# Agent Team Dashboard

> 本地优先的 Agent 团队可视化面板。**Pipeline + 操作日志 + 进程监控**，一个页面看清项目全貌。

---

## 启动

```bash
cd 你的项目目录
npx agent-team-dashboard
```

浏览器自动打开 `http://localhost:3456`。Dashboard 以当前目录为项目根，自动读取文件系统数据。首次启动如项目无 Git 则自动初始化。

---

## 核心功能：全流程操作日志

### 两层 Commit，双重保障

| 层级 | 触发方式 | 标签 | 示例 |
|------|---------|------|------|
| **自动存盘** | `.claude/settings.json` 的 PostToolUse hook——Worker 每次 Write/Edit 自动 commit | `[auto]` | `[auto] Write briefs/scout→designer.md` |
| **语义节点** | Worker 在关键交付点手动 commit | `[scout]` `[builder]` 等 | `[builder] Pipeline 面板完成` |

Dashboard Operation Log 面板展示语义 commit——每条对应一个真实交付节点。自动存盘保留完整历史，随时 `git log` 回溯。

### 设置自动存盘 Hook

在项目目录创建 `.claude/settings.json`：

```bash
mkdir -p .claude
cat > .claude/settings.json << 'EOF'
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "cd ${CLAUDE_PROJECT_DIR} && git add -A && git commit -m \"[auto] ${CLAUDE_TOOL_NAME} ${CLAUDE_FILE_PATH}\""
          }
        ]
      }
    ]
  }
}
EOF
```

或从 Company OS 模板直接复制：`cp agents/templates/settings.json .claude/settings.json`

### 语义 Commit 标签

Worker 在交付检查清单中按节点 commit，Dashboard 按标签分类展示：

| 标签 | Worker | 典型 commit |
|------|--------|-----------|
| `[scout]` | Scout | `[scout] 竞品分析完成`、`[scout] 调研交付` |
| `[designer]` | Designer | `[designer] 需求分析完成`、`[designer] 设计交付` |
| `[builder]` | Builder | `[builder] Pipeline 面板完成`、`[builder] Git Log 解析 bug 修复` |
| `[tester]` | Tester | `[tester] 测试计划完成`、`[tester] 38/38 全部通过` |
| `[seller]` | Seller | `[seller] 封版清理完成`、`[seller] 产品已发布` |

### 回退

Dashboard 不写 Git——只读。回退用标准 Git 操作：

```bash
git log --oneline                  # 找到要回退的 commit
git revert <hash>                  # 回退一个节点
# 或
git reset --hard <hash>            # 回退整个项目到某个节点
```

---

## 三个面板

### Pipeline（流程面板）

实时 5 阶段看板：Scout → Designer → Builder → Tester → Seller。chokidar 监听 `briefs/` 和 `src/`，文件变化时自动更新阶段状态。

### Operation Log（操作日志面板）

解析 git log 中带 `[tag]` 前缀的语义 commit，按 Worker 角色分类展示时间线。5 秒轮询，点击展开查看文件变更详情。

### Process Monitor（进程监控面板）

监听 `~/.claude/sessions/`，实时显示 Claude Code 进程状态卡片（idle / busy / decision）。点击复制进程目录路径。

---

## 依赖

| 依赖 | 要求 | 说明 |
|------|------|------|
| Node.js | >= 18 | 运行时 |
| Git | 任意版本 | Operation Log 需要；Dashboard 首次启动自动 `git init` |
| Claude Code | 可选 | Process Monitor 需要 |

---

## 端口

默认 `3456`，可通过 `--port` 或 `PORT` 环境变量修改：

```bash
npx agent-team-dashboard --port 3457
PORT=3457 npx agent-team-dashboard
```

---

## 数据流

```
briefs/ src/ .git/ ~/.claude/sessions/
        │
        ▼
chokidar / git polling / file watchers
        │
        ▼
SSE broadcast (/events)
        │
        ▼
Browser rendering（零框架）
```

---

## 技术栈

纯 Node.js + 原生 HTML/CSS/JS。仅 chokidar 一个运行时依赖。SSE 实时推送，零构建步骤。
