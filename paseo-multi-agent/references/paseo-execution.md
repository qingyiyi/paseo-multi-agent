# Paseo 执行细节

## 原对话与可用工具

在原 Paseo Codex 对话的模型选择器切到 GPT‑6.1 Terra，然后发送 `/pma` 加实际任务。直接使用 Codex 时可用 `$pma`。老命令 `/paseo-multi-agent` 仍可使用。安装时把 `pma` 和 `paseo-multi-agent` 两个目录放进实际运行 Codex 的主机上的 `~/.agents/skills/`。若 Paseo 客户端连远端主机，Skill 由远端 Codex 加载。主会话身份用 `PASEO_AGENT_ID` 或已确认的 Paseo agent ID，即使 Hydrogen 由子代理 Astra 派发，交付目标也是原 Terra 主会话。不要仅靠标题选会话。 [Codex Skill 安装位置](https://learn.chatgpt.com/docs/build-skills)

优先用当前会话已有的 Paseo MCP 工具。以实时工具定义为准。

| 动作 | 适用工具 |
| --- | --- |
| 核对可用提供商、模型与会话模式 | `list_providers`、`list_models`、`inspect_provider` |
| 发现并核对工作者 | `list_agents`、`get_agent_status`，后台工作者需包含在查询中 |
| 启动某角色的首个任务 | `create_agent` 的 `provider`、`initialPrompt`、`labels` 等字段。Astra 使用 `settings.thinkingOptionId: "high"`，启动后核对有效设置 |
| 在已有工作者上派发 | `send_agent_prompt` 的 `agentId` 和 `prompt` |
| 调整已存在的工作者设置 | `update_agent` 的 `settings.model` 或 `settings.thinkingOptionId`，先等空闲，改完后核对实际生效的设置 |
| 读计划或执行结论 | 优先用当前任务的完成摘要，必要时仅用 `get_agent_activity` 获取相关结论。Hydrogen 结果由展示桥接读取 |

跨提供商创建工作者时，先检查模式。Neon 默认起草，Opus 路线中由 Opus 起草、Neon 补充。Hydrogen 负责聊天回复或润色，依据已授权的输入处理。可用时使用适合文本工作的受限模式，明确无需改文件或展开工作区历史。工作者只使用用户已授权的能力。发现计划缺失执行授权或有未解决的阻塞时，Astra 停住受影响的工作。

如果当前会话缺少工具，先检查 **Settings → 服务器 → Agents → Enable Paseo tools**。若工具已经启用但旧会话还未收到，可在其空闲时重载该 agent 来加载新工具，保留原线程。Skill 不自动改设置、重启服务或中断运行。Shell 可用时，现有 `paseo run --provider codex/gpt-6.2-sol --no-wait`、`paseo send` 和 `paseo inspect` 可补足执行委派与状态查询。当前 CLI 的 `paseo agent update` 无 `--model`，切换 Gemini 用 MCP 或用户界面的模型选择器。 [Paseo 委派文档](https://paseo.sh/docs/orchestration#get-started) · [Paseo MCP 工具](https://paseo.sh/docs/mcp)

## 找回同一工作者

- 在当前主会话相关的已有工作者中按实际 ID 复用。创建新工作者时，用标签 `paseo-workflow-root` 记录原 Terra 主会话 ID，并用 `paseo-workflow-role` 标记 `sol`、`terra`、`neon` 或相应角色。Terra 主控的 ID 与 Terra 工作者不同。Astra 接手后按原主会话身份查找，避免因为直接父会话改变而创建第二份。可用 `paseo ls --background --label <键=值>` 查标签，再用 `paseo inspect <完整ID>` 核对。
- 对无标签的旧工作者，只有已确认是本主会话之前用于同一工作范围的工作者时才复用。核对身份失败时，保留其他会话的工作者，按需创建当前对话的工作者。
- 对正在执行同一任务的工作者等待结果。只有任务未投递时才发送，避免因为摘要暂未返回而创建第二份工作。Neon 规划会话优先持续复用。若共用同一 Gemini 会话切换到 Hydrogen，先等空闲，再核对模型及上下文是否适用。聊天与无关规划的历史分开，避免把过往计划混入回复或带进额外输入。
- 对相关任务延续现有上下文。若旧内容与新任务无关、失败状态无法恢复或需隔离资料，启用新的短上下文，并仅在当前阶段用一个可用工作者。

## 交接文本

**聊天交给 Hydrogen**。Terra 只附上当前消息以及消除指代歧义所需的少量信息。涉及即时状态或工作区事实时，经授权查证后用简短事实说明。通过经验证的展示桥接提交时，明确指定原主会话 ID。

```text
请直接回答用户这条消息。只使用必要背景，保留已有事实和不确定性。
第一行必须原样输出 hydrogen:，从下一行开始写回复正文。
```

**任务单发给起草者**。默认 Neon。明确点名 Opus 5.5 时先请 Opus 5.5 起草，再附上任务单和初稿交给 Neon。

```text
按用户目标设计可执行计划。说明范围、建议分工、依赖、验收和阻塞。
先返回一版简明计划，供 Astra 核对与完善。

目标和交付物
必要事实和证据定位
允许动作、范围和约束
需要满足的验收条件
```

**计划交给 Astra High**。传规划结果或精确的工作者 ID 和本轮结果定位、相关硬约束与原主会话 ID。Astra 核对并修订计划，依据修订版逐项派发。已有工作在执行时，只给受影响的工作者发必要的修订或增量。已完成的工作直接引用证据。Sol 和 Terra 的执行结果回给 Astra，Terra 主会话可接收完成状态或定稿定位。

**Opus 路线的来源标注**。Opus 初稿的重要建议标为 `[Opus 5.5]`。Neon 对照初稿返回增量和所针对的条目，使用 `[Neon]`。Astra 审核后将实质修正与新增细节标为 `[Astra]`，结合多人贡献的同一条可使用多个标签。交付时保留接受的建议来源，重要分歧可简要说明取舍。无需为每次编辑建立额外的版本清单。

**子任务发给 Sol 或 Terra**。已有工作者接收变化和当前任务所需的引用。

```text
子任务与预期交付物
相关目录、文件或证据位置
允许的读写范围与必须遵守的约束
完成后要核对的命令、指标或事实

请回报完成状态、关键结果、证据位置和未解决事项。
```

**定稿发给 Hydrogen**。正文如需保留 Markdown 链接和公式，在交接前确认已包含于稿件。

```text
请润色下方定稿，保留结论、数字、公式、引用、链接、来源标签和不确定性的程度。
按给定受众、语言和篇幅改善措辞与结构。无需查证、调用工具或解释你的改动。
第一行必须原样输出 hydrogen:，其前不得有标题、代码围栏或说明。
从下一行开始输出成稿正文。

受众、语言和格式要求
已确认定稿正文
```

## Hydrogen 结果的去向

- 真实 Hydrogen 回复统一以单独一行 `hydrogen:` 开始。手动交接使用上面的聊天或润色模板。若展示桥接有格式校验，确保首行标记只出现一次。Terra 的备用答复、Astra 原稿和进度使用各自的身份标识。
- 只有当前主会话存在确认能仅在界面展示成稿的 Paseo 桥接时，才使用自动回显。插件使用原 Terra 主会话 ID 和任务身份进行交付及去重。Terra 和 Astra 只收状态。普通代理消息、完成通知、模型可见的工具返回和时间线展示项是不同通道。插件可用 `timeline.append` 展示结果。重启恢复使用已保存的正文。 [Paseo 0.17.4 插件时间线接口](https://github.com/getpaseo/paseo/blob/v0.17.4/public-docs/plugins/reference.md#append-a-timeline-row-from-the-daemon)
- 自动回显尚无交付确认时，Terra 仅记录进度。确认桥接缺失或无法交付时，Terra 在原主对话提供 Astra 定稿或可打开的结果链接，聊天给出备用答复。以实际交付为准，进度摘要和工作者完成状态不作为已交付的证明。
- 若用户明确接受成稿留在 Gemini 会话，选择用户能打开的 Hydrogen 工作者。调用 `create_agent` 或 `send_agent_prompt` 时，明确设置 `notifyOnFinish: false`。控制端只说明用户应打开哪个工作会话，避免读取其正文或要求 Gemini 发回主控。无法确认没有模型回传时，让用户在 Gemini 工作会话内手动发消息或定稿。 [Paseo 完成通知设置](https://paseo.sh/docs/mcp)
- 用户下一条普通消息仍由 Terra 接收。针对结论的追问可基于 Astra 原稿和证据转交，针对 Hydrogen 具体措辞的追问可由用户显式引用必要句段。
