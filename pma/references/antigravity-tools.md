# Antigravity 执行细节

## 启用与派发

查看进度或已有结果时，使用主对话的 **PMA** 浮层。待授权与异常有处理入口，「成稿」查看已有 Hydrogen 结果，「自检」查看连接与工具设置，「速查」可复制协作模板。使用 `/pma` 发起新协作。

在运行 Antigravity CLI 的主机上把 `pma` 目录放入 `~/.gemini/config/skills/`，或在项目的 `.agents/skills/` 中安装。打开 Paseo 顶层 Antigravity 会话，选 Orchestrator（Neon），用 `/pma` 加上任务。已有 Antigravity 会话如果尚未出现新 Skill 或工具，可在空闲时重载该会话。 [Antigravity Skill 文档](https://antigravity.google/docs/skills) · [Paseo Antigravity 文档](https://paseo.sh/docs/supported-providers/antigravity)

通过 Paseo tools 核对当前会话、模型与已有工作者。用 `create_agent` 或 `send_agent_prompt` 派发，遵循 [权限继承规则](../SKILL.md#继承主控的权限档位)。Astra 使用 `settings.thinkingOptionId: "high"`。用 `paseo-workflow-root` 和 `paseo-workflow-role` 标签记录根会话和 `astra`、`sol`、`terra` 等角色。优先消费本轮完成摘要，必要时才按已知 ID 读取相关活动。缺少工具时检查服务端 **Enable Paseo tools** 及 Antigravity 提供商策略。派发也可用本机 Paseo CLI，Hydrogen 自动回显依赖插件工具。 [Paseo tools](https://paseo.sh/docs/mcp)

## 交接内容

| 接收人 | 交接 | 回报 |
| --- | --- | --- |
| Astra 计划审核 | Neon 草案、用户目标、已核实依据、权限、资源和验收 | 可派发的计划版本，每项注明责任、顺序、验收和待确认点 |
| 执行 Sol 或 Terra | 版本、任务编号、责任范围、输入位置、交付物和验收条件 | 任务结果、实际检查、证据位置、计划偏差、阻塞和待核项 |
| Astra 终审 | 审定计划变化、按编号的执行结果、证据、Neon 初步判断和不确定性 | 结论证据强度、修正、需定向补核的问题和补充建议 |
| Hydrogen（用户明确要求时） | Neon 核实后的成稿、受众和格式要求 | 显示在原对话的成稿 |

## 按需调用 Hydrogen

- **由原 Neon 主会话调用** `pma_hydrogen`，省略 `rootAgentId`。聊天用 `kind: "chat"` 并给简短 `brief`。润色用 `kind: "polish"`，把定稿放在 `fallbackDraft`，`brief` 写作要求。每项交付使用稳定的 `requestId`，如需重试沿用原 ID。
- 若收到 `pending: true`，等待同一交付回显，并在原主对话处理插件呈现的授权。收到 `delivered: true` 仅汇报交付状态。已保存的成稿可用 `/pma-replay` 恢复。若工具缺失或无法交付，Neon 在原对话提供已核实的正文或可打开的结果链接，说明润色状态。
- 首行原样 `hydrogen:`。Markdown 和公式保留，双美元公式定界各占一行。来源标签写在所对应内容前，单独成行并留空行。Hydrogen 只负责表达，查文件、运行命令和事实核对交给执行工作者或 Astra。
