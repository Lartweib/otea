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

There is no build step or installable `otea` binary yet; run the CLI from source through npm:

```sh
npm run otea -- init
npm run otea -- collection add tasks
npm run otea -- create --collection tasks --title "Write the docs"
npm run otea -- list --turn agent --json
npm run otea -- help   # every command, global options and exit codes
```

## License

[MIT](LICENSE)
