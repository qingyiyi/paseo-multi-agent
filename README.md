# Paseo-Multi-Agent（PMA）

PMA 是用于 Paseo 的 Codex Skill。它在现有对话里按任务类型分工，从聊天直接回复，到方案起草、审核、执行和最终润色。

## 模型分工

| 任务 | 流程 |
| --- | --- |
| 聊天和轻量问答 | 主控 Sol 分流，Hydrogen 直接回复 |
| 设计方案 | 主控 Sol 整理目标，Neon 起草，Astra High 审核并完善 |
| 明确要求 Opus 5.5 | Opus 5.5 起草，Neon 补充，Astra High 审核，并保留各模型的贡献标签 |
| 执行方案 | Astra 派发任务并汇总，Sol 负责实现和测试，Terra 工作者负责查证或独立任务，最后由 Hydrogen 润色 |

### 角色分工与轻量直派

本工作流保持既定多模型分工：由 **主控 Sol** 在原主对话中负责接收与分流，**Neon** 负责方案规划（用户明确点名 Opus 5.5 时由 Opus 5.5 起草、Neon 补充），**Astra High** 负责审核、派发与汇总，独立的 **执行 Sol** 与 **Terra 子工作者**分别承担代码实现和 Astra 计划中分配的简单任务，**Hydrogen** 负责聊天回复与最终成稿润色。对于边界清晰、改动较小的简单执行任务，主控 Sol 默认交给独立的执行 Sol 完成；无论是否采用轻量直派，均严格遵循用户指定的审核要求与确认边界，不得擅自跳过审核。

### 上下文复用、接入边界与 Hydrogen 回显

为兼顾协作连贯性与上下文成本控制，同一主线下的**相关任务优先复用已有工作者**并仅传递必要增量，**无关任务则使用短会话**以减少冗余旧历史带来的额外开销（复用本身不保证旧历史免计额度）。全流程仅通过官方 Codex 与官方 Antigravity `agy acp` 接入，**绝对禁止任何自建或第三方模型反代、中转及消费订阅 API 转接**。**Hydrogen** 仅在当前环境具备已验证的 Paseo 单向展示桥接（如 `pma_hydrogen`）时，将首行固定为 `hydrogen:` 的成稿自动回显至原主对话界面，且全文禁止自动回传给主控 Sol 或 Astra 作为后续模型上下文；若展示桥接缺失或回显失败，则由主控 Sol 在原主对话直接交付执行结果、Astra 定稿或备用答复。

## 安装

在运行 **Codex** 的机器上执行。Mac 上的 Paseo 如果连接远端服务，就在远端机器安装。

```sh
git clone https://github.com/qingyiyi/paseo-multi-agent.git
mkdir -p "$HOME/.agents/skills"
cp -R paseo-multi-agent/paseo-multi-agent "$HOME/.agents/skills/"
```

安装后只需维护一个目录 `~/.agents/skills/paseo-multi-agent/`。

## 在 Paseo 中使用

1. 在原 Codex 对话里选用 GPT‑6.2 Sol，并确认该主机启用了 Paseo 工具和任务所需的模型。
2. 输入 `/PMA` 搜索，选中 `/paseo-multi-agent`，再追加任务后发送。
3. 也可以直接输入以下完整命令。

```text
/paseo-multi-agent 为这个项目设计一套测试方案，先给计划，暂不执行。
```

在 Codex 中也可以用 `$paseo-multi-agent` 调用。

## Hydrogen 回显

仓库中的 [PMA Hydrogen 插件](plugins/pma-hydrogen/) 提供 `pma_hydrogen` 工具。插件需要 Paseo 0.17.4 或更新版本，并在运行 Paseo 服务的机器上安装。请先配置官方 Antigravity，登录自己的账号并确认 `gemini-4-hydrogen` 可用。

```sh
paseo plugin install git:qingyiyi/paseo-multi-agent:plugins/pma-hydrogen
paseo plugin ls pma-hydrogen
```

启用插件后，成稿以浅蓝色 `hydrogen:` 标签显示在原主对话。主控 Sol 和 Astra 收到交付状态，成稿全文不自动进入它们的模型上下文。回显失败时，主对话会提供备用答复、定稿或可打开的定稿链接。服务重启后，可在原对话输入 `/pma-replay` 恢复保存的成稿，无需重新生成。

查找文件、执行命令和核对事实由执行 Sol、Astra 或 Astra 安排的 Terra 子工作者完成。Hydrogen 接收作答需要的事实或已核实的定稿。如果仍遇到授权请求，原主对话会显示确认卡片。处理后插件继续等待原任务并回显成稿。如果这一轮无法完成，插件会显示调用时提供的已核实定稿。也可用 `/pma-replay` 查看仍待处理的请求。

来源标签单独成行、前后留空行时，Opus 显示为红色，Neon 显示为金黄色，Astra 显示为紫色。若正文包含跨段落的 Markdown 引用链接定义，则保留整篇 Markdown 渲染。

Hydrogen 卡片支持独立的 LaTeX 公式块。用双美元包围公式，定界符各占一行，公式放在代码块之外。公式由 Paseo 服务端本地排版，安装插件时会构建所需的渲染依赖。源代码及许可证见 [NOTICE](plugins/pma-hydrogen/NOTICE)。

插件在 Paseo 服务端以当前服务用户身份运行，并在服务主机的 `PASEO_HOME/pma-hydrogen`（默认 `~/.paseo/pma-hydrogen`）保存成稿用于恢复。插件通过 Paseo 使用已配置的官方 Antigravity，不接收账号密码。

完整规则和交接模板见 [Skill](paseo-multi-agent/SKILL.md) 和 [Paseo 执行细节](paseo-multi-agent/references/paseo-execution.md)。

## 许可证

[Apache License 2.0](LICENSE)
