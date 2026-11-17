# Otea

> From the Spanish verb *otear*: to scan from a high vantage point, to watch what is happening and what is coming.

**Otea is the asynchronous handoff surface between you and your AI agents.**

Agents produce work faster than a human can follow it live. Otea is where work changes hands: agents leave findings, deliverables and evidence; you leave decisions and feedback; both can see at any moment where each thing stands and whose turn it is.

**The handoff lives in the item, not in the session.** Evidence, history and the next step are stored with the item, so an agent can hand it over and its session can close instead of sitting open waiting for you. Any later session picks it up from `otea show`, whose `Next:` line says what to do now, and `otea wait` blocks until an item is the agent's turn again. A lease the closed session held expires on its own.

- **Triage** many findings at once: filter, group, prioritize, discard.
- **Review** results in depth: GIFs, video, diffs, logs, with concrete questions the agent reads back and acts on.
- **Boards** shape the work: their steps, who does and reviews each, what a handoff carries. **Templates** start a board, or several joined boards at once (a Cambio that divides into one Tarea de repo per repository).
- **Local-first**: data stays with your project. No cloud, no accounts.
- **Harness-neutral**: any agent with a shell (CLI) or MCP support can use it.
- **Traceable**: every change is an append-only event, with who made it and through which channel.

## Status

Early: usable, still changing fast. The product definition lives in [`docs/otea-product-definition.md`](docs/otea-product-definition.md).

## Install

Download Otea for your system from [GitHub Releases](https://github.com/Lartweib/otea/releases/latest) and install it like any desktop app. It needs nothing else: no Node, no npm.

| System | Download | The `otea` command |
| --- | --- | --- |
| Windows | `Otea-Setup-<version>.exe`: installs for your user, no administrator | on your PATH after the install; the uninstaller takes it off |
| macOS (Apple Silicon and Intel) | `Otea-<version>-mac.dmg`: drag Otea to Applications | tray menu › **Install the otea command** (`/usr/local/bin/otea`) |
| Linux | the `.deb` (`sudo apt install ./Otea-<version>-amd64.deb`), or the `.AppImage` for the app alone | `/usr/bin/otea` from the deb |

Open Otea like any app. The first time it asks for a project: **Open folder** or **Create project**; after that it reopens the last one, and the tray menu opens another. It runs `otea serve` itself and shows the UI in its window, with no console. Agents run `otea` from any new terminal, on the CLI the app carries. Otea checks for updates at start and every few hours, downloads them in the background and says so in a corner ("Otea updated · restart"); the update applies when you restart it.

The installers are not signed yet. On Windows, SmartScreen warns on the first run: **More info** › **Run anyway**. On macOS, Gatekeeper refuses the first open: Control-click Otea in Applications › **Open** (on macOS 15 and later, System Settings › Privacy & Security › **Open Anyway**); until the Mac app is signed it announces a new version with a download link instead of updating itself. More in [`desktop/README.md`](desktop/README.md).

## Development

Requirements: Node.js 22.18 or later (Node 24 recommended, see `.nvmrc`).

```sh
npm install
npm run check   # lint, typecheck and tests
```

Tests never touch your real `~/.otea`: the test setup gives every test file a temporary `OTEA_HOME`, and code that falls back to the home folder throws inside tests, so a test must pass `OTEA_HOME` in the env it hands to Otea.

Without the desktop app, run the CLI from source inside the project you want to track (npm scripts always run from the Otea checkout, so `npm run otea` is only useful for `help`):

```sh
alias otea='node --disable-warning=ExperimentalWarning /path/to/otea/src/cli/main.ts'

cd /path/to/your/project
otea init                                  # a new project starts with no board: pick them here or in Studio
otea init --template changes               # Cambios, the changes you ask an agent for (templates below; none for no board)
otea board add Errores --template bug-reports   # another board, from a template, published at once (yours: no agent name)

# What an agent runs: every command that acts names the agent (--as, or OTEA_AGENT for the session)
export OTEA_AGENT=claude
otea profile --model claude-opus-5-5 --effort high --harness claude-code   # what it runs as (unknown if it cannot tell)
otea create --collection Cambios --title "Write the docs" --field "Qué quiero=Install and first steps" --field "Cómo lo valido=Follow it on a clean machine"
otea create --collection Cambios --title "Fix the footer" --field "Qué quiero=It shows last year"   # no Cómo lo valido: starts in Aclarar
otea list --turn agent --unclaimed --json # waiting for agents and not held by another one
otea next                                  # which item to take now, and what its step asks
otea claim CAM-2                           # hold it for 15 minutes (--ttl 30m for another length)
otea heartbeat CAM-2                       # extend the lease on long work
otea handoff CAM-2                         # refused (exit 8) while what Aclarar asks for is missing
otea update CAM-2 --field "Cómo lo valido=The footer shows this year" --field "Clase de cambio=Error"   # fill what was missing
otea handoff CAM-2                         # on to Hacerlo; then otea next again
otea list --field "Clase de cambio=Error"  # items whose field holds that value, by name or id (repeat to AND them)
otea wait --turn agent --unclaimed         # nothing to do: block until there is something, then otea next
otea check --gate push --branch --repo     # may this branch be pushed? exit 0 yes, 19 no (fails open)
unset OTEA_AGENT
otea list                                  # read without a name: list, show, events and board need none
otea show CAM-1                            # what to do next, fields, moves the agent can relay, lease, timeline
otea validate                              # check boards, collections and items

otea hook install --git --claude           # in a repo: make that check a pre-push hook and a Claude Code hook
otea help                                  # every command, global options and exit codes
```

Agents claim an item before working it. A lease is atomic: while one agent holds an item, `otea claim`, `otea update` and `otea move` from any other agent fail with exit code 12 (`lease_held`), and `otea heartbeat` or `otea release` by someone who does not hold it fail with exit code 12 (`not_lease_holder`), saying who holds it. An expired lease reads as free and can be taken over; moving an item off the agent turn (for example to `review`) releases it automatically. On a published board a lease is for one step: every move (a handoff to the next step or to a review, an approval, a send-back) releases it, even when the next step is the agent's too, so it never blocks that step or reads as someone working there; an agent that goes on with the next step claims it again. While another agent holds an item, `otea show` and `otea next` for it say `Held by <agent> until 2026-11-12 10:04 UTC: pick another item.` instead of the agent's turn. Items nobody claimed stay writable, and the human in the web UI is never blocked by a lease. Every agent command acts as a named agent: `--as <name>`, or `$OTEA_AGENT`. Reading (`otea list`, `show`, `events`, `board`) needs no name: without one it reads as the person, and is not recorded as an agent. There is no default name: a command that acts, without one, fails with exit 2 (`unnamed_agent`) saying how to name yourself, and the name follows the rule below (exit 6, `invalid_agent_name`) wherever it is given. The name is the agent's identity, so each agent working at the same time uses its own; two agents under one name share every lease. Only items whose turn is the agent can be claimed (exit code 4, `not_claimable`, otherwise).

A lease that ran out without a release leaves its item stuck (**Atasco** in the web UI). There the person either puts it back in the queue of its step for any agent to claim (**Retomar**, `POST /api/items/:id/restart`) or leaves it for a named agent (**Reasignar**, `POST /api/items/:id/reassign` with `{"agent"}`). Both drop the lease that ran out and write a `released` event by the human with `cause` `restart` or `reassign` (and `next`, the agent it is left for); `otea show` reads them as `(back in the queue)` and `(left for <agent>)`. The agent named is expected, not enforced: any agent may still claim the item, but `otea next` offers it only to that agent, and `otea show` tells any other `Left for <agent>: pick another item.` (and that agent `The person left it for you.`) until an agent claims or moves it. An item whose lease is still running, or that has none, is refused (409, `not_stuck`). While its toast is up, `POST /api/items/:id/undo` with `{"release": true}` gives the lease back as it was (with `{"from"}` it takes back a move, as before); like moves, these writes need the session, JSON and the server's own origin.

`otea update` changes fields of an open item (a blank value clears an optional field) and records the old and new values in the timeline; items in a closed state (turn `none`) cannot be updated. Agents act through the CLI, so it only makes the moves a board gives agents. Approving a step the person reviews (`Hacerlo (en revisión)` -> `Integrar` on Encargos; a review reads in the board's language, and `(in review)` is accepted too) is the person's, in the web UI: `otea approve`, `otea move` and `otea relay` refuse it with exit code 7 (`forbidden`).

A board is named in any case wherever a command takes one (`--collection encargos` is Encargos, and so is `otea board encargos`), as its steps and fields are in `otea list --state/--field`: board names are unique whatever their case.

### Projects

`otea init` creates the project for the repository root (or the folder itself outside git) in common storage: its data goes to `$OTEA_HOME/data/<id>/` (`OTEA_HOME` defaults to `~/.otea`), the user-level registry links the root to it, and nothing is written into the repo (only `otea init --agents-md`, `otea connect` and `otea hook install` write there, when asked: see [Files Otea writes in the repo](#files-otea-writes-in-the-repo)). `otea init --local` keeps the data in `.otea/` at the root instead, excluded from git through `.git/info/exclude`. Every command finds the project from any subfolder or git worktree of that repo: the nearest registered folder containing the working directory or the main repo root, or else the nearest folder above the main repo root holding `.otea/otea.db`. So one project can also live in a product folder above several repos (the folder need not be a repo): run `otea init` there, and commands from inside any of those repos use it. `otea init` inside a repo that such a project already covers refuses; `otea init --here` creates a separate project at the repo, which then wins for it. `OTEA_PROJECT=<path>` skips discovery and names the project folder directly (or a registered folder, or a project id). The MCP server and `otea serve` find the project the same way.

Each project has an identity stored in its database: a name (its folder's) and an id, the name as a slug plus six random base32 characters (`my-app-k3x7qa`). `otea init --json` prints both next to `root`, `path` (the data folder) and `storage`, and `GET /api/project` returns them. A database created before identities gets one the first time it is opened.

### Files Otea writes in the repo

Common storage keeps every item, board and event outside the repo. Inside it, Otea writes only when a command asks it to, and it keeps each file that names this machine out of git through `.git/info/exclude` (never `.gitignore`, which is tracked):

| File | Written by | In git |
| --- | --- | --- |
| `.otea/` | `otea init --local` | excluded: the project's data |
| `.mcp.json` | `otea connect` | excluded: its `otea` entry names this machine's path to Otea |
| `.claude/settings.local.json` | `otea hook install --claude` | excluded: its hooks name this machine's path to Otea |
| the `pre-push` hook (`.git/hooks`, or where `core.hooksPath` points) | `otea hook install --git` | never committed under `.git/hooks` |
| `AGENTS.md` | `otea init --agents-md` | yours to commit: it tells every agent to use Otea |

A file the repo already tracks (a team's shared `.mcp.json`) is not excluded, since git ignores the exclude list for tracked files: Otea writes its entry and says the file is tracked, so you keep that change out of your commits.

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
otea repos list                          # the repos its items name: api  remote:github.com/acme/api
otea repos add ~/code/web --name web     # add a repo (or rename one); every clone of it is web
```

Commands, the MCP server and `otea serve` in any linked folder (and its subfolders and worktrees) then use that project: an item created from `api` is listed from `web`. Common storage writes nothing into the repo, not even `.otea/` (only `otea init --agents-md`, `otea connect` and `otea hook install` do, when asked). The user-level registry (`$OTEA_HOME/registry.db`) records which folders lead to which project: a folder belongs to one project only, a folder with its own `.otea/` project cannot be linked, and when both a linked folder and a local project contain the working directory, the nearer one wins. A local project (`otea init --local`) cannot be shared this way.

When a repo moves, `otea projects relink <old> <new>` points its link at the new folder, but only when the new folder is the same repo: the same origin URL (a trailing `.git` or `/` aside) or the same root commit, compared with the old folder if it still exists and else with what was recorded when it was linked. Another repo is refused (exit code 17, `different_repo`) unless `--force`; when neither can be checked (plain folders, a repo with no remote and no commit) it relinks with a warning. `otea projects forget <path>` removes a link and never the data: a project left with no linked folder stays registered with its items, nothing resolves to it, and `otea init --join` or `otea projects add` links a folder to it again. A project knows its repos by their origin URL (its https, ssh and `git@host:path` forms are one; without an origin, by the root commit), under the name a repo task's `repo` field holds: the repos at its folders are added under their folder names when it is created or a folder is linked, so a clone or worktree in any other folder still goes by the repo's name, and a gate check (`--repo` with no name) in a repo the project does not know refuses until `otea repos add` names it. A command run where no project resolves says so (exit code 3); when projects are registered, it also suggests `otea init --join <id>` and `otea projects list`. `otea projects list` marks linked folders that no longer exist with `(missing)`.

### Moving a local project to common storage

A project created in `.otea/` (with `otea init --local`, or before common storage was the default) stays there until you move it; Otea never migrates on its own. `otea migrate --to common`, run from the project:

1. copies the database into `$OTEA_HOME/data/<id>/` with `VACUUM INTO` and checks the copy (`PRAGMA integrity_check`, and the same row count and last row id in every table);
2. copies `evidence/` and `presets/`, registers the project (same id) and links its folder;
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
  - A type that places no evidence module takes any file in any role, as before. Evidence attached before modules existed (or to a module a board edit removed) belongs to the first module that accepts it.
- `otea show` groups the evidence by module, in layout order, marks required ones and says `nothing yet` for an empty one; files no module draws come last as `other files`. The MCP `attach` tool takes the same `module` and `role`.
- The kind comes from the extension: `gif`, `png`, `jpg`, `jpeg` and `webp` are images; `mp4`, `webm` and `mov` videos; `diff` and `patch` diffs; `log` and `txt` logs; anything else, SVG included (it can carry scripts), is a plain file.
- Evidence is append-only, like the event log, and each attachment adds an `evidence_added` event to the timeline. Attaching the same file again (same content, module, role and caption) before the item moves adds nothing: `otea attach` prints the entry it already has and says so (`--json`: the entry with `"duplicate": true`). Once the item moves, as in a new round, the same file is a new entry. It follows the rules of `otea update`: an item another agent holds refuses it (exit 12, `lease_held`) and so does a closed item (exit 4, `item_closed`). A missing file fails with exit 3 (`file_not_found`) and one over 50 MB with exit 14 (`evidence_too_large`).
- `otea show --json` and `GET /api/items/:id` list the entries under `evidence`. `GET /api/evidence/:id/file` serves the file to a signed-in browser only (401 otherwise), with `X-Content-Type-Options: nosniff` and `Content-Security-Policy: sandbox`: images and videos inline with their type, diffs and logs as `text/plain`, anything else as a download, so no attached file runs in the UI's origin. It serves byte ranges (`Range: bytes=…`, 206), so videos seek.
- The item detail draws each evidence module where the layout places it: `images` as one image (`single`), a gallery with thumbnails (`gallery`, left and right arrows step through it) or a before/after slider with a draggable divider and a side-by-side mode (`compare`; the divider is a keyboard slider); `recording` in the browser's player (`player`, nothing autoplays) or as a strip of eight frames read from the video (`frames`, falling back to the player when the browser cannot read frames); `diff` as files, hunks and numbered lines; `log` numbered, with a wrap toggle, keeping only its start and end until "show all" when longer than 160 lines. An empty module says what agents attach, and a required one is drawn dashed. A browser that is not signed in lists file names only.

### Relations between items

Items link to each other with a typed relation: `parent`, `blocks`, `duplicates`, `implements` and `relates`. A collection is one board: a tree of `parent` links lives inside it, and the other kinds link items across the collections of the project.

```sh
# after otea init --template ideas: Ideas and Implementación
otea create --collection Implementación --title "Create wolf" --field "Qué hay que hacer=A wolf for the forest"
otea create --collection Implementación --title "Body" --field "Qué hay que hacer=Mesh and rig" --parent TAR-1
otea create --collection Implementación --title "Movement" --field "Qué hay que hacer=Walk, trot, run" --parent TAR-1
otea link TAR-2 blocks TAR-3                # body before movement
otea create --collection Implementación --title "Wolf" --field "Qué hay que hacer=A wolf"
otea link TAR-4 duplicates TAR-1            # TAR-4 is a copy of TAR-1
otea create --collection Ideas --title "Forest fauna" --field "La idea=Animals that live in the forest"
otea link TAR-1 implements IDE-1            # work on one board delivers an item of another
otea create --collection Implementación --title "Pack" --field "Qué hay que hacer=Wolves together"
otea link TAR-5 parent TAR-4                # TAR-4 becomes the parent of TAR-5
otea link IDE-1 parent TAR-1                # refused, exit 16: a parent lives on its child's board
otea unlink TAR-2 blocks TAR-3
otea list --parent TAR-1                    # the children of TAR-1
otea show TAR-1                             # children summary and relations by kind
```

What waits on another item says so with `blocks`, and a step that waits for its blockers (**Algo que esperar** in Studio, `"waits": ["blockers"]` in `board.json`) is not handed off, or approved, while one of them is open. Implementación, the task board of `otea init --template ideas`, waits for them in Hacer:

```sh
otea create --collection Implementación --title "Login page" --field "Qué hay que hacer=The login form" --field "Terminado cuando=It signs in" --field "Tamaño=S"
otea create --collection Implementación --title "Auth endpoint" --field "Qué hay que hacer=POST /login" --field "Terminado cuando=It answers a token" --field "Tamaño=S"
otea link TAR-7 blocks TAR-6                # the login page waits for the auth endpoint
otea handoff TAR-6                          # in Hacer: refused while TAR-7 is open (exit 4, blockers_open, once its deliverables are in)
otea show TAR-6                             # its Handoff names TAR-7, its board and its step, as what still blocks it
```

- `otea link <id> <kind> <other>` reads as a sentence for `blocks`, `duplicates`, `implements` and `relates`; `<id> parent <other>` makes `<other>` the parent of `<id>`. `otea create --parent <id>` creates the item as a child in the same write. `otea unlink` takes the link named the same way (`relates` either way round).
- Each pair is linked once per kind; an item has at most one parent, in its own collection; `parent` and `blocks` never loop. Refusals: a self link, a second parent, a parent in another collection or a cycle exit 16 (`self_relation`, `parent_exists`, `parent_across_boards`, `relation_cycle`; the cycle's path, or for another collection's parent the `blocks` and `implements` links to use instead, in the message); a missing item exits 3 (`not_found`); a repeated link exits 5 (`already_exists`); an unknown kind exits 2 (`invalid_relation`); an open child under a closed parent exits 4 (`item_closed`). The CLI, the API and MCP refuse alike.
- A `parent` across collections linked before the rule is kept and read as before. `otea validate` warns on each and names a way out, such as converting the link to `blocks` or `implements`. Nothing is migrated for you.
- Linking changes neither item's fields nor state, so it is not bound by leases and works on closed items. Every link and unlink is recorded in both items' timelines (`relation_added`, `relation_removed`), with who did it and through which channel.
- `otea show` prints, for a parent, `Children: n of m closed (d done, x discarded)`, then the relations grouped by kind with each other item's state and turn. `--json`, `otea list --json` and the API carry `relations` (and `children` for a parent) on the items that have them.
- A step waits for what its board says: its blockers (`"waits": ["blockers"]`), every item that `blocks` this one, in any board, refused with exit 4 (`blockers_open`); or its parts (`"waits": ["parts"]`), the items it divides into on another board (see [Templates that make several boards](#templates-that-make-several-boards)), refused with exit 4 (`children_open`). Each refusal names what is still open, and the approval is checked again, so a part reopened during the review stops it. Nothing ever moves an item for its parts or its blockers, and `otea show`'s `Next:` says what the handoff still waits for.
- The MCP server serves `link` and `unlink` as tools. In the web UI the relations show in the side of the detail and a parent's children in its body; a signed-in browser adds and removes links there (`POST /api/items/:id/link` and `/unlink`, `{kind, other}`, behind the same checks as moves) and creates children with **+ child**. In the list a parent shows how many children are still open, and children in the same section sit under their parent, foldable. With two collections or more the sidebar leads with **All work**: one tree across collections, where an item sits under its parent (same collection) and under whatever it blocks or implements, with `relates` counted on the row; an item's detail lists its links to other collections under **Across boards**.

### Relaying a decision made in conversation

The person's decisions on a board, such as sending a step they review back or dropping an item, can also be made by an agent relaying what the person decided in the conversation. That is a separate command, so a harness can ask the human to confirm every call:

```sh
otea relay TAR-3 Dropped --quote "Drop it, billing moves to the vendor" --reason "Billing moves to the vendor" --as claude
```

- The move is recorded as the human's (`actor: human`) with `via: <agent>`, `source: conversation` and the quote, and `otea show` (and `--json`) and the UI timeline always mark it as relayed (`human, relayed by claude`), never as a UI decision.
- `--quote` is required and cannot be blank (exit 2, `quote_required`). When the transition requires a reason, `--reason` is required too (exit 2, `reason_required`): the quote is evidence of the approval, the reason is the same field the UI records, and a quote such as "yes" explains nothing.
- An approval cannot be relayed: exit 7 (`forbidden`), the person approves in the web UI. Moves an agent may make itself are refused with exit 4 (`not_relayable`): use `otea handoff` or `otea drop`. Unknown items and undeclared moves fail as usual (exit 3, exit 4).
- An agent never relays a decision on its own work: once it has done the item's step in the current round (handed it off, or, while the step was being done, claimed the item, attached evidence or changed its fields, even if another agent handed it off; off a board, once it made the move that brought the item where it is), every relay of it by that agent exits 7 (`forbidden`, details `own_step`); the person decides in the web UI.
- A relayed decision is the human's, so like a move in the UI it is not blocked by another agent's lease; moving off the agent turn releases that lease as usual (the release is marked as relayed too).

### Waiting for work and following events

An agent does not have to poll `otea list`: `otea wait` blocks until there is work, and `otea events` reads what happened. Both work across processes without `otea serve`.

```sh
otea wait --turn agent --unclaimed --timeout 15m --json   # then: otea claim <id>
otea events --since 42 --json                              # events after id 42, one JSON object per line
otea events --item TAR-1 --follow                          # keep printing new events until Ctrl+C
```

- `otea wait --turn agent|human` returns at once when an item is already on that turn, otherwise as soon as one gets there. It prints the item as a row of `otea list` (with `--json`, one object shaped like an entry of `otea list --json`). When several match, it prints the one that has waited longest: the first to enter its current state (field updates and leases do not reset it), ties going to the first created.
- `--collection` narrows it and `--unclaimed` skips items another agent holds, as in `otea list`; a lease that expires frees its item for the wait without anything being written. `wait` only reads: claim the item afterwards with `otea claim`, and if that fails with exit 12 because another agent got there first, wait again.
- `--timeout <duration>` (`90s`, `15m`, `1h`) gives up with exit 13 (`timeout`); without it, `wait` waits until interrupted (exit 130, `interrupted`).
- Every text of the CLI and the MCP tools says a time one way, as its UTC day and minute: `2026-11-12 10:04 UTC` (a lease, an event, a refusal). `--json` keeps the full ISO timestamp.
- `otea events` prints the event log in commit order, filtered by `--item` and `--collection`. Each event has an id; pass the last one you read to `--since` to get only newer ones, and `--limit <n>` to read at most n. With `--json` each line is an event shaped like the ones in `otea show --json` (`id`, `itemId`, `type`, `actor`, `at`, `data`). On a board, whose steps and fields are stored under hidden ids, the text names them, and `--json` gives each id its name beside it (`stateName`, `fromName` and `toName`, `moduleName`, and a `name` on each field change). Items read the same way in `--json` and MCP: `stateName` beside `state`, `fields` as a list of `{ id, name, value }` (a choice also has its `label`), and each move's `toName`; the ids stay the keys a program sends back. `--follow` keeps printing new events as any process commits them, until Ctrl+C (exit 0); it cannot be combined with `--limit`.

### Side topics

The questions you ask an agent off the work at hand ("why is the Windows build slow?") get answered in the chat and then lost. With topics on, the agent keeps each one as a short conversation, and the page lists what is left hanging. Topics are off until you turn them on, and they are never work: no lease, and `otea next` never offers one.

```sh
otea topic on                                                    # you, once per project (or Settings › Topics)
otea topic add "Why is the Windows build slow?" --as quill       # the agent records your question
otea topic answer TEM-1 --summary "Defender scans node_modules." --full "<the whole answer>" --as quill
otea topic note TEM-1 "And on Linux?"                            # you keep it going; a waiting agent wakes for it
otea topic close TEM-1                                           # only you close a topic
otea create --collection Cambios --title "Exclude node_modules" --field "Qué quiero=Faster builds" --from TEM-1 --as quill
```

- An open topic is the agent's turn; once answered it is yours, and Te toca folds the answered ones under its lanes. One nobody touched for a day reads as left hanging.
- Each answer shows its summary, with the full answer folded below and where that text came from: copied by the agent, or read from the session. `otea hook install --claude` adds a Claude Code Stop hook that reads the session's transcript at the end of each turn and keeps the answer as the agent wrote it; it wins over the agent's copy.
- From the page you can turn a topic into a task on a board you pick, linked both ways. An item lists its related topics, says while it is your turn that one is still open, and offers to close them once it is finished; a topic the same agent opened shortly before making the item is suggested, for you to link or wave off.
- While topics are on, the agent guide (MCP instructions, `otea board`) tells agents to record them; while off it never mentions them.

### Telling agents what to do

An agent finds its instructions in the project itself, in the words of each board:

```sh
otea next                             # the item to take now and what its step asks
otea next --claim                     # ... and claim it in the same call
otea board                            # the project's boards, each with the command that reads it
otea board Errores                    # that board's own words for agents and each step's instructions
otea show ERR-2                       # ... Next: the same answer as otea next, for this item
otea init --agents-md                 # opt in: point agents at "otea next" and "otea board" from AGENTS.md
```

- `otea next` says which item to take now on the published boards (or in `--collection`), oldest first, and what its step asks: what it starts with, the instructions, the handoff and where it goes next. An item nobody holds says `Claim it first: otea claim <id>`; one the agent holds says until when. `--claim` claims the item in the same transaction (`lease` in `--json`), so two agents asking at once never take the same one. Without it, the item offered is kept from other agents for two minutes while it stays in its step, so they are offered another; an item another agent holds is never offered. Each value under `Starts with` is given whole, line by line; one over 500 characters is cut there, with the `otea show` that reads all of it. When there is nothing to take it says so once, naming the boards, with each board's own words for idle time, and how to wait for the next item (`otea wait --turn agent --unclaimed`). A `--way` the step does not have is refused (exit 4, `invalid_transition`) with the ways it has: on to a later step or Done, and back to an earlier step with `--reason` (`ways` and `back` in the error's data).
- Otea's agent guide, a few numbered lines on working a board to the letter (name yourself with `--as`, a unique name per agent and subagent; declare the model and effort you really run as with `otea profile`, each session and whenever either changes; start with `otea next`; claim each step before working it; follow the step's instructions and every line of `Before you hand it off`; answer a `Sent back to you` note; hand off with the command `next` prints; never relay a decision on your own step; never push to a branch the item does not allow; answer every note from the person before handing off), is one text read in three places: the MCP server's `instructions`, the `AGENTS.md` block and the start of `otea board`'s text (not its `--json`).
- `otea board <name>` prints what agents read about a board before acting: its own words for them and each step's instructions (`--json`: `kind`, `collection`, `board`, `version` and `text`). A board that is not published yet fails with exit 3 (`not_found`). Without a name it prints the index (`--json`: `boards`, each with `name`, `board`, the board's id or `null` for a draft, and `command`; a name with spaces is quoted).
- `otea show` (and `--json`, as `hint`) carries `Next:`, the answer `otea next` gives for that item on its board: whose turn it is, what the step starts with, what the handoff still lacks and where it goes next. A long board text is cut to its first paragraph there, with the `otea board` command that reads the whole of it.
- `otea init --agents-md` adds a short block between `<!-- otea:begin -->` and `<!-- otea:end -->` to `AGENTS.md` at the project root (creating the file if needed) telling agents to run `otea next` and `otea board <name>` (or the `next` and `board` MCP tools), hand off with `otea handoff` and read `otea show`, followed by Otea's agent guide. Running it again replaces the block, never duplicates it, and leaves the rest of the file alone. `otea init` alone never touches `AGENTS.md`.

### The profile an agent runs as

Every agent, and every subagent, declares the profile it runs as: its harness, its model and its effort. It is kept on everything the agent does, so rounds and send-backs can be compared by model and effort afterwards; it never decides who gets which work.

```sh
otea profile --model claude-opus-5-5 --effort high --harness claude-code   # the first time on the command line
otea profile --effort max                                                  # one value changed: the rest stays
otea profile                                                               # what is on record (--json too)
```

- `--model` is the exact model id and `--effort` the effort, both as the harness names them, stored as given (one word each, at most 100 characters; else exit 2, `invalid_profile`). There is no translation between vendors: `--json` adds a `family` that groups model ids (`opus`, `sonnet`, `haiku`, `gpt-5`, `o3`, `gemini-pro`, ...; an id it does not know is its own family).
- Declare only what you can read from your settings; if you cannot know a value, declare `unknown` (`--model unknown`, `--effort unknown`, any case; stored as `unknown`). Never guess. It still makes a profile, and `otea stats` and Rendimiento keep it as its own group, never inside a family, after the declared rows (shown as "not declared"). The harness takes no `unknown`: an agent always knows the tool it runs in.
- The harness comes from the MCP client: the `profile` tool takes `model` and `effort`, and the client's name in its initialize (`clientInfo`) is the harness. A command-line agent names it with `--harness` the first time; it is kept after that.
- `otea claim` refuses an agent with no profile, and `otea next` one with no profile or one not declared in this session, with exit 2 (`profile_required`) and the exact command that declares it. A session starts when an MCP client initializes the server, at the first call of each agent name on that server, and, on the command line, when an agent comes back after an hour unseen: until it declares its profile again, the profile stands unconfirmed.
- Every `otea next` ends with `Your profile: <model> · <effort>. If you changed model or effort, update it: otea profile …`, and `--json` carries it as `profile`.
- Every event an agent writes keeps the profile it had then (`profile` on each event in `otea events --json`, and in the web server's events; the person's events have none, and a relayed decision keeps the relaying agent's). The profile a round counts is the one on its handoff. Each change of profile is kept too, in its own append-only history.

How each model performs, from those profiles: `otea stats` prints one row per model family and effort (the exact models and each board's steps under it) with its handoffs, how many came back for another round (sent back), the rounds a finished step took on average, the items done it handed off part of, the items discarded after its last handoff, and the median time from claim to handoff. A finished step counts for the profile on its last handoff; steps the person did and agents with no profile are left out. `--since 7d` (or `30d`, `12h`, `all`, the default) keeps a period and `--board <name>` one board; `--json` gives the same numbers. The web page shows them in Rendimiento (Performance), reached from the agents menu and the rail. The profiles are as the agents declare them: Otea does not check them.

```sh
otea stats --since 30d                                     # per model family and effort, last 30 days
otea stats --board Errores --json                          # one board, as JSON
```

### Working from an MCP client

`otea mcp` serves the agent commands as tools of a [Model Context Protocol](https://modelcontextprotocol.io) server on stdin and stdout, so Claude Code and other MCP clients can work Otea without shelling out. Connect it once per project, naming the agent it acts as:

```sh
cd /path/to/your/project
otea connect --as claude-b --model claude-opus-5-5 --effort high   # or just "otea connect" at a terminal, which asks for the name
```

- `otea connect` writes the `otea` server into `.mcp.json` at the project root (the project config Claude Code reads), running `node --disable-warning=ExperimentalWarning /path/to/otea/src/cli/main.ts mcp --as claude-b`, so every action through it is attributed to `claude-b`. `--model` and `--effort` give the profile the agent runs as (see [The profile an agent runs as](#the-profile-an-agent-runs-as)); `connect` refuses without them (exit 2) unless the agent already declared one, and the agent confirms it in its first session. Other servers in the file are kept, and connecting again replaces the entry. `--json` prints the path, the agent, and the `command` and `args`, to copy into clients that keep their config elsewhere (or run `claude mcp add otea -- <command> <args>`).
- `.mcp.json` then names this machine's path to Otea, so it is a file for this machine alone: `connect` keeps it out of git through `.git/info/exclude` (never `.gitignore`, which is tracked) and says so. When the repo already tracks `.mcp.json` (a team's shared servers), Otea leaves git alone and says the file is tracked, so keep the change out of your commits; `--json` tells which with `git` (`excluded`, `tracked`, or `outside` a repo).
- The name is a short slug: at most 24 lowercase letters, digits and single dashes, starting with a letter, and not `you`, `human` or `agent`. Anything else fails with exit 6 (`invalid_agent_name`) and writes nothing. Without `--as`, `connect` asks for the name at a terminal and fails with exit 2 otherwise, so scripts pass `--as`. The web UI shows each agent by a mark derived from its name, so a stable name keeps its mark stable.
- On initialize the server gives Otea's agent guide as its `instructions`, which clients such as Claude Code put in the agent's context.
- Tools: `board`, `board_draft`, `list`, `show`, `create`, `update`, `attach`, `link`, `unlink`, `next`, `reply`, `merged`, `tick`, `topic_add`, `topic_answer`, `ask`, `handoff`, `drop`, `approve`, `send_back`, `move`, `claim`, `profile`, `heartbeat`, `release`, `relay`, `events` and `wait`, one per agent command, named after it with words joined by underscores (`otea send-back` is `send_back`, `otea board draft` is `board_draft`). What a tool answers names the tools too: `otea claim TAR-1` in a text, or in `show`'s `hint`, reads `claim { id: "TAR-1" }`. Each takes that command's arguments and options by name (`{"id": "TAR-1", "note": "what changed"}`, `"field": ["Prioridad=Alta"]`, durations as `"90s"`, `"15m"`, `"1h"`; `attach` takes `file` as a path the server reads, relative to the directory it runs in) and runs the command itself, so the rules, the validations and the error codes are those of the CLI. Setup and human commands (`init`, `brief`, `stats` (how each model performs is the person's reading), `projects`, `migrate`, `connect`, `collection icon`, `board add`, `validate`, `check`, `hook`, `serve`, `open`, `devices`, `mcp`) stay in the CLI, and `human-ui` moves are refused (`forbidden`) as in the CLI.
- A tool returns the JSON the command prints with `--json`; `events` returns its events as one array. A failure is a tool error whose text is the same `{"error":{"code","message"}}`.
- `wait` gives up with the `timeout` error after 5 minutes unless `timeout` says otherwise, and refuses more than 15 minutes, since clients time out long tool calls: call it again to keep waiting. A cancelled call stops waiting. `events` has no `follow`: call it again with the last event id as `since`.
- Every tool takes `as`, the name of the agent making the call; without it the call acts as the agent the server was started as (`otea mcp --as`, or `$OTEA_AGENT`). Subagents share their parent's server, so each one passes its own `as` on every call: otherwise they sign with one name and take over each other's leases. A server started without a name refuses a call without `as` (`unnamed_agent`). The name rule is the CLI's (`invalid_agent_name`). The project is found from the directory the client starts the server in. Nothing but the protocol goes to stdout.

### Token budget

What an agent reads back costs tokens on every call, so output size is tested like behavior. `src/cli/token-budget.test.ts` measures the CLI text, the CLI `--json` and the MCP result of `show`, `list`, `board` (the index and one board), `create`, `claim`, `handoff`, `attach` and `wait`, plus the MCP tool definitions, on a full bug-triage item, and fails when one grows past its budget. Tokens are estimated as characters / 4, not counted by a tokenizer. `--json` and MCP results are compact JSON, one line, no indentation. `OTEA_TOKEN_REPORT=sizes.json npx vitest run src/cli/token-budget.test.ts` writes the current sizes; raise a budget only on purpose.

### Templates

`otea init --template <key>`, `otea board add <name> --template <key>` and Studio's **Nuevo tablero** take the same templates: the starter catalogue below: seven single boards and the sets `ideas` and `repos`, which make several boards at once (below). `otea init --help` and `otea board add --help` list them from the same catalog. `otea board add <name> --template repos` makes every board of the set, the name (and `--item`) naming the first; its `--json` is the list of boards it published.

- A project starts with no board: `otea init` makes one only when `--template` names it (`none` makes none either), and the person picks the rest in Studio's **Nuevo tablero** or with `otea board add`. The empty project page offers **Elegir tableros** until the project has one.
- Every project also has **Pedidos**, the built-in board for loose requests, where an agent's board draft arrives. It is made when the project is first opened, but the places (the sidebar, `GET /api/collections`) list it only once it holds an item.
- `otea init --template` makes boards only on a project with no boards of its own (Pedidos aside). On a project that already has boards it makes none and, when given `--template`, says to add one with `otea board add`. An unknown template fails with exit 3 (`not_found`) either way.

### Collections from before boards

Projects made before boards kept each collection on a preset (`presets/<name>/preset.yaml`, official or the project's own). The first time such a project opens, every collection is read once as a board: an official preset becomes its template's board (`tasks` Tareas, `bug-triage` Errores, `change` Cambios plus Tareas de repo, and so on) with its own words for agents, and a project's own preset becomes a board of one step, Hacerlo, that keeps its items' fields, with the text of its playbooks (its own `playbook.md`, then its types') as the board's words, which agents read with `otea board <name>`. Nothing makes a collection on a preset any more: boards are made with `otea board add` or in Studio.

**Icons.** `otea init --icon <icon>` gives the project an icon, also on a project that already exists; a project without one is drawn as a two-letter monogram of its name. `otea collection icon <name> <icon>` gives a board its own icon in the lists (`otea collection icon <name> default` shows its default again). Icons are named as in [`src/core/icons.ts`](src/core/icons.ts) (112 of them), and an unknown name fails with exit 6 (`invalid_icon`), naming the close ones, and changes nothing. `GET /api/collections` gives each collection its resolved `icon`, and `GET /api/project` the project's `id`, `name` and `icon` (`null` when it has none).

The starter catalogue: nine generic boards named by what they manage, each a base to adapt to your own fields and steps in Studio (or to have an agent design one for your project, below). Between them they use every kind of evidence the item page shows: diffs, test reports, logs, Markdown and other files, diagrams, images (gallery, single, before and after), video and audio.

- **Errores** (`bug-reports`): bugs you find or the people who use what you make report. Completar (skipped when the report is complete), Triar (yours), Arreglar on its own branch, with the proof its kind asks for (a failing test for behaviour, a measurement for performance, a recording for a visual bug), which you review, and Integrar.
- **Cambios** (`changes`): the small changes you ask an agent for in your own project. Aclarar (skipped when you already said how you will check it) asks you what is unclear and writes the checks; Hacerlo is done on its own branch with its diff, and screenshots for an interface change or the test output for a bug, and you review it; Integrar is the land step: once you approve, the agent rebases, fast-forwards `main`, writes the commit and deletes the branch, with no second approval. Otea guards the branch and `main`, which takes the branch only during Integrar.
- **Investigación** (`research`): a question searched with sources, answered in a recommendation you review; it never makes the change.
- **Decisiones** (`decisions`): research before deciding. The agent lays out options with sources, you decide, and it records an ADR when the repository keeps them.
- **Contenido** (`content`): posts, newsletters, docs pages, episodes. You approve the outline and the draft; the agent publishes what you approved.
- **Diseño visual** (`design`): anything judged by looking (interfaces, illustrations, sprites, generated images). An agent creates it and you review each round, marking on the images what to change and sending it back as many times as needed; each round is framed like the one before so you can compare them, and a blind A/B comparison is a choice made when the piece is created. Integrar lands it once you approve.
- **Experimentos** (`experiments`): a hypothesis, a plan with a baseline and one deciding metric, and a run you review. Nothing runs against live systems.
- **Ideas → Tareas** (`ideas`) and **Entregas con PR** (`repos`) make two boards each (below).

The first Studio's boards (`tasks`, `bugs`, `blog`, `triage`, `review`) are retired: no list offers them, and projects made with them keep their boards. The earlier catalogue's `digest`, `assets`, `support`, `visual-iteration`, `playtest`, `resume` and `repobugs` are gone.

### Templates that make several boards

A template set makes several boards at once, joined the only way boards are declared to join: **"se divide en"** (each item of one board divides into items of another).

```sh
otea init --template ideas     # Ideas, each divided into its Decisions, and Implementación, the tasks a planned Idea makes
otea init --template repos     # Trabajos, which divides into Entregas (always: a delivery is always part of a Trabajo)
```

- **Ideas → Tareas** (`ideas`): an agent refines each Idea by asking you, one question at a time, into a Brief (or a Decision into its Options), designs it (an architecture document, Mermaid diagrams, the project's `.md` files) once its Decisions, parts on the same board, are closed, and plans it: it creates the tasks on Implementación, each linked `implements` to the Idea and `blocks` in order. Those tasks wait until you approve the plan. A task born complete skips Preparar; Hacer waits for its subtasks and blockers.
- **Entregas con PR** (`repos`): a Trabajo is born from a GitHub issue; an agent analyses it into a plan with one line per delivery and a merge plan, which you approve, then creates one Entrega per line (`--parent`), linked `blocks` in merge order. Each Entrega is done on its own branch by one agent and reviewed by another; you approve its merge once its blockers are in (Aprobar el merge), and Otea guards both its branch and `main`. Once the Entregas are merged, the Trabajo's agent tests everything together and hands it off. Record a merge with `otea merged <id> --pr <url>`.
- A part on a board that is always part of another needs `--parent` (`otea create --collection Entregas --parent TRA-1 …`); without it, or with a parent on another board, the create fails with exit 16 (`parent_required`, `parent_type`). `otea link A parent B` follows the same rule.
- Every other link (`blocks`, `implements`, `relates`, `duplicates`) is free between any two boards. A step that waits for its blockers ("Algo que esperar") is not handed off, or approved, while one of them is open (exit 4, `blockers_open`); one that waits for its parts, while a part is open (exit 4, `children_open`).
- Blueprints are gone. A project that had one is read once, when it opens: every collection becomes a board (each old preset has its own reading, so a `change` collection becomes Cambios plus Tareas de repo and its repo tasks move there with their history), a `blocks` connection into a board makes its working step wait for blockers, and `.otea/blueprint.yaml` is deleted once every collection reads as a board (while one cannot be read yet, Otea warns and keeps it). A collection on a preset Otea never shipped keeps its git gates as a guard on its `branch` field.

### An agent drafting a board

In Studio, **Que lo esboce un agente** (on Studio's home and in **Nuevo tablero**) leaves a board for an agent to draft: it waits as a draft, and a Pedido (assigned to the agent when one is named) keeps what the board is for in the person's words. How to hand it in is the instructions of the Pedido's step, which `otea next` and `otea show` give the agent; the Pedido's page links to the board in Studio.

An agent the person asks for a board starts the same thing from the CLI or MCP (the `board_draft` tool, with `new` and `why`): `otea board draft --new "<name>" --why "<what it is for>"` makes the waiting board and its Pedido, held by the agent, with `--why` as what the board is for. A name another board or draft has is refused (`already_exists`), as in Studio, and an unnamed agent too. With `--file board.json` it hands the draft in at once, checked as below; a file that is not a board makes nothing. It prints the Pedido and the board's link in Studio, where it waits for the person to try and publish: agents never publish.

`--template <key>` starts the draft from a board of the catalogue (one board, never a set) instead of a blank one, so the agent adapts the closest template rather than writing a board from nothing.

```sh
otea board draft --new "Piezas" --why "The game's screens, reviewed by looking" --template design   # PED-1, starting from Diseño visual
otea board draft PED-1 > board.json          # the draft to start from: every key a board takes
otea board draft PED-1 --file board.json     # check it as a board and hand it in on the Pedido
```

- The shape of `board.json` is published as a JSON Schema, [`schemas/board.schema.json`](schemas/board.schema.json), each key with what it is for and an example: check a draft against it before handing it in. It is generated from the board's zod schema (`src/core/board/schema.ts`), and a test keeps the two together.
- A file that is not a board is refused (exit 9, `invalid_board`) with one line per problem: where, in the board's terms (`step 2 "Fix" › handoff 1 (fsteps) › req`), what was expected and what it found, what the key is for with an example, and the JSON path (`[steps.1.hand.0.req]`). Then it points at the draft to start from, the schema, and Studio, where the person can finish what is hard to say in JSON.
- A board that is a board but not ready (a step with no name, an agent closing an item as Done) is handed in all the same, and the command lists what is still to fix for it to be published.
- A step is done by `"you"` (the person) or `"any"` agent, and reviewed by `"none"`, `"you"` or `"any"` agent; a step never names one agent. A board written before, whose step names one (`{"agent": "claude-b"}`), is read as `"any"`, nothing else changing: a hand-in says so under `Read as today's board:` (and `PUT /api/boards/:id/draft` answers it as `notes`), and a board already stored reads the same way.
- Publishing the board offers to close its Pedido as done (checked by default): publishing is the person taking the draft. Unchecked, the Pedido stays open.

### What to paste into an agent's chat

`otea prompt` prints what the person pastes into an agent's chat, the same text the UI copies (**Conectar un agente** and the empty project page), in Spanish or with `--lang en`:

- `start`, the first contact on a new project: set it up (`otea init`, no template) and connect (`otea connect` with the agent's own name, model and effort), read the project (README, code, git history, CLAUDE.md or AGENTS.md, CI), ask the person one question at a time how they want to work, draft the boards with `otea board draft --new … --why … --template <key>`, say where to review them and to try them with a first item, and then keep working.
- `join`, one more agent on a project that has boards: pick a name none of the listening agents has (they are named) and put it on every command, never running `otea connect` (it rewrites the project's `.mcp.json`, which the other agents use), declare its profile, read the guide and the boards, written from the project as it is now (each board's agent steps and how many items wait for an agent), and work the queue (`otea next --claim`, hand off, `otea wait`), never taking an item another agent holds and never designing boards.
- `design`, one more board on a project that already has some.

Without one, it gives `start` until the project has a board of its own (or where there is no project yet), then `join`. `GET /api/agent-prompt?kind=&lang=` answers the same for the UI.

### Archiving and deleting a board

A board you no longer work on is archived, or deleted, from its menu in Studio's editor (**Archivar tablero…**, **Eliminar tablero…**). Both are the person's acts, like publishing: there is no CLI or MCP command for them, and the API (`POST /api/boards/:id/archive`, `POST /api/boards/:id/unarchive`, `DELETE /api/boards/:id`) takes them only from this computer's signed-in browser, refusing a request without the session (an agent), one a proxy forwarded and a paired phone. Pedidos, the built-in board for requests, is never archived or deleted (`forbidden`, details `board_builtin`).

- **Archiving** takes the board out of every list: Te toca, Triage, the board views and filters, the phone, `otea next`, `otea list`, the index of `otea board` and the git gates. Its items stay to read, with their history and evidence, in Studio's **Archivados** (`GET /api/boards/archived`), where they are searched by title or id and opened read-only. Open items may be archived: they freeze where they stand, and the leases on them are released (each with a `released` event, cause `archive`); the confirmation says how many freeze and how many leases go. Nothing writes to an archived item: a move, an update, a claim, a heartbeat, a note, a question, a link, evidence or a new item on the board fails with exit 21 (`board_archived`, HTTP 409), saying the board is archived and the person restores it in Studio. Its name stays taken, and Studio does not change it while it is archived.
- **Restoring** (**Restaurar** in Archivados, or **Deshacer** in the toast) brings everything back as it was: the board in the lists, its items where they stood and writable again. Released leases are not taken again: an agent claims the item anew.
- **Deleting** takes a board without items at once, after one confirmation. A board with items is archived first, then deleted from Archivados once you type its name (the API refuses `{"confirm": "<name>"}` that does not match, `reason_required`, details `board_delete_confirm`): its items, their history, notes and evidence go for good, while an empty board loses nothing a template cannot make again. Deleting removes the board, its versions, its draft, its collection and its items with their events, evidence and links; an evidence file goes from the project's data folder unless another item's evidence shares it. Events on other items stay as they were written, a link to a deleted item included.
- **A board another divides into** (Entregas, under Trabajos) goes with its parent: archiving, restoring and deleting Trabajos takes Entregas along, as the confirmation says, and the child alone is refused while its parent stands (`in_use`, details `board_split_child`), since the parent's items have their parts there.

### Agent moves on a board

```sh
otea handoff BUG-4 --note "the test I ran and what I saw"   # a step that asks for a note refuses without it (exit 8)
otea handoff BUG-4 --way "Triar" --reason "Cannot reproduce"  # a way back: no review, Triar starts its next round
otea drop TAR-3 --reason "Out of scope" --motive "Duplicado" # drop with a motive (by name or id), where the board lets agents drop
otea check --gate push --branch --repo                     # reads the board's protected Rama and its repo field
```

- On a step any agent reviews, an agent never reviews a step it did in that round (handed it off or, while the step was being done, claimed the item, attached evidence or changed its fields): `otea next` never offers it that review (`You did this step in this round: another agent reviews it.`), and its `otea claim`, `otea approve`, `otea send-back` or `otea move` of the review exits 7 (`forbidden`, details `own_review`) or 4 (`not_claimable`). Another agent reviews it; work of an earlier round does not count.
- The note of each handoff is kept with its round (`otea show --json`: `board.notes`). A way back needs `--reason` (exit 2, `reason_required`).
- A round that a send-back started opens, in `otea next` and `otea show`, with `Sent back to you: "…"`: the reviewer's note, who sent it, when and from which review (`sentBack` in `otea next --json`, `board.sentBack` in `otea show --json`, and the same over MCP). `otea next` offers items sent back before the rest, and handing one in again needs `--note` saying what changed, even on a step that asks for no note (exit 8).
- While an agent does a step, the person can leave it a note (from the item's page, the phone included) without changing the step, the round or the lease, optionally on a piece of evidence already attached in this round: the note points at that very file, not at a later one attached in its place, and for a recording at the moment seen. Several notes may wait at once, numbered per item. The agent reads them in the answers it already asks for: `otea heartbeat` and `otea attach` add `New note from the person (note 3, unanswered): …` with the moment it was left in (the evidence it is on, the time, how many of the step's required handoff deliverables were in, the handoff note not counted) and the command that answers it; `otea next` and `otea show` list the round's notes under `Notes from the person`, and their Handoff gains `Notes from the person answered: required`. Over MCP and `--json` the same block comes as `text` (in `next`, in its text) and the notes as `notes`. `otea wait` wakes on a note waiting on an item the agent holds (`TAR-7: new note from the person (note 3). Read it: otea show TAR-7`).
- The agent answers with `otea reply TAR-7 --note 3 "<a short answer>"` (MCP `reply`, with `note` and `answer`); a handoff is refused while a note of the round is unanswered, as one missing a note is (exit 8, `missing_fields`), with the command that answers it. An agent never opens a thread itself: what it asks the person goes through `otea ask`, which changes the turn. Leaving a note and answering it are kept as `note_left` and `note_answered` events, the answer with the agent's name.
- To ask the person something while it does a step, the agent runs `otea ask TAR-7 "<the question>"` (MCP `ask`, with `question`). The turn is the person's until they answer; the step, the round and the lease stay as they are, and one question waits at a time. Meanwhile the item is under **Preguntas para ti** in Te toca, the agents column says the agent waits for your answer, and the item's page asks it with a box to answer it (the phone too); `otea next` offers the item to no agent, `otea next` and `otea show` say `Waiting for the person to answer your question: "…"`, and a handoff is refused (exit 4, `invalid_transition`). The person's answer gives the turn back to the agent in the same round: `otea wait` wakes on it (`TAR-7: the person answered your question. Read it: otea show TAR-7`), and `otea next` and `otea show` give `You asked the person: "…"` and `The person answered: "…"`, to address in the round as a send-back note. While a question waits, the list, `otea show --json` and the API give the item `turn: "human"` and `asks: { question, by, text, at }`, and its page's `board.questions` keeps every round's (`POST /api/items/:id/answer` with `{ "text" }` answers it). Asking and answering are kept as `question_asked` and `question_answered` events. A handoff whose words end in a question mark is no longer a question: only old events written before `otea ask` still read that way.
- `otea drop` without `--reason` or, on a board with motives, without `--motive` exits 2; where only the person drops it exits 7 (`forbidden`); where the person drops only from the page, a relayed drop exits 4.
- `otea check` and the hooks (`otea hook install --git` for a pre-push hook, `--claude` for Claude Code's `git push` and `gh pr merge`) match the branch and the repo against the board's **Rama** field (the branch field Otea protects) and the field it names as the repo, never against a fixed `branch` key: a push is allowed only while one of the chosen steps is being done (frozen while it is reviewed), a merge once the item is Done. Repo names match whatever their case (`--repo API` is `api`), as git hosts and the file systems of Windows and macOS take them, so `otea repos add` refuses a name another repo already holds in any case.
- `otea show` of a repo task says whether the checkouts of its repo in the project's folders have the pre-push hook (`Git hook: installed in <path>`, or `not installed in <path>: run otea hook install --git there`); `--json` and the MCP `show` tool carry it as `gitHook: { repo, installed, missing }`, with the checkouts' paths. A push from a checkout without the hook is never checked.
- Without more, the base branch is not checked: with an item in review, an agent could merge its branch into `main` locally and push `main`. In Studio, under the protected **Rama**, **It protects the base branch too** names the base branch (`"guard": { "base": "main" }` in `board.json`). Then a push or a merge into it is allowed only when it brings in the branch of at least one of the board's items and every such item is Done: the pre-push hook passes `--commits <remote>..<local>` so `otea check` sees which local branches the push brings in, the Claude Code hook reads them from the command (`git push origin feat/x:main`, a local merge then `git push`), and a `gh pr merge` whose branch no item has is checked as a merge into the PR's base. A push straight onto the base, or of a branch still in review, is refused. The person still can: merging on the repository's website, or `git push --no-verify` past the hook.

| `otea check` exit | Name | Meaning |
| --- | --- | --- |
| 0 | `ok` | allowed, or nothing gates the action, or the check could not run (fails open, with a note on stderr) |
| 19 | `gate_refused` | refused; the reason on stdout. The pre-push hook stops the push on this code only |
| 2 | `usage`, `invalid_gate` | a gate or a field no board declares (`--gate psuh`, `--gate deploy`): the message names the gates there are (`merge, push`) |
| 2 | `hook_refused` | with `--claude-hook`: refused, which makes Claude Code block the call |
| 1 | `unexpected` | Otea failed; a hook lets the action go on |

### See it live

The web UI updates live as items change, and it is where you take the decisions agents cannot, such as approving a task in review.

```sh
npm run build:ui            # once, in the Otea checkout

cd /path/to/your/project
otea serve                  # Otea running at http://127.0.0.1:4400
```

`otea serve` opens your browser already signed in to act on items (the session lives in an HTTP-only cookie; the token in `ui-token` in the project's data folder is never printed, except as below). Pass `--no-open` to skip the browser: at a terminal `otea serve` then prints the sign-in link (`<url>/auth?token=…`) for you to open by hand; piped to a file or a log, or with `--json`, it never prints the token and says to run `otea open`, which signs a browser in to the running server from the project. A tab opened on the plain URL without signing in is read-only.

In another terminal in the same project, create and move items and watch them update:

```sh
otea board add Preguntas --template research
export OTEA_AGENT=claude                    # the agent's side (after its otea profile)
otea create --collection Preguntas --title "Search library" --field "Pregunta=Which search library fits our data?" --field "Para qué=Pick the search for v2"
otea claim PRE-1
otea update PRE-1 --field "Hallazgos=Two libraries fit" --field "Fuentes=Their docs"
otea handoff PRE-1                          # on to Responder
otea claim PRE-1
otea update PRE-1 --field "Conclusión=Use the smaller one"
otea handoff PRE-1 --note "Answered with sources"
```

`PRE-1` is now waiting for you: approve it or send it back with a note from its detail in the UI. The CLI refuses the approval, and the timeline shows your decision as `human (ui)`.

You can also create items from the browser: when it is signed in, **New item** opens a form from the board's fields. Only the title is required; an item that lacks what the board's first step asks (Cómo lo valido on Cambios) starts there, in Aclarar, for an agent to complete (`otea update`, then `otea handoff <id>`), and one that has it starts at the next step. The timeline shows who created it as `human (ui)`.

On a phone the selected item unfolds in place under its row, with its moves at the bottom of the screen. **Triage**, at the end of *Waiting for you*, shows what waits for you one card at a time: swipe right for the primary move, left to send it back to the agent (asking for the reason when the workflow requires one), or use the buttons.

`#/modules` in the URL opens the catalog of field modules: what each one does and a live preview of how it looks in a row, in the detail and as a form control. `#/modules/<name>` links to one module. It lists the boards and the module each of their fields shows through (read from `GET /api/presets`); a board's fields are set in Studio, and the kind of each field picks its module.

**Agents at work.** Otea notes each agent it sees: every agent command, from the CLI or the MCP server, records when that agent was last seen (to within 30 seconds, so a busy agent does not write on every call), and the harness it came through: the `clientInfo` name the MCP client sends in `initialize` (`claude-code`, say), or `cli` for an agent only seen at the command line. An MCP server notes its agent as soon as the client connects, and hears it again every minute while it stays open; `otea wait` does the same while it blocks: that agent is listening. `GET /api/agents` returns `{"agents":[{"name","harness","holding","lastSeen","live","listening"}]}`: `harness` is `null` when unknown (agents that wrote before presence was kept start from their last event), `holding` lists the ids of the items the agent holds a live lease on, `lastSeen` is an ISO time, `listening` is true when it was heard listening in the last 150 seconds, and `live` (connected) is true when it listens or holds a lease: having run a command lately is not enough, so an agent that read once and left, or a session that closed, is not shown as waiting. Live agents come first, then the most recently seen; the human is never listed. Besides `change`, `GET /api/stream` sends a `presence` event when an agent is seen anew, changes harness or takes or drops a lease; time running out (a listener gone quiet, a lease expiring) sends nothing, so the UI reads `lastSeen` and the leases for that.

**Notes while an agent works.** `POST /api/items/:id/notes` with `{"text", "anchor"?: {"evidence", "seconds"?}}` leaves a note from the person (allowed from a paired phone, as every move is) and answers `201` with the thread; it is refused unless an agent's step is being done (`invalid_transition`), without text (`reason_required`), or on evidence not attached to the item in this round (`invalid_fields`), each with `details.kind: "note"` and its `why`. `GET /api/items/:id/notes` reads the thread, every round's or, with `?step=<name or id>&round=<n>`, one round's (with only `round`, of the step the item stands on), as `{"item","notes","worker"}`: each note with its moment (`stepName`, `round`, `at`, `delivered: {done, of}`, `to`, `anchor`) and, once answered, `answer: {text, at, by}`; `worker` is the agent doing the step and `lastSeen`, its last sign of life (any call, a heartbeat included), so the page can warn that a note may go unread. `GET /api/items/:id` gives the same as `board.thread` and `board.worker`, and `GET /api/items` marks an item whose round has notes with `notes: {count, unanswered, replied?: {note, by, at}}`, so a list can say the agent answered without the turn changing.

### A phone: on the same network, or through Tailscale

`otea serve` answers this computer only (127.0.0.1). A phone reaches it through a **phone transport**; the transports are interchangeable, and whichever carries the phone, it pairs once with a code shown on this computer, gets its own device token, and only paired devices get in:

- **Local network** (the default): **Open to the local network** in Settings › Phone (or `otea phone lan --open`) makes the running `otea serve` also listen on this computer's network addresses, plain HTTP, same Wi-Fi only, without a restart. The choice is kept, so every `otea serve` after (the desktop app's too) starts open; **Close to the network** (or `otea phone lan --close`) stops listening there, and paired phones stay paired but cannot reach Otea off this computer until it opens again. `otea serve --lan` opens it for that run only.
- **Tailscale**: `otea phone tailscale` gives Otea an HTTPS address on your tailnet, `https://<machine>.<tailnet>.ts.net`, that your own devices reach from anywhere.
- **Otea relay**: a future service. It is not available yet: `otea phone relay` and Configuración say so.

```sh
otea phone lan --open       # opens the local network now (on the running otea serve) and from now on
otea phone lan --close      # closes it again; paired phones stay paired
otea serve --lan            # opens it for this run only; prints the LAN address, a pairing code and its QR code
otea phone tailscale        # sets Tailscale up for this project (see below)
otea phone status           # the transport, its URL, whether Otea answers there, the paired devices
otea phone lan              # back to the local network
otea devices list           # the paired devices, with when each was last seen
otea devices revoke <id>    # its token stops working at once
```

The terminal and **Pair a phone** in Settings › Phone (`#/lan`, this computer's signed-in browser only; Preferences links there) show a QR code for the chosen transport: `http://<lan-ip>:<port>/pair#code=XXXX-XXXX` on the local network, `https://<machine>.<tailnet>.ts.net/pair#code=XXXX-XXXX` on Tailscale. The code lasts 10 minutes, works once, and is thrown away after 5 wrong tries; **New code** shows another. The phone trades it for its own device token (an HTTP-only cookie, `Secure` over HTTPS; only its SHA-256 is stored), and each device can be revoked from the same page. A request from the network must come from a private address (including Tailscale's 100.64.0.0/10), name one of this computer's IP addresses as its host (never a DNS name), and carry a device token; without one it reaches only the pairing screen. Pairing attempts are limited to 10 a minute per address. Traffic on the LAN is plain HTTP, so use it on a network you trust, and use Tailscale when away instead of opening a port. Only this computer's signed-in browser opens or closes the local network (`POST /api/lan/open`, `POST /api/lan/close`); a paired phone or anything a proxy forwarded is refused. The first time, Windows may ask whether to let Otea through its firewall; Otea never changes the firewall or the network settings itself. **Pair a phone** on a closed local network opens it and shows the code in one step.

When this computer's `<hostname>.local` resolves (mDNS) to one of those addresses, the QR code and the terminal use it first, so a home-screen shortcut survives a new DHCP address; the same link by IP is printed and shown beside it for phones that cannot resolve `.local`. The server answers that one name besides its IPs; any other host name is refused.

After pairing, the phone suggests adding Otea to its home screen (a web app manifest and icons, served before pairing too; no service worker, which browsers refuse on plain HTTP). On iOS the home-screen app keeps its own storage, apart from Safari: it opens on the pairing screen and pairs once more, by typing a new code. On Android over plain HTTP, Chrome adds a shortcut rather than installing the app.

#### Tailscale

`otea phone tailscale` (or **Settings › Phone › Tailscale** in the UI) takes these steps on this computer, and stops at the first one that is missing, saying what to do:

1. Finds the `tailscale` CLI: on `PATH`, then where the installers put it (`C:\Program Files\Tailscale\tailscale.exe` on Windows, the app or Homebrew on macOS, `/usr/bin` and friends on Linux). When it is missing, it prints how to install it (`winget install --id tailscale.tailscale`, `brew install --cask tailscale`, or Tailscale's install script, and the download page); **Otea never installs anything.**
2. Checks that Tailscale is logged in. When it is not, it says to run `tailscale up` and log in once in the browser; `otea phone tailscale --login` runs `tailscale up` for you.
3. Checks that the tailnet has MagicDNS and HTTPS certificates on (they are on by default on new tailnets); when not, it points at the DNS page of the admin console.
4. Runs `tailscale serve --bg --https=443 http://127.0.0.1:<port>` (the running `otea serve`'s port, or `--port`): Tailscale terminates HTTPS with an automatic certificate and forwards to Otea, for your tailnet only (`serve`, never `funnel`). If `https://<machine>.<tailnet>.ts.net/` already forwards elsewhere, it leaves it alone and says how to free it.
5. Makes Tailscale the phone transport: the pairing QR now carries the HTTPS URL. On the phone: install the Tailscale app, log in with the same account, and scan Otea's QR code.

What `tailscale serve` forwards comes from this computer, so Otea tells it apart by its host (the tailnet name) and its `X-Forwarded-For`, never takes it for this computer's own browser, and still asks for a device token. A forwarded request that no chosen transport expects is refused. The HTTPS certificate is public: the machine's name on the tailnet is listed in the Certificate Transparency logs. `otea phone lan` goes back to the local network (and says how to stop `tailscale serve`); exit 20 (`transport_unavailable`) means Tailscale is not ready yet, or the relay was chosen.

#### Notifications

On a phone over HTTPS (Tailscale), **Preferences › Notifications** (Avisos) turns on Web Push: the phone's browser subscribes with the project's own VAPID key pair (made on the first `otea serve`, kept in `push-keys.json` in the data folder with owner-only permissions) and `otea serve` posts each notice to that browser's push service, encrypted for it (aes128gcm) and to no other host. On iPhone, Safari allows it only for Otea added to the Home Screen; over the local network's plain HTTP no browser allows it, and Preferences says so. The desktop app shows the same notices as the system's notifications (see `desktop/README.md`).

What is told, each a switch, all on by default: something is your turn (a review, or an agent's question via `otea ask`), an agent answered your note, an item got stuck (an agent went quiet holding its lease). A burst arrives as one ("3 things are yours"), an item is told about at most once every five minutes, and optional quiet hours (off by default) keep it silent. A notice carries a title, the item's id and title and where tapping it leads (the item, or Your turn for a burst); nothing else from the item. Unpairing a phone unsubscribes it, and a subscription its push service reports gone (404, 410) is dropped. The API: `GET /api/notify`, `POST /api/notify/subscribe` (a paired device on HTTPS), `/api/notify/unsubscribe`, `/api/notify/prefs`, and the desktop app's `GET /api/notify/stream` (this computer only).

Working on the UI itself: keep `otea serve` running and start `npm run dev:ui` in the Otea checkout for hot reload (it proxies `/api` to port 4400).

## License

Otea is free software under the [GNU Affero General Public License v3.0](LICENSE). You can use, study, modify and share it. If you distribute a modified version, or let people use it over a network, you must publish its source under the same license, keeping the copyright notices.

**Commercial license.** If the AGPL does not fit your use (for example, embedding Otea in a closed product), a commercial license is available. Open an issue or contact [@Lartweib](https://github.com/Lartweib).

**Name.** "Otea" and its logo identify this project. Forks are welcome under the AGPL, but must use a different name.

Contributions are accepted under the [Contributor License Agreement](CLA.md); see [CONTRIBUTING.md](CONTRIBUTING.md).
