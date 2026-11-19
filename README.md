# Otea

¿Hablas español? Lee el [inicio rápido en español](README.es.md).

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

There is no download yet: Otea has not had its first release. Today you install it from source, which takes Git and Node.js 22.18 or later (Node 24 recommended):

```sh
git clone https://github.com/Lartweib/otea.git
cd otea
npm ci              # the CLI's dependencies
npm run build:ui    # the web UI that otea serve shows
npm link            # puts the otea command on your PATH
otea --version
```

`npm link` installs a real command, not an alias: a symlink in npm's global `bin` on macOS and Linux, and `otea.cmd`, `otea.ps1` and a shell script in npm's global folder on Windows. Every shell finds it, so an agent's own shell (Claude Code's, OpenCode's, a script's) runs `otea` the same as your terminal. Run `npm prefix -g` to see where it went; if `otea` is not found, add that folder (on macOS and Linux, its `bin`) to your PATH. To update, `git pull`, `npm ci` and `npm run build:ui` again; `npm unlink -g @otea/cli` takes the command away.

Then, in the folder you want to track:

```sh
otea init     # makes the project; it says what to do next
otea serve    # the desk, in your browser
```

and paste the text the desk offers into your agent's chat (`otea prompt` prints the same): the agent connects itself, reads the project and drafts its boards with you.

### On Windows, in Git Bash

Git Bash turns an argument that starts with `/` into a path (`/deploy` reaches Otea as `C:/Program Files/Git/deploy`). Otea undoes it for the text it is given (a title, a field, a note), so `otea create --title "/deploy fails"` keeps its slash. Anywhere else, set `MSYS_NO_PATHCONV=1` for that command, or start the value with `//`.

### The desktop app

The desktop app (in `desktop/`) carries its own CLI and needs no Node. Until it is released you build its installer from source: see [`desktop/README.md`](desktop/README.md). Installed, it puts `otea` on your PATH, opens a project at start (**Open folder** or **Create project**) and runs this computer's one `otea serve` itself, with no console.

## License

Otea is free software under the [GNU Affero General Public License v3.0](LICENSE). You can use, study, modify and share it. If you distribute a modified version, or let people use it over a network, you must publish its source under the same license, keeping the copyright notices.

**Commercial license.** If the AGPL does not fit your use (for example, embedding Otea in a closed product), a commercial license is available. Open an issue or contact [@Lartweib](https://github.com/Lartweib).

**Name.** "Otea" and its logo identify this project. Forks are welcome under the AGPL, but must use a different name.

Contributions are accepted under the [Contributor License Agreement](CLA.md); see [CONTRIBUTING.md](CONTRIBUTING.md).

## Docs

- [Working with agents](docs/working-with-agents.md): the commands agents run, leases, relaying a decision, waiting and events, the guide, profiles and stats, and what to paste into an agent's chat.
- [MCP](docs/mcp.md): working from an MCP client, `otea connect` and the tools.
- [Projects](docs/projects.md): where a project lives, the files Otea writes in the repo, linking several repos, and moving a local project to common storage.
- [Evidence](docs/evidence.md): attaching files as proof, and how the item page draws them.
- [Relations](docs/relations.md): parents, blockers and the other links between items.
- [Boards](docs/boards.md): templates, the Matrix, boards that divide into others, an agent drafting a board, archiving, and the moves and git gates of agents.
- [Topics](docs/topics.md): the side questions agents keep as short conversations.
- [The desk](docs/desk.md): `otea serve`, the web UI, and its API for agents at work and notes.
- [Several projects and a phone](docs/phone.md): one server for every project, the phone on the local network or Tailscale, and notifications.
- [Development](docs/development.md): tests, `npm run dev:ui` and the token budget.
