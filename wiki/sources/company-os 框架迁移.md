---
title: "Company OS 框架迁移"
type: source
tags: [source, meta, framework]
created: 2026-06-08
updated: 2026-06-08
source: "从 JIANGXIA 的 我的公司/ 知识库迁移"
---

# Company OS 框架迁移

> 本框架的核心体系提取自 JIANGXIA 的「我的公司」知识库的实践经验。

## 来源背景

JIANGXIA 在 2026 年 5-6 月期间，基于 LLM Wiki 方法论、Anthropic Agent 设计模式、以及多个开源一人公司项目，构建了一套完整的 AI Agent 协作操作系统。该系统在实践中被验证有效：
- 成功运行 5 Worker 团队完成 CHANGELOG 工具的产品全周期
- 增量构建了 60+ 页的结构化 wiki
- 形成了完整的知识管理 + 多 Agent 协作方法论

## 迁移内容

从「我的公司」知识库中提取了以下框架层内容，适配为通用模板：

### 宪法与配置
- `CLAUDE.md` — Cub 宪法（去掉个人断点信息，保留核心原则和四大工作流）
- `TASKS.md` — 待办模板
- `.claude/settings.json.example` — 权限与 Hook 配置示例

### Agent 模板（6 个）
- `agents/cub.md` — Cub persona
- `agents/templates/project.template.md` — 项目级模板
- `agents/templates/scout.template.md` — Scout Worker
- `agents/templates/designer.template.md` — Designer Worker
- `agents/templates/builder.template.md` — Builder Worker
- `agents/templates/tester.template.md` — Tester Worker
- `agents/templates/seller.template.md` — Seller Worker

### Wiki 种子概念页（8 个）
- [[concepts/一人公司架构]] — 四层架构模型
- [[concepts/硬盘即公司]] — 物理层终极部署方案
- [[concepts/LLM Wiki 方法论]] — 知识管理核心方法论
- [[concepts/Agent 记忆分级系统]] — 五级记忆金字塔
- [[concepts/Agent 自学习循环]] — Worker 经验闭环
- [[concepts/多 Agent 协作模型]] — 四条共享通道 + 权限边界
- [[concepts/预索引 vs 运行时扫描]] — 两种范式的对比与实证
- [[concepts/CLAUDE.md 写作规范]] — 宪法节优先级体系

### 种子页面
- `wiki/index.md` — 路由器（带填写指南）
- `wiki/overview.md` — 全局图景（带模板框架）
- `wiki/log.md` — 时间线日志（带格式说明）

## 适配原则

- 去掉所有个人特定的引用（具体来源对话、外部仓库等）
- 保留通用理论框架和方法论
- 所有概念页标注"Company OS 框架的种子概念页"
- 用户填写区域用 `<!-- TODO -->` 标注
- 项目内 wikilink 全部自包含，不依赖外部知识库

## 与源知识库的关系

本框架是「我的公司」的**提取和泛化**——去掉了个人内容，保留了经过验证的系统设计。源知识库继续作为 JIANGXIA 的个人知识库运行，本框架作为独立仓库供他人复用。
