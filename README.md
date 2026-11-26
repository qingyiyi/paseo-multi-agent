# Paseo-Multi-Agent（PMA）

PMA 是用于 Paseo 的 Codex Skill。它在现有对话里按任务类型分工，从聊天直接回复，到方案起草、审核、执行和最终润色。

## 模型分工

| 任务 | 流程 |
| --- | --- |
| 聊天和轻量问答 | Terra 分流，Hydrogen 直接回复 |
| 设计方案 | Terra 整理目标，Neon 起草，Astra High 审核并完善 |
| 明确要求 Opus 5.5 | Opus 5.5 起草，Neon 补充，Astra High 审核，并保留各模型的贡献标签 |
| 执行方案 | Astra 派发任务并汇总，Sol 负责实现和测试，Terra 工作者负责查证或独立任务，最后由 Hydrogen 润色 |

### 角色分工与轻量直派

本工作流保持既定多模型分工：由 **Terra** 在原主对话中负责接收与分流，**Neon** 负责方案规划（用户明确点名 Opus 5.5 时由 Opus 5.5 起草、Neon 补充），**Astra High** 负责审核、派发与汇总，**Sol** 与 **Terra 工作者**分别承担代码实现和查证核对，**Hydrogen** 负责聊天回复与最终成稿润色。对于边界清晰、改动较小的简单执行任务，**仅当用户明确决定允许时**，Terra 可直接派发给 Sol 执行；无论是否采用轻量直派，均严格遵循用户指定的审核要求与确认边界，不得擅自跳过审核。

### 上下文复用、接入边界与 Hydrogen 回显

为兼顾协作连贯性与上下文成本控制，同一主线下的**相关任务优先复用已有工作者**并仅传递必要增量，**无关任务则使用短会话**以减少冗余旧历史带来的额外开销（复用本身不保证旧历史免计额度）。全流程仅通过官方 Codex 与官方 Antigravity `agy acp` 接入，**绝对禁止任何自建或第三方模型反代、中转及消费订阅 API 转接**。**Hydrogen** 仅在当前环境具备已验证的 Paseo 单向展示桥接（如 `pma_hydrogen`）时，将首行固定为 `hydrogen:` 的成稿自动回显至原主对话界面，且全文禁止自动回传给 Terra 或 Astra 作为后续模型上下文；若展示桥接缺失或回显失败，则由 Terra 在原主对话直接交付 Astra 定稿或备用答复。

## 安装

在运行 **Codex** 的机器上执行。Mac 上的 Paseo 如果连接远端服务，就在远端机器安装。

```sh
git clone https://github.com/qingyiyi/paseo-multi-agent.git
mkdir -p "$HOME/.agents/skills"
cp -R paseo-multi-agent/paseo-multi-agent "$HOME/.agents/skills/"
```

安装后只需维护一个目录 `~/.agents/skills/paseo-multi-agent/`。

## 在 Paseo 中使用

1. 在原 Codex 对话里选用 GPT‑6.1 Terra，并确认该主机启用了 Paseo 工具和任务所需的模型。
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

启用插件后，成稿以浅蓝色 `hydrogen:` 标签显示在原主对话。Terra 和 Astra 收到交付状态，成稿全文不自动进入它们的模型上下文。回显失败时，主对话会提供备用答复、定稿或可打开的定稿链接。服务重启后，可在原对话输入 `/pma-replay` 恢复保存的成稿，无需重新生成。

插件在 Paseo 服务端以当前服务用户身份运行，并在服务主机的 `PASEO_HOME/pma-hydrogen`（默认 `~/.paseo/pma-hydrogen`）保存成稿用于恢复。插件通过 Paseo 使用已配置的官方 Antigravity，不接收账号密码。

完整规则和交接模板见 [Skill](paseo-multi-agent/SKILL.md) 和 [Paseo 执行细节](paseo-multi-agent/references/paseo-execution.md)。

## 许可证

[Apache License 2.0](LICENSE)
