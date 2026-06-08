#!/usr/bin/env node

/**
 * Agent Team Dashboard — server.js
 *
 * HTTP server entry point.
 * - Static file serving (from ./public/) with path traversal protection
 * - SSE endpoint (/events) for real-time push
 * - REST API fallback (/api/*)
 * - Shutdown endpoint (/shutdown)
 * - Module orchestration (process-monitor, pipeline, git-log)
 *
 * Usage:
 *   node server.js               # start on port 3456, project root = cwd
 *   node server.js --port 3457   # custom port
 *   node server.js --dir ../path # custom project root
 *   PORT=3457 node server.js     # port via env var
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

// ─── CLI Argument Parsing ────────────────────────────────────────────

let PORT = parseInt(process.env.PORT, 10) || 3456;
let projectRoot = process.cwd();

const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port' && args[i + 1]) {
    PORT = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === '--dir' && args[i + 1]) {
    projectRoot = path.resolve(args[i + 1]);
    i++;
  } else if (args[i] === '--help' || args[i] === '-h') {
    console.log('Agent Team Dashboard');
    console.log('');
    console.log('Usage:');
    console.log('  node server.js [options]');
    console.log('');
    console.log('Options:');
    console.log('  --port <number>    HTTP server port (default: 3456, env: PORT)');
    console.log('  --dir <path>       Project root directory (default: cwd)');
    console.log('  --help, -h         Show this help');
    console.log('');
    console.log('Examples:');
    console.log('  node server.js');
    console.log('  node server.js --port 3457');
    console.log('  node server.js --dir /path/to/project');
    process.exit(0);
  }
}

// Validate project root
if (!fs.existsSync(projectRoot)) {
  console.error(`Error: Directory not found: ${projectRoot}`);
  process.exit(1);
}

const PUBLIC_DIR = path.join(__dirname, 'public');
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// ─── SSE Manager ─────────────────────────────────────────────────────

function createSSEManager() {
  const clients = new Set();
  let heartbeatTimer = null;

  function addClient(res) {
    clients.add(res);
    if (clients.size === 1) {
      // Start heartbeat when first client connects
      heartbeatTimer = setInterval(() => {
        const payload = ':keepalive\n\n';
        for (const c of clients) {
          try { c.write(payload); } catch { clients.delete(c); }
        }
      }, 30000);
    }
  }

  function removeClient(res) {
    clients.delete(res);
    if (clients.size === 0 && heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  function broadcast(eventType, data) {
    const payload = `event:${eventType}\ndata:${JSON.stringify(data)}\n\n`;
    for (const c of clients) {
      try { c.write(payload); } catch { clients.delete(c); }
    }
  }

  function sendTo(res, eventType, data) {
    const payload = `event:${eventType}\ndata:${JSON.stringify(data)}\n\n`;
    try { res.write(payload); } catch { /* client gone */ }
  }

  return { addClient, removeClient, broadcast, sendTo, clients };
}

const sse = createSSEManager();

// ─── Module Initialization ───────────────────────────────────────────

const processMonitor = require('./lib/process-monitor');
processMonitor.init(sse.broadcast);

// Pipeline and git-log are initialized later when their modules are ready
let pipelineModule = null;
let gitLogModule = null;

// Lazy-load pipeline and git-log to allow server to start even if they fail
try {
  pipelineModule = require('./lib/pipeline');
  pipelineModule.init(projectRoot, sse.broadcast);
} catch (err) {
  console.error('Pipeline module init error:', err.message);
}

try {
  gitLogModule = require('./lib/git-log');
  gitLogModule.init(projectRoot, sse.broadcast);
} catch (err) {
  console.error('Git Log module init error:', err.message);
}

// ─── Static File Serving ────────────────────────────────────────────

function serveStaticFile(req, res) {
  const urlPath = req.url === '/' ? '/index.html' : req.url;

  // Security: prevent path traversal
  const safeRelative = urlPath.replace(/^[/\\]+/, ''); // strip leading /
  const requestedPath = path.resolve(PUBLIC_DIR, safeRelative);

  // Verify the resolved path is within PUBLIC_DIR
  if (requestedPath !== PUBLIC_DIR &&
      !requestedPath.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  // Check file exists
  if (!fs.existsSync(requestedPath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
    return;
  }

  // Serve with correct MIME type
  const ext = path.extname(requestedPath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  const content = fs.readFileSync(requestedPath);

  res.writeHead(200, {
    'Content-Type': contentType,
    'Cache-Control': 'no-cache, no-store, must-revalidate'
  });
  res.end(content);
}

// ─── REST API Handlers ───────────────────────────────────────────────

function sendJSON(res, data, statusCode = 200) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function handleAPI(req, res) {
  const urlPath = req.url;

  if (urlPath === '/api/pipeline') {
    if (pipelineModule && pipelineModule.getState) {
      sendJSON(res, pipelineModule.getState());
    } else {
      sendJSON(res, { error: 'Pipeline module not available' }, 503);
    }
    return true;
  }

  if (urlPath === '/api/git-log' || urlPath === '/api/gitlog') {
    if (gitLogModule && gitLogModule.getState) {
      sendJSON(res, gitLogModule.getState());
    } else {
      sendJSON(res, { error: 'Git Log module not available' }, 503);
    }
    return true;
  }

  if (urlPath === '/api/processes' || urlPath === '/api/process') {
    sendJSON(res, processMonitor.getState());
    return true;
  }

  return false; // not an API route
}

// ─── SSE Connection Handler ──────────────────────────────────────────

function handleSSE(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  // Send connected event
  res.write('event:connected\ndata:{}\n\n');

  // Register client
  sse.addClient(res);

  // Send current state of all modules to just this client
  // (modules already broadcast to all clients on changes, but this client
  //  just connected, so we need to send them the current state directly)

  // Process Monitor state
  try {
    const procState = processMonitor.getState();
    if (procState) {
      sse.sendTo(res, 'process:sync', procState);
    }
  } catch (err) {
    sse.sendTo(res, 'error', {
      source: 'process',
      code: 'EPROCSYNC',
      message: err.message,
      recoverable: true,
      timestamp: Date.now()
    });
  }

  // Pipeline state
  try {
    if (pipelineModule && pipelineModule.getState) {
      const pipeState = pipelineModule.getState();
      if (pipeState) {
        sse.sendTo(res, 'pipeline:sync', pipeState);
      }
    }
  } catch (err) {
    sse.sendTo(res, 'error', {
      source: 'pipeline',
      code: 'EPIPESYNC',
      message: err.message,
      recoverable: true,
      timestamp: Date.now()
    });
  }

  // Git Log state
  try {
    if (gitLogModule && gitLogModule.getState) {
      const gitState = gitLogModule.getState();
      if (gitState) {
        sse.sendTo(res, 'gitlog:sync', gitState);
      }
    }
  } catch (err) {
    sse.sendTo(res, 'error', {
      source: 'gitlog',
      code: 'EGITSYNC',
      message: err.message,
      recoverable: true,
      timestamp: Date.now()
    });
  }

  // Handle client disconnect
  req.on('close', () => {
    sse.removeClient(res);
  });
}

// ─── Shutdown Handler ────────────────────────────────────────────────

function handleShutdown(req, res) {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Server shutting down...');
  console.log('Shutdown requested via /shutdown');

  setTimeout(() => {
    // Clean up modules
    try { processMonitor.destroy(); } catch {}
    try { if (pipelineModule && pipelineModule.destroy) pipelineModule.destroy(); } catch {}
    try { if (gitLogModule && gitLogModule.destroy) gitLogModule.destroy(); } catch {}

    server.close(() => {
      console.log('Server stopped. Port released.');
      process.exit(0);
    });
  }, 500);
}

// ─── HTTP Server ─────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  // SSE endpoint
  if (req.url === '/events') {
    handleSSE(req, res);
    return;
  }

  // Shutdown endpoint
  if (req.url === '/shutdown') {
    handleShutdown(req, res);
    return;
  }

  // API endpoints
  if (req.url.startsWith('/api/')) {
    if (handleAPI(req, res)) return;
    // Unknown API route
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  // Static files
  serveStaticFile(req, res);
});

// ─── Auto-open Browser ───────────────────────────────────────────────

function openBrowser(url) {
  const platform = process.platform;
  let cmd;
  if (platform === 'darwin') {
    cmd = `open ${url}`;
  } else if (platform === 'win32') {
    cmd = `start "" "${url}"`;
  } else {
    cmd = `xdg-open ${url}`;
  }
  exec(cmd, (err) => {
    if (err) {
      console.log(`Open ${url} in your browser`);
    }
  });
}

// ─── Start Server ────────────────────────────────────────────────────

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Agent Team Dashboard → http://localhost:${PORT}`);
  console.log(`Project root: ${projectRoot}`);
  console.log(`Processes: ${processMonitor.getState().length} active`);
  console.log('');
  console.log('Panels:');
  console.log('  ■ Pipeline       — briefs/ + src/ (chokidar)');
  console.log('  ■ Operation Log  — git log (5s polling)');
  console.log('  ■ Process Monitor — ~/.claude/sessions/ (chokidar)');
  console.log('');

  // Auto-open browser
  openBrowser(`http://localhost:${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use.`);
    console.error('');
    console.error(`  Kill the existing process first:`);
    console.error(`    Windows: netstat -ano | findstr :${PORT}  →  taskkill /PID <pid>`);
    console.error(`    Mac:     lsof -i :${PORT}  →  kill <pid>`);
    console.error(`    Linux:   fuser -k ${PORT}/tcp`);
    console.error('');
    console.error(`  Or use a different port:`);
    console.error(`    node server.js --port ${PORT + 1}`);
    process.exit(1);
  } else {
    console.error('Server error:', err);
    process.exit(1);
  }
});
