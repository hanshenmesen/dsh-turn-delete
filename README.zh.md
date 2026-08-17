# dsh-turn-delete

[English](README.md) | 中文

从 DeepSeek Harness 对话中删除一个完整且已经结束的 Turn（轮次），不删除或替换整个 Session。每个已完成的顶层轮次，其最后一条助手回复旁会出现删除按钮。

## 安装

从 GitHub 安装：

```sh
dsh plugin --profile web add github:hanshenmesen/dsh-turn-delete
```

从预构建的 GitHub Release 安装：

```sh
dsh plugin --profile web add https://github.com/hanshenmesen/dsh-turn-delete/releases/latest/download/dsh-turn-delete.tgz
```

安装后重启 `dsh web`。卸载命令：

```sh
dsh plugin --profile web remove dsh-turn-delete
```

## 行为

- 删除按钮只出现在普通 Session 已完成的轮次上，Subagent 对话不会显示。
- 删除前必须确认；Session 正在运行时不能删除。
- 所选轮次的提问、助手消息与工具记录会从 Session 当前的模型上下文中移除。
- Session id、标题、工作区关联、后续轮次和原始 append-only 事件日志保持不变。
- 删除由一个持久的零内容替换事件记录；刷新页面或重启 profile 后仍然生效。
- 重复提交同一次删除是幂等的。

目标轮次尚未结束，或已与其他历史一起合并进 compaction 替换节点时，插件会拒绝删除，避免只删除模型可见上下文的一部分。

## 设计

Host 端注册 `POST /dsh-turn-delete`，取得目标 Agent 的维护租约，验证完整闭合轮次对应的 surface 区间，追加零内容替换事件，并在 `sessions.flush()` 完成后才返回成功。

浏览器端使用公开的 `conversation.chat.assistant-actions` 与 `conversation.chat.turnTail` slot。Conversation definition 将持久 tombstone 投影到目标 Turn。DeepSeek Harness 目前还没有公开完整 Turn 的可见性扩展点，因此 tail contribution 会对相邻 Turn tail 之间的 Chat 行应用一个范围受限的呈现兼容层；模型上下文删除本身不依赖这个兼容层。

## 兼容性

- DeepSeek Harness `0.1.0-rc.6` 与 `0.1.0-rc.7`
- Node.js 22.19 或更高版本
- Web profile 与基于 Web 的桌面套壳

DeepSeek Harness 仍处于 developer preview。升级 Harness 后，建议新建一个含三个短轮次的临时 Session，并删除中间轮次完成一次验证。

## 开发

```sh
npm install
npm run check
dsh plugin --profile web add -w link:/absolute/path/to/dsh-turn-delete
```

`npm run check` 会检查类型、构建 Host/Browser 两部分、运行单元与 UI 测试，并校验 npm 包内容。

## 安全

与所有 DSH 插件一样，本包拥有 Harness 进程的权限。安装第三方插件前应检查源码。删除会改变后续模型上下文，但为了审计与回放会保留原始 append-only 事件。

## 许可证

MIT
