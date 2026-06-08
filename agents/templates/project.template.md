# CLAUDE.md — {{PROJECT_NAME}}

> 项目级指令。Cub 和所有 Worker 启动后先读此文件定位全局上下文。

## 产品信息

- **产品名**：{{PROJECT_NAME}}
- **一句话**：{{PROJECT_DESC}}
- **目标用户**：{{TARGET_USER}}
- **定价锚点**：{{PRICING_ANCHOR}}

## 产品周期阶段

```
Scout  →  Designer  →  Builder  →  Tester  →  Seller
```

| 阶段 | Worker | 状态 | 产出 |
|------|--------|------|------|
| 找方向+验证 | Scout | ⏳ 待激活 | `briefs/scout→designer.md` |
| 设计 | Designer | ⏳ 待激活 | `briefs/designer→builder.md` |
| 开发 | Builder | ⏳ 待激活 | `src/` + `briefs/builder→tester.md` + CLI 参考 |
| 测试 | Tester | ⏳ 待激活 | `src/tests/e2e.test.js` + 示例用法 |
| 封版上线 | Seller | ⏳ 待激活 | README/快速入门 + Landing Page + 打包发布 + 分发 |

## 目录结构

```
projects/{{project-slug}}/
├── CLAUDE.md                     ← 本文件
├── briefs/
│   ├── scout→designer.md         ← Scout 写 → Designer/Seller 读
│   ├── designer→builder.md       ← Designer 写 → Builder/Tester 读
│   └── builder→tester.md         ← Builder 写 → Tester 读
├── scout/CLAUDE.md
├── designer/CLAUDE.md
├── builder/CLAUDE.md
├── tester/CLAUDE.md
├── seller/CLAUDE.md
└── src/
    ├── tests/                    ← Tester 唯一可写
    └── ...
```

## 硬约束（所有 Worker 通用）

- `wiki/`：所有 Worker 只读。Cub 是唯一维护者
- `inboxes/`：每个 Worker 只能写自己的文件
- Worker 之间不直接通信——通过 briefs/ 和用户传递信息
- 同项目其他 Worker 的子目录：只读（自己的目录除外）

## 共享记忆

- 导航：`../../wiki/index.md`
- 模板来源：`../../agents/templates/`
- 踩坑上报：`../../inboxes/<role>.md`

## 断点规则

- 存档：每个 Worker 在自己 CLAUDE.md 末尾写入 `<!-- ROLE:RESUME -->` 标记块
- 恢复：下次启动时检测标记块 → 读出 → 删除 → 继续
- 关键：读后即删，避免过期断点残留