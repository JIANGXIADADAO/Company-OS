# Company OS — 一人公司操作系统

> **你的整个公司，就是一个文件夹。**
>
> 零数据库、零安装脚本、零供应商锁定。AI Agent 团队 + 持久化知识库 + 文件系统协作。

## 这是什么

Company OS 是一人公司的**基础设施层**——一套基于 Markdown 文件系统和 Claude Code 的 AI Agent 协作框架。它让你：

- 🧠 **建立持久化知识库** — Cub（知识库 Agent）增量构建 wiki，不每次从零检索
- 🤖 **运行 5 人 AI 团队** — Scout → Designer → Builder → Tester → Seller，按产品周期接力
- 📂 **拥有全部数据** — 纯文本 Markdown + Git 版本控制，不绑定任何平台
- 💻 **跨机器运行** — 整个公司放移动硬盘，插哪台电脑都能继续工作

## 核心概念

| 概念 | 一句话 |
|------|--------|
| [[wiki/concepts/硬盘即公司|硬盘即公司]] | 整个公司是移动硬盘上的一个文件夹 |
| [[wiki/concepts/一人公司架构|一人公司架构]] | 知识层 + Agent 层 + 执行层 + 界面层的四层模型 |
| [[wiki/concepts/LLM Wiki 方法论|LLM Wiki 方法论]] | 预索引压倒运行时检索的知识管理范式 |
| [[wiki/concepts/Agent 记忆分级系统|Agent 记忆分级系统]] | 五级记忆金字塔：宪法 → 地图 → 领域 → 过程 → 归档 |
| [[wiki/concepts/多 Agent 协作模型|多 Agent 协作模型]] | 文件系统四条共享通道，Worker 间不直接通信 |
| [[wiki/concepts/预索引 vs 运行时扫描|预索引 vs 运行时扫描]] | 提前建索引 vs 每次扫描——查询远超索引次数时预索引是压倒性更优策略 |

## 快速开始

### 前置条件

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) 已安装：`npm install -g @anthropic-ai/claude-code`
- 已认证：`claude login`
- （可选）[Obsidian](https://obsidian.md) — 用于可视化浏览 wiki

### 5 步上手

```bash
# 1. 克隆或复制本仓库
git clone <your-repo-url> my-company
cd my-company

# 2. 启动 Cub（知识库维护者）
claude

# 3. 告诉 Cub 你的背景和关注领域
#    Cub 会将这些写入 wiki/overview.md 和 wiki/concepts/

# 4. 添加你的第一批来源
#    把文章、论文、播客笔记放入 raw/ 对应目录
#    告诉 Cub "摄入 raw/articles/xxx.md"

# 5. 启动你的第一个项目
mkdir -p projects/my-first-product/src
cp agents/templates/project.template.md projects/my-first-product/CLAUDE.md
# 编辑 CLAUDE.md，填入项目信息
cd projects/my-first-product && claude  # 从 Scout 开始
```

## Worker 团队

| Worker | 职责 | 激活方式 |
|--------|------|----------|
| **Scout** | 市场调研、竞品追踪、用户发现 | `cp agents/templates/scout.template.md projects/<p>/scout/CLAUDE.md` |
| **Designer** | 产品设计、交互流程、视觉设计 | `cp agents/templates/designer.template.md projects/<p>/designer/CLAUDE.md` |
| **Builder** | 编码、调试、端到端验证 | `cp agents/templates/builder.template.md projects/<p>/builder/CLAUDE.md` |
| **Tester** | 全流程 E2E 测试、产出修复指令 | `cp agents/templates/tester.template.md projects/<p>/tester/CLAUDE.md` |
| **Seller** | 封版清理、打包发布、产品页面、分发运营 | `cp agents/templates/seller.template.md projects/<p>/seller/CLAUDE.md` |

详见 [[wiki/concepts/多 Agent 协作模型|多 Agent 协作模型]]。

## 工具

| 工具 | 说明 |
|------|------|
| **Agent Team Dashboard** | 本地优先的 Agent 团队可视化面板——流程 + 操作日志 + 进程监控。详见 [Dashboard README](tools/dashboard/README.md) · `cd tools/dashboard && npm start` |

## 目录结构

```
my-company/
├── CLAUDE.md              ← Cub 宪法（每次启动必读）
├── TASKS.md               ← 公司基础设施待办
├── .claude/               ← Claude Code 配置（跟着仓库走）
├── agents/                ← Agent 模板（人力资源部）
├── wiki/                  ← 长期记忆（Cub 唯一写者）
├── tools/                 ← 可复用工具脚本
│   └── dashboard/          ← Agent 团队可视化面板
├── raw/                   ← 不可变原始来源
├── inboxes/               ← Worker 踩坑收件箱
├── projects/              ← 进行中的项目
└── archive/               ← 已封存项目
```

## 设计哲学

1. **零数据库** — 所有数据是纯文本 Markdown，文件管理器就是数据库浏览器
2. **零安装脚本** — 没有 `npm install`、没有 `docker-compose up`
3. **多 Agent 不需要框架** — 一个 Claude Code 程序，多窗口多开，各自读各自的 CLAUDE.md
4. **读是自由的，写是单点的** — Worker 自由读 wiki，只有 Cub 能写——防止语义冲突
5. **硬盘即公司** — 拔掉硬盘，公司下班。插上另一台电脑，继续

## 从哪里开始读

1. 先读本文件（你正在读）
2. 再读 [[CLAUDE.md]] — Cub 的宪法，理解系统规则
3. 然后读 [[wiki/overview|概览]] — 知识库的全局图景
4. 最后读 [[wiki/index|索引]] — 按需深入各个概念页

## 协议

MIT — 自由使用、修改、分发。详见 [LICENSE](LICENSE)。

---

🤖 基于 [Company OS](https://github.com/jiangxiadadao/company-os) 框架构建。
