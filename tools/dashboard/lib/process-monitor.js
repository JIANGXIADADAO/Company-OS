/**
 * process-monitor.js
 * Monitors ~/.claude/sessions/ and ~/.claude/permission-flags/ for Claude Code process state.
 * Ported from Monad Dashboard with SSE event naming adapted for Agent Team Dashboard.
 *
 * Events emitted via broadcast:
 *   process:sync   — full list of all session states (on init or full re-scan)
 *   process:update — single session state changed
 *   process:remove — session removed
 *   error          — on unrecoverable errors (source: 'process')
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { watch } = require('chokidar');

const SESSIONS_DIR = path.join(os.homedir(), '.claude', 'sessions');
const FLAGS_DIR = path.join(os.homedir(), '.claude', 'permission-flags');
const IDLE_THRESHOLD_MS = 2 * 60 * 1000;

const sessions = new Map();
const stopSignals = new Map();

let _broadcast = null;
let _state = [];
let _sessionWatcher = null;
let _flagWatcher = null;
let _idleInterval = null;
let _initialized = false;

// ─── Utilities ───────────────────────────────────────────────────────

function readJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function projectLabel(cwd) {
  if (!cwd) return 'unknown';
  const parts = cwd.split(/[/\\]+/).filter(Boolean);
  if (parts.length === 0) return 'unknown';
  if (parts.length === 1) return parts[0];
  return parts.slice(-2).join('/');
}

function computeSessionState(s) {
  const now = Date.now();
  const status = s.status || 'idle';
  const idleMs = status === 'idle' ? now - (s.updatedAt || s.startedAt || now) : 0;
  const hasSignal = stopSignals.has(s.sessionId);
  return {
    sessionId: s.sessionId,
    pid: s.pid,
    project: projectLabel(s.cwd),
    cwd: s.cwd || '',
    status,
    idleMs,
    decision: status === 'idle' && hasSignal,
    attention: status === 'idle' && idleMs > IDLE_THRESHOLD_MS && !hasSignal,
    startedAt: s.startedAt || now,
    updatedAt: s.updatedAt || s.startedAt || now
  };
}

function getSessionList() {
  const list = [];
  for (const s of sessions.values()) {
    list.push(computeSessionState(s));
  }
  list.sort((a, b) => b.startedAt - a.startedAt);
  return list;
}

// ─── Session file handling ───────────────────────────────────────────

function handleSessionFile(filePath, event) {
  const fileName = path.basename(filePath);
  if (!fileName.endsWith('.json')) return;

  // Handle deletion
  if (event === 'unlink') {
    const pid = parseInt(fileName.replace('.json', ''), 10);
    for (const [id, s] of sessions) {
      if (s.pid === pid) {
        sessions.delete(id);
        _state = getSessionList();
        _broadcast('process:remove', { sessionId: id });
        return;
      }
    }
    return;
  }

  // Handle add/change
  const s = readJSON(filePath);
  if (!s || !s.sessionId) return;
  sessions.set(s.sessionId, s);
  const st = computeSessionState(s);
  _state = getSessionList();
  _broadcast('process:update', st);
}

// ─── Permission flag handling ────────────────────────────────────────

function loadFlagFile(filePath) {
  const flag = readJSON(filePath);
  if (flag && flag.sessionId) {
    stopSignals.set(flag.sessionId, {
      stoppedAt: flag.stoppedAt,
      cwd: flag.cwd
    });
    const s = sessions.get(flag.sessionId);
    if (s) {
      _state = getSessionList();
      _broadcast('process:update', computeSessionState(s));
    }
  }
}

function unloadFlagFile(filePath) {
  const sessionId = path.basename(filePath).replace('.json', '');
  stopSignals.delete(sessionId);
  const s = sessions.get(sessionId);
  if (s) {
    _state = getSessionList();
    _broadcast('process:update', computeSessionState(s));
  }
}

// ─── Initial scan ────────────────────────────────────────────────────

function loadInitial() {
  // Load session files
  if (fs.existsSync(SESSIONS_DIR)) {
    const files = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.json'));
    for (const file of files) {
      const s = readJSON(path.join(SESSIONS_DIR, file));
      if (s && s.sessionId) sessions.set(s.sessionId, s);
    }
  }

  // Load permission flags
  if (fs.existsSync(FLAGS_DIR)) {
    const flagFiles = fs.readdirSync(FLAGS_DIR).filter(f => f.endsWith('.json'));
    for (const file of flagFiles) {
      const flag = readJSON(path.join(FLAGS_DIR, file));
      if (flag && flag.sessionId) {
        stopSignals.set(flag.sessionId, {
          stoppedAt: flag.stoppedAt,
          cwd: flag.cwd
        });
      }
    }
  }
}

// ─── Periodic idle state push ────────────────────────────────────────

function startIdlePusher() {
  _idleInterval = setInterval(() => {
    for (const s of sessions.values()) {
      if (s.status === 'idle') {
        _state = getSessionList();
        _broadcast('process:update', computeSessionState(s));
      }
    }
  }, 10000);
}

// ─── Public API ──────────────────────────────────────────────────────

/**
 * Initialize the process monitor.
 * @param {Function} broadcast — SSE broadcast function: (eventType, data) => void
 */
function init(broadcast) {
  if (_initialized) return;
  _broadcast = broadcast;

  // Initial scan
  loadInitial();
  _state = getSessionList();
  _broadcast('process:sync', _state);
  _initialized = true;

  // Watch sessions directory
  _sessionWatcher = watch(SESSIONS_DIR, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 }
  })
    .on('add', (fp) => handleSessionFile(fp, 'add'))
    .on('change', (fp) => handleSessionFile(fp, 'change'))
    .on('unlink', (fp) => handleSessionFile(fp, 'unlink'));

  // Ensure flags directory exists
  if (!fs.existsSync(FLAGS_DIR)) {
    try { fs.mkdirSync(FLAGS_DIR, { recursive: true }); } catch { /* permission denied, skip */ }
  }

  // Watch flags directory
  _flagWatcher = watch(FLAGS_DIR, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 }
  })
    .on('add', (fp) => loadFlagFile(fp))
    .on('change', (fp) => loadFlagFile(fp))
    .on('unlink', (fp) => unloadFlagFile(fp));

  // Start periodic idle state push
  startIdlePusher();
}

/**
 * Get the current list of session states.
 * @returns {Array} Array of session state objects
 */
function getState() {
  return _state;
}

/**
 * Clean up watchers and timers.
 */
function destroy() {
  if (_sessionWatcher) _sessionWatcher.close();
  if (_flagWatcher) _flagWatcher.close();
  if (_idleInterval) clearInterval(_idleInterval);
  sessions.clear();
  stopSignals.clear();
  _state = [];
  _initialized = false;
}

module.exports = { init, getState, destroy };
