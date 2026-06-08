/**
 * pipeline.js
 *
 * Monitors the project's briefs/ and src/ directories to compute
 * the current Pipeline stage state. Uses chokidar for real-time file
 * watching.
 *
 * The pipeline has 5 stages: scout, designer, builder, tester, seller.
 * Each stage's status is derived from the existence/timestamps of
 * specific files in the project.
 *
 * Events emitted:
 *   pipeline:sync   — full pipeline state (on init)
 *   pipeline:update — updated pipeline state (on file change)
 *   error           — on errors (source: 'pipeline')
 */

const fs = require('fs');
const path = require('path');
const { watch } = require('chokidar');

let _broadcast = null;
let _projectRoot = null;
let _state = null;
let _watcher = null;
let _initialized = false;
let _scanTimer = null;

// ─── Utilities ─────────────────────────────────────────────────────────

function getMtime(filePath) {
  try {
    var stat = fs.statSync(filePath);
    return stat.mtimeMs;
  } catch {
    return null;
  }
}

function dirExistsNonEmpty(dirPath) {
  try {
    if (!fs.existsSync(dirPath)) return false;
    var entries = fs.readdirSync(dirPath);
    // Filter out common dot-files and empty dirs
    var realEntries = entries.filter(function(e) {
      return e !== '.gitkeep' && e !== '.DS_Store' && e !== 'Thumbs.db';
    });
    return realEntries.length > 0;
  } catch {
    return false;
  }
}

// ─── State Computation ─────────────────────────────────────────────────

function computePipelineState(projectRoot) {
  var briefsDir = path.join(projectRoot, 'briefs');
  var srcDir = path.join(projectRoot, 'src');
  var testsFile = path.join(srcDir, 'tests', 'e2e.test.js');
  var sellerDir = path.join(projectRoot, 'seller');
  var sellerReadme = path.join(sellerDir, 'readme.md');

  // File existence checks
  var f1 = path.join(briefsDir, 'scout→designer.md');    // scout→designer.md
  var f1Alt = path.join(briefsDir, 'scout→designer.md');
  var f2 = path.join(briefsDir, 'designer→builder.md');  // designer→builder.md
  var f3 = path.join(briefsDir, 'builder→tester.md');    // builder→tester.md

  // Account for both → (UTF-8 arrow) and -> (ASCII fallback)
  var f1Exists = fs.existsSync(f1) || fs.existsSync(f1Alt) ||
                 fs.existsSync(path.join(briefsDir, 'scout->designer.md'));
  var f2Exists = fs.existsSync(f2) ||
                 fs.existsSync(path.join(briefsDir, 'designer->builder.md'));
  var f3Exists = fs.existsSync(f3) ||
                 fs.existsSync(path.join(briefsDir, 'builder->tester.md'));

  var srcExists = dirExistsNonEmpty(srcDir);
  var testsExist = fs.existsSync(testsFile) ||
                   fs.existsSync(path.join(srcDir, 'tests')) &&
                   fs.readdirSync(path.join(srcDir, 'tests')).length > 0;
  var sellerReadmeExists = fs.existsSync(sellerReadme);

  var stages = [];

  // Stage 1: Scout (Direction)
  stages.push({
    id: 'scout',
    label: '找方向',
    status: f1Exists ? 'done' : 'pending',
    file: 'briefs/scout→designer.md',
    fileExists: f1Exists,
    lastModified: getMtime(f1) || getMtime(path.join(briefsDir, 'scout->designer.md')),
    description: f1Exists ? '找到明确方向' : '等待方向确定',
    order: 1
  });

  // Stage 2: Designer
  stages.push({
    id: 'designer',
    label: '设计',
    status: f2Exists ? 'done' : 'pending',
    file: 'briefs/designer→builder.md',
    fileExists: f2Exists,
    lastModified: getMtime(f2) || getMtime(path.join(briefsDir, 'designer->builder.md')),
    description: f2Exists ? '设计已完成' : '等待设计',
    order: 2
  });

  // Stage 3: Builder (Development)
  var builderStatus = 'pending';
  var builderDesc = '等待前序阶段完成';

  if (f1Exists && f2Exists) {
    // Pre-requisites done, check development state
    if (f3Exists) {
      if (srcExists || testsExist) {
        builderStatus = 'done';
        builderDesc = '开发完成';
      } else {
        builderStatus = 'done';
        builderDesc = '开发完成（手写移交文档）';
      }
    } else if (srcExists) {
      builderStatus = 'in-progress';
      builderDesc = 'src/ 非空，开发进行中';
    } else {
      builderStatus = 'pending';
      builderDesc = '等待开发开始';
    }
  }

  stages.push({
    id: 'builder',
    label: '开发',
    status: builderStatus,
    file: 'src/',
    fileExists: srcExists,
    lastModified: getMtime(srcDir),
    description: builderDesc,
    order: 3
  });

  // Stage 4: Tester
  var testerStatus = 'pending';
  var testerDesc = '等待开发完成';

  if (f3Exists) {
    if (testsExist) {
      testerStatus = 'done';
      testerDesc = '测试全部通过';
    } else {
      testerStatus = 'in-progress';
      testerDesc = '等待测试文件创建';
    }
  }

  stages.push({
    id: 'tester',
    label: '测试',
    status: testerStatus,
    file: 'src/tests/e2e.test.js',
    fileExists: testsExist,
    lastModified: getMtime(testsFile),
    description: testerDesc,
    order: 4
  });

  // Stage 5: Seller (Release)
  var sellerStatus = 'pending';
  var sellerDesc = '等待测试通过';

  if (testsExist) {
    if (sellerReadmeExists) {
      sellerStatus = 'done';
      sellerDesc = '分发完成';
    } else {
      sellerStatus = 'in-progress';
      sellerDesc = '等待封版上线';
    }
  }

  stages.push({
    id: 'seller',
    label: '封版上线',
    status: sellerStatus,
    file: 'seller/readme.md',
    fileExists: sellerReadmeExists,
    lastModified: getMtime(sellerReadme),
    description: sellerDesc,
    order: 5
  });

  return {
    projectRoot: projectRoot,
    stages: stages,
    updatedAt: Date.now()
  };
}

// ─── Scanning ──────────────────────────────────────────────────────────

function scanAndBroadcast(isInitial) {
  try {
    _state = computePipelineState(_projectRoot);
    _broadcast(isInitial ? 'pipeline:sync' : 'pipeline:update', _state);
  } catch (err) {
    _broadcast('error', {
      source: 'pipeline',
      code: err.code || 'EUNKNOWN',
      message: err.message || 'Pipeline scan failed',
      recoverable: true,
      timestamp: Date.now()
    });
  }
}

// ─── Debounced re-scan ─────────────────────────────────────────────────

function debouncedScan() {
  if (_scanTimer) clearTimeout(_scanTimer);
  _scanTimer = setTimeout(function() {
    _scanTimer = null;
    scanAndBroadcast(false);
  }, 300); // 300ms debounce for batch file operations
}

// ─── Public API ────────────────────────────────────────────────────────

function init(projectRoot, broadcast) {
  if (_initialized) return;
  _broadcast = broadcast;
  _projectRoot = projectRoot;
  _initialized = true;

  // Initial scan (synchronous)
  scanAndBroadcast(true);

  // Ensure watch directories exist
  var watchDirs = [
    path.join(projectRoot, 'briefs'),
    path.join(projectRoot, 'src'),
    path.join(projectRoot, 'seller')
  ];

  for (var d = 0; d < watchDirs.length; d++) {
    if (!fs.existsSync(watchDirs[d])) {
      try { fs.mkdirSync(watchDirs[d], { recursive: true }); } catch { /* skip */ }
    }
  }

  // Watch with chokidar
  _watcher = watch(watchDirs, {
    ignoreInitial: true,
    ignored: /(^|[/\\])\../, // ignore dotfiles
    awaitWriteFinish: {
      stabilityThreshold: 200,
      pollInterval: 100
    }
  });

  _watcher.on('add', debouncedScan);
  _watcher.on('change', debouncedScan);
  _watcher.on('unlink', debouncedScan);
  _watcher.on('unlinkDir', debouncedScan);
}

function getState() {
  return _state;
}

function destroy() {
  if (_watcher) {
    _watcher.close();
    _watcher = null;
  }
  if (_scanTimer) {
    clearTimeout(_scanTimer);
    _scanTimer = null;
  }
  _state = null;
  _initialized = false;
}

module.exports = { init, getState, destroy };
