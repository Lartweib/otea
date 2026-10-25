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
otea collection add tasks
otea create --collection tasks --title "Write the docs"
otea list --turn agent --json
otea help   # every command, global options and exit codes
```

### See it live

The web UI is read-only for now and updates as items change.

```sh
npm run build:ui            # once, in the Otea checkout

cd /path/to/your/project
otea serve                  # Otea running at http://127.0.0.1:4400
```

Open the URL, then in another terminal in the same project create and move items and watch them update:

```sh
otea create --collection tasks --title "Review the copy"
otea move TASKS-1 in_progress
```

Working on the UI itself: keep `otea serve` running and start `npm run dev:ui` in the Otea checkout for hot reload (it proxies `/api` to port 4400).

## License

[MIT](LICENSE)
