# Paseo 执行细节

## 原对话与可用工具

在原 Paseo Codex 对话的模型选择器切到 GPT‑6.2 Sol。选择 `/pma` 并追加实际任务。直接使用 Codex 时用 `$pma`。把 `pma` 目录放进实际运行 Codex 的主机上的 `~/.agents/skills/`。若 Paseo 客户端连远端主机，Skill 由远端 Codex 加载。主会话身份用 `PASEO_AGENT_ID` 或已确认的 Paseo agent ID，即使 Hydrogen 由子代理 Astra 调用，交付目标也是原主控 Sol 会话。不要仅靠标题选会话。 [Codex Skill 安装位置](https://learn.chatgpt.com/docs/build-skills)

优先用当前会话已有的 Paseo MCP 工具。以实时工具定义为准。

用户只需查看进度或已有成稿时，指向输入框旁的 **PMA** 浮层。待授权与异常有处理入口，「成稿」按需预览或复制已有 Hydrogen 结果，「自检」查看主控模型、连接与工具设置，「速查」可复制协作模板。打开这些入口不派发模型任务或另存数据。使用 `/pma` 发起新协作，`/pma-replay` 在需要时恢复已存回显。

| 动作 | 适用工具 |
| --- | --- |
| 核对可用提供商、模型与会话模式 | `list_providers`、`list_models`、`inspect_provider` |
| 发现并核对工作者 | `list_agents`、`get_agent_status`，后台工作者需包含在查询中 |
| 启动某角色的首个任务 | `create_agent` 的 `provider`、`initialPrompt`、`labels` 和 `settings.modeId`。Astra 使用 `settings.thinkingOptionId: "high"`，启动后核对有效设置 |
| 在已有工作者上派发 | `send_agent_prompt` 的 `agentId`、`prompt` 和 `sessionMode` |
| 调整已存在的工作者设置 | `update_agent` 的 `settings.model` 或 `settings.thinkingOptionId`，先等空闲，改完后核对实际生效的设置 |
| 读计划或执行结论 | 优先用当前任务的完成摘要，必要时仅用 `get_agent_activity` 获取相关结论。Hydrogen 结果由展示桥接读取 |
| 生成并显示 Hydrogen 成稿 | Paseo 工具 `pma_hydrogen`。后台 Hydrogen 会话由插件管理，主控只收到交付回执 |

两种派发都按 [权限继承规则](../SKILL.md#继承主控的权限档位) 从原主会话取得模式。工作者只使用用户已授权的能力。遇到授权缺口或计划阻塞时，由主控 Sol 暂停受影响的工作。

如果当前会话缺少工具，先检查 **Settings → 服务器 → Agents → Enable Paseo tools**。若工具已经启用但旧会话还未收到，可在其空闲时重载该 agent 来加载新工具，保留原线程。Skill 不自动改设置、重启服务或中断运行。Shell 可用时，现有 `paseo run --provider codex/gpt-6.2-sol --no-wait`、`paseo send` 和 `paseo inspect` 可补足执行委派与状态查询。当前 CLI 的 `paseo agent update` 无 `--model`，切换 Gemini 用 MCP 或用户界面的模型选择器。 [Paseo 委派文档](https://paseo.sh/docs/orchestration#get-started) · [Paseo MCP 工具](https://paseo.sh/docs/mcp)

## 找回同一工作者

- 在当前主会话相关的已有工作者中按实际 ID 复用。创建新工作者时，用标签 `paseo-workflow-root` 记录原主控 Sol 会话 ID，并用 `paseo-workflow-role` 标记 `sol`、`terra`、`neon` 或相应角色。主控 Sol 的 ID 与执行 Sol 工作者不同，Terra 子工作者也有独立 ID。Astra 接手后按原主会话身份查找，避免因为直接父会话改变而创建第二份。可用 `paseo ls --background --label <键=值>` 查标签，再用 `paseo inspect <完整ID>` 核对。
- 对无标签的旧工作者，只有已确认是本主会话之前用于同一工作范围的工作者时才复用。核对身份失败时，保留其他会话的工作者，按需创建当前对话的工作者。
- 对正在执行同一任务的工作者等待结果。只有任务未投递时才发送，避免因为摘要暂未返回而创建第二份工作。让同一个 Neon 完成同一任务的规划和结果分析，同一个 Astra 完成两次审核。Hydrogen 由展示插件管理。聊天与无关规划的历史分开。
- 对相关任务延续现有上下文。彼此无关的任务启用新的短会话，避免携带旧历史。失败状态无法恢复或需隔离资料时同样使用新会话，并仅在当前阶段用一个可用工作者。复用会话时评估历史增长和实际用量。

## 交接文本

**聊天交给 Hydrogen**。主控 Sol 只附上当前消息以及消除指代歧义所需的少量信息。涉及即时状态或工作区事实时，由执行 Sol 查证后交接简短事实。通过经验证的展示桥接提交时，明确指定原主会话 ID。

```text
请直接回答用户这条消息。只使用必要背景，保留已有事实和不确定性。
第一行必须原样输出 hydrogen:，从下一行开始写回复正文。
```

**详细任务材料发给 Neon**。主控 Sol 提供与当前决策有关的全部已核实材料。把必要数值、关键证据摘录和口径直接写进交接，较大材料附精确出处及用途。需对关键背景做现场查证时，先调用有权限的执行工作者。明确点名 Opus 5.5 时，先发给 Opus 5.5 起草，再把同一份材料和 Opus 初稿交给 Neon 补全。

```text
输入
- 用户目标、交付物、已确认决定与待确认选择
- 当前状态、已有计划及其取舍、已完成项、基线、已核实结果、可用证据及位置
- 可用资源、时间或预算、读写和授权边界、验收口径
- 已知未知项、数据差异、失败条件与相关依赖

输出
- 建议及其依据，有实质差异时说明备选方案与取舍
- 逐项任务编号、执行人、依赖、输入、操作步骤、输出物和证据位置
- 验收方法、必要对照、通过与失败条件、阻塞处理和需用户决策的点
- 每个关键假设的核实方式；缺失事实列为待查项
```

**计划交给 Astra High**。提供 Neon 计划、关键依据、硬约束和原主会话 ID。请 Astra 核对能否落地，补足执行与验收细节，逐项提出需要修订或确认的点，返回带版本的审定计划。主控 Sol 只派发审定且已授权的任务。发现变动时，提交受影响任务及新证据给 Astra，并在收到修订后只向受影响的工作者发送增量。

**Opus 路线的来源标注**。Opus 初稿的重要建议标为 `[Opus 5.5]`。Neon 对照初稿返回增量和所针对的条目，使用 `[Neon]`。Astra 审核后将实质修正与新增细节标为 `[Astra]`，结合多人贡献的同一条可使用多个标签。交付时保留接受的建议来源，重要分歧可简要说明取舍。无需为每次编辑建立额外的版本清单。

需要在 Paseo 回显中显示彩色来源时，把对应标签写在其贡献之前的单独一行，前后各留一个空行。同一项的多个标签可写在同一行，如 `[Neon] [Astra]`。请 Hydrogen 润色时保留这些标签行及其位置。

**主控 Sol 按计划派发给执行 Sol 或 Terra**。保留审定计划的编号、责任人、依赖和验收口径。已有工作者接收当前任务所需的引用和增量。执行结果回给主控 Sol。

```text
审定计划版本、任务编号、依赖及预期交付物
相关目录、文件或证据位置、允许读写范围和约束
验收命令、指标、对照及通过条件

请按任务编号回报交付物、实际检查及结果、证据位置、计划偏差和未解决事项。
若需改变范围、方法或验收条件，先把原因和建议回报主控 Sol。
```

**主控 Sol 把实测汇总交回 Neon**。同一任务复用规划会话，提供审定计划的变化及一份按任务编号的汇总。每项包含计划验收条件、实际结果、证据、限制及可比基线。请 Neon 对照预期，解释结论和可能的替代解释，区分通过、失败及缺少证据，给出会影响结论的补核建议。相关工作日志只在有争议或需要复查时摘取。

**主控 Sol 将汇总和 Neon 分析一起交 Astra 终审**。保留工作者原始结果摘要和证据定位，便于 Astra 独立复核。请 Astra 给出结论、证据强度、修正和未决项。若请求补核，由主控派发受影响任务，并将新证据交回 Astra。仅在新证据改变 Neon 的重要判断时，才请 Neon 对该点再次分析。Astra 以核实后的内容形成定稿。

**定稿发给 Hydrogen**。正文如需保留 Markdown 链接和公式，在交接前确认已包含于稿件。

```text
请润色下方定稿，保留结论、数字、公式、引用、链接、来源标签和不确定性的程度。
保留双美元公式块。定界符各占一行，公式放在代码块之外，中文说明放在公式外。
按给定受众、语言和篇幅改善措辞与结构。无需查证、调用工具或解释你的改动。
第一行必须原样输出 hydrogen:，其前不得有标题、代码围栏或说明。
从下一行开始输出成稿正文。

受众、语言和格式要求
已确认定稿正文
```

## Hydrogen 结果的去向

- 有 `pma_hydrogen` 时，聊天由原主会话调用 `kind: "chat"`。简单执行的结果由主控 Sol 交 Hydrogen 润色并调用 `kind: "polish"`。计划由原主会话的直属 Astra 调用 `kind: "polish"`，并传 `rootAgentId` 为原主会话的 Paseo ID。后台 Astra 带标签 `paseo-workflow-role=astra`。主会话自己调用时省略 `rootAgentId`。
- `brief` 只传当前请求或 Astra 已确认的定稿及必要格式要求。每项交付生成一个稳定且唯一的 `requestId`，例如 UUID。相关追问可用 `reuseWorker: true`，无关联任务使用默认值。插件负责触发 Hydrogen，调用方无需另开 Gemini。收到 `delivered: true` 后只记录交付状态，不提取或复述成稿。需要重试时使用原 `requestId`，避免再次生成。
- 插件工具定义支持 `fallbackDraft` 时，润色把已核实的定稿放到 `fallbackDraft`，`brief` 只传写作要求。原定稿只传一次。若工具返回 `pending: true`，主对话会显示必要的确认入口，用户处理后插件沿同一 `requestId` 自动交付。收到 `fallbackDelivered: true` 时，原定稿已显示。遇到无法自动交付且无已显示定稿的情况，按下文提供备用交付。聊天如已有经核实的备用答复，也可放进 `fallbackDraft`。
- 若 Paseo 客户端弹出 `pma_hydrogen` 工具使用确认，或主对话显示 Hydrogen 工作者的确认卡片，由用户决定。服务重启后，原主对话可以用 `/pma-replay` 恢复已保存的成稿并刷新待处理请求。
- 真实 Hydrogen 回复统一以单独一行 `hydrogen:` 开始。手动交接使用上面的聊天或润色模板。若展示桥接有格式校验，确保首行标记只出现一次。主控 Sol 的备用答复、Astra 原稿和进度使用各自的身份标识。
- 只有当前主会话存在确认能仅在界面展示成稿的 Paseo 桥接时，才使用自动回显。插件使用原主控 Sol 会话 ID 和任务身份进行交付及去重。主控 Sol 和 Astra 只收状态。普通代理消息、完成通知、模型可见的工具返回和时间线展示项是不同通道。插件可用 `timeline.append` 展示结果。重启恢复使用已保存的正文。 [Paseo 0.17.4 插件时间线接口](https://github.com/getpaseo/paseo/blob/v0.17.4/public-docs/plugins/reference.md#append-a-timeline-row-from-the-daemon)
- 自动回显尚无交付确认时，主控 Sol 仅记录进度。确认桥接缺失或无法交付时，主控 Sol 在原主对话提供执行 Sol 的结果、Astra 定稿或可打开的结果链接，聊天给出备用答复。以实际交付为准，进度摘要和工作者完成状态不作为已交付的证明。
- 若用户明确接受成稿留在 Gemini 会话，选择用户能打开的 Hydrogen 工作者。调用 `create_agent` 或 `send_agent_prompt` 时，明确设置 `notifyOnFinish: false`。控制端只说明用户应打开哪个工作会话，避免读取其正文或要求 Gemini 发回主控。无法确认没有模型回传时，让用户在 Gemini 工作会话内手动发消息或定稿。 [Paseo 完成通知设置](https://paseo.sh/docs/mcp)
- 用户下一条普通消息仍由主控 Sol 接收。针对结论的追问可基于 Astra 原稿和证据转交，针对 Hydrogen 具体措辞的追问可由用户显式引用必要句段。
