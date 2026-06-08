/**
 * git-log.js
 *
 * Monitors git log for semantic commits matching the [tag] pattern.
 * Polls every 5 seconds, parses structured commit data, and broadcasts
 * via SSE.
 *
 * Events emitted:
 *   gitlog:sync   — full commit list (on init)
 *   gitlog:update — new/updated commits (on each poll)
 *   error         — on git errors (source: 'gitlog')
 */

const { exec, execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

let _broadcast = null;
let _projectRoot = null;
let _state = null;
let _pollInterval = null;
let _initialized = false;
let _hasSentInitial = false;
let _prevCommitHashes = new Set();

const GIT_LOG_CMD = 'git log --stat -n 50 --format="%H||%h||%s||%aI||%an"';

// ─── Parsing ──────────────────────────────────────────────────────────

function parseFileLine(line) {
  // Format: " file/path | N +++++---"
  var match = line.match(/^\s*(.+?)\s+\|\s+(\d+)\s+(.*)$/);
  if (!match) return null;

  var filePath = match[1].trim();
  var total = parseInt(match[2], 10);
  var symbols = match[3] || '';

  var insertions = 0;
  var deletions = 0;
  for (var i = 0; i < symbols.length; i++) {
    if (symbols[i] === '+') insertions++;
    else if (symbols[i] === '-') deletions++;
  }

  return {
    path: filePath,
    insertions: insertions || total,
    deletions: deletions || 0
  };
}

function parseStatLine(line) {
  if (!line) return { total: 0, insertions: 0, deletions: 0 };

  var fileMatch = line.match(/(\d+)\s+files?\s+changed/);
  var insMatch = line.match(/(\d+)\s+insertion/);
  var delMatch = line.match(/(\d+)\s+deletion/);

  return {
    total: fileMatch ? parseInt(fileMatch[1], 10) : 0,
    insertions: insMatch ? parseInt(insMatch[1], 10) : 0,
    deletions: delMatch ? parseInt(delMatch[1], 10) : 0
  };
}

/**
 * Detect if a line is a commit header (starts with a hex hash followed by ||).
 * This is used to split the git log output into individual commit blocks.
 */
function isCommitHeader(line) {
  return /^[a-f0-9]{40}\|\|/.test(line);
}

/**
 * Parse a single commit block's worth of lines into a commit object.
 * First line must be the header (format output), remaining lines are stat content.
 */
function parseCommitBlock(lines) {
  if (!lines || lines.length < 1) return null;

  var headerParts = lines[0].split('||');
  if (headerParts.length < 5) {
    // Try with just hash + message (fallback)
    var altMatch = lines[0].match(/^([a-f0-9]+)\s+(.+)/);
    if (!altMatch) return null;
    headerParts = [
      altMatch[1],
      altMatch[1].substring(0, 7),
      altMatch[2],
      '',
      ''
    ];
  }

  var hash = headerParts[0] || '';
  var shortHash = headerParts[1] || hash.substring(0, 7);
  var message = headerParts[2] || '';
  var date = headerParts[3] || '';
  var author = headerParts[4] || '';

  var tagMatch = message.match(/^\[(\w+)\]\s*(.*)/);
  var tag = tagMatch ? tagMatch[1] : 'unknown';
  var description = tagMatch ? tagMatch[2] : message;

  // Remaining lines (after header) are stat content: file lines + summary
  // Skip any blank lines that may appear between header and first file line
  var statContent = lines.slice(1).filter(function(l) { return l.trim() !== ''; });
  // Last non-blank line is the stat summary; everything before are file lines
  var fileLines = statContent.length > 1 ? statContent.slice(0, -1) : [];
  var statLine = statContent.length > 0 ? statContent[statContent.length - 1] : '';

  var files = [];
  for (var f = 0; f < fileLines.length; f++) {
    var parsed = parseFileLine(fileLines[f]);
    if (parsed) files.push(parsed);
  }

  var stats = parseStatLine(statLine);

  return {
    hash: hash,
    shortHash: shortHash,
    tag: tag,
    description: description,
    date: date,
    author: author,
    files: files,
    stats: stats
  };
}

function parseGitLogOutput(stdout) {
  if (!stdout || !stdout.trim()) return [];

  // Use commit header detection (line starting with hex hash + ||) as block boundary,
  // because --stat output places \n\n between header and stat content (not between commits).
  // This is robust across both Unix (\n) and Windows (\r\n) line endings.
  var lines = stdout.trim().split('\n');
  var commits = [];
  var currentBlock = [];

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    // Each commit starts with a line like "40-hex-chars||short||message||date||author"
    if (isCommitHeader(line) && currentBlock.length > 0) {
      var commit = parseCommitBlock(currentBlock);
      if (commit) commits.push(commit);
      currentBlock = [];
    }
    currentBlock.push(line);
  }

  // Parse the last block
  if (currentBlock.length > 0) {
    var commit = parseCommitBlock(currentBlock);
    if (commit) commits.push(commit);
  }

  return commits;
}

// ─── Fetching ─────────────────────────────────────────────────────────

function fetchGitLog() {
  const git = spawn('git', ['log', '--stat', '-n', '50', '--format=%H||%h||%s||%aI||%an'], {
    cwd: _projectRoot
  });

  let stdout = '';
  let stderr = '';

  git.stdout.on('data', (d) => { stdout += d; });
  git.stderr.on('data', (d) => { stderr += d; });

  git.on('close', (code) => {
    if (code !== 0) {
      handleGitError(new Error(stderr || 'git log failed'), stderr);
      return;
    }

    // Normalize line endings for cross-platform compatibility (Windows \r\n → \n)
    stdout = stdout.replace(/\r\n/g, '\n');

    var commits = parseGitLogOutput(stdout);

    // JS-side filtering: remove commits without a [tag] prefix
    commits = commits.filter(c => c.tag !== 'unknown');

    // Get total commit count
    exec('git rev-list --count HEAD', { cwd: _projectRoot }, function(err2, countOut) {
      var totalCommits = 0;
      if (countOut) {
        totalCommits = parseInt(countOut.trim(), 10) || 0;
      }

      var result = {
        commits: commits,
        totalCommits: totalCommits,
        lastFetchAt: Date.now()
      };

      _state = result;

      // Track current hashes for change detection
      var currentHashes = new Set();
      for (var i = 0; i < commits.length; i++) {
        currentHashes.add(commits[i].hash);
      }

      if (!_hasSentInitial) {
        _hasSentInitial = true;
        _prevCommitHashes = currentHashes;
        _broadcast('gitlog:sync', result);
      } else {
        // Check if anything changed
        var changed = false;
        if (currentHashes.size !== _prevCommitHashes.size) {
          changed = true;
        } else {
          var iter = currentHashes.values();
          for (var h = iter.next(); !h.done; h = iter.next()) {
            if (!_prevCommitHashes.has(h.value)) {
              changed = true;
              break;
            }
          }
        }

        if (changed) {
          _prevCommitHashes = currentHashes;
          _broadcast('gitlog:update', result);
        }
      }
    });
  });
}

function handleGitError(err, stderr) {
  var msg = (stderr || err.message || '').toLowerCase();

  if (msg.indexOf('not a git repository') !== -1 || err.code === 'ENOENT') {
    // Not a git repo - show error state
    _state = { commits: [], totalCommits: 0, lastFetchAt: Date.now() };
    if (!_hasSentInitial) {
      _hasSentInitial = true;
      _broadcast('gitlog:sync', _state);
    }
    _broadcast('error', {
      source: 'gitlog',
      code: 'ENOTGIT',
      message: 'Not a git repository (or git not installed). Operation Log requires git.',
      recoverable: false,
      timestamp: Date.now()
    });
  } else {
    // Other git error (permissions, etc.)
    _broadcast('error', {
      source: 'gitlog',
      code: err.code || 'EGIT',
      message: err.message || 'Git command failed',
      recoverable: true,
      timestamp: Date.now()
    });
  }
}

// ─── Public API ───────────────────────────────────────────────────────

function init(projectRoot, broadcast) {
  if (_initialized) return;
  _broadcast = broadcast;
  _projectRoot = projectRoot;
  _initialized = true;

  // Auto-init git if missing (zero-risk, pure local operation)
  const gitDir = path.join(projectRoot, '.git');
  if (!fs.existsSync(gitDir)) {
    try {
      execSync('git init', { cwd: projectRoot, stdio: 'pipe' });
      console.log('  ■ git initialized (auto) — your project now has version control');
    } catch {
      console.log('  ■ git not found — Operation Log panel will show setup instructions');
    }
  }

  // Initial fetch
  fetchGitLog();

  // Poll every 5 seconds
  _pollInterval = setInterval(fetchGitLog, 5000);
}

function getState() {
  return _state;
}

function destroy() {
  if (_pollInterval) {
    clearInterval(_pollInterval);
    _pollInterval = null;
  }
  _state = null;
  _initialized = false;
  _hasSentInitial = false;
  _prevCommitHashes.clear();
}

module.exports = { init, getState, destroy };
