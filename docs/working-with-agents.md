# Working with agents

## Using it

With `otea` on your PATH (see [Install](../README.md#install)), run it inside the project you want to track:

```sh
cd /path/to/your/project
otea init                                  # a new project starts with no board: pick them here or in Studio
otea init --template changes               # Cambios, the changes you ask an agent for (templates below; none for no board)
otea board add Errores --template bug-reports   # another board, from a template, published at once (yours: no agent name)

# What an agent runs: every command that acts names the agent (--as, or OTEA_AGENT for the session)
otea whoami --harness claude-code          # a new session: the name it worked under here before, if any
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
otea list --sort order                     # on top first, then the order fixed on the Matrix (numbered over open items), then the other open items, closed ones last
otea wait --turn agent --unclaimed         # nothing to do: block until there is something, then otea next
otea check --gate push --branch --repo     # may this branch be pushed? exit 0 yes, 19 no (fails open)
unset OTEA_AGENT
otea list                                  # read without a name: list, show, events and board need none
otea show CAM-1                            # what to do next, fields, moves the agent can relay, lease, timeline
otea validate                              # check boards, collections and items

otea hook install --git --forge            # in a repo: a pre-push hook, and GitHub rules on the protected base
otea help                                  # every command, global options and exit codes
```

Agents claim an item before working it. A lease is atomic: while one agent holds an item, `otea claim`, `otea update` and `otea move` from any other agent fail with exit code 12 (`lease_held`), and `otea heartbeat` or `otea release` by someone who does not hold it fail with exit code 12 (`not_lease_holder`), saying who holds it. Any otea call of the holder keeps its live leases: one with less than half of it left is extended to a full lease from then. An expired lease reads as free and can be taken over, except while its holder's session runs (an MCP server or `otea wait` of it still runs), since the holder may be on a long step with no call, such as a rebase or a test run: then `otea claim` refuses it with exit 12 (`lease_held`), `otea next` does not offer it, and the person frees it on the desk (Liberar). Moving an item off the agent turn (for example to `review`) releases it automatically. On a published board a lease is for one step: every move (a handoff to the next step or to a review, an approval, a send-back) releases it, even when the next step is the agent's too, so it never blocks that step or reads as someone working there; an agent that goes on with the next step claims it again. While another agent holds an item, `otea show` and `otea next` for it say `Held by <agent> until 2026-11-12 10:04 UTC: pick another item.` instead of the agent's turn. Items nobody claimed stay writable, and the human in the web UI is never blocked by a lease. Every agent command acts as a named agent: `--as <name>`, or `$OTEA_AGENT`. Reading (`otea list`, `show`, `events`, `board`) needs no name: without one it reads as the person, and is not recorded as an agent. There is no default name: a command that acts, without one, fails with exit 2 (`unnamed_agent`) saying how to name yourself, and the name follows the rule below (exit 6, `invalid_agent_name`) wherever it is given. The name is the agent's identity, so each agent working at the same time uses its own; two agents under one name share every lease. Only items whose turn is the agent can be claimed (exit code 4, `not_claimable`, otherwise). An agent sets aside an item it holds, or one nobody holds since it let it go, as when the person wants it for later, with `otea release <id> --later` (a `released` event with `cause` `later`, read as `(set aside for later)`): `otea next` and `otea wait --unclaimed` then leave it out for every agent, as the person's wish, until the item moves, an agent claims it again, or the set-aside lifts: on its own once what the item waited for (its parts, what blocks it) closes, and whenever the person acts on it (a note, an answer, picking it in the Matrix order, «Poner arriba», or «Retomar» on its page, `POST /api/items/:id/resume`), each written as a `set_aside_lifted` event saying why (`/api/items` gives `setAside` with who set it aside, and when, until then). `otea next` with nothing to do names what is set aside and by whom, with the place of the first of them in the person's order. `--later` is refused with exit code 4 (`children_open`, `blockers_open`, `not_claimable` or `item_closed`) on an item that is not agent work right now, one that waits for its parts, what blocks it or the person, as `otea next` offers it again on its own once it is. It is also refused (exit 4, `invalid_transition`) while a note from the person on the item waits for an answer, giving the `otea reply`, and once the person took the item up again (their act lifted a set-aside) and it has not moved since: `otea next`, `otea show` and `otea wait` then say `The person took it up again (Retomar, <time>): do it now.`, and only the person's newer words, relayed with `otea release <id> --later --quote "<the person's words>"`, set it aside again. `otea wait` gives the person's unanswered notes on the item it wakes for in their words, with the reply. When `otea next` or `otea wait` offers an agent the item it let go of with a plain `otea release`, they add how to set it aside instead.

A lease that ran out without a release leaves its item stuck (**Atasco** in the web UI). There the person either puts it back in the queue of its step for any agent to claim (**Retomar**, `POST /api/items/:id/restart`) or leaves it for a named agent (**Reasignar**, `POST /api/items/:id/reassign` with `{"agent"}`). Both drop the lease that ran out and write a `released` event by the human with `cause` `restart` or `reassign` (and `next`, the agent it is left for); `otea show` reads them as `(back in the queue)` and `(left for <agent>)`. The agent named is expected, not enforced: any agent may still claim the item, but `otea next` offers it only to that agent, and `otea show` tells any other `Left for <agent>: pick another item.` (and that agent `The person left it for you.`) until an agent claims or moves it. An item whose lease is still running, or that has none, is refused (409, `not_stuck`). While its toast is up, `POST /api/items/:id/undo` with `{"release": true}` gives the lease back as it was (with `{"from"}` it takes back a move, as before); like moves, these writes need the session, JSON and the server's own origin.

`otea update` changes fields of an open item (a blank value clears an optional field) and records the old and new values in the timeline; items in a closed state (turn `none`) cannot be updated. A long or multi-line value comes from a file with `--field-file "<name>=<file>"`, or from stdin with `<name>=-` (`otea create` takes it too); a UTF-8 BOM and the line break that ends the file are left out. `--description` fills the board's description field where it has one (Descripción on Errores); a board without one (Cambios) refuses it. Agents act through the CLI, so it only makes the moves a board gives agents. Approving a step the person reviews (`Hacerlo (en revisión)` -> `Integrar` on Encargos; a review reads in the board's language, and `(in review)` is accepted too) is the person's, in the web UI: `otea approve`, `otea move` and `otea relay` refuse it with exit code 7 (`forbidden`).

A board is named in any case wherever a command takes one (`--collection encargos` is Encargos, and so is `otea board encargos`), as its steps and fields are in `otea list --state/--field`: board names are unique whatever their case.

## Relaying a decision made in conversation

The person's decisions on a board, such as sending a step they review back or dropping an item, can also be made by an agent relaying what the person decided in the conversation. That is a separate command, so a harness can ask the human to confirm every call:

```sh
otea relay TAR-3 Dropped --quote "Drop it, billing moves to the vendor" --reason "Billing moves to the vendor" --as claude
```

- The move is recorded as the human's (`actor: human`) with `via: <agent>`, `source: conversation` and the quote, and `otea show` (and `--json`) and the UI timeline always mark it as relayed (`human, relayed by claude`), never as a UI decision.
- `--quote` is required and cannot be blank (exit 2, `quote_required`). When the transition requires a reason, `--reason` is required too (exit 2, `reason_required`): the quote is evidence of the approval, the reason is the same field the UI records, and a quote such as "yes" explains nothing.
- An approval cannot be relayed: exit 7 (`forbidden`), the person approves in the web UI. Moves an agent may make itself are refused with exit 4 (`not_relayable`): use `otea handoff` or `otea drop`. Unknown items and undeclared moves fail as usual (exit 3, exit 4).
- An agent never relays a decision on its own work: once it has done the item's step in the current round (handed it off, or, while the step was being done, claimed the item, attached evidence or changed its fields, even if another agent handed it off; off a board, once it made the move that brought the item where it is), every relay of it by that agent exits 7 (`forbidden`, details `own_step`); the person decides in the web UI.
- A relayed decision is the human's, so like a move in the UI it is not blocked by another agent's lease; moving off the agent turn releases that lease as usual (the release is marked as relayed too).

## Waiting for work and following events

An agent does not have to poll `otea list`: `otea wait` blocks until there is work, and `otea events` reads what happened. Both work across processes without `otea serve`.

```sh
otea wait --turn agent --unclaimed --timeout 15m --json   # then: otea claim <id>
otea events --since 42 --json                              # events after id 42, one JSON object per line
otea events --item TAR-1 --follow                          # keep printing new events until Ctrl+C
```

- `otea wait --turn agent|human` returns at once when an item is already on that turn, otherwise as soon as one gets there. It prints the item as a row of `otea list` (with `--json`, one object shaped like an entry of `otea list --json`). When several match, it prints the one that has waited longest: the first to enter its current state (field updates and leases do not reset it), ties going to the first created.
- `--collection` narrows it and `--unclaimed` skips items another agent holds, as in `otea list`; a lease that expires frees its item for the wait without anything being written. `wait` only reads: claim the item afterwards with `otea claim`, and if that fails with exit 12 because another agent got there first, wait again.
- `--timeout <duration>` (`90s`, `15m`, `1h`) gives up with exit 13 (`timeout`); without it, `wait` waits until interrupted (exit 130, `interrupted`). An agent stops its own wait by ending the shell that runs it or with `--timeout`, never by killing processes by name or pattern, which can stop another agent's.
- Only a running wait hears the desk: the person's approvals, answers and notes reach an agent that is in `otea wait`, and `otea next` with nothing to do says so. Over MCP its last line gives the wait first as a background shell line, which keeps the chat free, and the `wait` tool second, since it holds the chat until it returns. The guide tells an agent to go back to waiting after it answers the person in the chat.
- A harness that runs its sessions in a background service (OpenCode's, for one) can keep an agent's background `otea wait` alive after you close the harness's window: when the wait returns, the service resumes the session and the agent works on with no window open. End the session in the harness, or that wait, before you close the window.
- Every text of the CLI and the MCP tools says a time one way, as its UTC day and minute: `2026-11-12 10:04 UTC` (a lease, an event, a refusal). `--json` keeps the full ISO timestamp.
- `otea events` prints the event log in commit order, filtered by `--item` and `--collection`. Each event has an id; pass the last one you read to `--since` to get only newer ones. `--limit <n>` alone reads the latest n; after `--since` it reads the first n after it. With `--json` each line is an event shaped like the ones in `otea show --json` (`id`, `itemId`, `type`, `actor`, `at`, `data`). On a board, whose steps and fields are stored under hidden ids, the text names them, and `--json` gives each id its name beside it (`stateName`, `fromName` and `toName`, `moduleName`, and a `name` on each field change). Items read the same way in `--json` and MCP: `stateName` beside `state`, `fields` as a list of `{ id, name, value }` (a choice also has its `label`), and each move's `toName`; the ids stay the keys a program sends back. `--follow` keeps printing new events as any process commits them, until Ctrl+C (exit 0); it cannot be combined with `--limit`.

## Telling agents what to do

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

## The profile an agent runs as

Every agent, and every subagent, declares the profile it runs as: its harness, its model and its effort. It is kept on everything the agent does, so rounds and send-backs can be compared by model and effort afterwards; it never decides who gets which work.

```sh
otea profile --model claude-opus-5-5 --effort high --harness claude-code   # the first time on the command line
otea profile --effort max                                                  # one value changed: the rest stays
otea profile                                                               # what is on record (--json too)
```

- `--model` is the exact model id and `--effort` the effort, both as the harness names them, stored as given (one word each, at most 100 characters; else exit 2, `invalid_profile`). There is no translation between vendors: `--json` adds a `family` that groups model ids (`opus`, `sonnet`, `haiku`, `gpt-5`, `o3`, `gemini-pro`, ...; an id it does not know is its own family).
- Declare what this session tells you (your instructions, or what the person says); never open config files outside the project for it. Otherwise declare `unknown` (`--model unknown`, `--effort unknown`, any case; stored as `unknown`). Never guess. It still makes a profile, and `otea stats` and Rendimiento keep it as its own group, never inside a family, after the declared rows (shown as "not declared"). The harness takes no `unknown`: an agent always knows the tool it runs in.
- The harness comes from the MCP client: the `profile` tool takes `model` and `effort`, and the client's name in its initialize (`clientInfo`) is the harness. A command-line agent names it with `--harness` the first time; it is kept after that.
- `otea claim` refuses an agent with no profile, and `otea next` one with no profile or one not declared in this session, with exit 2 (`profile_required`) and the exact command that declares it. A session starts when an MCP client initializes the server, at the first call of each agent name on that server, and, on the command line, when an agent comes back after an hour unseen: until it declares its profile again, the profile stands unconfirmed.
- Every `otea next` ends with `Your profile: <model> · <effort>. If you changed model or effort, update it: otea profile …`, and `--json` carries it as `profile`.
- Every event an agent writes keeps the profile it had then (`profile` on each event in `otea events --json`, and in the web server's events; the person's events have none, and a relayed decision keeps the relaying agent's). The profile a round counts is the one on its handoff. Each change of profile is kept too, in its own append-only history.

How each model performs, from those profiles: `otea stats` prints one row per model family and effort (the exact models and each board's steps under it) with its handoffs, how many came back for another round (sent back), the rounds a finished step took on average, the items done it handed off part of, the items discarded after its last handoff, and the median time from claim to handoff. A finished step counts for the profile on its last handoff; steps the person did and agents with no profile are left out. `--since 7d` (or `30d`, `12h`, `all`, the default) keeps a period and `--board <name>` one board; `--json` gives the same numbers. The web page shows them in Rendimiento (Performance), reached from the agents menu and the rail. The profiles are as the agents declare them: Otea does not check them.

```sh
otea stats --since 30d                                     # per model family and effort, last 30 days
otea stats --board Errores --json                          # one board, as JSON
```

## What to paste into an agent's chat

`otea prompt` prints what the person pastes into an agent's chat, the same text the UI copies (**Conectar un agente** and the empty project page), in Spanish or with `--lang en`:

- `start`, the first contact on a new project: set it up (`otea init`, no template) and connect (`otea connect` with the agent's own name, model and effort), read the project (README, code, git history, CLAUDE.md or AGENTS.md, CI; in a folder that is no git repository, what is in it, with no git words), ask the person one question at a time how they want to work, draft the boards with `otea board draft --new … --why … --template <key>`, say where to review them and to try them with a first item, and then keep working.
- `join`, one more agent on a project that has boards: pick a name none of the listening agents has (they are named), connect (`otea connect`, which writes nothing that names it) and put the name on every command, declare its profile, read the guide and the boards, written from the project as it is now (each board's agent steps and how many items wait for an agent), and work the queue (`otea next --claim`, hand off, `otea wait`), never taking an item another agent holds and never designing boards.
- `design`, one more board on a project that already has some.

Without one, it gives `start` until the project has a board of its own (or where there is no project yet), then `join`. `GET /api/agent-prompt?kind=&lang=` answers the same for the UI.
