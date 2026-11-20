# The desk

## See it live

The web UI updates live as items change, and it is where you take the decisions agents cannot, such as approving a task in review.

```sh
npm run build:ui            # once, in the Otea checkout

cd /path/to/your/project
otea serve                  # Otea running at http://127.0.0.1:4400/p/<project id>/
```

`otea serve` opens your browser on the project's page, already signed in to act on items (the session lives in an HTTP-only cookie; the token in `ui-token` in the Otea home is never printed, except as below). Pass `--no-open` to skip the browser: `otea serve` then prints the sign-in link (`<url>/auth?token=…&next=/p/<id>/`) for you to open by hand, at a terminal and piped to a file or a log alike, so an agent that started the server in the background can relay it. The link holds this computer's Otea key: keep that output to yourself, and pass `--json` for output with no token in it. `otea serve` stops once the process that started it ends (the terminal closes, an agent's session ends), and says so on stderr: `serve stopped: the process that started it (<pid>) ended…`. Started in the background on purpose (PowerShell's `Start-Process`, `nohup`), pass `--no-owner` to keep it running on its own; stop it with Ctrl+C or by its process id. `otea open` signs a browser in to the running server on the project's page. A tab opened on the plain URL without signing in is read-only. One server serves every project of the computer: see [Several projects](phone.md#several-projects).

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

**Agents at work.** Otea notes each agent it sees: every agent command, from the CLI or the MCP server, records when that agent was last seen (to within 30 seconds, so a busy agent does not write on every call), and the harness it came through: the `clientInfo` name the MCP client sends in `initialize` (`claude-code`, say), or `cli` for an agent only seen at the command line. An MCP server notes an agent from its first call (a harness that only loads the server is no agent), and hears it again every minute while it stays open; `otea wait` does the same while it blocks: that agent is listening. `GET /api/agents` returns `{"agents":[{"name","harness","holding","lastSeen","live","listening"}]}`: `harness` is `null` when unknown (agents that wrote before presence was kept start from their last event), `holding` lists the ids of the items the agent holds a live lease on, `lastSeen` is an ISO time, `listening` is true when it was heard listening in the last 150 seconds, `actedAt` is when it last ran an agent command (`null` if never; a listener's beat is none), and `live` (connected) is true when it listens, ran a command in the last 150 seconds, or was seen in the last 90: a command-line agent between its commands, or between two items, shows as connected, never as listening, and drops out once it stops acting. A lease alone keeps no agent connected: after its session ends, the item says so (its holder's session ended, or it has been quiet for a while) until the lease runs out and it goes back to the queue. `sessionEnded` is true when every listener it was heard through (its MCP server, its `otea wait`) has ended; never for an agent heard through none. A listener whose process is gone (its MCP server, or its `otea wait` killed with its session) stops counting at once, and an agent that did nothing since is no longer connected, though a lease of its runs on. An MCP server hears again on its beat only the agents that called through it in the last 150 seconds, besides the session's own, so an ended subagent drops out. A subagent (named after another agent, then a role, as in `claude-haiku-hacer`; a number alone, as in `claude-2`, is another session) that let go of what it held with `otea release` and ran no command since has finished: 90 seconds after its release it is no longer connected, listening or waiting, though an `otea wait` it left running in its parent's shells still beats. `mcp` says how MCP stands for it: `missing` while it, or another agent of its harness, asked for MCP (`otea connect --as`) and that harness never loaded the server since (whatever name the agent took), `unused` once the harness loaded it (its client's `initialize`) while this agent works through the command line, `null` when nobody asked or it was heard through it; `mcpMissing` is `mcp === "missing"`. `folder` is the folder it was last seen working from. Live agents come first, then the most recently seen; the human is never listed. Besides `change`, `GET /api/stream` sends a `presence` event when an agent is seen anew, changes harness or takes or drops a lease; time running out (a listener gone quiet, a lease expiring) sends nothing, so the UI reads `lastSeen` and the leases for that.

**Notes while an agent works.** `POST /api/items/:id/notes` with `{"text", "anchor"?: {"evidence", "seconds"?}}` leaves a note from the person (allowed from a paired phone, as every move is) and answers `201` with the thread; it is refused unless an agent's step is being done (`invalid_transition`), without text (`reason_required`), or on evidence not attached to the item in this round (`invalid_fields`), each with `details.kind: "note"` and its `why`. `GET /api/items/:id/notes` reads the thread, every round's or, with `?step=<name or id>&round=<n>`, one round's (with only `round`, of the step the item stands on), as `{"item","notes","worker"}`: each note with its moment (`stepName`, `round`, `at`, `delivered: {done, of}`, `to`, `anchor`) and, once answered, `answer: {text, at, by}`; `worker` is the agent doing the step and `lastSeen`, its last sign of life (any call, a heartbeat included), so the page can warn that a note may go unread. `GET /api/items/:id` gives the same as `board.thread` and `board.worker`, and `GET /api/items` marks an item whose round has notes with `notes: {count, unanswered, replied?: {note, by, at}}`, so a list can say the agent answered without the turn changing.
