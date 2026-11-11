# Otea

> From the Spanish verb *otear*: to scan from a high vantage point, to watch what is happening and what is coming.

**Otea is the asynchronous handoff surface between you and your AI agents.**

Agents produce work faster than a human can follow it live. Otea is where work changes hands: agents leave findings, deliverables and evidence; you leave decisions and feedback; both can see at any moment where each thing stands and whose turn it is.

**The handoff lives in the item, not in the session.** Evidence, history and the next step are stored with the item, so an agent can hand it over and its session can close instead of sitting open waiting for you. Any later session picks it up from `otea show`, whose `Next:` line says what to do now, and `otea wait` blocks until an item is the agent's turn again. A lease the closed session held expires on its own.

- **Triage** many findings at once: filter, group, prioritize, discard.
- **Review** results in depth: GIFs, video, diffs, logs, with concrete questions the agent reads back and acts on.
- **Presets** shape each board and carry the agent playbook, so sharing a preset shares a way of working. **Blueprints** build a set of boards at once and say which links may join them.
- **Local-first**: data stays with your project. No cloud, no accounts.
- **Harness-neutral**: any agent with a shell (CLI) or MCP support can use it.
- **Traceable**: every change is an append-only event, with who made it and through which channel.

## Status

Early design. Nothing is usable yet. The product definition lives in [`docs/otea-product-definition.md`](docs/otea-product-definition.md).

## Development

Requirements: Node.js 22.18 or later (Node 24 recommended, see `.nvmrc`).

```sh
npm install
npm run check   # lint, typecheck and tests
```

Tests never touch your real `~/.otea`: the test setup gives every test file a temporary `OTEA_HOME`, and code that falls back to the home folder throws inside tests, so a test must pass `OTEA_HOME` in the env it hands to Otea.

There is no installable `otea` binary yet. Run the CLI from source inside the project you want to track (npm scripts always run from the Otea checkout, so `npm run otea` is only useful for `help`):

```sh
alias otea='node --disable-warning=ExperimentalWarning /path/to/otea/src/cli/main.ts'

cd /path/to/your/project
otea init
otea collection add tasks                  # --preset tasks is the default
otea collection add roadmap --icon map     # its own icon instead of its preset's
otea create --collection tasks --title "Write the docs" --description "Install and first steps"
otea create --collection tasks --title "Flaky login test"   # no description: starts incomplete
otea create --collection tasks --title "Fix the footer" --description "Wrong year" --field priority=high
otea create --collection tasks --title "Dark mode?"           # also incomplete
otea list --turn agent --unclaimed --json # waiting for agents and not held by another one
otea wait --turn agent --unclaimed         # or block until there is one (see below)
otea list --field priority=high            # items whose field holds that value (repeat to AND them)
otea show TASKS-1                          # what to do next, fields, moves the agent can make or relay, lease, timeline
otea claim TASKS-1 --as claude             # hold it for 15 minutes (--ttl 30m for another length)
otea heartbeat TASKS-1 --as claude         # extend the lease on long work
otea move TASKS-1 in_progress --as claude
otea move TASKS-2 todo                     # refused (exit 8) while a required field is missing
otea update TASKS-2 --description "Fails on CI only, see run 42"   # fill what was missing
otea move TASKS-2 todo
otea move TASKS-4 discarded --reason "Out of scope"   # an incomplete item can be closed with a reason
otea validate                              # check presets, blueprints, collections and items
otea check --gate push --branch --repo     # may this branch be pushed? exit 0 yes, 1 no (fails open)
otea hook install --git --claude           # in a repo: make that check a pre-push hook and a Claude Code hook
otea help                                  # every command, global options and exit codes
```

Agents claim an item before working it. A lease is atomic: while one agent holds an item, `otea claim`, `otea update` and `otea move` from any other agent fail with exit code 12 (`lease_held`), and `otea heartbeat` or `otea release` by someone who does not hold it fail with exit code 12 (`not_lease_holder`). An expired lease reads as free and can be taken over; moving an item off the agent turn (for example to `review`) releases it automatically. Items nobody claimed stay writable, and the human in the web UI is never blocked by a lease. The agent is named by `--as <name>`, then `$OTEA_AGENT`, then `agent`. Only items whose turn is the agent can be claimed (exit code 4, `not_claimable`, otherwise).

A lease that ran out without a release leaves its item stuck (**Atasco** in the web UI). There the person either puts it back in the queue of its step for any agent to claim (**Retomar**, `POST /api/items/:id/restart`) or leaves it for a named agent (**Reasignar**, `POST /api/items/:id/reassign` with `{"agent"}`). Both drop the lease that ran out and write a `released` event by the human with `cause` `restart` or `reassign` (and `next`, the agent it is left for); `otea show` reads them as `(back in the queue)` and `(left for <agent>)`. The agent named is expected, not enforced: any agent may still claim the item. An item whose lease is still running, or that has none, is refused (409, `not_stuck`). While its toast is up, `POST /api/items/:id/undo` with `{"release": true}` gives the lease back as it was (with `{"from"}` it takes back a move, as before); like moves, these writes need the session, JSON and the server's own origin.

`otea update` changes fields of an open item (a blank value clears an optional field) and records the old and new values in the timeline; items in a closed state (turn `none`) cannot be updated. Agents act through the CLI, so it only performs transitions whose authority is `agent`. Approving work (`review` -> `done` in the tasks preset) is `human-ui`: the CLI refuses it with exit code 7 (`forbidden`).

### Projects

`otea init` creates the project for the repository root (or the folder itself outside git) in common storage: its data goes to `$OTEA_HOME/data/<id>/` (`OTEA_HOME` defaults to `~/.otea`), the user-level registry links the root to it, and nothing is written into the repo. `otea init --local` keeps the data in `.otea/` at the root instead, excluded from git through `.git/info/exclude`. Every command finds the project from any subfolder or git worktree of that repo: the nearest registered folder containing the working directory or the main repo root, or else the nearest folder above the main repo root holding `.otea/otea.db`. So one project can also live in a product folder above several repos (the folder need not be a repo): run `otea init` there, and commands from inside any of those repos use it. `otea init` inside a repo that such a project already covers refuses; `otea init --here` creates a separate project at the repo, which then wins for it. `OTEA_PROJECT=<path>` skips discovery and names the project folder directly (or a registered folder, or a project id). The MCP server and `otea serve` find the project the same way.

Each project has an identity stored in its database: a name (its folder's) and an id, the name as a slug plus six random base32 characters (`my-app-k3x7qa`). `otea init --json` prints both next to `root`, `path` (the data folder) and `storage`, and `GET /api/project` returns them. A database created before identities gets one the first time it is opened.

### Linking several repos to one project

A product split across separate repos (not nested in one folder) can share one project, since common storage keeps it in the Otea home (`OTEA_HOME`, default `~/.otea`) instead of in any repo:

```sh
cd ~/code/api && otea init               # creates the project, prints its data folder
otea projects current                    # api-k3x7qa  api  common, then the root and the data folder
cd ~/code/web && otea init --join api-k3x7qa   # or the project's name, when it is unique
otea projects add ~/notes/api --to api-k3x7qa  # any other folder
otea projects list                       # every registered project with its linked folders
otea projects relink ~/code/web ~/src/web     # the repo moved
otea projects forget ~/notes/api         # unlink a folder; the project and its items stay
```

Commands, the MCP server and `otea serve` in any linked folder (and its subfolders and worktrees) then use that project: an item created from `api` is listed from `web`. Common storage writes nothing into the repo, not even `.otea/`. The user-level registry (`$OTEA_HOME/registry.db`) records which folders lead to which project: a folder belongs to one project only, a folder with its own `.otea/` project cannot be linked, and when both a linked folder and a local project contain the working directory, the nearer one wins. A local project (`otea init --local`) cannot be shared this way.

When a repo moves, `otea projects relink <old> <new>` points its link at the new folder, but only when the new folder is the same repo: the same origin URL (a trailing `.git` or `/` aside) or the same root commit, compared with the old folder if it still exists and else with what was recorded when it was linked. Another repo is refused (exit code 17, `different_repo`) unless `--force`; when neither can be checked (plain folders, a repo with no remote and no commit) it relinks with a warning. `otea projects forget <path>` removes a link and never the data: a project left with no linked folder stays registered with its items, nothing resolves to it, and `otea init --join` or `otea projects add` links a folder to it again. A command run where no project resolves says so (exit code 3); when projects are registered, it also suggests `otea init --join <id>` and `otea projects list`. `otea projects list` marks linked folders that no longer exist with `(missing)`.

### Moving a local project to common storage

A project created in `.otea/` (with `otea init --local`, or before common storage was the default) stays there until you move it; Otea never migrates on its own. `otea migrate --to common`, run from the project:

1. copies the database into `$OTEA_HOME/data/<id>/` with `VACUUM INTO` and checks the copy (`PRAGMA integrity_check`, and the same row count and last row id in every table);
2. copies `evidence/`, `presets/`, `blueprints/` and the blueprint copy, registers the project (same id) and links its folder;
3. renames `.otea/` to `.otea.migrated-<date>-<time>/`, a backup Otea never deletes (excluded from git like `.otea/`);
4. prints what it did and how to undo it: `otea projects forget <folder>`, rename the backup back to `.otea`, and delete the copied data folder once it is no longer needed.

It refuses (exit code 18, `in_use`) while `otea serve` runs on the project, and when another process holds or writes the database during the move, leaving everything as it was. Running it again on a migrated project does nothing; if a run stopped after registering the project, the next one only moves the old folder aside, once its contents match the copy.

### Attaching evidence

Agents attach files to an item as proof of their work: a GIF reproducing a bug, a before and after screenshot, a video, a diff, a log or test output.

```sh
otea attach BUGS-1 shots/before.png --role before --caption "Blank page after save" --as claude
otea attach BUGS-1 shots/after.png --role after --as claude
otea attach BUGS-1 test-output.log --caption "12 tests pass" --as claude
otea show BUGS-1                           # lists the evidence above the timeline
```

- `otea attach <id> <file>` copies the file into `evidence/` in the project's data folder (`.otea/evidence/` for a local project), named by its sha256, so attaching the same content twice stores it once; nothing lands in the repo's tracked files. It prints the entry: id, role, kind, file name, size and caption (`--json`: also `contentType`, `sha256`, `createdAt`, `actor` and `channel`). A relative path is resolved against the current directory.
- `--role` is `before`, `after` or `single` (the default). There is no pair id: a viewer pairs the latest `before` with the latest `after`.
- When the item's type places evidence modules in its layout (see the product definition, §9), the file goes to one of them, and the entry records which (`module`, its id):
  - A file no module of the type accepts is refused with exit 15 (`evidence_not_accepted`); the message lists what each module takes.
  - When several modules accept it, `--module <id>` says which, otherwise exit 2 (`module_required`). A module's id is its `id:` in the layout, or its module kind (`images`, `log`) when it declares none; ids are unique within a type. An unknown id fails with exit 3 (`not_found`).
  - A `compare` module takes only `--role before` or `--role after`; every other module takes single files. A role that does not fit fails with exit 2 (`invalid_role`).
  - A type that places no evidence module takes any file in any role, as before. Evidence attached before modules existed (or to a module a preset edit removed) belongs to the first module that accepts it.
- `otea show` groups the evidence by module, in layout order, marks required ones and says `nothing yet` for an empty one; files no module draws come last as `other files`. The MCP `attach` tool takes the same `module` and `role`.
- The kind comes from the extension: `gif`, `png`, `jpg`, `jpeg` and `webp` are images; `mp4`, `webm` and `mov` videos; `diff` and `patch` diffs; `log` and `txt` logs; anything else, SVG included (it can carry scripts), is a plain file.
- Evidence is append-only, like the event log, and each attachment adds an `evidence_added` event to the timeline. It follows the rules of `otea update`: an item another agent holds refuses it (exit 12, `lease_held`) and so does a closed item (exit 4, `item_closed`). A missing file fails with exit 3 (`file_not_found`) and one over 50 MB with exit 14 (`evidence_too_large`).
- `otea show --json` and `GET /api/items/:id` list the entries under `evidence`. `GET /api/evidence/:id/file` serves the file to a signed-in browser only (401 otherwise), with `X-Content-Type-Options: nosniff` and `Content-Security-Policy: sandbox`: images and videos inline with their type, diffs and logs as `text/plain`, anything else as a download, so no attached file runs in the UI's origin. It serves byte ranges (`Range: bytes=…`, 206), so videos seek.
- The item detail draws each evidence module where the layout places it: `images` as one image (`single`), a gallery with thumbnails (`gallery`, left and right arrows step through it) or a before/after slider with a draggable divider and a side-by-side mode (`compare`; the divider is a keyboard slider); `recording` in the browser's player (`player`, nothing autoplays) or as a strip of eight frames read from the video (`frames`, falling back to the player when the browser cannot read frames); `diff` as files, hunks and numbered lines; `log` numbered, with a wrap toggle, keeping only its start and end until "show all" when longer than 160 lines. An empty module says what agents attach, and a required one is drawn dashed. A browser that is not signed in lists file names only.

### Relations between items

Items link to each other with a typed relation: `parent`, `blocks`, `duplicates`, `implements` and `relates`. A collection is one board: a tree of `parent` links lives inside it, and the other kinds link items across the collections of the project.

```sh
otea create --collection tasks --title "Create wolf" --description "A wolf for the forest"
otea create --collection tasks --title "Body" --description "Mesh and rig" --parent TASKS-1
otea create --collection tasks --title "Movement" --description "Walk, trot, run" --parent TASKS-1
otea link TASKS-2 blocks TASKS-3            # body before movement
otea link BUGS-7 duplicates BUGS-3          # BUGS-7 is a copy of BUGS-3
otea link TASKS-9 implements BUGS-3         # work on one board delivers an item of another
otea link TASKS-3 parent TASKS-4            # TASKS-4 becomes the parent of TASKS-3
otea link BUGS-3 parent TASKS-1             # refused, exit 16 (parent_across_boards)
otea unlink TASKS-2 blocks TASKS-3
otea list --parent TASKS-1                  # the children of TASKS-1
otea show TASKS-1                           # children summary and relations by kind
```

What waits on another board says so with `blocks`, and a state that declares `requires: blockers_closed` waits for it. Here the `web` collection's preset holds its review until every child and every blocker is closed:

```yaml
# .otea/presets/web/preset.yaml, an excerpt
review: { turn: human, requires: [children_closed, blockers_closed] }
```

```sh
otea link API-4 blocks WEB-2                # the login page waits for the auth endpoint
otea move WEB-2 review                      # exit 4 (blockers_open) while API-4 is open
otea show WEB-2                             # "... once its open blocker API-4 is closed"
```

- `otea link <id> <kind> <other>` reads as a sentence for `blocks`, `duplicates`, `implements` and `relates`; `<id> parent <other>` makes `<other>` the parent of `<id>`. `otea create --parent <id>` creates the item as a child in the same write. `otea unlink` takes the link named the same way (`relates` either way round).
- Each pair is linked once per kind; an item has at most one parent, in its own collection; `parent` and `blocks` never loop. Refusals: a self link, a second parent, a parent in another collection or a cycle exit 16 (`self_relation`, `parent_exists`, `parent_across_boards`, `relation_cycle`; the cycle's path, or for another collection's parent the `blocks` and `implements` links to use instead, in the message); a missing item exits 3 (`not_found`); a repeated link exits 5 (`already_exists`); an unknown kind exits 2 (`invalid_relation`); an open child under a closed parent exits 4 (`item_closed`). The CLI, the API and MCP refuse alike.
- A `parent` across collections linked before the rule is kept and read as before. `otea validate` warns on each and names a way out: merge the two collections into one preset as types, or convert the link, to `blocks` when the parent's workflow waits for its children (then write `requires: blockers_closed` where it requires `children_closed`, so the wait is kept) and to `implements` otherwise. Nothing is migrated for you.
- Linking changes neither item's fields nor state, so it is not bound by leases and works on closed items. Every link and unlink is recorded in both items' timelines (`relation_added`, `relation_removed`), with who did it and through which channel.
- `otea show` prints, for a parent, `Children: n of m closed (d done, x discarded)`, then the relations grouped by kind with each other item's state and turn. `--json`, `otea list --json` and the API carry `relations` (and `children` for a parent) on the items that have them.
- A preset can make any state wait for the children, a working one as well as a closed one: `review: { turn: human, requires: children_closed }` brings a parent back to the human only once every child is closed. Moving or relaying into it while a child is open fails with exit 4 (`children_open`), listing the open children. Its twin, `requires: blockers_closed`, waits for every item that `blocks` this one, in any collection, and fails with exit 4 (`blockers_open`), listing the open blockers. A state may require both, as a list: `requires: [children_closed, blockers_closed]`. Nothing ever moves an item for its children or its blockers, and `otea show`'s hint says what the next move still waits for. The moves in `--json`, the API and MCP carry `requires` as a list. The former `close_requires` still works, and `otea validate` warns on it.
- The MCP server serves `link` and `unlink` as tools. In the web UI the relations show in the side of the detail and a parent's children in its body; a signed-in browser adds and removes links there (`POST /api/items/:id/link` and `/unlink`, `{kind, other}`, behind the same checks as moves) and creates children with **+ child**. In the list a parent shows how many children are still open, and children in the same section sit under their parent, foldable. With two collections or more the sidebar leads with **All work**: one tree across collections, where an item sits under its parent (same collection) and under whatever it blocks or implements, with `relates` counted on the row; an item's detail lists its links to other collections under **Across boards**.

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

### Telling agents what to do

An agent finds its instructions in the project itself:

```sh
otea playbook                         # the collections, each with its preset and how to read its playbook
otea playbook --collection bugs       # the playbook of that collection's preset, as Markdown
otea show BUGS-2                      # ... Next: Your turn: claim it, move it to fixing, work it, then move it to verify with evidence and a reason.
otea init --agents-md                 # opt in: point agents at "otea playbook" from AGENTS.md
```

- `otea playbook --collection <name>` prints the playbook of the collection's preset, then the playbooks of its types that have their own (`--json`: `collection`, `preset` and `playbook`, `null` when the preset ships none, and `types`, each `{type, playbook}`). An unknown collection fails with exit 3 (`not_found`). Without `--collection` it prints the index (`--json`: `collections`, each with `name`, `preset` and `command`).
- `otea show` (and `--json`, as `hint`) says what the agent should do now, in one line, derived from the item and never written per preset: its turn, who holds it (`Held by claude-b until 04:21: pick another item.`), the fields an incomplete item lacks, the agent moves that bring it back to the human (forward through the states in the order the workflow declares them), the evidence the handover needs (naming required evidence modules still empty), the reason a move requires and the open children a gated state waits for. When the playbook of the item's type, or else the preset's, has a heading that names the state (`## in_progress` or ``### 3. `review` ``), its first paragraph is the hint instead.
- `otea init --agents-md` adds a short block between `<!-- otea:begin -->` and `<!-- otea:end -->` to `AGENTS.md` at the project root (creating the file if needed) telling agents to run `otea playbook`. Running it again replaces the block, never duplicates it, and leaves the rest of the file alone. `otea init` alone never touches `AGENTS.md`.

### Working from an MCP client

`otea mcp` serves the agent commands as tools of a [Model Context Protocol](https://modelcontextprotocol.io) server on stdin and stdout, so Claude Code and other MCP clients can work Otea without shelling out. Connect it once per project, naming the agent it acts as:

```sh
cd /path/to/your/project
otea connect --as claude-b     # or just "otea connect" at a terminal, which asks for the name
```

- `otea connect` writes the `otea` server into `.mcp.json` at the project root (the project config Claude Code reads), running `node --disable-warning=ExperimentalWarning /path/to/otea/src/cli/main.ts mcp --as claude-b`, so every action through it is attributed to `claude-b`. Other servers in the file are kept, and connecting again replaces the entry. `--json` prints the path, the agent, and the `command` and `args`, to copy into clients that keep their config elsewhere (or run `claude mcp add otea -- <command> <args>`).
- The name is a short slug: at most 24 lowercase letters, digits and single dashes, starting with a letter, and not `you` or `human`. Anything else fails with exit 6 (`invalid_agent_name`) and writes nothing. Without `--as`, `connect` asks for the name at a terminal and fails with exit 2 otherwise, so scripts pass `--as`. The web UI shows each agent by a mark derived from its name, so a stable name keeps its mark stable.
- Tools: `playbook`, `list`, `show`, `create`, `update`, `attach`, `link`, `unlink`, `move`, `claim`, `heartbeat`, `release`, `relay`, `events` and `wait`, one per agent command. Each takes that command's arguments and options by name (`{"id": "TASKS-1", "state": "review"}`, `"field": ["priority=high"]`, durations as `"90s"`, `"15m"`, `"1h"`; `attach` takes `file` as a path the server reads, relative to the directory it runs in) and runs the command itself, so the rules, the validations and the error codes are those of the CLI. Setup and human commands (`init`, `connect`, `collection add`, `validate`, `serve`, `open`) stay in the CLI, and `human-ui` moves are refused (`forbidden`) as in the CLI.
- A tool returns the JSON the command prints with `--json`; `events` returns its events as one array. A failure is a tool error whose text is the same `{"error":{"code","message"}}`.
- `wait` gives up with the `timeout` error after 5 minutes unless `timeout` says otherwise, and refuses more than 15 minutes, since clients time out long tool calls: call it again to keep waiting. A cancelled call stops waiting. `events` has no `follow`: call it again with the last event id as `since`.
- The agent is named by `--as`, then `$OTEA_AGENT`, then `agent`, as in the CLI, and the project is found from the directory the client starts the server in. Nothing but the protocol goes to stdout.

### Token budget

What an agent reads back costs tokens on every call, so output size is tested like behavior. `src/cli/token-budget.test.ts` measures the CLI text, the CLI `--json` and the MCP result of `show`, `list`, `playbook`, `create`, `claim`, `move`, `attach` and `wait`, plus the MCP tool definitions, on a full bug-triage item, and fails when one grows past its budget. Tokens are estimated as characters / 4, not counted by a tokenizer. `--json` and MCP results are compact JSON, one line, no indentation. `OTEA_TOKEN_REPORT=sizes.json npx vitest run src/cli/token-budget.test.ts` writes the current sizes; raise a budget only on purpose.

### Presets

Every collection is governed by a preset: its fields, states, turns and transitions, plus a playbook for agents. Official presets live in [`presets/`](presets/):

- [`tasks`](presets/tasks/playbook.md): the default; an agent works a task and a human approves it in review.
- [`bug-triage`](presets/bug-triage/playbook.md): an agent files a documented bug (steps, expected and actual, environment, severity), you triage it, the agent fixes the ones you accept and returns proof, and you verify the fix. It lists bugs in a grid by category (an enum: crash, visual, gameplay, physics, audio, performance, ui), severity and area. Area is free text, in the words the project uses; the grid filters and groups by it as written (lowercased, so `Farm` and `farm` are one), and a project that wants a fixed set of values can make it an enum in its own preset. `otea collection add bugs --preset bug-triage`
- [`change`](presets/change/playbook.md): one piece of work across several repos. You create a `change`; the agent plans it as one `repo_task` child per repo (with its `repo` and `branch`; a repo task lives only under a change, and a change takes nothing else), you approve each repo task's plan (`proposed` to `ready`), the agent implements it, records its pull request (`pr`) and hands it to `pr_review`, and you approve it (`approved`, which closes it), and then the agent merges it. The change goes to `verify` once every repo task is closed. A repo task's gates say whether its branch may be pushed (only while `implementing` or `revising`; it is frozen in review) and merged (only once `approved`): `otea show <id> --json` carries `"gates": {"push": true, "merge": false}`. Otea does not talk to any forge: the agent fills `repo`, `branch` and `pr` with `otea update`. `otea collection add changes --preset change`

A project can add its own in `presets/<name>/preset.yaml` in its data folder (`otea projects current` prints it; `.otea/presets/` for a local project) (with its `playbook.md`) and use it with `otea collection add <collection> --preset <name>`; project presets cannot reuse an official name. The format is described in §9 of the [product definition](docs/otea-product-definition.md#9-preset-format).

A preset can hold several **item types** in one collection, for example bugs and improvements, each with its own fields, workflow and layout. Items then carry their type: `otea create --collection work --type bug --title "..."` (`--type` is required only when the preset has more than one type), `otea list --type impr`, and every `--json` output include it (the text of `list` and `show` names it only when the preset has several). A preset without `types` has a single type, `item`; a preset with one type names it by declaring just that one under `types`, as `tasks` (`task`) and `bug-triage` (`bug`) do. Items stored as `item` before their preset named its type take that name the next time the project is opened. Each type may name an icon the web UI draws beside its items (`icon: bug`, or a top-level `icon` for a preset without types; `tasks` uses `checkbox` and `bug-triage` uses `bug`); an unknown name is a preset problem that suggests the close ones. A top-level `icon` is also the preset's own icon, the default of its collections, next to types too; without it the preset's icon is its first root type's. The official presets use `checklist` (`tasks`), `bug` (`bug-triage`) and `layers` (`change`).

**Collection and project icons.** Every collection shows an icon: its preset's, unless it was given its own with `otea collection add <name> --icon <icon>` or later with `otea collection icon <name> <icon>` (`otea collection icon <name> default` goes back to the preset's). `otea init --icon <icon>` gives the project an icon, also on a project that already exists; a project without one is drawn as a two-letter monogram of its name. Icons are named as in presets (the 112 in [`src/core/icons.ts`](src/core/icons.ts)), and an unknown name fails with exit 6 (`invalid_icon`), naming the close ones, and changes nothing. `GET /api/collections` gives each collection its resolved `icon` (its own, else its preset's, `null` when neither has one), `GET /api/presets` each preset's `icon`, and `GET /api/project` the project's `id`, `name` and `icon` (`null` when it has none). Closed states say what closing means (`closes: done` or `closes: discarded`), and an agent can never close an item as `done`. `otea validate` checks types, layouts and closing kinds, and reports items whose type the preset no longer declares.

Types can form a **hierarchy**. Under `types.<type>`, `children: [story, bug]` lists the types that may hang under it with `parent`, and `root: false` says it may not live with no parent (`root` defaults to `true`):

```yaml
types:
  epic: { label: Epic, children: [story, bug], playbook: ./epic.md }
  story: { label: Story, root: false, children: [bug] }
  bug: { label: Bug }
```

- The hierarchy applies only once a type of the preset lists `children`; then a type without `children` takes none. A preset where no type lists them, as every official one, takes any child under any type.
- `otea link <child> parent <parent>`, `otea create --parent` and the API refuse a child whose type the parent's type does not list with exit 16 (`parent_type`), and `otea create` of a type with `root: false` and no `--parent` with exit 16 (`parent_required`).
- `otea validate` reports a child that is not a type of the preset or is listed twice, a loop (`epic -> story -> epic`, or a type under itself), and a `root: false` type that no type lists in its `children`.
- `GET /api/collections` and `/api/presets` carry `children` and `root` on each type of a preset with a hierarchy, and the web UI's **+ child** offers only the types the parent takes (and hides on a type that takes none); **New item** offers only the types that may stand alone.

**Notes on a preset.** A preset can be valid and still leave things in the dark. Loading it also notes, without stopping it:

| Code | Level | What it means |
| --- | --- | --- |
| `field_unplaced` | warning | a field no layout slot (header, body, side, row, intake, phone) places, so nobody sees it; the title never counts |
| `state_stuck_in_chat` | warning | a human-turn state that a decision relayed from chat cannot move forward: every exit is `human-ui`, or its `human` exits only go back (to a state no farther from the start) or to a `discarded` close |
| `gate_unchecked` | warning | a gate no playbook of the preset runs `otea check --gate <name>` for; Otea records no gate checks, so the playbook is the only sign it is used |
| `field_single_type` | info | a field only one type of several has |
| `deprecated_key` | warning | `close_requires`, the former name of `requires` |
| `sample_*` | warning | a sample that does not fit the preset (below) |

`otea validate` prints the warnings of the project's own presets, as warnings that never fail it; an official preset is read-only, so its notes (each official approval is given only in the web UI, by design) and every info note stay in Studio. Studio's `GET /api/studio/presets/<name>` carries them all as `notes`, each with its `code`, `level`, `message` (which starts with its place in the YAML, as problems do), `file` and a structured `path`, such as `{"section": "fields", "type": "bug", "field": "build_hash"}`, for the editor to open the part it is about. A blueprint is noted too: a `blocks` connection whose target type has no state that `requires: blockers_closed` waits for nothing, and `otea validate` warns about it in the project's blueprint (the official `product` blueprint's `bugs.bug blocks work.task` is one, since no `tasks` state waits for blockers).

**Sample items.** A preset may carry a few example items in `samples.yaml`, beside `preset.yaml`, for Studio to draw the real detail, row, form and lanes from a draft. They never enter a collection or the database. Evidence files live in a `samples/` folder beside it:

```yaml
samples:
  - type: bug                     # optional when the preset has one type
    id: BUGS-1                    # the id it shows; any text
    title: Wall-slide jump drops the buffered input
    state: reported
    fields: { steps: ..., severity: high }
    evidence:                     # role: before, after or single (the default); module and caption optional
      - { file: wall-slide-before.png, role: before }
    relations:                    # the other item, described: kind as read from this one
      - { kind: blocks, id: WORK-2, title: Coyote time on moving platforms, type: task, state: todo }
    history:                      # actor human or agent; ago: 5m, 3h, 2d
      - { actor: agent, name: claude-a, event: created, ago: 2m }
```

Samples are read strictly against the preset, and what does not fit is a note, never a problem: a sample with an unknown key or type is left out (`sample_invalid`, `sample_unknown_type`), a state the workflow lacks is drawn as its initial state (`sample_unknown_state`), a value of an unknown field shows as plain text (`sample_unknown_field`), one its field does not allow is noted (`sample_invalid_value`), and evidence whose file `samples/` lacks is dropped (`sample_missing_file`). Every official preset ships samples. `GET /api/studio/presets/<name>/samples` returns `{yaml, files, samples, notes}`, `GET /api/studio/presets/<name>/samples/<file>` serves a file of the folder, and `POST /api/studio/presets/<name>` takes `samples` (the text of `samples.yaml`) beside `yaml` and `playbooks`; changing only the samples leaves `preset_version` as it is. Duplicating a preset copies its samples and their files.

**Studio's preview.** `src/core/views.ts` builds what clients draw from a preset alone, so the server and Studio's preview share it: `typeViews(types)`, `draftCollectionView(preset, {name, icon?})`, `itemMoves(type, state, fields, performer)` (the moves, relayable decisions, missing fields and gates of an item in a state), and `sampleItem` / `sampleItemView(preset, sample, {collection, now, performer?})`, which draw a sample as `GET /api/items/:id` draws a stored item (its `ago` times counted back from `now`, the desk's browser as performer by default). `ui/src/studio/preview.ts` wraps them as `draftPreview(draft, {yaml, files}, {collection, now})`, reading the samples against the draft. The rendered detail, list row and create form mark each part the layout places with `data-type`, `data-slot`, `data-index` and, for a field, `data-field`, so a click finds its place in the preset. `POST /api/studio/presets` with `{"name"}` creates a blank project preset, and `POST /api/studio/presets/<name>/delete` deletes a project preset that no collection uses (`in_use`, 409, otherwise); both only from this computer's signed-in browser, and official presets stay read-only.

A type may have its own **playbook**, `playbook: ./epic.md`, beside the preset's, in the same folder. The hint of `otea show` takes the section for the state from the item's type's playbook first, then from the preset's. `otea playbook --collection <name>` prints the preset's playbook, then each type's own under `--- Type <type> ---`; its `--json` adds `types`, a list of `{type, playbook}` for the types that have one (empty when none do). The MCP `playbook` tool returns the same.

### Blueprints

A **blueprint** is a set of boards, each a collection name plus a preset, and the links allowed between them. It builds all of a project's boards at once and says how they work together:

```yaml
blueprint: product
blueprint_version: 1
playbook: ./playbook.md          # optional: the coordination playbook, in Markdown
boards:
  work: { preset: tasks }
  bugs: { preset: bug-triage }
connections:                     # <board>.<type> <kind> <board>.<type>
  - bugs.bug blocks work.task
```

A connection lets an item of one type in one board link to an item of one type in another, with one kind: `blocks`, `implements`, `relates` (either way) or `duplicates`. `parent` is never a connection; it stays inside a board.

```sh
otea init --blueprint product         # create the project and every board of the blueprint
otea blueprint apply ./shared/studio  # or build them in an existing project (a name, or a path with a slash)
otea blueprint status                 # compare the project's copy with its source
otea blueprint update                 # bring the source's changes in, after confirmation (--yes skips it)
```

- Official blueprints live in [`blueprints/`](blueprints/) next to `presets/`: [`product`](blueprints/product/playbook.md) builds `work` (tasks) and `bugs` (bug-triage), where a bug can block a task. A project adds its own in `blueprints/<name>/blueprint.yaml` in its data folder (`.otea/blueprints/` for a local project), under names the official ones do not use.
- Applying a blueprint creates each board as a collection; an existing collection of the same name and preset becomes its board, and one with another preset stops the apply before anything is created. A project has one blueprint.
- The project keeps its **own copy** in `blueprint.yaml` in its data folder (with the playbook beside it as `blueprint.md`), plus where it came from and the hash of the source. It is a copy, not a live reference: editing the source changes nothing until `otea blueprint update`. `otea blueprint status` and `otea validate` list what the source changed (`+ board qa (preset tasks)`, `- bugs.bug blocks work.task`, `~ playbook`). Update adds boards and connections, and removes or rebuilds a board only while it has no items: a board with items is kept and reported.
- Once a project has a blueprint, a link between two of its boards that the blueprint does not declare fails with exit 16 (`link_not_in_blueprint`), and the message lists what is allowed between those boards. Links inside one board, `parent` links, and boards outside the blueprint are not restricted. Without a blueprint nothing changes.
- `otea playbook` (without `--collection`) ends with the blueprint's coordination playbook, and its `--json` carries it as `blueprint`. `otea validate` checks blueprints: unknown presets, unknown types, `parent` used as a connection, and connections listed twice.

### See it live

The web UI updates live as items change, and it is where you take the decisions agents cannot, such as approving a task in review.

```sh
npm run build:ui            # once, in the Otea checkout

cd /path/to/your/project
otea serve                  # Otea running at http://127.0.0.1:4400
```

`otea serve` opens your browser already signed in to act on items (the session lives in an HTTP-only cookie; the token in `ui-token` in the project's data folder is never printed). Pass `--no-open` to skip the browser, and run `otea open` from the project later to sign a browser in to the running server. A tab opened on the plain URL without signing in is read-only.

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

**Agents at work.** Otea notes each agent it sees: every agent command, from the CLI or the MCP server, records when that agent was last seen (to within 30 seconds, so a busy agent does not write on every call), and the harness it came through: the `clientInfo` name the MCP client sends in `initialize` (`claude-code`, say), or `cli` for an agent only seen at the command line. An MCP server notes its agent as soon as the client connects. `GET /api/agents` returns `{"agents":[{"name","harness","holding","lastSeen","live"}]}`: `harness` is `null` when unknown (agents that wrote before presence was kept start from their last event), `holding` lists the ids of the items the agent holds a live lease on, `lastSeen` is an ISO time, and `live` is true when the agent was seen in the last 5 minutes or holds a lease. Live agents come first, then the most recently seen; the human is never listed. Besides `change`, `GET /api/stream` sends a `presence` event when an agent is seen anew, changes harness or takes or drops a lease; time running out (the 5 minutes, a lease expiring) sends nothing, so the UI reads `lastSeen` and the leases for that.

### A phone on the same network

`otea serve` answers this computer only (127.0.0.1). `otea serve --lan` also listens on the local network so a phone can pair once and then open the UI:

```sh
otea serve --lan            # prints the LAN address, a pairing code and its QR code
otea devices list           # the paired devices, with when each was last seen
otea devices revoke <id>    # its token stops working at once
```

The terminal and **Pair a phone** in Preferences (`#/lan`, this computer's signed-in browser only) show a QR code for `http://<lan-ip>:<port>/pair#code=XXXX-XXXX`. The code lasts 10 minutes, works once, and is thrown away after 5 wrong tries; **New code** shows another. The phone trades it for its own device token (an HTTP-only cookie; only its SHA-256 is stored), and each device can be revoked from the same page. A request from the network must come from a private address (including Tailscale's 100.64.0.0/10), name one of this computer's IP addresses as its host (never a DNS name), and carry a device token; without one it reaches only the pairing screen. Pairing attempts are limited to 10 a minute per address. Traffic on the LAN is plain HTTP, so use it on a network you trust, and reach Otea through Tailscale when away instead of opening a port.

When this computer's `<hostname>.local` resolves (mDNS) to one of those addresses, the QR code and the terminal use it first, so a home-screen shortcut survives a new DHCP address; the same link by IP is printed and shown beside it for phones that cannot resolve `.local`. The server answers that one name besides its IPs; any other host name is refused.

After pairing, the phone suggests adding Otea to its home screen (a web app manifest and icons, served before pairing too; no service worker, which browsers refuse on plain HTTP). On iOS the home-screen app keeps its own storage, apart from Safari: it opens on the pairing screen and pairs once more, by typing a new code. On Android over plain HTTP, Chrome adds a shortcut rather than installing the app.

Working on the UI itself: keep `otea serve` running and start `npm run dev:ui` in the Otea checkout for hot reload (it proxies `/api` to port 4400).

## License

Otea is free software under the [GNU Affero General Public License v3.0](LICENSE). You can use, study, modify and share it. If you distribute a modified version, or let people use it over a network, you must publish its source under the same license, keeping the copyright notices.

**Commercial license.** If the AGPL does not fit your use (for example, embedding Otea in a closed product), a commercial license is available. Open an issue or contact [@Lartweib](https://github.com/Lartweib).

**Name.** "Otea" and its logo identify this project. Forks are welcome under the AGPL, but must use a different name.

Contributions are accepted under the [Contributor License Agreement](CLA.md); see [CONTRIBUTING.md](CONTRIBUTING.md).
