# Paseo-Multi-Agent（PMA）

PMA 是一份 Paseo Skill。使用 `/pma` 时按当前主对话的提供商选择工作流。

## 模型分工

| 主对话 | 计划、执行和交付 |
| --- | --- |
| [Codex GPT‑6.2 Sol](pma/references/codex-workflow.md) | Gemini 4 Neon 拟定详细计划，Astra High 审核。主控 Sol 派发给执行 Sol 或 Terra，再汇总证据交 Neon 分析。Astra 终审定稿，Hydrogen 润色回显。 |
| [Antigravity Orchestrator（Neon）](pma/references/antigravity.md) | Neon 讨论并拟定计划，Astra High 审核。Neon 派发给执行 Sol 或 Terra，再汇总结果。长时间或复杂任务交 Astra 终审，Neon 综合并直接交付。用户可以另行指定 Hydrogen 润色。 |

### 角色分工与轻量直派

聊天在 Codex 路线由 Hydrogen 作答，在 Antigravity 路线由主控直接回答。边界明确的简单任务可直接派发，并保留用户指定的审核与确认点。只要求方案时，交付 Astra 审定的计划。明确点名 Opus 5.5 时，由 Opus 起草、Neon 补全、Astra 审核，并保留实质贡献标签。

### 上下文复用、接入边界与 Hydrogen 回显

相关任务优先复用已有工作者，只传必要增量。无关任务使用短会话。全流程通过官方 Codex 与官方 Antigravity `agy acp` 接入，严禁自建或第三方模型反代、中转及消费订阅 API 转接。Hydrogen 通过 `pma_hydrogen` 把成稿回显到原主对话，调用方只收到状态。回显失败时，由主控交付已核实的结果、定稿或备用答复。

## 安装

在运行 Paseo、Codex 与 Antigravity 的主机上执行。客户端连接远端 Paseo 时，在远端主机安装。同一份 Skill 源码分别安装到两个客户端的目录。

```sh
git clone https://github.com/qingyiyi/paseo-multi-agent.git
mkdir -p "$HOME/.agents/skills" "$HOME/.gemini/config/skills"
cp -R paseo-multi-agent/pma "$HOME/.agents/skills/"
cp -R paseo-multi-agent/pma "$HOME/.gemini/config/skills/"
```

`/pma` 接替旧的 `/pmac`、`/pmaa` 和 `/paseo-multi-agent`。安装新版后可移出旧 Skill，现有对话可以继续使用。

## 在 Paseo 中使用

在设置中为两套主控启用 Paseo tools。Codex 对话选择 GPT‑6.2 Sol。Antigravity 顶层对话选择 Orchestrator（Neon）（`gemini-pro-orchestrator-neon`）。在任一对话使用同一命令。

```text
/pma 为这个项目设计一套测试方案，先给计划，暂不执行。
```

在 Codex 中也可以用 `$pma`。已有会话未显示新 Skill 或工具时，可在会话空闲后重载该会话。 [Antigravity Skill 安装说明](https://antigravity.google/docs/skills) · [Paseo 工具设置](https://paseo.sh/docs/orchestration#get-started)

## Hydrogen 回显

仓库中的 [PMA Hydrogen 插件](plugins/pma-hydrogen/) 提供 `pma_hydrogen` 工具。插件需要 Paseo 0.17.4 或更新版本，并在运行 Paseo 服务的机器上安装。请先配置官方 Antigravity，登录自己的账号并确认 `gemini-4-hydrogen` 可用。

```sh
paseo plugin install git:qingyiyi/paseo-multi-agent:plugins/pma-hydrogen
paseo plugin ls pma-hydrogen
```

已从 Git 安装插件的主机可用 `paseo plugin update pma-hydrogen` 更新。Hydrogen 成稿以浅蓝色 `hydrogen:` 标签显示在原主对话。主控和 Astra 只收到交付状态。Antigravity 路线的可选回显由顶层 Orchestrator（Neon）发起。服务重启后，可在原对话输入 `/pma-replay` 恢复保存的成稿，无需重新生成。

查找文件、执行命令和核对事实由执行 Sol、Astra 或审定计划中负责该项的 Terra 完成。Hydrogen 接收作答需要的事实或已核实的定稿。如果仍遇到授权请求，原主对话会显示确认卡片。处理后插件继续等待原任务并回显成稿。如果这一轮无法完成，插件会显示调用时提供的已核实定稿。也可用 `/pma-replay` 查看仍待处理的请求。

来源标签单独成行、前后留空行时，Opus 显示为红色，Neon 显示为金黄色，Astra 显示为紫色。卡片正文使用 Paseo 的 Markdown 渲染器，支持紧贴中文句读的加粗，以及与公式混排的标题、列表、表格和链接。正文含有 Markdown 引用链接定义时，来源标签作为普通 Markdown 显示。

Hydrogen 卡片和普通助手消息中的独立 LaTeX 公式块都可由插件本地排版，正文沿用 Paseo 原生 Markdown。用双美元包围公式，定界符各占一行，公式放在代码块之外。如启用了会接管回复的第三方 Markdown 渲染器，显示样式取决于该渲染器。源代码及许可证见 [NOTICE](plugins/pma-hydrogen/NOTICE)。

插件在 Paseo 服务端以当前服务用户身份运行，并在服务主机的 `PASEO_HOME/pma-hydrogen`（默认 `~/.paseo/pma-hydrogen`）保存成稿用于恢复。插件通过 Paseo 使用已配置的官方 Antigravity，不接收账号密码。

交接模板见 [Codex 执行细节](pma/references/codex.md) 和 [Antigravity 执行细节](pma/references/antigravity-tools.md)。

## 许可证

[Apache License 2.0](LICENSE)
