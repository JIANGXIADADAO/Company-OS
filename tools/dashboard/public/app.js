/**
 * Agent Team Dashboard — app.js
 *
 * Frontend logic:
 *   - SSE client (EventSource) receiving real-time events
 *   - State management (pipeline, gitlog, processes, errors)
 *   - Rendering functions for all 3 panels × 4 states
 *   - Interaction handlers (click to expand/copy, refresh, fold)
 */

/* ═══════════════════════════════════════════════════════════════════
   Global State
   ═══════════════════════════════════════════════════════════════════ */

const state = {
  pipeline: null,
  gitlog: null,
  processes: new Map(),
  errors: {
    pipeline: null,
    gitlog: null,
    process: null
  },
  expandedCommits: new Set(),
  collapsedPanels: {
    pipeline: false,
    gitlog: false,
    process: false
  },
  connected: false,
  clock: ''
};

/* ═══════════════════════════════════════════════════════════════════
   Utilities
   ═══════════════════════════════════════════════════════════════════ */

function escapeHTML(str) {
  if (typeof str !== 'string') return String(str || '');
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatDuration(ms) {
  if (ms <= 0 || ms == null) return '--';
  var s = Math.floor(ms / 1000);
  if (s < 60) return s + 's';
  if (s < 3600) return Math.floor(s / 60) + 'm ' + (s % 60) + 's';
  return Math.floor(s / 3600) + 'h ' + Math.floor((s % 3600) / 60) + 'm';
}

function formatTime(ts) {
  var d = new Date(ts);
  return d.toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' });
}

function formatDateTime(iso) {
  var d = new Date(iso);
  return d.toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDate(iso) {
  var d = new Date(iso);
  var month = String(d.getMonth() + 1).padStart(2, '0');
  var day = String(d.getDate()).padStart(2, '0');
  return month + '-' + day + ' ' + formatTime(iso);
}

/* ═══════════════════════════════════════════════════════════════════
   DOM References
   ═══════════════════════════════════════════════════════════════════ */

var $ = function(id) { return document.getElementById(id); };

/* ═══════════════════════════════════════════════════════════════════
   Toast
   ═══════════════════════════════════════════════════════════════════ */

var toastTimer = null;

function showToast(msg, isError) {
  var el = $('toast');
  el.textContent = msg;
  el.className = 'toast' + (isError ? ' toast-error' : '') + ' show';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function() {
    el.classList.remove('show');
  }, 2000);
}

/* ═══════════════════════════════════════════════════════════════════
   Clock
   ═══════════════════════════════════════════════════════════════════ */

function updateClock() {
  var now = new Date();
  $('clock').textContent = now.toLocaleTimeString('zh-CN', { hour12: false });
}
updateClock();
setInterval(updateClock, 1000);

/* ═══════════════════════════════════════════════════════════════════
   Connection Status
   ═══════════════════════════════════════════════════════════════════ */

function updateConnStatus() {
  var el = $('connStatus');
  if (state.connected) {
    el.textContent = '● LIVE';
    el.className = 'conn-status conn-live';
  } else {
    el.textContent = '● RECONNECTING';
    el.className = 'conn-status conn-reconnecting';
  }

  // Update agent count
  $('agentCount').textContent = state.processes.size + ' agent' + (state.processes.size !== 1 ? 's' : '');
}

/* ═══════════════════════════════════════════════════════════════════
   Panel refresh handlers
   ═══════════════════════════════════════════════════════════════════ */

function setupRefreshButtons() {
  // Pipeline refresh
  $('pipeline-refresh').addEventListener('click', function() {
    this.classList.add('refreshing');
    var self = this;
    fetch('/api/pipeline')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        state.pipeline = data;
        render();
      })
      .catch(function(err) {
        showToast('Pipeline refresh failed', true);
      })
      .finally(function() {
        setTimeout(function() { self.classList.remove('refreshing'); }, 500);
      });
  });

  // Git Log refresh
  $('gitlog-refresh').addEventListener('click', function() {
    this.classList.add('refreshing');
    var self = this;
    fetch('/api/git-log')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        state.gitlog = data;
        render();
      })
      .catch(function(err) {
        showToast('Git Log refresh failed', true);
      })
      .finally(function() {
        setTimeout(function() { self.classList.remove('refreshing'); }, 500);
      });
  });

  // Process refresh
  $('process-refresh').addEventListener('click', function() {
    this.classList.add('refreshing');
    var self = this;
    fetch('/api/processes')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        state.processes.clear();
        for (var i = 0; i < data.length; i++) {
          state.processes.set(data[i].sessionId, data[i]);
        }
        render();
      })
      .catch(function(err) {
        showToast('Process refresh failed', true);
      })
      .finally(function() {
        setTimeout(function() { self.classList.remove('refreshing'); }, 500);
      });
  });
}

/* ═══════════════════════════════════════════════════════════════════
   Panel fold/unfold
   ═══════════════════════════════════════════════════════════════════ */

function setupPanelToggles() {
  var toggles = document.querySelectorAll('.panel-toggle');
  for (var i = 0; i < toggles.length; i++) {
    toggles[i].addEventListener('click', function(e) {
      e.stopPropagation();
      var panelName = this.dataset.panel;
      var panelId = panelName === 'pipeline' ? 'pipeline' : (panelName === 'gitlog' ? 'gitlog' : 'process');
      var bodyId = panelId + '-body';

      state.collapsedPanels[panelId] = !state.collapsedPanels[panelId];
      var body = $(bodyId);
      if (state.collapsedPanels[panelId]) {
        body.classList.add('collapsed');
        this.classList.add('collapsed');
        this.title = 'Expand';
      } else {
        body.classList.remove('collapsed');
        this.classList.remove('collapsed');
        this.title = 'Collapse';
      }
    });
  }
}

/* ═══════════════════════════════════════════════════════════════════
   Render: Pipeline Panel
   ═══════════════════════════════════════════════════════════════════ */

function renderPipelineEmpty() {
  return '<div class="empty-state">' +
    '<div class="empty-icon">◆</div>' +
    '<div class="empty-title">NO PIPELINE</div>' +
    '<div class="empty-desc">Start a Worker pipeline by creating brief/ files. ' +
    'The 5-stage process will appear here automatically.</div>' +
    '<div class="empty-files">' +
    'briefs/<br>' +
    '  ├── scout→designer.md<br>' +
    '  ├── designer→builder.md<br>' +
    '  ├── builder→tester.md<br>' +
    'src/<br>' +
    '  └── tests/e2e.test.js<br>' +
    'seller/<br>' +
    '  └── readme.md' +
    '</div>' +
    '</div>';
}

function renderPipelineError(error) {
  return '<div class="error-state">' +
    '<div class="error-icon">⚠</div>' +
    '<div class="error-title">Pipeline Error</div>' +
    '<div class="error-message">' + escapeHTML(error.message || 'Unknown error') + '</div>' +
    (error.code ? '<div class="error-path">' + escapeHTML(error.code) + '</div>' : '') +
    '<button class="btn-retry" onclick="fetch(\'/api/pipeline\').then(r=>r.json()).then(d=>{state.pipeline=d;render();}).catch(e=>showToast(\'Retry failed\',true))">Retry Scan</button>' +
    '</div>';
}

function renderPipelinePartial(data) {
  return renderPipelineNormal(data) +
    '<div class="partial-bar">' +
    '<span class="partial-icon">ℹ️</span>' +
    '<span>Process Monitor has no running processes. ' +
    'Pipeline shows a file-system based static snapshot. ' +
    'Start Claude Code to see live updates.</span>' +
    '</div>';
}

function renderPipelineNormal(data) {
  var stages = data.stages;
  var flowHTML = '';
  for (var i = 0; i < stages.length; i++) {
    var s = stages[i];
    var statusIcon = s.status === 'done' ? '✅' :
      s.status === 'in-progress' ? '🟡' : '⏳';
    var statusClass = 'stage-' + s.status;
    var timeStr = s.lastModified ? formatTime(s.lastModified) : '--';

    flowHTML += '<div class="stage-card ' + statusClass + '" title="' + escapeHTML(s.file || '') + '">' +
      '<div class="stage-label">' + escapeHTML(s.label) + '</div>' +
      '<div class="stage-status">' + statusIcon + '</div>' +
      '<div class="stage-time">' + timeStr + '</div>' +
      '<div class="stage-desc">' + escapeHTML(s.description || '') + '</div>' +
      '</div>';

    if (i < stages.length - 1) {
      flowHTML += '<div class="stage-arrow">→</div>';
    }
  }

  // Find current active stage for detail
  var detailStage = null;
  for (var j = 0; j < stages.length; j++) {
    if (stages[j].status === 'in-progress') {
      detailStage = stages[j];
      break;
    }
  }

  var detailHTML = '';
  if (detailStage) {
    detailHTML = '<div class="pipeline-detail active">' +
      '<div class="pipeline-detail-label">' + escapeHTML(detailStage.label) + ' — ' + escapeHTML(detailStage.description) + '</div>' +
      '<div class="pipeline-detail-desc">' + (detailStage.file ? 'File: ' + escapeHTML(detailStage.file) : '') + '</div>' +
      '</div>';
  }

  return '<div class="pipeline-flow">' + flowHTML + '</div>' + detailHTML;
}

function renderPipeline(data, error) {
  var el = $('pipeline-body');

  if (error) {
    el.innerHTML = renderPipelineError(error);
  } else if (!data || !data.stages || data.stages.every(function(s) { return s.status === 'pending'; })) {
    el.innerHTML = renderPipelineEmpty();
  } else {
    var hasProcessData = state.processes.size > 0;
    var isPartial = data.stages.some(function(s) { return s.status === 'pending'; }) || !hasProcessData;
    el.innerHTML = isPartial ? renderPipelinePartial(data) : renderPipelineNormal(data);
  }

  // Update summary
  if (data && data.stages) {
    var done = data.stages.filter(function(s) { return s.status === 'done'; }).length;
    $('pipeline-summary').textContent = done + '/' + data.stages.length;
  }
}

/* ═══════════════════════════════════════════════════════════════════
   Render: Git Log Panel
   ═══════════════════════════════════════════════════════════════════ */

function renderCommitFiles(files) {
  var html = '';
  for (var i = 0; i < files.length; i++) {
    var f = files[i];
    html += '<div class="commit-file">' +
      '<span class="commit-file-path">' + escapeHTML(f.path) + '</span>' +
      (f.insertions > 0 ? '<span class="commit-file-add">+' + f.insertions + '</span>' : '<span class="commit-file-add"></span>') +
      (f.deletions > 0 ? '<span class="commit-file-del">-' + f.deletions + '</span>' : '<span class="commit-file-del"></span>') +
      '</div>';
  }
  return html;
}

function renderGitLogEmpty(totalCommits) {
  return '<div class="empty-state">' +
    '<div class="empty-icon">◇</div>' +
    '<div class="empty-title">NO SEMANTIC COMMITS</div>' +
    '<div class="empty-desc">Commits tagged with [scout] [designer] [builder] [tester] [seller] will appear here.</div>' +
    '<div class="empty-files">' +
    'Example commit message:<br>' +
    '<span style="color:var(--text-dim)">[scout] 完成竞品调研，确定差异化定位</span><br><br>' +
    'Total commits in repo: ' + totalCommits +
    '</div>' +
    '</div>';
}

function renderGitLogError(error) {
  return '<div class="error-state">' +
    '<div class="error-icon">⚠</div>' +
    '<div class="error-title">Git Error</div>' +
    '<div class="error-message">' + escapeHTML(error.message || 'Not a git repository') + '</div>' +
    '<div class="error-path">This panel requires git for version tracking. Other panels continue to work.</div>' +
    '<button class="btn-retry" onclick="fetch(\'/api/git-log\').then(r=>r.json()).then(d=>{state.gitlog=d;render();}).catch(e=>showToast(\'Retry failed\',true))">Retry</button>' +
    '</div>';
}

function renderGitLogPartial(data, expandedCommits) {
  return '<div class="partial-bar">' +
    '<span class="partial-icon">ℹ️</span>' +
    '<span>No recent semantic commits in the last 24 hours. Make a tagged commit to see it appear here.</span>' +
    '</div>' +
    renderGitLogList(data, expandedCommits);
}

function renderGitLogList(data, expandedCommits) {
  var commits = data.commits || [];
  var totalCommits = data.totalCommits || 0;
  var html = '<div class="gitlog-list">';

  for (var i = 0; i < commits.length; i++) {
    var c = commits[i];
    var isExpanded = expandedCommits.has(c.shortHash);
    var tagClass = 'tag-' + (c.tag || 'unknown');
    var arrow = isExpanded ? '▼' : '▶';
    var filesHTML = isExpanded && c.files && c.files.length > 0
      ? '<div class="commit-files">' + renderCommitFiles(c.files) + '</div>'
      : '';

    html += '<div class="commit-entry' + (isExpanded ? ' expanded' : '') + '" data-hash="' + escapeHTML(c.shortHash) + '">' +
      '<div class="commit-header">' +
      '<span class="commit-time">' + formatDateTime(c.date) + '</span>' +
      '<span class="commit-tag ' + tagClass + '">' + escapeHTML(c.tag || 'unknown') + '</span>' +
      '<span class="commit-desc">' + escapeHTML(c.description || c.message || '') + '</span>' +
      '<span class="commit-arrow">' + arrow + '</span>' +
      '</div>' +
      '<div class="commit-meta">' +
      '<span class="commit-hash">' + escapeHTML(c.shortHash) + '</span>' +
      '<span class="commit-author">' + escapeHTML(c.author || '') + '</span>' +
      '<span>' + (c.files ? c.files.length : 0) + ' files</span>' +
      '<span class="commit-stats">' +
      (c.stats && c.stats.insertions > 0 ? '<span class="stat-add">+' + c.stats.insertions + '</span>' : '') +
      (c.stats && c.stats.deletions > 0 ? '<span class="stat-del">-' + c.stats.deletions + '</span>' : '') +
      '</span>' +
      '</div>' +
      filesHTML +
      '</div>';
  }

  html += '</div>';
  return html;
}

function renderGitLogNormal(data, expandedCommits) {
  return renderGitLogList(data, expandedCommits);
}

function renderGitLog(data, error, expandedCommits) {
  var el = $('gitlog-body');

  if (error) {
    el.innerHTML = renderGitLogError(error);
  } else if (!data || !data.commits || data.commits.length === 0) {
    el.innerHTML = renderGitLogEmpty(data ? (data.totalCommits || 0) : 0);
  } else {
    var hasRecent = data.commits.some(function(c) {
      return Date.now() - new Date(c.date).getTime() < 24 * 60 * 60 * 1000;
    });

    if (!hasRecent) {
      el.innerHTML = renderGitLogPartial(data, expandedCommits);
    } else {
      el.innerHTML = renderGitLogNormal(data, expandedCommits);
    }
  }

  // Bind click handlers for expanding commits (event delegation)
  el.querySelectorAll('.commit-entry').forEach(function(entry) {
    entry.addEventListener('click', function(e) {
      var hash = this.dataset.hash;
      if (!hash) return;
      if (state.expandedCommits.has(hash)) {
        state.expandedCommits.delete(hash);
      } else {
        state.expandedCommits.add(hash);
      }
      renderGitLog(state.gitlog, state.errors.gitlog, state.expandedCommits);
    });
  });

  // Update summary
  if (data) {
    $('gitlog-summary').textContent = (data.commits ? data.commits.length : 0) + '/' + (data.totalCommits || 0) + ' commits';
  }
}

/* ═══════════════════════════════════════════════════════════════════
   Render: Process Monitor Panel
   ═══════════════════════════════════════════════════════════════════ */

function renderProcessEmpty() {
  return '<div class="empty-state">' +
    '<div class="empty-icon">▣</div>' +
    '<div class="empty-title">NO ACTIVE SESSIONS</div>' +
    '<div class="empty-desc">No Claude Code processes detected. ' +
    'Start a Claude Code session and it will appear here.</div>' +
    '</div>';
}

function renderProcessError(error) {
  return '<div class="error-state">' +
    '<div class="error-icon">⚠</div>' +
    '<div class="error-title">Process Monitor Error</div>' +
    '<div class="error-message">' + escapeHTML(error.message || 'Unable to read sessions directory') + '</div>' +
    '<div class="error-path">~/.claude/sessions/</div>' +
    '<button class="btn-retry" onclick="fetch(\'/api/processes\').then(r=>r.json()).then(d=>{state.processes.clear();d.forEach(function(p){state.processes.set(p.sessionId,p);});render();}).catch(e=>showToast(\'Retry failed\',true))">Retry</button>' +
    '</div>';
}

function renderProcessPartial() {
  return '<div class="partial-bar">' +
    '<span class="partial-icon">ℹ️</span>' +
    '<span>No processes detected. Pipeline data found on file system. ' +
    'Start Claude Code in this project directory to see live process updates.</span>' +
    '</div>';
}

function renderProcessCard(p) {
  var statusClass = p.decision ? 'status-decision' :
    p.attention ? 'status-sleeping' :
    p.status === 'idle' ? 'status-idle' : 'status-busy';

  var badgeLabel = p.decision ? 'DECISION?' :
    p.attention ? 'SLEEPING' :
    p.status === 'idle' ? 'WAITING' : 'WORKING';

  var badgeClass = p.decision ? 'badge-decision' :
    p.attention ? 'badge-sleeping' :
    p.status === 'idle' ? 'badge-idle' : 'badge-busy';

  var dotClass = p.decision ? 'dot-decision' :
    p.attention ? 'dot-sleeping' :
    p.status === 'idle' ? 'dot-idle' : 'dot-busy';

  var since = formatDuration(Date.now() - p.startedAt);
  var idleStr = p.idleMs > 0 ? formatDuration(p.idleMs) : null;

  return '<div class="process-card ' + statusClass + '" data-cwd="' + escapeHTML(p.cwd || '') + '" title="Click to copy path">' +
    '<div class="card-header">' +
    '<span class="card-project" title="' + escapeHTML(p.cwd || '') + '">' + escapeHTML(p.project) + '</span>' +
    '<span class="status-badge ' + badgeClass + '"><span class="status-dot ' + dotClass + '"></span>' + badgeLabel + '</span>' +
    '</div>' +
    '<div class="card-info">' +
    '<div><div class="info-label">PID</div><div class="info-value">' + p.pid + '</div></div>' +
    '<div><div class="info-label">Uptime</div><div class="info-value">' + since + '</div></div>' +
    '<div><div class="info-label">Started</div><div class="info-value">' + formatTime(p.startedAt) + '</div></div>' +
    '<div><div class="info-label">Updated</div><div class="info-value">' + formatTime(p.updatedAt) + '</div></div>' +
    '</div>' +
    '<div class="card-footer">' +
    '<span>' + escapeHTML(p.cwd || '') + '</span>' +
    (idleStr ? '<span class="idle-timer' + (p.decision ? ' decision' : p.attention ? ' sleeping' : '') + '">idle ' + idleStr + '</span>' : '') +
    '</div>' +
    '</div>';
}

function renderProcessNormal(processes) {
  var sorted = [];
  processes.forEach(function(p) { sorted.push(p); });
  sorted.sort(function(a, b) { return (b.startedAt || 0) - (a.startedAt || 0); });

  var cardsHTML = '';
  for (var i = 0; i < sorted.length; i++) {
    cardsHTML += renderProcessCard(sorted[i]);
  }

  return '<div class="process-grid">' + cardsHTML + '</div>';
}

function renderProcesses(processes, error) {
  var el = $('process-body');

  if (error) {
    el.innerHTML = renderProcessError(error);
  } else if (processes.size === 0) {
    el.innerHTML = renderProcessEmpty();
  } else {
    var hasPipeline = state.pipeline !== null;
    var allIdle = true;
    processes.forEach(function(p) {
      if (p.status !== 'idle') allIdle = false;
    });

    if (allIdle && !hasPipeline) {
      el.innerHTML = renderProcessPartial();
    } else {
      el.innerHTML = renderProcessNormal(processes);
    }
  }

  // Bind click handlers for copying paths
  el.querySelectorAll('.process-card').forEach(function(card) {
    card.addEventListener('click', function() {
      var cwd = this.dataset.cwd;
      if (cwd && navigator.clipboard) {
        navigator.clipboard.writeText(cwd).then(function() {
          showToast('Copied: ' + cwd);
        }).catch(function() {});
      }
    });
  });

  // Update summary
  $('process-summary').textContent = processes.size + ' active';
  $('agentCount').textContent = processes.size + ' agent' + (processes.size !== 1 ? 's' : '');
}

/* ═══════════════════════════════════════════════════════════════════
   Main Render
   ═══════════════════════════════════════════════════════════════════ */

function render() {
  renderPipeline(state.pipeline, state.errors.pipeline);
  renderGitLog(state.gitlog, state.errors.gitlog, state.expandedCommits);
  renderProcesses(state.processes, state.errors.process);
}

/* ═══════════════════════════════════════════════════════════════════
   SSE Client
   ═══════════════════════════════════════════════════════════════════ */

var es = null;

function connectSSE() {
  if (es) {
    es.close();
  }

  es = new EventSource('/events');

  es.addEventListener('connected', function() {
    state.connected = true;
    updateConnStatus();
  });

  es.addEventListener('pipeline:sync', function(e) {
    try {
      state.pipeline = JSON.parse(e.data);
      state.errors.pipeline = null;
      render();
    } catch (err) {
      showToast('Failed to parse pipeline data', true);
    }
  });

  es.addEventListener('pipeline:update', function(e) {
    try {
      state.pipeline = JSON.parse(e.data);
      state.errors.pipeline = null;
      render();
    } catch (err) {
      showToast('Failed to parse pipeline update', true);
    }
  });

  es.addEventListener('gitlog:sync', function(e) {
    try {
      state.gitlog = JSON.parse(e.data);
      state.errors.gitlog = null;
      render();
    } catch (err) {
      showToast('Failed to parse git log data', true);
    }
  });

  es.addEventListener('gitlog:update', function(e) {
    try {
      state.gitlog = JSON.parse(e.data);
      state.errors.gitlog = null;
      render();
    } catch (err) {
      showToast('Failed to parse git log update', true);
    }
  });

  es.addEventListener('process:sync', function(e) {
    try {
      var list = JSON.parse(e.data);
      state.processes.clear();
      for (var i = 0; i < list.length; i++) {
        state.processes.set(list[i].sessionId, list[i]);
      }
      state.errors.process = null;
      render();
    } catch (err) {
      showToast('Failed to parse process data', true);
    }
  });

  es.addEventListener('process:update', function(e) {
    try {
      var item = JSON.parse(e.data);
      state.processes.set(item.sessionId, item);
      state.errors.process = null;
      render();
    } catch (err) {
      showToast('Failed to parse process update', true);
    }
  });

  es.addEventListener('process:remove', function(e) {
    try {
      var data = JSON.parse(e.data);
      state.processes.delete(data.sessionId);
      render();
    } catch (err) {
      // ignore parse errors for removals
    }
  });

  es.addEventListener('error', function(e) {
    try {
      var errData = JSON.parse(e.data);
      state.errors[errData.source] = errData;

      if (errData.source === 'gitlog' && !errData.recoverable) {
        // Non-recoverable git error - show error state
        state.gitlog = null;
      }

      render();

      if (errData.recoverable) {
        showToast(errData.message, true);
      }
    } catch (err) {
      // If we can't parse the error event, show generic error
      showToast('Server error', true);
    }
  });

  es.onerror = function() {
    state.connected = false;
    updateConnStatus();
  };

  return es;
}

/* ═══════════════════════════════════════════════════════════════════
   Init
   ═══════════════════════════════════════════════════════════════════ */

function setupHelpModal() {
  var helpBtn = document.getElementById('helpBtn');
  var modal = document.getElementById('helpModal');
  var closeBtn = document.getElementById('helpClose');

  helpBtn.addEventListener('click', function() {
    modal.classList.add('active');
  });

  closeBtn.addEventListener('click', function() {
    modal.classList.remove('active');
  });

  // Click overlay to close
  modal.addEventListener('click', function(e) {
    if (e.target === modal) {
      modal.classList.remove('active');
    }
  });

  // Escape key to close
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && modal.classList.contains('active')) {
      modal.classList.remove('active');
    }
  });
}

function init() {
  setupHelpModal();
  setupPanelToggles();
  setupRefreshButtons();
  connectSSE();
}

// Wait for DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
