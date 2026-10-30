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
otea wait --turn agent --unclaimed         # or block until there is one (see below)
otea show TASKS-1                          # fields, moves the agent can make or relay, lease, timeline
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

### Attaching evidence

Agents attach files to an item as proof of their work: a GIF reproducing a bug, a before and after screenshot, a video, a diff, a log or test output.

```sh
otea attach BUGS-1 shots/before.png --role before --caption "Blank page after save" --as claude
otea attach BUGS-1 shots/after.png --role after --as claude
otea attach BUGS-1 test-output.log --caption "12 tests pass" --as claude
otea show BUGS-1                           # lists the evidence above the timeline
```

- `otea attach <id> <file>` copies the file into `.otea/evidence/`, named by its sha256, so attaching the same content twice stores it once; `.otea` is excluded from git. It prints the entry: id, role, kind, file name, size and caption (`--json`: also `contentType`, `sha256`, `createdAt`, `actor` and `channel`). A relative path is resolved against the current directory.
- `--role` is `before`, `after` or `single` (the default). There is no pair id: a viewer pairs the latest `before` with the latest `after`.
- The kind comes from the extension: `gif`, `png`, `jpg`, `jpeg` and `webp` are images; `mp4`, `webm` and `mov` videos; `diff` and `patch` diffs; `log` and `txt` logs; anything else, SVG included (it can carry scripts), is a plain file.
- Evidence is append-only, like the event log, and each attachment adds an `evidence_added` event to the timeline. It follows the rules of `otea update`: an item another agent holds refuses it (exit 12, `lease_held`) and so does a closed item (exit 4, `item_closed`). A missing file fails with exit 3 (`file_not_found`) and one over 50 MB with exit 14 (`evidence_too_large`).
- `otea show --json` and `GET /api/items/:id` list the entries under `evidence`. `GET /api/evidence/:id/file` serves the file to a signed-in browser only (401 otherwise), with `X-Content-Type-Options: nosniff` and `Content-Security-Policy: sandbox`: images and videos inline with their type, diffs and logs as `text/plain`, anything else as a download, so no attached file runs in the UI's origin.

### Relaying a decision made in conversation

Transitions with `human` authority (discarding a task in the tasks preset) can also be made by an agent relaying what the human decided in the conversation. That is a separate command, so a harness can ask the human to confirm every call:

```sh
otea relay TASKS-3 discarded --quote "Drop it, billing moves to the vendor" --reason "Billing moves to the vendor" --as claude
```

- The move is recorded as the human's (`actor: human`) with `via: <agent>`, `source: conversation` and the quote, and `otea show` (and `--json`) and the UI timeline always mark it as relayed (`human, relayed by claude`), never as a UI decision.
- `--quote` is required and cannot be blank (exit 2, `quote_required`). When the transition requires a reason, `--reason` is required too (exit 2, `reason_required`): the quote is evidence of the approval, the reason is the same field the UI records, and a quote such as "yes" explains nothing.
- `human-ui` transitions (approving, sending back from review) cannot be relayed: exit 7 (`forbidden`), make them in the web UI. Transitions an agent may make itself are refused with exit 4 (`not_relayable`): use `otea move`. Unknown items and undeclared moves fail as usual (exit 3, exit 4).
- A relayed decision is the human's, so like a move in the UI it is not blocked by another agent's lease; moving off the agent turn releases that lease as usual (the release is marked as relayed too).

### Waiting for work and following events

An agent does not have to poll `otea list`: `otea wait` blocks until there is work, and `otea events` reads what happened. Both work across processes without `otea serve`.

```sh
otea wait --turn agent --unclaimed --timeout 15m --json   # then: otea claim <id>
otea events --since 42 --json                              # events after id 42, one JSON object per line
otea events --item TASKS-1 --follow                        # keep printing new events until Ctrl+C
```

- `otea wait --turn agent|human` returns at once when an item is already on that turn, otherwise as soon as one gets there. It prints the item as a row of `otea list` (with `--json`, one object shaped like an entry of `otea list --json`). When several match, it prints the one that has waited longest: the first to enter its current state (field updates and leases do not reset it), ties going to the first created.
- `--collection` narrows it and `--unclaimed` skips items another agent holds, as in `otea list`; a lease that expires frees its item for the wait without anything being written. `wait` only reads: claim the item afterwards with `otea claim`, and if that fails with exit 12 because another agent got there first, wait again.
- `--timeout <duration>` (`90s`, `15m`, `1h`) gives up with exit 13 (`timeout`); without it, `wait` waits until interrupted (exit 130, `interrupted`).
- `otea events` prints the event log in commit order, filtered by `--item` and `--collection`. Each event has an id; pass the last one you read to `--since` to get only newer ones, and `--limit <n>` to read at most n. With `--json` each line is an event shaped like the ones in `otea show --json` (`id`, `itemId`, `type`, `actor`, `at`, `data`). `--follow` keeps printing new events as any process commits them, until Ctrl+C (exit 0); it cannot be combined with `--limit`.

### Working from an MCP client

`otea mcp` serves the agent commands as tools of a [Model Context Protocol](https://modelcontextprotocol.io) server on stdin and stdout, so Claude Code and other MCP clients can work Otea without shelling out. Register it once per project, naming the agent it acts as:

```sh
cd /path/to/your/project
claude mcp add otea -- node --disable-warning=ExperimentalWarning /path/to/otea/src/cli/main.ts mcp --as claude
```

- Tools: `list`, `show`, `create`, `update`, `attach`, `move`, `claim`, `heartbeat`, `release`, `relay`, `events` and `wait`, one per agent command. Each takes that command's arguments and options by name (`{"id": "TASKS-1", "state": "review"}`, `"field": ["priority=high"]`, durations as `"90s"`, `"15m"`, `"1h"`; `attach` takes `file` as a path the server reads, relative to the directory it runs in) and runs the command itself, so the rules, the validations and the error codes are those of the CLI. Setup and human commands (`init`, `collection add`, `validate`, `serve`, `open`) stay in the CLI, and `human-ui` moves are refused (`forbidden`) as in the CLI.
- A tool returns the JSON the command prints with `--json`; `events` returns its events as one array. A failure is a tool error whose text is the same `{"error":{"code","message"}}`.
- `wait` gives up with the `timeout` error after 5 minutes unless `timeout` says otherwise, and refuses more than 15 minutes, since clients time out long tool calls: call it again to keep waiting. A cancelled call stops waiting. `events` has no `follow`: call it again with the last event id as `since`.
- The agent is named by `--as`, then `$OTEA_AGENT`, then `agent`, as in the CLI, and the project is found from the directory the client starts the server in. Nothing but the protocol goes to stdout.

### Presets

Every collection is governed by a preset: its fields, states, turns and transitions, plus a playbook for agents. Official presets live in [`presets/`](presets/):

- [`tasks`](presets/tasks/playbook.md): the default; an agent works a task and a human approves it in review.
- [`bug-triage`](presets/bug-triage/playbook.md): an agent files a documented bug (steps, expected and actual, environment, severity), you triage it, the agent fixes the ones you accept and returns proof, and you verify the fix. `otea collection add bugs --preset bug-triage`

A project can add its own in `.otea/presets/<name>/preset.yaml` (with its `playbook.md`) and use it with `otea collection add <collection> --preset <name>`; project presets cannot reuse an official name. The format is described in §9 of the [product definition](docs/otea-product-definition.md#9-preset-format).

A preset can hold several **item types** in one collection, for example bugs and improvements, each with its own fields, workflow and layout. Items then carry their type: `otea create --collection work --type bug --title "..."` (`--type` is required only when the preset has more than one type), `otea list --type impr`, and `list`, `show` and every `--json` output include it. A preset without `types` has a single type, `item`, so nothing changes for `tasks` and `bug-triage`. Closed states say what closing means (`closes: done` or `closes: discarded`), and an agent can never close an item as `done`. `otea validate` checks types, layouts and closing kinds, and reports items whose type the preset no longer declares.

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

Otea is free software under the [GNU Affero General Public License v3.0](LICENSE). You can use, study, modify and share it. If you distribute a modified version, or let people use it over a network, you must publish its source under the same license, keeping the copyright notices.

**Commercial license.** If the AGPL does not fit your use (for example, embedding Otea in a closed product), a commercial license is available. Open an issue or contact [@Lartweib](https://github.com/Lartweib).

**Name.** "Otea" and its logo identify this project. Forks are welcome under the AGPL, but must use a different name.

Contributions are accepted under the [Contributor License Agreement](CLA.md); see [CONTRIBUTING.md](CONTRIBUTING.md).
