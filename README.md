# Otea

> From the Spanish verb *otear*: to scan from a high vantage point, to watch what is happening and what is coming.

**Otea is the asynchronous handoff surface between you and your AI agents.**

Agents produce work faster than a human can follow it live. Otea is where work changes hands: agents leave findings, deliverables and evidence; you leave decisions and feedback; both can see at any moment where each thing stands and whose turn it is.

- **Triage** many findings at once: filter, group, prioritize, discard.
- **Review** results in depth: GIFs, video, diffs, logs, with concrete questions the agent reads back and acts on.
- **Presets** shape each board and carry the agent playbook, so sharing a preset shares a way of working.
- **Local-first**: data stays with your project. No cloud, no accounts.
- **Harness-neutral**: any agent with a shell (CLI) or MCP support can use it.

## Status

Early design. Nothing is usable yet. The product definition lives in [`docs/otea-product-definition.md`](docs/otea-product-definition.md).

## Development

Requirements: Node.js 22.18 or later (Node 24 recommended, see `.nvmrc`).

```sh
npm install
npm run check   # lint, typecheck and tests
```

There is no installable `otea` binary yet. Run the CLI from source inside the project you want to track (npm scripts always run from the Otea checkout, so `npm run otea` is only useful for `help`):

```sh
alias otea='node --disable-warning=ExperimentalWarning /path/to/otea/src/cli/main.ts'

cd /path/to/your/project
otea init
otea collection add tasks                  # --preset tasks is the default
otea create --collection tasks --title "Write the docs" --description "Install and first steps"
otea create --collection tasks --title "Flaky login test"   # no description: starts incomplete
otea create --collection tasks --title "Fix the footer" --description "Wrong year" --field priority=high
otea list --turn agent --json
otea show TASKS-1                          # fields, moves available to the agent, timeline
otea move TASKS-1 in_progress
otea move TASKS-2 discarded --reason "Duplicate of TASKS-3"
otea validate                              # check presets, collections and items
otea help                                  # every command, global options and exit codes
```

Agents act through the CLI, so it only performs transitions whose authority is `agent`. Approving work (`review` -> `done` in the tasks preset) is `human-ui`: the CLI refuses it with exit code 7 (`forbidden`).

### Presets

Every collection is governed by a preset: its fields, states, turns and transitions, plus a playbook for agents. Official presets live in [`presets/`](presets/) (`tasks` for now). A project can add its own in `.otea/presets/<name>/preset.yaml` (with its `playbook.md`) and use it with `otea collection add <collection> --preset <name>`; project presets cannot reuse an official name. The format is described in §9 of the [product definition](docs/otea-product-definition.md#9-preset-format).

### See it live

The web UI is read-only for now and updates as items change.

```sh
npm run build:ui            # once, in the Otea checkout

cd /path/to/your/project
otea serve                  # Otea running at http://127.0.0.1:4400
```

Open the URL, then in another terminal in the same project create and move items and watch them update:

```sh
otea create --collection tasks --title "Review the copy" --description "Landing page"
otea move TASKS-1 in_progress
```

Working on the UI itself: keep `otea serve` running and start `npm run dev:ui` in the Otea checkout for hot reload (it proxies `/api` to port 4400).

## License

[MIT](LICENSE)
