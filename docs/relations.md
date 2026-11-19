# Relations between items

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
- A step waits for what its board says: its blockers (`"waits": ["blockers"]`), every item that `blocks` this one, in any board, refused with exit 4 (`blockers_open`); or its parts (`"waits": ["parts"]`), the items it divides into on another board (see [Templates that make several boards](boards.md#templates-that-make-several-boards)), refused with exit 4 (`children_open`). Each refusal names what is still open, and the approval is checked again, so a part reopened during the review stops it. A part or blocker that is Done but whose protected branch is not merged yet (no `otea merged`, on a board with no land step) still holds it, so merges land in order: `otea next`, and `otea wait` when it wakes for the item, say to merge those parts first and name each one. `otea merged <id> --pr <url>` asks gh for the PR first: it refuses a PR that is not merged, or that merges another branch, and records the mark as given when gh cannot tell. Nothing ever moves an item for its parts or its blockers, and `otea show`'s `Next:` says what the handoff still waits for. While a step waits for parts or blockers still being worked on it is not agent work: `otea next` does not offer it and `otea wait --unclaimed` does not wake for it. One that waits only for Done parts to be merged is.
- The MCP server serves `link` and `unlink` as tools. In the web UI the relations show in the side of the detail and a parent's children in its body; a signed-in browser adds and removes links there (`POST /api/items/:id/link` and `/unlink`, `{kind, other}`, behind the same checks as moves) and creates children with **+ child**. In the list a parent shows how many children are still open, and children in the same section sit under their parent, foldable. With two collections or more the sidebar leads with **All work**: one tree across collections, where an item sits under its parent (same collection) and under whatever it blocks or implements, with `relates` counted on the row; an item's detail lists its links to other collections under **Across boards**.
