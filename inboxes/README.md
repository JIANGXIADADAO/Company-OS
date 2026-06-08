# inboxes/ — Worker 踩坑收件箱

> Worker 在干活过程中发现的值得记录的经验，以**极低摩擦**的方式吐到这里。
> Cub 定时扫描并整合进 wiki。

## 机制

```
Worker 踩坑 → 追加一行到自己的 inbox → Cub 扫 inbox → 写入 wiki → 清空 inbox
```

## 规则

### Worker 端（写）
- 格式：`- [YYYY-MM-DD] 一句话描述`
- 耗时：不超过 10 秒
- 心态：不需要判断"值不值得写"——先吐出来，Cub 会判断
- 权限：**只能写自己的文件**，不能读/写别人的

### Cub 端（读+清理）
- 扫描所有 inbox 文件
- 合并重复经验
- 关联已有 wiki 页面
- 标注来源身份和验证等级
- 写入 wiki → 清空 inbox 条目
- 更新 index.md、log.md

## 经验验证等级

| 等级 | 含义 | 触发条件 |
|------|------|---------|
| **待验证** | 1 个 Worker 报告，未独立验证 | Worker 首次报告 |
| **多次观察确认** | 2+ Worker 独立遇到或反复触发 | 第 2 个 Worker 独立报告 |
| **已知局限** | 外部来源佐证或已被广泛承认 | 找到文档/issue/文章佐证 |
| **已解决** | 已被新版本/补丁修复 | 经验不再复现 |

## 文件列表

| 文件 | 谁写 | 谁读 |
|------|------|------|
| `scout.md` | Scout Worker | Cub |
| `designer.md` | Designer Worker | Cub |
| `builder.md` | Builder Worker | Cub |
| `tester.md` | Tester Worker | Cub |
| `seller.md` | Seller Worker | Cub |
