---
title: "Agent 自学习循环"
type: concept
tags:
  - agent-memory
  - self-learning
  - inbox-pattern
  - cub
  - multi-agent
created: 2026-06-08
updated: 2026-06-08
related:
  - "[[concepts/Agent 记忆分级系统]]"
  - "[[concepts/一人公司架构]]"
  - "[[concepts/LLM Wiki 方法论]]"
---

# Agent 自学习循环

> **Worker 踩坑 → 极低摩擦吐碎片 → Cub 定时摄入 → wiki 更新 → 下一次 Worker 启动时已经变聪明了。**

这是多 Agent 系统中知识从实践到沉淀的完整闭环。

## 循环全景

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│   Worker A ──→ inboxes/builder.md ──┐                    │
│   Worker B ──→ inboxes/scout.md  ──┤                    │
│                                     │                    │
│               Cub 定时扫 inboxes/ ←─┘                    │
│                 │                                        │
│                 ├── 合并重复经验                          │
│                 ├── 关联已有 wiki                         │
│                 ├── 标注来源（Worker 观察，待验证）         │
│                 ├── 写入 wiki/ 对应页面                   │
│                 ├── 更新 index.md / overview.md / log.md  │
│                 └── 清空 inbox 条目                       │
│                                                          │
│   下次 Worker A 启动 → 读 index.md → 新坑已在 wiki 里     │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

## 三步机制

### Step 1：极低摩擦捕获（Worker → inbox）

Worker 在干活时发现一个值得记录的经验——

**规则**：
- 格式：`- [YYYY-MM-DD] 一句话描述`
- 路径：`inboxes/<worker-name>.md`
- 耗时：不超过 10 秒
- 心态：不需要判断"这个值不值得写"——先吐出来，由 Cub 决定

**示例**：
```
- [2026-06-01] Scrapling 的 Turnstile 绕过在 3s 检测窗口失效
- [2026-06-01] Cabinet cron 在 WebSocket 断开后不自动恢复
```

Worker 不花心思整理——它只管吐。

### Step 2：集中式摄入（Cub 扫 inbox → wiki）

Cub 定时（或按阈值触发）扫描 `inboxes/` 目录：

**触发条件**（推荐混合模式）：
- 每次启动时自动扫一次
- 或任一个 inbox 积累 ≥ 5 条新经验时立即触发

**Cub 的摄入流程**：
1. 读所有 inbox 中的待处理条目
2. 合并重复——两个 Worker 踩了同一个坑？
3. 关联已有 wiki——这个经验属于哪个概念页？哪个实体页？
4. 写入对应 wiki 页面（标注来源为 `inboxes/<worker>`）
5. 更新 index.md、log.md
6. 清空对应的 inbox 条目

### Step 3：质量闸门

- 写入时必须标注来源身份——"Builder Worker 在 2026-06-01 的踩坑记录（待验证）"
- 发现外部来源佐证时升级验证等级
- 防止循环自证——Worker 踩坑 → Cub 写进 wiki → Worker 信了 wiki → wiki 内容其实是 Worker 自己上报的

## 经验验证等级

"Worker 观察，待验证"不是永久的标签——它是一套升迁机制。

```
待验证          →  1 个 Worker 报告，未独立验证
多次观察确认    →  2+ Worker 独立遇到或同一 Worker 反复触发
已知局限        →  外部来源佐证或已被广泛承认
已解决          →  已被新版本/补丁修复
```

### Worker 如何对待不同等级

| 等级 | Worker 的处理方式 |
|------|-----------------|
| **待验证** | "wiki 说有人踩过这个坑，我留意一下。先拿最小样本验证" |
| **多次观察确认** | "大概率是真的，我主动规避或准备应对方案" |
| **已知局限** | 当事实用——避坑或针对性处理 |
| **已解决** | 忽略——选择修复后的版本或方法 |

**关键原则**：Worker 采纳的是"注意这个风险点"，不是"这件事一定是真的"。

---

*本页面是 Company OS 框架的种子概念页。可根据你的知识体系自由修改和扩展。*
