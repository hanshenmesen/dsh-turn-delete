# dsh-turn-delete

English | [中文](README.zh.md)

Delete one complete closed turn from a DeepSeek Harness conversation without deleting or replacing the Session. The action appears beside the final assistant response for each completed top-level turn.

## Demo

Delete the middle turn after confirmation while keeping the same Session and its later turn. This was recorded through the real DeepSeek model flow on DeepSeek Harness `0.1.0-rc.7`.

![Delete one turn without deleting the Session](https://github.com/hanshenmesen/dsh-turn-delete/releases/download/v0.1.0/dsh-turn-delete-demo-en.gif)

## Install

From npm (recommended):

```sh
dsh plugin --profile web add dsh-turn-delete
```

From GitHub:

```sh
dsh plugin --profile web add github:hanshenmesen/dsh-turn-delete
```

From a prebuilt GitHub Release:

```sh
dsh plugin --profile web add https://github.com/hanshenmesen/dsh-turn-delete/releases/latest/download/dsh-turn-delete.tgz
```

Restart `dsh web` after installation. To remove it:

```sh
dsh plugin --profile web remove dsh-turn-delete
```

## Behavior

- A trash action appears only on completed ordinary Session turns. Subagent transcripts do not expose it.
- Deletion requires confirmation and is disabled while the Session is running.
- The prompt, assistant messages, and tool records for the selected turn are removed from the Session's current model surface.
- The Session id, title, workspace association, later turns, and original append-only event log remain intact.
- A durable zero-content replacement event records the deletion. Reloading the page or restarting the profile preserves it.
- Repeating the same request is idempotent.

The plugin refuses deletion when the target turn is still open or has already been merged into a compaction replacement with other history. This prevents deleting only part of model-visible context.

## Design

The Host half registers `POST /dsh-turn-delete`, claims the target Agent's maintenance lease, validates the complete closed-turn surface span, appends a zero-content replacement, and waits for `sessions.flush()` before acknowledging success.

The browser half contributes to the public `conversation.chat.assistant-actions` and `conversation.chat.turnTail` slots. A Conversation definition projects the durable tombstone onto the target Turn. DeepSeek Harness does not yet expose a public whole-Turn visibility hook, so the tail contribution applies a narrow presentation compatibility layer to the Chat rows between adjacent Turn tails. Model context deletion does not depend on that compatibility layer.

## Compatibility

- DeepSeek Harness `0.1.0-rc.6` and `0.1.0-rc.7`
- Node.js 22.19 or newer
- Web profile and Web-based desktop shells

DeepSeek Harness is in developer preview. After upgrading Harness, verify the plugin once with a disposable Session containing three short turns and delete the middle one.

## Development

```sh
npm install
npm run check
dsh plugin --profile web add -w link:/absolute/path/to/dsh-turn-delete
```

`npm run check` type-checks and builds both plugin halves, runs the unit/UI tests, and verifies the npm package contents.

## Security

Like every DSH plugin, this package runs with the Harness process's permissions. Review the source before installing third-party plugins. The deletion changes future model context but deliberately retains the original append-only events for audit and replay.

## License

MIT
