# Paseo-Multi-Agent（PMA）

PMA 是用于 Paseo 的 Codex Skill。它在现有对话里按任务类型分工，从聊天直接回复，到方案起草、审核、执行和最终润色。

## 模型分工

| 任务 | 流程 |
| --- | --- |
| 聊天和轻量问答 | Terra 分流，Hydrogen 直接回复 |
| 设计方案 | Terra 整理目标，Neon 起草，Astra High 审核并完善 |
| 明确要求 Opus 5.5 | Opus 5.5 起草，Neon 补充，Astra High 审核，并保留各模型的贡献标签 |
| 执行方案 | Astra 派发任务并汇总，Sol 负责实现和测试，Terra 工作者负责查证或独立任务，最后由 Hydrogen 润色 |

工作者按需复用，每次只接收当前任务所需的上下文。PMA 使用官方 Codex 和 Antigravity 接入，禁止模型反代。

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

自动回显依赖 Paseo 服务端提供 `pma_hydrogen` 工具。目前此仓库提供 Skill，回显插件需要单独部署。启用后，成稿以 `hydrogen:` 标识，直接显示在原主对话。Terra 和 Astra 只收到交付状态，成稿全文不会自动进入它们的模型上下文。回显不可用时，主对话会提供备用答复、定稿或可打开的定稿链接。

完整规则和交接模板见 [Skill](paseo-multi-agent/SKILL.md) 和 [Paseo 执行细节](paseo-multi-agent/references/paseo-execution.md)。

## 许可证

[Apache License 2.0](LICENSE)
