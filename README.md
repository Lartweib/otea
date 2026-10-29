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
otea create --collection tasks --title "Dark mode?"           # also incomplete
otea list --turn agent --unclaimed --json # waiting for agents and not held by another one
otea show TASKS-1                          # fields, moves available to the agent, lease, timeline
otea claim TASKS-1 --as claude             # hold it for 15 minutes (--ttl 30m for another length)
otea heartbeat TASKS-1 --as claude         # extend the lease on long work
otea move TASKS-1 in_progress --as claude
otea move TASKS-2 todo                     # refused (exit 8) while a required field is missing
otea update TASKS-2 --description "Fails on CI only, see run 42"   # fill what was missing
otea move TASKS-2 todo
otea move TASKS-4 discarded --reason "Out of scope"   # an incomplete item can be closed with a reason
otea validate                              # check presets, collections and items
otea help                                  # every command, global options and exit codes
```

Agents claim an item before working it. A lease is atomic: while one agent holds an item, `otea claim`, `otea update` and `otea move` from any other agent fail with exit code 12 (`lease_held`), and `otea heartbeat` or `otea release` by someone who does not hold it fail with exit code 12 (`not_lease_holder`). An expired lease reads as free and can be taken over; moving an item off the agent turn (for example to `review`) releases it automatically. Items nobody claimed stay writable, and the human in the web UI is never blocked by a lease. The agent is named by `--as <name>`, then `$OTEA_AGENT`, then `agent`. Only items whose turn is the agent can be claimed (exit code 4, `not_claimable`, otherwise).

`otea update` changes fields of an open item (a blank value clears an optional field) and records the old and new values in the timeline; items in a closed state (turn `none`) cannot be updated. Agents act through the CLI, so it only performs transitions whose authority is `agent`. Approving work (`review` -> `done` in the tasks preset) is `human-ui`: the CLI refuses it with exit code 7 (`forbidden`).

### Presets

Every collection is governed by a preset: its fields, states, turns and transitions, plus a playbook for agents. Official presets live in [`presets/`](presets/) (`tasks` for now). A project can add its own in `.otea/presets/<name>/preset.yaml` (with its `playbook.md`) and use it with `otea collection add <collection> --preset <name>`; project presets cannot reuse an official name. The format is described in §9 of the [product definition](docs/otea-product-definition.md#9-preset-format).

### See it live

The web UI updates live as items change, and it is where you take the decisions agents cannot, such as approving a task in review.

```sh
npm run build:ui            # once, in the Otea checkout

cd /path/to/your/project
otea serve                  # Otea running at http://127.0.0.1:4400
```

`otea serve` opens your browser already signed in to act on items (the session lives in an HTTP-only cookie; the token in `.otea/ui-token` is never printed). Pass `--no-open` to skip the browser, and run `otea open` from the project later to sign a browser in to the running server. A tab opened on the plain URL without signing in is read-only.

In another terminal in the same project, create and move items and watch them update:

```sh
otea create --collection tasks --title "Review the copy" --description "Landing page"
otea move TASKS-1 in_progress
otea move TASKS-1 review
```

`TASKS-1` is now waiting for you: approve it (`done`) or send it back with a reason (`todo`) from its detail in the UI. The CLI refuses those moves, and the timeline shows your decision as `human (ui)`.

You can also create items from the browser: when it is signed in, **New item** opens a form generated from the collection's preset. Only the title is required; leave the description empty and the item starts in `incomplete`, in the *With agents* section, for an agent to investigate and complete following the playbook (`otea update`, then `otea move <id> todo`). The timeline shows who created it as `human (ui)`.

On a phone the selected item unfolds in place under its row, with its moves at the bottom of the screen. **Triage**, at the end of *Waiting for you*, shows what waits for you one card at a time: swipe right for the primary move, left to send it back to the agent (asking for the reason when the workflow requires one), or use the buttons.

**Modules** in the top bar (or `#/modules` in the URL) opens the catalog of field modules: what each one does, a live preview of how it looks in a row, in the detail and as a form control, which preset fields use it, and how to declare it in `preset.yaml`. `#/modules/<name>` links to one module. The data comes from `GET /api/presets`, which lists every loaded preset (official and project) with its fields and the collections that use it.

Working on the UI itself: keep `otea serve` running and start `npm run dev:ui` in the Otea checkout for hot reload (it proxies `/api` to port 4400).

## License

[MIT](LICENSE)
