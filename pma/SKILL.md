---
name: pma
description: PMA 是 Paseo 的多模型工作流。用于用户点名 PMA 或明确要求这套协作的任务。按当前主会话分流，Codex Sol 主控协作由 Hydrogen 回显，Antigravity Orchestrator（Neon）主控默认直接交付。
---

# PMA

先确认当前顶层 Paseo 会话的提供商、模型和 agent ID。用会话的现有身份或 `PASEO_AGENT_ID` 配合 Paseo 状态工具核对。保留原会话，按实际提供商选择一路，再读对应参考：

- **Codex**。主控使用 `gpt-6.2-sol`，走 [Codex 主控流程](references/codex-workflow.md)。默认由 Hydrogen 交付。
- **Antigravity**。主控使用 **Orchestrator（Neon）**（`gemini-pro-orchestrator-neon`），走 [Antigravity 主控流程](references/antigravity.md)。主控直接交付，用户明确要求 Hydrogen 时才调用。
- 当前模型与该提供商的主控设置不符时，说明应在原会话选择哪个模型。PMA 按会话路由，不自动切换提供商或修改设置。

使用官方 Codex 与 Antigravity `agy acp`。严禁自建或第三方模型反代理、模型中转和消费订阅 API 转接。只发送用户授权范围内的材料，遵守项目的专门分工和确认点。相关任务按原主会话 ID 复用工作者，只传当前阶段需要的增量。

普通正文使用段落、列表和独立成行的粗体小节。一级和二级标题留给用户要求的长文或正式文档。中文说明放在公式外，双美元定界符各占一行。
