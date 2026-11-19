# Development

Requirements: Node.js 22.18 or later (Node 24 recommended, see `.nvmrc`).

```sh
npm install
npm run check   # lint, typecheck and tests
```

Tests never touch your real `~/.otea`: the test setup gives every test file a temporary `OTEA_HOME`, and code that falls back to the home folder throws inside tests, so a test must pass `OTEA_HOME` in the env it hands to Otea.

Working on the UI itself: keep `otea serve` running and start `npm run dev:ui` in the Otea checkout for hot reload (it proxies `/auth`, `/api` and each project's `/p/<id>/api` to port 4400).

## Token budget

What an agent reads back costs tokens on every call, so output size is tested like behavior. `src/cli/token-budget.test.ts` measures the CLI text, the CLI `--json` and the MCP result of `show`, `list`, `board` (the index and one board), `create`, `claim`, `handoff`, `attach` and `wait`, plus the MCP tool definitions, on a full bug-triage item, and fails when one grows past its budget. Tokens are estimated as characters / 4, not counted by a tokenizer. `--json` and MCP results are compact JSON, one line, no indentation. `OTEA_TOKEN_REPORT=sizes.json npx vitest run src/cli/token-budget.test.ts` writes the current sizes; raise a budget only on purpose.
