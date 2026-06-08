# Agent Team Dashboard

> Agent 团队可视化面板——一眼看清你的 Worker 在做什么。

Company OS 子模块，本地优先、零配置。三个面板覆盖从文件系统、Git 历史到 Claude Code 进程的全方位团队可见性。

---

## 启动

```bash
npx agent-team-dashboard
```

浏览器自动打开 `http://localhost:3456`。

> 在项目目录下运行——Dashboard 以当前目录为项目根，自动读取 `briefs/`、`src/`、`.git/` 来展示数据。

## 依赖要求

| 依赖 | 版本 | 说明 |
|------|------|------|
| Node.js | >= 18 | 运行时 |
| git | 任意版本 | Operation Log 面板需要；其他面板不依赖 |
| Claude Code | 可选 | Process Monitor 面板需要读取 `~/.claude/sessions/` |

## 三个面板

### Pipeline（流程）

实时的 5 阶段流程看板：Scout → Designer → Builder → Tester → Seller。通过 chokidar 监控 `briefs/` 和 `src/` 目录中的文件变化，自动判定每个阶段的完成状态。

### Operation Log（操作日志）

通过 git log 解析带 `[tag]` 前缀的语义提交，按 Worker 角色（scout / designer / builder / tester / seller）分类展示提交历史。5 秒轮询一次，自动检测变更。

### Process Monitor（进程监控）

监控 `~/.claude/sessions/` 目录，实时显示 Claude Code 进程状态（idle / busy / decision）。支持点击复制进程目录路径。

## 端口

默认 `3456`，可通过 `PORT` 环境变量或 `--port` 参数修改：

```bash
npm start -- --port 3457
# 或
PORT=3457 npm start
```

## API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/` | GET | Dashboard 界面 |
| `/api/pipeline` | GET | Pipeline 完整状态 |
| `/api/git-log` | GET | Git 日志完整状态 |
| `/api/processes` | GET | 当前进程列表 |
| `/events` | GET | SSE 实时推送 |
| `/shutdown` | GET | 优雅关闭服务器 |

## 端口被占用

```bash
# Windows
netstat -ano | findstr :3456  →  taskkill /PID <pid>
# 或使用不同端口
npm start -- --port 3457
```

## 数据流

```
文件系统变化 (briefs/, src/, .git/, ~/.claude/sessions/)
    │
    ▼
chokidar / git polling / file watchers
    │
    ▼
SSE broadcast (/events)
    │
    ▼
Browser rendering (零框架, 原生 JS)
```

## 技术栈

- **后端**：纯 Node.js（零框架，仅依赖 chokidar）
- **前端**：原生 HTML + CSS + JS（零框架）
- **实时通信**：Server-Sent Events (SSE)
- **文件监控**：chokidar
- **Git 监控**：5 秒轮询 git log
