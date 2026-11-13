# Otea — Product Definition (v1 draft)

> **Otea**, from the Spanish verb *otear*: to scan from a high vantage point, to watch what is happening and what is coming.
> Status: product vision agreed; architecture not yet designed. Open decisions are listed in §16.

## 0. Name

- CLI binary: `otea`. Otea home: `~/.otea` (`OTEA_HOME`). Local project folder: `.otea/`. MCP server: `otea`.
- npm: org `@otea`. The bare name `otea` is blocked by npm typosquatting protection, so the package is `@otea/cli` and its binary is `otea` (`npm i -g @otea/cli`). Split packages go under the same scope (`@otea/core`, `@otea/ui-kit`).
- Open source, local-first, no hosted service.

## 1. Origin

Otea grew out of two single-purpose tools built while working with coding agents:

1. **A bug triage panel for a game.** An agent searched the game for bugs following explicit rules (what to look for, how to reproduce, how to capture evidence, how to decide whether something is really a bug). Each finding arrived fully documented: root cause, suggested fix, risk, regression checks, media. The human filtered, grouped and cross-checked findings, decided what to tackle, and the agent fixed the chosen ones, returning commits and proof for the human to verify. Players' reports could also be added with minimal info; the agent then investigated them and either turned them into complete bugs or closed them as not reproducible / duplicate / not a bug.
2. **A review board for generated content.** An agent produced procedural assets (creatures, video cuts) that are never "done" just because the agent finished. It published cards with a GIF and concrete questions ("does this fit? what would you change?"). The human answered when they had time; the agent picked up the feedback and iterated.

Both worked. Both were hardcoded to one project. Otea is the general version.

## 2. Thesis

**Otea is the asynchronous handoff surface between you and your AI agents.**

Agents produce work faster than a human can follow it live. Otea is where work changes hands: agents leave findings, deliverables and evidence; humans leave decisions and feedback; both can see at any moment where each thing stands and **whose turn it is**.

You can leave agents working on several things across several projects, and sit down when you have time to see what is waiting for you.

### The value: the session can close

The handoff lives in the item: its evidence, its history and the next step. An agent hands an item over and leaves it; its session does not have to stay open so the thread is not lost. Any later session, of any agent, resumes from the item: `otea show` says what to do now (its `Next:` line, from the item and the playbook), `otea wait` blocks until an item is the agent's turn, and a lease left by a closed session expires on its own.

This is the problem Otea answers first. In the owner's own work with agents, about 30% of prompts were handoff acts (approve, reject, attach proof), and sessions sat open more than an hour waiting on the human 711 times, more than four hours 257 times, kept open only to keep the thread. Traceability (who decided what, through which channel) comes with the item too, but it is the second value, not the first.

### What it is not

- Not a project manager for human teams.
- Not a chat with the agent.
- Not a real-time log monitor.

A Jira-like development board is perfectly expressible as a preset (and a good test that the core is generic), but it is not the core: that space is already served by several agent kanban tools. Otea's focus is **triage of findings and review of results with evidence**.

### Differentiators

1. **Turn-based collaboration**: every state belongs to someone. "What is waiting for me" is a first-class query, across all projects.
2. **Evidence and deliverables are first-class**: GIF, video, image, diff, log, URL, with roles (`before`, `after`, `single`).
3. **Structured feedback and iterations**: concrete questions, verdicts and comments that the agent reads back and acts on; successive attempts on the same item stay visible.
4. **Presets carry the craft**: a preset is UI configuration *plus* the agent playbook (how to search, validate, gather evidence). Sharing a preset shares a way of working, not just a form.
5. **Local-first**: data lives with the project in a single SQLite file, exportable to readable Markdown/JSONL. No cloud, no accounts.
6. **Authority enforced in code**: what only a human may decide is enforced by the core, not by prose in a prompt.

## 3. Illustrative use cases

| Use case | Agent | Human | Agent |
|---|---|---|---|
| Bug triage | finds and documents bugs with evidence | filters, groups, prioritizes, discards | fixes and returns proof; human verifies |
| Generated asset review | generates an asset and a GIF | answers concrete questions or approves | iterates on the feedback |
| Video direction | renders iterations | comments on the whole or on parts | adjusts direction |
| Content pipeline | drafts posts | approves or requests changes | publishes approved items |
| Feature definition | proposes definitions | refines them (in UI or in chat) | records the agreed result |
| Dev tasks (Jira-like) | — | defines and prioritizes tasks | executes and reports |

Different domains and loop shapes (linear, iterative), same structure.

## 4. Core concepts

| Concept | Definition |
|---|---|
| **Project** | The data for one product: a database plus evidence, in the Otea home (common storage, the default) or in a `.otea/` directory of its folder (local storage). It is linked to one or more repos/folders, and can sit in a product folder above several repos and serve all of them. |
| **Collection** | A named set of items governed by one preset. A project can have N collections (e.g. `bugs`, `reviews`, `tasks`). Items can link across collections. |
| **Item** | A unit of work (bug, review card, definition, task). A record in the project database; long text fields are Markdown. |
| **Turn** | Who is expected to act next on an item: `human`, `agent` or `none` (terminal). Declared per state by the preset. |
| **Iteration** | One attempt on an item: its evidence, the feedback it received and the verdict. Items that loop (review, direction) accumulate iterations; history is never overwritten. |
| **Feedback** | Structured human input on an iteration: answers to the preset's questions, verdicts, free comments. |
| **Preset** | Declarative YAML that selects and configures modules for a collection, plus its playbook. Versioned (`preset_version`). |
| **Playbook** | Markdown shipped with a preset; the protocol agents follow for that collection, split by situation (intake, enrichment, work, revision). Templated, no hardcoded names. |
| **Module** | A building block with a manifest. Three kinds: field, view, behavior (§10). |
| **Actor** | `human` or `agent`. Every agent declares its **profile** (harness, model, effort; §11). |
| **Authority** | Who may perform an action: `agent`, `human`, `human-ui` (§6). |
| **Lease** | Time-limited claim on an item, with heartbeat and takeover on expiry. |
| **Event** | Append-only record of every change. Source of history and audit. |
| **Evidence** | Files attached to an item or iteration, with roles. |
| **Note (in flight)** | What the human says to the agent while it does a step, without moving the item; the agent answers it before handing off (§5). |

## 5. Item lifecycle

The preset defines the actual states. The core provides the building blocks every lifecycle is made of:

1. **Intake**
   - *Agent-created*: an agent creates a complete item following the playbook (e.g. a documented bug).
   - *Human-created*: a form generated from the preset's fields. If every field required for completeness is filled, the item enters the normal flow. If not, it enters an incomplete state whose turn is the agent's: the agent follows the playbook's enrichment section to investigate and complete it, **or closes it with a reason** (not reproducible, duplicate, out of scope).
2. **Triage** (human, many items at once): filter, group, cross-check, prioritize, discard, select what gets worked on.
3. **Work** (agent): claim with a lease, verify the problem still exists, act, attach evidence.
4. **Review** (human, one item in depth): inspect evidence, answer the preset's questions, approve or request changes.
5. **Iterate**: requested changes open a new iteration; the agent reads the feedback and goes back to work.
   - *Notes while it works*: the human need not wait for the review to say something. While an agent does a step, the human leaves a note (desk or phone) that changes neither the step, the round nor the lease, optionally on a piece of evidence already attached in that round (the very version seen, not a later one put in its place). Several may wait at once, numbered per item. Each keeps its moment: step, round, time and how many of the step's required handoff deliverables were in (the handoff note is not one). The agent reads it in the answers it already asks for (heartbeat, show, next, attach; `otea wait` wakes on it) and answers it with `otea reply`; it cannot hand off while a note of the round is unanswered. The thread is the human's: an agent never opens one, and what it needs to ask the human still goes in a handoff, which changes the turn. Once handed off, the notes belong to their round.
6. **Close**: done, discarded, already fixed, etc., always with the actor and reason recorded.

Two distinct modes of human attention are both first-class: **triage** (breadth) and **review** (depth).

## 6. Authority levels

Each action or field in a preset declares who may perform it:

| Level | Who | Typical use |
|---|---|---|
| `agent` | any actor, including agents acting on their own | fill fields, attach evidence, move work forward |
| `human` | a human in the UI, **or** an agent relaying a decision the human made in conversation | accept definitions agreed in chat |
| `human-ui` | a human in the web UI only | approve visual results, taste gates, final verification |

- A relayed decision is recorded as `actor: human, via: agent, source: conversation`, with a quote or summary of what the human said. It is visibly marked as relayed in the timeline.
- An agent may relay a decision only after the human explicitly approved it. This is enforced in two layers:
  - **Playbook**: relaying requires an explicit human approval in the conversation, quoted in the record.
  - **Harness**: relaying is a dedicated MCP tool / CLI command, separate from every other write, so the harness permission system can require human confirmation on each call. That confirmation prompt is the hard gate.
- An agent may not relay a decision on its own work: once it did the item's step in the current round (handed it off, or, while the step was being done, claimed the item, attached evidence to it or changed its fields), Otea refuses every relay of that item by it (`forbidden`). Work of an earlier round does not count. The human makes that decision in the web UI.
- Otea cannot see the conversation, so it cannot prove a relayed decision was really made by the human. Presets choose `human-ui` wherever that matters. Defaults are conservative: approval of an agent's own deliverable is `human-ui` unless the preset relaxes it explicitly.

## 7. Core invariants

Enforced by the core regardless of preset or module.

1. **An agent never approves its own work on its own authority.** Actions marked `human` or `human-ui` cannot be performed by an agent acting for itself.
2. **`human-ui` actions are not exposed in the CLI or MCP.** They exist only in the web UI, protected by a session token visible only to the browser.
3. **Relayed decisions are always labelled as relayed.** They can never be recorded as direct UI decisions.
4. **History is append-only.** The event log is never truncated or rewritten. Iterations are never overwritten.
5. **Verify before acting.** Playbooks require checking that a problem still exists at the current state before acting on it.
6. **External text is untrusted.** Reports, third-party comments and human-entered intake text are data, never instructions to the agent.
7. **Leases are atomic.** Two actors cannot hold the same item. A claim is one conditional write in an immediate transaction; an expired lease reads as free and can be taken over; moving an item to a state whose turn is not the agent's releases it, and on a published board every move releases it: a lease is for one step's doing or review, and an agent that goes on with the next step claims it again. Only agents are bound by another actor's lease: the human in the UI always can act.
8. **Reading never mutates.** Opening an item does not change its state.

**Threat model:** these invariants prevent agent mistakes and overreach through the official interfaces. They do NOT stop a malicious agent with shell access from editing files directly. This is stated explicitly in the docs.

## 8. Application model

**Data and app are separate.**

- **Data is per project**: one SQLite database plus evidence files, in one of two storage modes (below). Everything an agent needs is found from the project itself.
- **The app is one per user**: a single local process serving the UI for every linked project. No web server per project.
- **Project registry** (user-level, `registry.db` in the Otea home: `OTEA_HOME`, or `~/.otea` on every OS): the linked projects (id, name, storage mode, data folder) and the folders that lead to each, compared by a key (the real path with forward slashes, lowercased on Windows and macOS). A project can have several folders; the nearest linked folder at or above a path names its project. It is optional except in `common` storage mode.
- **Global attention inbox**: the home view aggregates "waiting for me" across all linked projects and collections.

**The app is never required.** An agent in a project works through the CLI (or MCP) with the app closed and the project unlinked. The human opens the UI whenever they want to look.

In the UI the human navigates between linked projects and, inside a project, between its collections (each with its own preset).

### Distribution

- **Desktop app (Electron)** with a traditional installer per OS that ends by opening the app. Native window, taskbar icon, system notifications when it is the human's turn, tray.
  - Downloaded from GitHub Releases (no store): an NSIS installer for Windows (per user, no administrator), a dmg for macOS (one universal app for Apple Silicon and Intel), an AppImage and a deb for Linux, all built with electron-builder in CI on a `v*` tag (`.github/workflows/desktop.yml`).
  - The app opens a project the way an editor opens a folder: the first run offers **Open folder** or **Create project** (`otea init`), later runs reopen the last project, and the tray menu opens another from the recent ones. It attaches to the project's running `otea serve` or starts one, and shows the UI in its window; there is no console.
  - It updates itself from GitHub Releases (electron-updater): a check at start and every 4 hours, the download in the background, then a quiet notice in a corner of the window ("Otea se actualizó · reiniciar") and an item in the tray menu. It never restarts on its own; a downloaded update applies when the app next quits.
  - Unsigned until certificates exist: Windows shows its SmartScreen warning and macOS its Gatekeeper refusal on the first open, and since macOS applies updates only to signed apps, the Mac app announces a new version with a download link instead. Signing is a drop-in through the release workflow's secrets.
  - The web UI already publishes whose turn it is (the living mark, see DESIGN.md, Brand): the page title counts what waits for the human ("(2) Otea") and the favicon swaps between four frames. The shell can follow both off the window it hosts, and `ui/src/attention.ts` derives the same state from the items for the main process.
- Electron was chosen over Tauri for render consistency: one bundled Chromium on every OS, so testing on one OS covers the UI on all of them. Accepted cost: larger installer.
- **The CLI is independent of the window**: installing puts `otea` on the PATH for agents (the Windows installer on the user's PATH, the deb in `/usr/bin`, the Mac app through its "Install the otea command" action, a symlink in `/usr/local/bin`); it never needs the app running.
- **Running from source** (clone + run) works without the installer, including serving the UI in a browser.
- Installers for all OSes are built in CI.

### Stack

- **Node.js only**, TypeScript end to end. Electron already ships Node; a second runtime would mean two SQLite drivers on the same file.
- The installed CLI runs on Electron's bundled Node (as editors like VS Code do for their CLI): the app carries the CLI's source and production dependencies in `resources/otea`, and `resources/bin/otea` runs `src/cli/main.ts` with `ELECTRON_RUN_AS_NODE=1`, Node stripping the types as it does from source. What the CLI writes to run itself later (the `.mcp.json` entry, the hooks) does the same, so a machine with the app needs no Node. Without the installer it is `npm i -g @otea/cli`.
- `node:sqlite` (built in, no native module to rebuild for Electron). Its API is still marked release candidate, so all database access is confined to `src/store/`; swapping to `better-sqlite3` would stay local to that folder.
- Verified by spike (Electron 45.0.0, Node 24.22, SQLite 3.53.4, Windows):
  - `node:sqlite` works without flags in the Electron main process and under `ELECTRON_RUN_AS_NODE` (the bundled CLI). Plain Node 22 also works but prints an `ExperimentalWarning`; the npm-installed CLI requires Node >= 24 or filters the warning.
  - Two processes on one WAL database: no corruption, no `SQLITE_BUSY` escaping with `busy_timeout`, atomic claim with exactly one winner. Write transactions must stay short: tight write loops starve other writers.
  - Change detection: poll `PRAGMA data_version` (ignores own commits, caught every external commit). `fs.watch` on the `-wal` file is only a wake-up hint; never watch the `.db` file.
  - esbuild bundles `.tsx` from Node and from Electron. Packaging must unpack its native binary from the asar and ship the per-OS `@esbuild/<platform>` package.
  - `npm i electron` may skip the binary download; setup runs `node node_modules/electron/install.js` if `dist/` is missing.
- Hono (HTTP + SSE), React + Vite (UI), Electron (desktop), esbuild (module loading), Zod (preset and module config validation).

### Code structure

One repo, one `package.json`, no workspace monorepo.

```
src/
  core/       domain, pure: preset schema, workflow, turns, authority, invariants
  store/      SQLite: schema, migrations, queries
  app/        use cases: create, claim, submit, relay decision, wait...
  cli/        commands -> use cases
  mcp/        tools -> same use cases
  server/     Hono: REST + SSE, tokens, pairing, serves the UI
  desktop/    Electron: window, tray, notifications, starts the server
  modules/    module loader (esbuild)
ui/           React + Vite shell + ui-kit
modules/      official modules (same structure as local ones)
presets/      bug-triage, change, review-rounds, tasks
docs/
```

- Dependencies point inward: `cli` / `mcp` / `server` -> `app` -> `core` + `store`. `core` imports nothing else.
- Use cases are the only write path; no interface talks to the database directly. This is what makes the invariants unbypassable.
- Light hexagonal: abstractions only where there is more than one real implementation. No repository port over SQLite; tests use in-memory SQLite.

### One server, several clients

The app process runs a local HTTP server that serves the UI. The Electron window is just one client of it; a browser on the same machine (when running from source) or on a phone is another.

- **LAN access is opt-in and off by default.** When enabled, the server also listens on the local network.
- **Browser session**: each project has a random UI token (32 bytes, base64url) in `ui-token` in its data folder, created on the first `otea serve` with owner-only permissions where the file system allows it, and never printed. `otea serve` and `otea open` launch the browser at `/auth?token=...`; the server compares the token in constant time, sets `otea_session_<port>` (named after the bound port, because browsers scope cookies by host but not by port, so servers of several projects on 127.0.0.1 keep separate sessions and ignore each other's cookies) as an `HttpOnly; SameSite=Strict; Path=/` cookie (no `Secure`: it is plain HTTP on 127.0.0.1) and redirects to `/`, so the token never reaches the page's JavaScript. A browser without that cookie sees a read-only UI.
- **Writes from the UI** (`POST /api/items/:id/move`, JSON `{ to, reason? }`) need the session cookie (else 401), `Content-Type: application/json` (else 415) and an `Origin` equal to the server's own origin (else 403), on top of the `Host` check that blocks DNS rebinding. They act as `human` on the `ui` channel, so `agent`, `human` and `human-ui` transitions are reachable there and only there; the event records the channel, which is how the timeline tells a direct UI decision apart.
- **Pairing**: the app shows a QR code carrying a device token. A paired device acts as the human, so it can perform `human-ui` actions. Devices can be revoked.
- Plain HTTP on the LAN: the token can be sniffed on a shared network. The UI states "trusted networks only".
- **Otea handles local access only.** For access outside the LAN (and HTTPS), the docs include a guide using Tailscale's free personal plan with `tailscale serve` (valid certificates, private to the user's devices; never `funnel`). Users who refuse a third-party account can self-host the coordination server with Headscale, at the cost of running a public server. Otea ships no certificate or remote-access code of its own.
- **The server never trusts the request origin.** Every write needs a valid session, even from localhost: a reverse proxy (e.g. `tailscale serve`) makes remote requests look local. While the server only listens on 127.0.0.1 and accepts only its own `Host`, reads stay open so a plain browser tab shows the read-only UI; once LAN access or pairing exist, reads require a session too.
- Closing the window keeps the app in the tray, so paired devices keep working; quitting stops the server.
- The UI is responsive: triage and review must be usable on a phone.

### Storage modes

Chosen at `otea init`: common by default, `--local` for local.

| Mode | Location | Footprint in the repo | Trade-off |
|---|---|---|---|
| **local** (`init --local`) | `.otea/` in the project, excluded through `.git/info/exclude` | none: no tracked file is touched, not even `.gitignore` | not shared with others |
| **common** (default) | `$OTEA_HOME/data/<project-id>/` (`otea.db`, `evidence/`, `presets/`) | none, not even a folder | agents depend on the user-level registry to find the data; several repos can share the project |

- The project folder (where `.otea/` goes, and the folder linked in the registry) is resolved from the git common directory (`git rev-parse --git-common-dir`), so every worktree of a repo shares the same data. Parallel agents in worktrees are a primary use case.
- **Discovery** (CLI, MCP server and `serve` alike, through one function), in order:
  1. `OTEA_PROJECT`: a folder holding `.otea/otea.db`, a registered folder, or a registered project id.
  2. The registry: the deepest registered folder containing the working directory or the main repo root.
  3. The local walk-up: from that main repo root (or the folder itself outside git) up to the nearest folder holding `.otea/otea.db`, stopping at the filesystem root. Matching the database, not `.otea/` alone, keeps the user-level `~/.otea` from passing for a project.

  Of 2 and 3 the nearest (deepest) folder wins; on a tie, the registered one. So one project in a product folder (which need not be a repo) covers every repo below it, with their worktrees and subfolders, and a project closer to the repo wins over it. `otea init` inside a folder already covered by a project above refuses unless `--here`, which creates a separate project at the repo.
- **Several repos, one project**: `otea init` creates the project in common storage, registers it and links the repo root. `otea init --join <project>` (id, or a name no other project has) links another repo root to it, and `otea projects add <path> --to <project>` links any folder. A folder belongs to one project only, and a folder holding a local `.otea/` project cannot be linked. `otea projects relink <old> <new>` moves a link to the folder a repo moved to, checking it is the same repo (same origin URL or same root commit, recorded at link time; another repo is refused unless `--force`, and it warns when neither can be checked). `otea projects forget <path>` removes a link, never the data: a project whose last folder is unlinked stays registered with its items, but nothing resolves to it until a folder is linked again. `otea projects list` lists the registered projects with their folders, marking the ones that no longer exist; `otea projects current` shows the project the working directory resolves to.
- **Migration** is explicit, never automatic: `otea migrate --to common` copies a local project's database into its common data folder with `VACUUM INTO`, verifies the copy (integrity check, row counts and last row ids per table), copies `evidence/` and `presets/`, registers the project under the same id and links its folder, then renames `.otea/` to `.otea.migrated-<date>-<time>/`, a backup that is never deleted. It prints the steps to undo it. It refuses while `otea serve` runs on the project or another process holds or writes the database (undoing what it did), and a re-run is safe: it does nothing, or only moves aside an old folder that still matches the copy.
- **Identity**: every project database holds one `project` row, `id` and `name`, so a registry of projects can be rebuilt from the databases themselves. The name is the project folder's; the id is the name as a slug (lowercase ASCII and dashes, at most 32 characters) plus `-` and six random base32 characters (`my-app-k3x7qa`). It is written on `init`, and on the first open of a database created before identities.
- **The project's repos**: a project keeps the repos its items name, each under a name (what a repo task's `repo` field holds) and an identity that holds wherever it is cloned: its `origin` remote URL, normalised so its https, ssh and scp forms are one (`git@github.com:acme/api.git` and `https://github.com/acme/api` are both `github.com/acme/api`: no user, port or trailing `.git`, the host lowercased, the path's case kept; a local remote by its path), or, without an origin, its root commits. A clone or worktree of a repo in any folder is that repo, and a folder's name never names a repo by itself. The repos at the project's folders (a linked repo, or the repos up to two folders below a linked folder) are added under their folder names when the project is created, and the first time a project from before this is opened for its repos; linking a folder (`init --join`, `projects add`, Configuración) adds the repos at it. Two folders holding one repo under different names (`api` and a clone in `api-copy`) add it under the name its items already use, or not at all; a name two repos would take goes to neither. `otea repos list` lists them, `otea repos add [<path>] [--name <name>]` adds the repo at a folder (or renames one already added), and `otea repos remove <name>` removes one; items keep their values.
- `common` is meant for products split across several repos, folders without git, or users who want zero footprint; it is the only mode where the registry is not optional. `local` keeps everything next to the repo, for users who want no user-level state.
- **Versioning is an export, not live data.** A binary database cannot be diffed or merged in git, so `otea export` writes a readable snapshot (items as Markdown, events as JSONL) that can be committed when a versioned history is wanted.

### Why a database and not files

- **Concurrency**: agents and the app write at the same time. SQLite (WAL mode) gives transactions; an atomic `claim` is one statement. Files would need temp-file renames, a custom lock and file watching.
- **Queries**: facets, grouping, "waiting for me" across projects and history are plain SQL. Files would need a separate index kept in sync, i.e. two representations of the same data.
- **Less code overall**: no sync layer between files and index.
- Accepted costs: data is not readable with `cat` (the CLI with `--json` and `otea export` cover it), and the live data is not versioned in git (covered by `export`).
- Evidence (images, GIFs, video) stays as plain files next to the database.

### Write model

One write path: the CLI and the app use the same core and write to the same database in transactions. There is no server in between and no delegation from the CLI to the app. The app detects external writes and refreshes the UI live.

### Storage layout (per project)

A project's data folder: `$OTEA_HOME/data/<project-id>/` in common storage, `.otea/` in the project folder in local storage.

```
<data folder>/
  config.yaml              collections -> preset mapping
  presets/                 local presets (or references to official ones)
  modules/                 local modules (§10.3)
  otea.db                  project identity, items (with their lease), iterations, events (append-only)
  ui-token                 browser session token (never committed, never printed)
  serve.json               port and pid of the running `otea serve`, removed on shutdown
  evidence/<collection>/<item-id>/...
```

The Otea home holds the registry and the common projects' data folders:

```
$OTEA_HOME/                (default ~/.otea)
  registry.db              registered projects and the folders linked to each
  data/<project-id>/       a common project's data folder, laid out as above
```

## 9. Preset format

Declarative YAML. **No expression language.** Complexity comes from composing more modules, not from more syntax. Derived scores are limited to product or weighted sum of enum weights.

A preset is a folder: `preset.yaml` plus the playbook it points to. Official presets live in `presets/<name>/`; project presets in `presets/<name>/` in the project's data folder (`.otea/presets/<name>/` for a local project), with the same structure. A project preset cannot reuse an official name.

The official `tasks` preset:

```yaml
preset: tasks
preset_version: 1
playbook: ./playbook.md
fields:
  title:       { module: text, required: create }
  description: { module: markdown, required: complete }
  priority:    { module: enum, values: [low, medium, high], default: medium }
workflow:
  initial: todo
  incomplete: incomplete
  states:
    incomplete:  { turn: agent }
    todo:        { turn: agent }
    in_progress: { turn: agent }
    review:      { turn: human }
    done:        { turn: none, closes: done }
    discarded:   { turn: none, closes: discarded }
  transitions:
    - { from: incomplete,  to: todo,        by: agent }
    - { from: todo,        to: in_progress, by: agent }
    - { from: in_progress, to: review,      by: agent }
    - { from: review,      to: done,        by: human-ui }
    - { from: review,      to: todo,        by: human-ui, reason: required }
    - { from: [incomplete, todo, in_progress, review], to: discarded, by: human, reason: required }
    - { from: incomplete,  to: discarded,   by: agent, reason: required }
```

**Fields**
- `module`: the field module. Official field modules today: `text`, `markdown`, `enum` (`enum` takes `values` and an optional `default` from them) and `severity` (a fixed scale `low`, `medium`, `high`, `critical`, levels 1 to 4; it takes no `values`, and an optional `default` from the scale).
- `required: create`: the item cannot be created without it. Every preset has a `title` field (`text`, `required: create`).
- `required: complete`: the item can be created without it, but then it starts in the workflow's `incomplete` state instead of `initial`, so an agent enriches it (§5) with `otea update`. The item cannot leave `incomplete` for a working state until these fields are filled; closing it (a state with turn `none`, e.g. `discarded` with a reason) stays allowed.
- `default`: applied at creation when the value is missing.

**Workflow**
- `initial`: where complete items start. `incomplete`: where items missing a `required: complete` field start; mandatory when any field uses it.
- Every state declares its `turn` (`agent`, `human` or `none`).
- Any state, whatever its turn, may declare `requires: children_closed`: an item cannot move into it (by a move in the UI, an agent move or a relayed decision) while any of its children is open; the refusal is `children_open` (exit 4, HTTP 409) and lists each open child with its state. It gates a working state as well as a closing one: while a parent has open children it belongs on the agents' side, so `review: { turn: human, requires: children_closed }` brings it back to the human only once every child is closed, and `done: { turn: none, closes: done, requires: children_closed }` keeps it from closing before them. Its twin, `requires: blockers_closed`, refuses the move while any item that `blocks` this one is open, in any collection (`blockers_open`, exit 4, HTTP 409, listing each open blocker with its state). A state may require both, as a list: `requires: [children_closed, blockers_closed]`; a single requirement may still be written alone. A move into such a state carries `requires` as a list (`["children_closed"]`) in the moves of `otea show --json`, the API and MCP, as `closes` does, so a UI can tell it waits, and `otea show`'s hint says what the move still waits for: its open children by count, its open blockers by id. The rule sits on the state rather than on each transition into it, so every way in is covered by one line. Nothing ever moves a parent for its children: its state is never derived from theirs.
- `close_requires` is the former name of `requires`, still read with the same meaning: a preset that uses it loads, and `otea validate` warns on each use, suggesting `requires`. A state that declares both is a problem.
- Every closed state (turn `none`) declares `closes`: `done` (the work was accepted) or `discarded` (it was thrown away). Other states cannot declare it. Like the turn, it is derived, never stored: a closed item and a move into a closed state carry `closes` in their JSON, and the UI draws the done or discarded node from it, whatever the state is called.
- Each transition declares `by`, the authority needed to take it (§6): `agent`, `human` or `human-ui`. `from` may list several states.
- `reason: required` makes the actor give a reason; it is recorded in the event and shown in the timeline.
- The same `from`/`to` pair may appear with different `by` (e.g. both humans and agents may discard an incomplete item); identical transitions are rejected.
- A transition with `by: agent` into a `closes: done` state is a preset error: agents never approve their own work. Closing as `discarded` is allowed (an agent may close an incomplete report it could not reproduce).
- `gates` (optional) names actions done outside Otea and the states that allow each one: `gates: { push: [implementing, revising], merge: [approved] }`. The action is a free snake_case name (`push`, `merge`, `implement`, `publish`), not a version-control concept; Otea gives it no meaning. Each listed state must belong to the workflow, once; an action lists at least one state. `otea show --json`, the API and MCP carry the item's verdicts, `"gates": { "push": true, "merge": false }`, and `otea show` a `Gates:` line; an item whose workflow has no gates has none. Like the turn, a verdict is derived from the state, never stored. Otea only answers (§12): a gate holds because the agent checks it, as its playbook says, or because a hook the consumer installs refuses the action.
- `otea check --gate <action> [--field <key=value>...] [--branch [<name>]] [--repo [<name>]]` answers for the items whose fields hold every value given: exit 0 when the action is allowed, 19 (`gate_refused`, a code of its own so a hook never mistakes a crash for a refusal) when it is refused, with one line per refusing item on stdout (`push refused: CHANGES-2 is pr_review; push is allowed only in implementing, revising`); `--json` prints `{ gate, allowed, items: [{ id, state, stateName, allowed, allowedIn, allowedInNames }] }`, each state by id and by its step's name. It checks the open matching items whose workflow gates the action, or the closed ones when none is open (a closed state can allow an action, such as merging what was approved), and allows the action only when every one of them does. `--branch` matches the `branch` field, the current git branch when given no name; `--repo` the `repo` field, given no name the name the project gives the repo checked out (see **The project's repos**), so a clone in another folder is checked as the repo it is a clone of; repo names match whatever their case, as git hosts and the file systems of Windows and macOS take them, so `--repo API` checks the items of `api`. A gate that no board and no preset of the project declares (a typo such as `psuh`, or `deploy`) is a usage error, exit 2 (`invalid_gate`), naming the gates there are: `push` and `merge`, plus any a preset declares. It fails open: when no item matches, no workflow gates the action, there is no project or no git checkout, or anything else keeps it from answering, it exits 0 with a note on stderr. The one exception is a repo the project cannot match: inside a project, `--repo` with no name in a checkout that is none of the project's repos (or has neither an origin nor a commit to tell it by) refuses the action, as a refusal (exit 19, or exit 2 with `--claude-hook`), with `otea repos add` in the reason.
- Gates are soft (the playbook asks the agent to run `otea check`) until a repo opts into hooks, never automatically: `otea hook install --git` writes the repo's `pre-push` hook (where `core.hooksPath` points), which runs `otea check --gate push --branch <each branch the push writes to or deletes on the remote> --repo` (the remote ref, never the local branch it sends from, so `git push origin main:feat/x` is checked against `feat/x`; tags go unchecked) and stops the push only on exit 19 (`gate_refused`); `otea hook install --claude` adds Claude Code `PreToolUse` hooks to the repo's `.claude/settings.local.json` (per machine and kept out of git through `.git/info/exclude`, since the hooks name this machine's path to Otea, as `.git/hooks` is never committed; a tracked one is left alone with a note) for Bash calls `git push` and `gh pr merge`, running `otea check --gate push|merge --branch --repo --claude-hook`, which reads the event on stdin, checks in its `cwd`, and refuses with exit 2 and the reason on stderr, so Claude Code blocks the call. Both print what they wrote and are idempotent; a pre-push hook Otea did not write is never overwritten (Otea prints the lines to add to it instead). `otea hook remove --git --claude` takes out only what Otea wrote. A `git push` is checked against each branch its refspecs write to (`src:dst`, `+src:dst`, `HEAD:dst`, `:dst` and `--delete` name `dst`), the current branch when it names none or names `HEAD`, and every local branch for `--all`; a push whose branches it cannot tell (`--mirror`, `--prune`, a glob or a shell variable in a refspec) is refused, not allowed. A bare `gh pr merge` is checked against the current branch; `gh pr merge <number|url|branch>` against that PR's head branch, which `gh pr view --json headRefName` tells (when gh is missing or fails, the merge goes on with a note); `otea show` does not yet say whether a repo is hooked, since items name repos but Otea does not track where their clones are. On a board, the protected branch field may also name the **base branch** (`guard.base`, Studio: "It protects the base branch too"): a push or a merge into it is then allowed only when it brings in the branch of at least one of the board's items and every such item is Done; one that brings in none (a commit straight onto the base) is refused, in any repo. What a push brings in are the local branches its commits contain that the remote's base does not yet have: the pre-push hook passes `--commits <remote_sha>..<local_sha>`; the Claude Code hook and a plain `otea check --branch <base>` use the source of each refspec (`src:dst`, the branch of the same name, `HEAD` for the current branch, nothing for a delete) against the branch's upstream, or `origin/<base>`; a `gh pr merge` whose head branch no item has is checked as a merge of that branch into the PR's base (`gh pr view --json headRefName,baseRefName`). The person still pushes past it with `git push --no-verify`, or merges on the forge, which no hook sees.

**Item types**

A collection can hold items of several kinds (bugs and improvements of one product, say). `types` declares them; each type has:

- `label`: how people read it (`Improvement`); the key (`impr`) is the short name the CLI and the list rows show.
- `fields` (optional): its own fields, added to the preset's `fields`, which every type shares. A type cannot redeclare a shared field; `title` is always shared.
- `workflow` (optional): its own workflow, same format as the preset's. Without it the type follows the preset's `workflow`, which stays mandatory.
- `layout` (optional): how its items are drawn (below).
- `icon` (optional): the icon the web UI draws beside its items (list rows, children and relations, the detail header), by name: `icon: bug`. Without one, the items have no icon.
- `playbook` (optional): its own playbook, a path in the preset's folder like the preset's `playbook`. Studio edits it with the preset's, and the gate check reads both.
- `children` (optional): the types that may hang under it with `parent`, `children: [story, bug]`. Once any type of the preset lists `children` the preset declares a hierarchy, and a type without them takes no children; a preset where none does takes any child under any type. A parent link or `create --parent` whose child type the parent's type does not list is refused with `parent_type` (exit 16, HTTP 409). Unknown or repeated names and loops (a type under itself too) are preset problems.
- `root` (optional, default `true`): `false` means an item of the type may not live with no parent; `create` without `--parent` is refused with `parent_required` (exit 16, HTTP 422), and a `root: false` type that no type lists in its `children` is a preset problem.

A preset without `types` has exactly one implicit type, named `item` (label `Item`), with the preset's fields and workflow; existing items are of that type. A preset that declares a single type names its only type (`tasks` names it `task`, `bug-triage` `bug`); items stored as `item` under such a preset take its name when the project is opened. It takes its icon from a top-level `icon`, as it takes its layout from a top-level `layout`; with `types`, each type declares its own.

The top-level `icon` (optional) is also the **preset's icon**: the default icon of every collection built from it (`otea collection icon` overrides it per collection, and `otea init --icon` gives the project one; a project without one is drawn as a monogram of its name). A preset with `types` may declare it too, apart from its types' icons; without it the preset's icon is that of its first root type, and a preset where that type has none gives its collections no icon. The official presets declare `checklist` (`tasks`, whose `task` type keeps `checkbox`), `bug` (`bug-triage`) and `layers` (`change`). An icon is drawn, never stored with items, so changing one needs no new `preset_version`.

**Icons** are drawn by Otea, 112 of them, named by what they depict: `layers`, `checkbox`, `list`, `stack`, `inbox`, `flag`, `milestone`, `target`, `rocket`, `clipboard`, `calendar`, `clock`, `hourglass`, `checklist`, `briefcase`, `chart` (work); `bug`, `git-branch`, `git-merge`, `terminal`, `code`, `brackets`, `database`, `server`, `plug`, `cpu`, `package`, `gear`, `wrench`, `shield`, `lock`, `key`, `cloud`, `browser`, `mobile`, `test-tube`, `gauge` (code); `image`, `film`, `camera`, `play`, `music`, `palette`, `brush`, `pen`, `ruler`, `shapes`, `eye`, `frame`, `sparkle`, `pen-nib`, `layout`, `type`, `cube` (design and media); `book`, `doc`, `note`, `chat-bubble`, `question`, `lightbulb`, `megaphone`, `bookmark`, `quote`, `link`, `mail`, `diagram`, `compare` (docs and talk); `paw`, `feather`, `bone`, `egg`, `fish`, `bird`, `leaf`, `sprout`, `tree`, `mountain`, `flame`, `drop`, `moon`, `sun`, `crystal`, `sword`, `shieldcrest`, `potion`, `map`, `compass`, `dice`, `controller`, `heart`, `star`, `skull`, `crown`, `ghost` (game and creatures); `puzzle`, `beaker`, `magnet`, `bolt`, `anchor`, `hook`, `trophy`, `gift`, `tag`, `pin`, `globe`, `home`, `user`, `users`, `robot`, `cart`, `coins`, `building` (status and flow). An unknown name is a preset problem that names the close matches (`types.bug.icon: unknown icon "bugg" (did you mean bug?)`), at load and in `otea validate`. The list lives in `src/core/icons.ts`; the drawings in the web UI are keyed by it. Every item stores its type. `otea create --type <type>` is required only when the preset declares more than one; `otea list --type <type>` filters by it; turns, moves, updates and field validation follow the item's type.

**Layout**

A type's `layout` places modules in slots. Each slot is an ordered list whose entries are a field name, or a module reference `{ module: <kind>, ...config }`:

| Slot | Where |
|---|---|
| `header` | under the title in the item detail |
| `evidence` | the evidence area of the detail, before the body |
| `body` | the main column of the detail |
| `side` | the side column of the detail, above its metadata |
| `row` | the list row, after the title |
| `phone` | the phone detail (reserved: not drawn differently yet) |
| `intake` | the create form, in order; it must include every `required: create` field |

A slot the layout leaves out keeps its default. A type without `layout` gets the default layout, which draws items as before layouts existed: `body` and `row` hold every field but the title, `intake` every field, the other slots nothing. A preset without `types` may declare `layout` at the top level for its implicit type; with `types`, each type declares its own.

**Module registry**

The modules a layout may place, the slots each one may sit in and the config it takes are listed in one registry in the core (`src/core/modules.ts`):

| Kind | Modules | Slots | Config |
|---|---|---|---|
| Field | `text`, `markdown`, `enum`, `severity` | header, body, side, row, phone, intake | `field` (required, a field of that module), `label` |
| Evidence | `images`, `recording`, `diff`, `log` | evidence, body, side, phone | `id`, `variant` (`images`: `single`, `gallery`, `compare`; `recording`: `player`, `frames`), `accepts`, `required`, `label` |
| Relation | `relations`, `children` | body, side | `label` |
| Reserved | `questions`, `rounds`, `score`, `options`, `diagram` | per module (e.g. `score`: header, side, row; `diagram`: evidence, body) | `label` |

- A field name is shorthand for `{ module: <its module>, field: <name> }`. A field module must match its field's module.
- `accepts` lists file kinds (`image`, `video`, `diff`, `log`) or extensions (`png`, `.mp4`), and each must belong to the module's family: `images` accepts images, `recording` videos, `diff` diffs, `log` logs.
- Reserved modules validate today; their components come later, and until then they draw nothing.
- `relations` lists the item's relations grouped by kind (§9.1), each other item with its node, id and title; `children` draws a parent's children as nodes on the lanes with how many closed, done and discarded, and lists them. Both draw nothing while there is nothing to show, beyond a quiet action to add one. Every type's default layout places `children` at the end of `body` and `relations` in `side`, so items without relations look as they did before.
- An evidence module's `id` (lowercase letters, digits and dashes) names it to `otea attach --module`; it defaults to the module kind, and must be unique within the type's layout, so a type with two `images` modules gives at least one of them an id. `otea show`, `--json` and the API report each entry's `module`.
- Attaching follows the layout: a file goes to a module that accepts it (`evidence_not_accepted`, exit 15, when none does); `--module <id>` picks one when several do (`module_required`, exit 2, without it); a `compare` takes only `before` and `after`, every other module single files (`invalid_role`, exit 2). A type that places no evidence module takes any file, as before modules existed. Evidence whose module is unknown (attached earlier, or the preset changed) belongs to the first module that accepts it, else to a plain list of other files.
- Each evidence module draws its own component where it is placed (single image, gallery, before/after slider, video player, frames, diff, log); empty, it says what agents attach, dashed when `required`. The `phone` slot is not drawn differently yet: on a phone the detail draws the same modules, at its width.

**Collection view**

`view: { kind, group_by, columns }` says how the collection lists its items, for the whole preset (collections have no settings of their own). `kind` is `list` (default), `board` or `grid`; a board is drawn as the list for now. `group_by` is `turn` (default: waiting for you, with agents, closed), `state`, `type`, or a one-line field (`enum`, `severity` or `text`) every type has, never `title`; a text field groups by the values its items hold, trimmed and lowercased. `columns` names what the grid shows, in order: the built-in `id`, `title` (always listed), `state`, `type`, `who` (the holder) and `age` (since the last change), and one-line fields (`enum`, `severity`, `text`); a field only some types have shows an empty cell on the others. Without `columns` the grid shows `id`, `title`, the one-line fields of the row slot, `state`, `who` and `age`. `columns` is the default set: in the web UI each viewer can show or hide any built-in or one-line field (id and title always show) and resize the columns, kept per browser; a column never moves from its place in this order. Validate reports an unknown column (with the close names), a column listed twice, a multi-line field (`steps is markdown; a column holds one line`), columns without the title, and a `group_by` that cannot group: a field some type lacks, `title`, or a multi-line field (`steps is markdown; only one-line fields group (enum, severity, text)`).

A person can still switch a collection between list and grid, and group, sort and filter it; the web UI keeps those choices per collection in the browser (see `DESIGN.md`, Grid), and the list honours the same grouping, sort and filters.

`labels` (optional) gives the preset's own words in other languages, for the web UI: per language code, a word for each type, state and field, `labels: { es: { types: { bug: Error }, states: { reported: reportado, … }, fields: { title: título, … } } }`. It is all or nothing: a language labels every type, state and field of the preset (a preset without `types` may leave its only type unnamed), so a screen never mixes translated words with keys; a missing or unknown name is a preset problem (`labels.es.states: missing fixing; a language labels every type, state and field`). The keys stay what agents, the CLI, MCP, the API and the history use; only the web UI, when it is in that language, shows the labels, with the key a hover away. The official presets carry `es`.

**Example: two types in one collection**

```yaml
preset: work
preset_version: 1
playbook: ./playbook.md
fields:                       # shared by every type
  title: { module: text, required: create }
  area:  { module: text }
workflow:                     # followed by every type without its own
  initial: reported
  incomplete: incomplete
  states:
    incomplete: { turn: agent }
    reported:   { turn: human }
    fixing:     { turn: agent }
    verify:     { turn: human }
    fixed:      { turn: none, closes: done }
    rejected:   { turn: none, closes: discarded }
  transitions:
    - { from: incomplete, to: reported, by: agent }
    - { from: reported,   to: fixing,   by: human }
    - { from: fixing,     to: verify,   by: agent }
    - { from: verify,     to: fixed,    by: human-ui }
    - { from: verify,     to: fixing,   by: human, reason: required }
    - { from: [incomplete, reported, fixing, verify], to: rejected, by: human, reason: required }
types:
  bug:
    label: Bug
    icon: bug
    fields:
      severity: { module: severity, required: create }
      steps:    { module: markdown, required: complete }
    layout:
      header: [severity]
      evidence:
        - { module: images, variant: compare, accepts: [png, gif], label: Before and after }
        - { module: recording, variant: player, accepts: [video] }
      body: [steps, area]
      side: [{ module: relations }]
      row: [severity]
      intake: [title, severity, steps, area]
  impr:
    label: Improvement
    icon: lightbulb
    fields:
      pitch:  { module: markdown, required: complete }
      effort: { module: enum, values: [small, medium, large], default: medium }
    workflow:
      initial: proposed
      incomplete: draft
      states:
        draft:    { turn: agent }
        proposed: { turn: human }
        building: { turn: agent }
        shipped:  { turn: none, closes: done }
        dropped:  { turn: none, closes: discarded }
      transitions:
        - { from: draft,    to: proposed, by: agent }
        - { from: proposed, to: building, by: human }
        - { from: building, to: shipped,  by: human-ui }
        - { from: [draft, proposed, building], to: dropped, by: human, reason: required }
    layout:
      body: [pitch, { module: questions }, effort]
      row: [effort]
      intake: [title, pitch, effort]
view: { kind: grid, group_by: turn, columns: [id, title, severity, area, state, who, age] }
```

Rules:
- **Store only what cannot be derived.** Computable states are derived, never stored. Turn is derived from the item's state and its collection's preset.
- Loading checks the schema and its meaning: `initial`, `incomplete`, `from` and `to` name declared states; every state is reachable from `initial` or `incomplete`; states with turn `none` have no outgoing transitions and declare `closes`, and every other state has at least one; no agent transition closes as `done`; enum and severity defaults are among their values; module names are known; every type's fields, workflow and layout pass the same checks, layouts those of the module registry (kinds, slots, config, `accepts` families, a complete intake); `view.group_by` names a grouping every type supports. Icons are known by name. Each problem names its path (`types.bug.layout.evidence[0].accepts`). Schema problems (an unknown key, kind or closing) are reported first and alone, since the rest cannot be checked until the shape is right.
- Collections record the preset name and `preset_version` they were created with; every item records the `preset_version` it was written under (set again when its fields are updated).
- Updates are validated like intake (unknown fields, enum values; a create-required field cannot be cleared), recorded as an `updated` event with old and new values, and rejected on items in a state with turn `none`.
- `otea validate` checks the whole project non-interactively: every preset (official and project), every collection's preset, and every item against its type in its collection's preset (unknown type, unknown state, wrong field type or enum value, missing `required: create` field; an older `preset_version`, and a working item outside `incomplete` that lacks a `required: complete` field, are warnings). It reports and never fixes; it exits non-zero only on errors.
- A preset that loads may still carry **notes**, each with a stable code, a level (`warning` or `info`), a message that starts with its path, and a structured path (`{section, type?, field?, state?, gate?, index?, file?}`): a field no slot places (`field_unplaced`), a human-turn state that a decision relayed from chat cannot move forward (`state_stuck_in_chat`; only `human` moves relay, and a move is forward when it closes as `done` or reaches an open state farther from the start than the one it leaves), a gate no playbook runs `otea check --gate` for (`gate_unchecked`; Otea records no gate checks, so the playbook is the evidence), a field only one type has (`field_single_type`, info), a deprecated key (`deprecated_key`), and samples that do not fit (`sample_*`). `otea validate` prints the warnings of project presets and never fails on them; official presets' notes and every info note show in Studio.
- A preset may ship **sample items** in `samples.yaml` beside `preset.yaml`, with their evidence files in `samples/`: `samples: [{type?, id, title, state, fields?, evidence?: [{file, role?, module?, caption?}], relations?: [{kind, id, title, type?, state?}], history?: [{actor, name, event, from?, to?, reason?, ago?}]}]`. They exist only for Studio's preview and never enter a collection or the database. They are read strictly, and every misfit is a note, never a problem.
- Items survive preset edits; incompatibilities are reported, not silently fixed.
- **Portability:** a preset that uses only official modules is shareable as-is. A preset that depends on local modules declares them; loading it elsewhere reports what is missing.

Planned, not yet supported: more field modules (`media`, `checks`), other `behaviors`, the components of the reserved layout modules, and drawing the `board` view.

### 9.1 Relations

Items link to other items of the same project with a typed relation. A collection is one board: `parent` links an item only to another of its collection, while the other kinds link across collections. Each is stored once and read from both sides:

| Kind | `otea link A <kind> B` means | Read from A | Read from B |
|---|---|---|---|
| `parent` | B is the parent of A | parent | child |
| `blocks` | A must be done before B | blocks | blocked by |
| `duplicates` | A is a copy of B | duplicates | duplicated by |
| `implements` | A is work that implements B | implements | implemented by |
| `relates` | A and B are related (no direction) | relates | relates |

- Rules, enforced by the core: no item related to itself (`self_relation`, exit 16); both items must exist (`not_found`, exit 3); one link per pair and kind (`already_exists`, exit 5; `relates` is the same either way, and `A duplicates B` excludes `B duplicates A`); at most one parent (`parent_exists`, exit 16), in the child's own collection (`parent_across_boards`, exit 16, HTTP 409; the message points to `blocks` to wait and `implements` to deliver); no cycle in `parent` nor in `blocks` (`relation_cycle`, exit 16, naming the path). An unknown kind is `invalid_relation` (exit 2). An open item cannot get a closed parent (`item_closed`, exit 4).
- Relations change neither item's fields nor its state, so linking is not bound by leases and works on closed items. Agents and humans link alike; each link and unlink appends `relation_added` or `relation_removed` to both items' timelines with the actor and channel, so the history stays append-only while the table holds only the current links.
- A `parent` across collections linked before that rule is kept and read as any other. `otea validate` warns on each and suggests making the parent's board divide into the child's in Studio, or converting the link: to `blocks` when the parent waits for its parts (with its board waiting for nothing holding it back there instead, the wait is kept), to `implements` otherwise. It never migrates links itself.
- A parent's state is never derived from its children, nor an item's from its blockers. `requires: children_closed` and `requires: blockers_closed` (§9), on a working or a closed state, are the only coupling, and they only refuse.
- `orderByBlocks` (`src/core/relations.ts`) orders a set of items so whatever blocks another comes right before it, keeping the given order wherever blocks allow and putting what is caught in a cycle last. It is the order the brief will list items in.

## 10. Modules

### 10.1 Kinds

| Kind | Examples |
|---|---|
| **Field** | text, enum (label/color/weight), code, diff, media (roles/kinds), checks (question + verdict + comment), relation (typed, cross-collection), git-ref |
| **View** | attention inbox, list (search + facets), detail (with timeline and iterations), review (evidence + questions), compare (before/after), grouped-grid, board, graph, matrix, dashboard |
| **Behavior** | workflow, gate (block/warn), lease, score, intake form, brief generator |

### 10.2 Module contract

```
<module>/
  manifest.yaml   name, kind, version, config JSON Schema, requirements on the preset
  server.ts       optional logic (uses core APIs only)
  view.tsx        optional UI (uses ui-kit only)
  tests/
```

- The manifest declares what the module needs (e.g. `compare` requires a `media` field with `before`/`after` roles). Preset loading validates that everything fits.
- Views use the shell's `ui-kit`, so modules look native.
- Modules never write state directly; they go through core use cases, so invariants hold.

### 10.3 Local modules and upstream path

Three origins, one folder structure:

| Origin | Location | Trust |
|---|---|---|
| **Official** | shipped with the app | reviewed through PRs to the official repo |
| **Own** | `.otea/modules/<name>/`, scaffolded with `otea module new` | written by the user |
| **Imported** | `otea module add <path-or-git-url>` copies it into `.otea/modules/` and records its origin | at the user's own risk: explicit warning and confirmation; marked as unofficial in the UI |

- A local module has **exactly the same structure** as an official one. Upstreaming = copy folder + PR.
- Modules are compiled when loaded (esbuild), so no module needs its own build step.
- `otea module test` runs the conformance suite (the official repo CI runs the same suite); `otea dev` hot reloads.
- **Imported modules run code with the user's permissions.** v1 does not sandbox them; it warns clearly and records the origin.
- Trade-off accepted: `ui-kit` becomes a public, versioned API. Breaking changes require a major version.
- Not in scope: a module marketplace or registry.

## 11. Agent interface

- **CLI is the baseline.** Works from any agent with a shell. `--json` on every read; meaningful exit codes.
- **MCP is a thin layer** over the same use cases. Every MCP tool has a CLI equivalent.
- **Two toolsets**, to keep per-session token cost low:
  - **Operate** (always on, kept small): create item, query items (including "my turn"), claim/heartbeat/release, update agent-writable fields, attach evidence, submit iteration, record a relayed human decision (`human` authority only), check blocked.
  - **Build** (CLI only or separate MCP server): list/describe modules, validate/preview presets, scaffold and test modules.
- **Instruction delivery**: an agent reads its instructions from the project, in the words of each board. `otea next` (and the MCP `next` tool) says which item to take now and what its step asks, starting with claiming it (`otea next --claim` takes and claims it at once), and never offers two agents the same item; `otea board` (the `board` tool) indexes the boards and prints a board's own words for agents and each step's instructions (a preset collection read as a board carries its playbook as that text); `otea show` adds `Next:`, the same answer for that item; `otea init --agents-md` opts a project into a marked AGENTS.md block that points agents at `otea next` and `otea board`. Otea's agent guide, one short text on following the board to the letter under a unique name per agent and subagent, reaches agents three ways: the MCP server's `instructions`, that AGENTS.md block and the start of `otea board`.
- **Agent naming**: an agent's name is its identity, mandatory and unique among the agents working at the same time; there is no default name. `--as <name>` (or `$OTEA_AGENT`) names it on the CLI; every MCP tool takes `as`, so subagents sharing one server each act under their own name; `otea connect --as <name>` pins the name a call without `as` acts as. One rule validates the name everywhere. The profile an agent works with (harness, model, effort) is separate from its name. The web UI marks each agent by its initials on a hue derived from its name.
- **Agent profile**: every agent and subagent declares the profile it runs as (harness, model, effort) with `otea profile` (the `profile` tool) and keeps it current. The harness comes from the MCP client's initialize; a command-line agent names it. Model and effort are stored exactly as declared, with no translation between vendors; a model family (opus, sonnet, gpt-5, ...) is derived only for grouping. The profile is mandatory (`claim` and `connect` refuse without one; `next` refuses one not declared again in the current session) and is stored on every event the agent writes, with each change kept in its own history; the profile a round counts is the one at its handoff. It exists for analysis after the fact (rounds and send-backs per model and effort), never to route or restrict work.
- **Preset builder flow**: the agent interviews the user ("what do you want to track?") following a builder playbook and using the Build toolset. No wizard inside the server.
- **Brief generator**: selected items -> Markdown brief ordered by dependencies, with success criteria and limits.
- **Turn notification** (how an agent learns the turn came back):
  - `otea wait --turn agent` blocks until something is waiting for the agent, or a note from the human waits on an item it holds. Harnesses that run background commands and resume the agent when they exit (e.g. Claude Code) use it directly.
  - Otherwise the agent polls `otea list --turn agent`, on its own loop or on a schedule the playbook suggests to the user.
  - On a fresh session, the playbook's first step is `otea list --turn agent`.
  - Otea never spawns agents.

## 12. Integration contract

External tools (orchestrators, queue runners, notification systems) rely only on **CLI + MCP + preset format**; everything else is internal.

1. Local and offline. No cloud dependency, no features tied to a single agent vendor.
2. Harness-neutral agent access (§11).
3. Project-scoped data (in the Otea home, or `.otea/` in local storage); the user-level registry is optional only in `local` storage mode.
4. Stable versioned preset format + non-interactive `validate`.
5. Machine-readable output (`--json`, exit codes).
6. Idempotent `init`.
7. Append-only event history, readable without the app (`otea events --json`, `otea export`).
8. Otea only *answers* questions like `blocked?`; enforcing them (e.g. blocking a merge) is the consumer's job.

## 13. v1 scope

**Three presets**: two that drive the design, one that proves it is generic.

- `bug-triage`: agent-documented findings, human intake with enrichment, severity x likelihood scoring, verify-before-fix, `already_fixed` with notes, typed relations feeding brief order.
- `review-rounds`: cards with evidence and concrete questions, iterations (rounds), before/after media, taste/correctness gates.
- `tasks`: a plain Jira-like board, built only from modules the other two already need. If it requires core changes, the abstraction is wrong.

**Generalize only what these need.**

Minimum views:
- **Attention inbox (home)**: what waits for the human across all linked projects, plus what agents currently hold.
- List with facets, detail with timeline and iterations, review, compare, grouped-grid, board.

## 14. Lessons from the prototypes

Keep:
- Verify before fixing.
- Leases with heartbeat and takeover on expiry.
- Verification requires evidence and is never set by the agent on its own authority.
- Reported text treated as untrusted.
- Typed relations feed both the graph and the brief order.
- Cross-checking findings against upstream changes (a large share of findings may already be fixed).
- Brief generation from selected items.
- Concrete questions per review card instead of a bare approve/reject.

Fix:
- Enums, labels and weights duplicated across build script, UI and docs -> one preset + i18n.
- Data embedded in generated HTML -> app + database.
- Browser-only file access APIs -> local app.
- OS-specific scripts -> single cross-platform binary.
- Lock protocol implemented twice in different languages -> database transactions through one core.
- Two status vocabularies for the same thing -> one workflow per preset.
- Same item stored in two formats -> one record in one database.
- Transitions enforced only by prose -> core invariants.
- Names of people and projects hardcoded in the playbook -> templated playbook.
- Event log capped -> append-only, never truncated.
- One web server per project -> one app, many projects.

## 15. Out of scope for v1

- Expression language in presets.
- Hooks in workflows.
- Remote module marketplace.
- Multi-user, network sync, remote access beyond the opt-in LAN pairing.
- HTTPS on the LAN (needed later for a PWA with offline support and push notifications).
- Graph, matrix and dashboard views.

## 16. Open decisions

1. ~~**Database schema**~~ **Resolved:** core columns (id, collection, state, title, timestamps, creator) plus one JSON `fields` column for every other preset field, validated by the core against the preset. Collections store the preset name and version; items store the `preset_version` they were written under. Preset changes never rewrite items; `otea validate` reports incompatibilities.
2. **Evidence in exports**: whether `otea export` copies media, references it, or leaves it out.
3. **i18n**: shell UI in English first, preset-provided labels in any language.
4. **Importers for the prototypes' formats**: whether they live in the public repo (as examples / fixtures) or stay private.
5. **ui-kit versioning policy** before accepting external module PRs.

## 17. Acceptance criteria (v1)

- An agent cannot perform a `human` action on its own authority, nor any `human-ui` action, via CLI or MCP (tests).
- A relayed decision is stored and displayed as relayed.
- A human-created item with missing required fields enters the incomplete state with the agent's turn; the agent can complete it or close it with a reason.
- A requested change opens a new iteration; previous iterations and verdicts remain visible.
- `blocked` returns blocked for an unapproved `taste` card, not blocked for `correctness`.
- The attention inbox shows waiting items from at least two linked projects in one app instance.
- Agents operate fully with the app closed and the project unlinked.
- The `tasks` preset is built without core changes.
- Works fully offline.
- Same flows work through MCP and through CLI only.
- A local module scaffolded with `module new` passes `module test` and loads without rebuilding the binary.
- `init` defaults to common storage and takes `--local`; both leave `git status` clean.
- Two worktrees of the same repo read and write the same data.
- Two agents claiming the same item concurrently: exactly one succeeds.
- With LAN access off, the server is not reachable from another device; with it on, only paired devices can act.
- `otea module add` warns and requires confirmation; imported modules are marked as unofficial.
- `otea export` produces a readable snapshot that round-trips the item and event data.
- Relaying a human decision is a separate command/tool from every other write.
- `init` is idempotent; `validate` runs non-interactively with meaningful exit codes.
