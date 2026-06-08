---
title: "多 Agent 协作模型"
type: concept
tags:
  - multi-agent
  - collaboration
  - worker
  - architecture
  - file-system
created: 2026-06-08
updated: 2026-06-08
related:
  - "[[concepts/一人公司架构]]"
  - "[[concepts/Agent 自学习循环]]"
  - "[[concepts/硬盘即公司]]"
  - "[[concepts/Agent 记忆分级系统]]"
---

# 多 Agent 协作模型

> **Worker 之间不直接通信。四条共享通道 + 目录级权限边界 = 完整协作。**

## 核心原则

多 Agent 不需要框架——单程序多窗口，各自读各自的 CLAUDE.md。区别只在于从哪个目录启动、读到哪个 Worker 指令。

这个模型与 LangChain/AutoGPT/CrewAI 等多 Agent 框架有本质区别：
- **无消息总线**：Agent 间不发送消息、不调用彼此
- **无中央调度器**：没有 orchestrator 分配任务
- **文件系统即通信协议**：协作完全通过共享文件目录实现
- **用户是信使**：跨 Worker 的信息传递由用户负责

## 四条共享通道

```
projects/my-app/
├── briefs/                 ← 通道 4：阶段交接文档
│   ├── scout→designer.md
│   ├── designer→builder.md
│   └── builder→tester.md
├── scout/CLAUDE.md
├── designer/CLAUDE.md
├── builder/CLAUDE.md
├── tester/CLAUDE.md
├── seller/CLAUDE.md
├── src/                   ← 通道 1：共享代码
│   ├── ...
│   └── tests/             ← 特殊权限区（仅 Tester 可写）
└── (wiki/ + inboxes/)     ← 通道 2 + 3：公司级共享
```

### 通道 1：`src/` — 共享代码

Worker 通过读写同一个代码目录协作。核心规则是**目录级写权限**：

| 区域 | Builder | Tester | Designer |
|------|---------|--------|----------|
| `src/` 代码 | 读+写 | 只读 | 读+写 |
| `src/tests/` | 只读 | 读+写 | 只读 |

权限分拆的关键案例：`src/tests/` 只有 Tester 可写。Builder 能读测试、能运行测试，但不能改测试。这保证了**测试是独立的验收标准**。

### 通道 2：`wiki/` — 共享记忆

Cub 维护的公司级知识库，所有 Worker 只读。Worker 间不直接共享经验——经验通过 Cub 摄入后才进入共有记忆。

```
Worker A 踩坑 → inboxes/a.md → Cub 摄入 → wiki/ 更新 → Worker B 启动时读到
```

### 通道 3：`inboxes/` — 经验出口

每个 Worker 有独立的 inbox 文件（`inboxes/<role>.md`）。Worker 只能写自己的 inbox，不能读/写别人的。Cub 扫全部 inbox 并整合。

### 通道 4：`briefs/` — 阶段接力棒

Worker 按产品周期接力。5 阶段流水线，3 种 brief：

```
Scout（找方向+验证）  →  Designer（设计）  →  Builder（开发）  →  Tester（测试）  →  Seller（封版上线）
        │                       │                      │                    │                  │
        └─ scout→designer ─────┘                      │                    │                  │
                 └─ designer→builder ─────────────────┘                    │                  │
                          └─ builder→tester ──────────────────────────────┘                  │
                                   └─ fix-prompt ←→ Builder (同阶段内循环)                     │
                                            └─ 测试结果+示例 ─────────────────────── Seller    │
```

**3 种 brief**：

| Brief | 谁写 | 谁读 | 传递 |
|-------|------|------|------|
| `scout→designer` | Scout | Designer、Seller | 找方向+验证 → 设计；Seller 用赛道空白做营销 |
| `designer→builder` | Designer | Builder、Tester | 设计 → 开发+测试 |
| `builder→tester` | Builder | Tester | 记录实现偏差、已知限制 |

**产品周期 5 阶段**：

| 阶段 | Worker | 核心产出 |
|------|--------|---------|
| 找方向+验证 | Scout | 竞品分析、用户画像、赛道空白 |
| 设计 | Designer | JTBD + 信息架构 + 交互设计 + Design Token |
| 开发 | Builder | 可运行代码 + CLI 参考 + `builder→tester.md` |
| 测试 | Tester | 全流程 E2E 测试 + `fix-prompt.md`（如有 bug）+ 示例用法 |
| 封版上线 | Seller | 封版清理 + 打包发布 + README/快速入门/Landing Page + 分发运营 |

## 当前 Worker 角色

| Worker | 职责 | 核心约束 |
|--------|------|---------|
| **Scout** | 市场调研、竞品追踪、用户发现 | 调研结果写入 `briefs/scout→designer.md` |
| **Designer** | 产品设计、交互流程、视觉设计 | 不向外搜索；拒绝通用 AI 美学 |
| **Builder** | 编码、调试、端到端验证、CLI 参考 | `src/` 可写，`src/tests/` 只读；写 `builder→tester.md` |
| **Tester** | 全流程 E2E 测试、产出 fix-prompt、示例用法 | 不看代码写测试；一个 `e2e.test.js`；`src/tests/` 可写 |
| **Seller** | 封版清理、打包发布、README/快速入门/Landing Page、分发运营 | 读 Scout + Builder + Tester；对外第一责任人 |

## 为什么不用框架

| 框架方案 | 文件系统方案 |
|---------|-----------|
| Worker 间通过消息总线通信 | Worker 间不通信，读/写共享文件 |
| 需要 orchestrator 调度 | 用户启动不同窗口/会话 |
| Worker 状态由框架管理 | Worker 状态由断点标记管理 |
| 新增 Worker 需注册到框架 | 新增 Worker = 复制模板文件 |
| 依赖特定运行时 | 零依赖——纯文件系统 |

文件系统方案的鲁棒性来源：**每个 Worker 是独立进程，彼此不可见。** 一个 Worker 崩溃不影响其他 Worker。

## 设计权衡

**优势**：
- 增删 Worker 不影响已有模板（O(1) 操作）
- 权限边界声明在每个 Worker 文件中，无全局状态
- 文件系统天然提供版本控制（git）、冲突检测、审计
- 零运行时依赖——Worker 不需要同时在线

**代价**：
- 经验传播有延迟（Cub 扫 inbox 间隔）
- 无实时 Worker 间协调（需要用户传递紧急信息）
- 目录结构即约定——没有编译器检查权限违规
- 跨项目 Worker 复用依赖人工复制模板

---

*本页面是 Company OS 框架的种子概念页。可根据你的知识体系自由修改和扩展。*
