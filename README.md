# Paseo-Multi-Agent（PMA）

PMA 在同一仓库提供两份独立的 Paseo Skill，共用同一个 Hydrogen 回显插件。

## 模型分工

| Skill | 主对话 | 计划、执行和交付 |
| --- | --- | --- |
| [PMAC](pmac/SKILL.md) | Codex GPT‑6.2 Sol | Neon 拟定详细计划，Astra High 审核。主控 Sol 派发给执行 Sol 或 Terra，再汇总证据交 Neon 分析。Astra 终审定稿，Hydrogen 润色回显。 |
| [PMAA](pmaa/SKILL.md) | Antigravity Gemini 4 Neon | Neon 讨论并拟定计划，Astra High 审核。Neon 派发给执行 Sol 或 Terra，再汇总结果。长时间或复杂任务交 Astra 终审，Neon 综合定稿，Hydrogen 润色回显。 |

### 角色分工与轻量直派

聊天可直接由 Hydrogen 作答。边界明确的简单任务可直接派发，并保留用户指定的审核与确认点。只要求方案时，交付 Astra 审定的计划。明确点名 Opus 5.5 时，由 Opus 起草、Neon 补全、Astra 审核，并保留实质贡献标签。

### 上下文复用、接入边界与 Hydrogen 回显

相关任务优先复用已有工作者，只传必要增量。无关任务使用短会话。全流程通过官方 Codex 与官方 Antigravity `agy acp` 接入，严禁自建或第三方模型反代、中转及消费订阅 API 转接。Hydrogen 通过 `pma_hydrogen` 把成稿回显到原主对话，调用方只收到状态。回显失败时，由主控交付已核实的结果、定稿或备用答复。

## 安装

在运行 Paseo、Codex 与 Antigravity 的主机上执行。客户端连接远端 Paseo 时，在远端主机安装。按需安装其中一份或两份。

```sh
git clone https://github.com/qingyiyi/paseo-multi-agent.git
mkdir -p "$HOME/.agents/skills" "$HOME/.gemini/config/skills"
cp -R paseo-multi-agent/pmac "$HOME/.agents/skills/"
cp -R paseo-multi-agent/pmaa "$HOME/.gemini/config/skills/"
```

PMAC 接替旧版 `/paseo-multi-agent`。安装 PMAC 后可将旧 Skill 移出 `~/.agents/skills/`，原 Codex 对话可继续使用。

## 在 Paseo 中使用

在设置中为两套主控启用 Paseo tools。PMAC 使用原 Codex 对话并选 GPT‑6.2 Sol。PMAA 在顶层 Antigravity 对话选 Gemini 4 Neon（`gemini-4-neon`）。在各自对话里选择对应命令并追加任务。

```text
/pmac 为这个项目设计一套测试方案，先给计划，暂不执行。
/pmaa 根据现有评估设计下一轮验证，先给计划，暂不执行。
```

在 Codex 中也可以用 `$pmac`。已有会话未显示新 Skill 或工具时，可在会话空闲后重载该会话。 [Antigravity Skill 安装说明](https://antigravity.google/docs/skills) · [Paseo 工具设置](https://paseo.sh/docs/orchestration#get-started)

## Hydrogen 回显

仓库中的 [PMA Hydrogen 插件](plugins/pma-hydrogen/) 提供 `pma_hydrogen` 工具。插件需要 Paseo 0.17.4 或更新版本，并在运行 Paseo 服务的机器上安装。请先配置官方 Antigravity，登录自己的账号并确认 `gemini-4-hydrogen` 可用。

```sh
paseo plugin install git:qingyiyi/paseo-multi-agent:plugins/pma-hydrogen
paseo plugin ls pma-hydrogen
```

已从 Git 安装插件的主机可用 `paseo plugin update pma-hydrogen` 获取 PMAA 回显支持。启用后，成稿以浅蓝色 `hydrogen:` 标签显示在原主对话。主控和 Astra 只收到交付状态。PMAA 的回显由顶层 Neon 直接发起。服务重启后，可在原对话输入 `/pma-replay` 恢复保存的成稿，无需重新生成。

查找文件、执行命令和核对事实由执行 Sol、Astra 或审定计划中负责该项的 Terra 完成。Hydrogen 接收作答需要的事实或已核实的定稿。如果仍遇到授权请求，原主对话会显示确认卡片。处理后插件继续等待原任务并回显成稿。如果这一轮无法完成，插件会显示调用时提供的已核实定稿。也可用 `/pma-replay` 查看仍待处理的请求。

来源标签单独成行、前后留空行时，Opus 显示为红色，Neon 显示为金黄色，Astra 显示为紫色。卡片正文使用 Paseo 的 Markdown 渲染器，支持紧贴中文句读的加粗，以及与公式混排的标题、列表、表格和链接。正文含有 Markdown 引用链接定义时，来源标签作为普通 Markdown 显示。

Hydrogen 卡片支持独立的 LaTeX 公式块。用双美元包围公式，定界符各占一行，公式放在代码块之外。公式由 Paseo 服务端本地排版，安装插件时会构建所需的渲染依赖。源代码及许可证见 [NOTICE](plugins/pma-hydrogen/NOTICE)。

插件在 Paseo 服务端以当前服务用户身份运行，并在服务主机的 `PASEO_HOME/pma-hydrogen`（默认 `~/.paseo/pma-hydrogen`）保存成稿用于恢复。插件通过 Paseo 使用已配置的官方 Antigravity，不接收账号密码。

交接模板见 [PMAC 执行细节](pmac/references/paseo-execution.md) 和 [PMAA 执行细节](pmaa/references/paseo-execution.md)。

## 许可证

[Apache License 2.0](LICENSE)
