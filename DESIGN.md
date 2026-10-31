# Design

The visual system of the Otea web UI, called **Lanes**. [`PRODUCT.md`](PRODUCT.md) says who it is for and how it should feel; this file says how it is built. The source of truth in code is [`ui/src/styles/tokens.css`](ui/src/styles/tokens.css) and the primitives in [`ui/src/kit/`](ui/src/kit/).

## The idea

Two vertical lanes run down every list: the **agent lane** on the left, **your lane** on the right. Every item is a node sitting on the lane of whoever has the turn. Closed items sink to the bottom, where both lanes fuse into one **trunk**. Whose turn it is can be read before any text.

## Color means you

- The accent `--you` (default `#3B5BFF`) belongs only to things that are yours: your-turn nodes, your lane, the one primary button, open questions for you, focus rings. Never decoration.
- Text set in your color uses `--you-ink`, deepened on light and lifted on dark so it stays above 4.5:1.
- Severity level 4 uses `--warn`, never the accent.
- Neutrals carry a trace of the accent hue (OKLCH, hue 265). Light mode is never white, dark mode is never black.
- Body text is at least 4.5:1 on every surface in both themes. Closed rows recede to `--mut`, not to the lighter `--closed` grey, which is for glyphs only.
- Turn and state are never conveyed by color alone: the node shape and a text label always go with it.

## Tokens

| Token | Use |
| --- | --- |
| `--bg` | ground, with the dotted pattern |
| `--sf` | raised panels, controls |
| `--well` | evidence, inset boxes |
| `--hov`, `--sel` | row hover and selection |
| `--ink`, `--mut` | text, agent marks; secondary text |
| `--lane`, `--line` | lanes and graph; hairlines |
| `--chip`, `--off` | pill fill; unlit severity bars |
| `--closed` | done and discarded glyphs |
| `--warn`, `--plus`, `--minus` | severity 4; diff added and removed |
| `--you`, `--on-you`, `--you-ink` | your color; text on it; text in it |

Themes: light and dark follow the system by default. The topbar toggle cycles system, light and dark; the choice is stored in `localStorage` (failures fall back to system) and applied as `data-theme` on `<html>`.

## Ground and surfaces

- **Ground**: `--bg` with a dotted 24px pattern (`radial-gradient` of `--pat`) on the page.
- **Raised** (`.raised`): `--sf` with a 1px `--line` ring, radius 8px. Panels such as the module catalog. The item detail is not raised: it sits on the ground, apart from the list by a hairline.
- **Well** (`.well`): `--well`, for evidence and inset notes.

## Type

Both fonts are bundled with the UI (`@fontsource`, OFL), so the UI works offline.

- **Schibsted Grotesk** (400/500/600/700) for what people write and read.
- **Spline Sans Mono** (400/500/600) for what machines write: ids, states, times, files, labels.

| Class | Spec |
| --- | --- |
| `t-display` | 28/700, -0.025em, balanced |
| `t-h` | 17/600 |
| `t-body` | 15/1.6 |
| `t-ui` | 14/500 |
| `t-small` | 13, muted |
| `t-id` | mono 12.5, muted |
| `t-cap` | mono 12, muted |
| `t-label` | mono 11.5/500, muted |

## Node language

One circle; its state lives in fill, stroke and mark.

| Kind | Shape |
| --- | --- |
| your turn | solid, in your color |
| agent working | ring plus an orbiting arc (the only thing that keeps moving) |
| agent queued | still ring |
| incomplete | dashed ring |
| done | filled grey plus check |
| discarded | hollow grey plus slash |

How an item maps to a kind (`ui/src/node-kind.ts`): turn `human` is yours; turn `agent` is working while a lease is held, incomplete when the item sits in its type's `incomplete` state, queued otherwise; turn `none` is done or discarded as the preset declares for the item's state (`closes: done` or `closes: discarded`, sent as the item's `closes`), whatever the state is called. The same `closes` on a move keeps a discarding move quiet (`moveVariants`).

## Lanes

Geometry lives in `ui/src/lanes.ts` (tested). The list gutter is 56px: agent lane at x=16, your lane at x=40, trunk at x=28. Open sections come first and closed items last, most recently closed on top. Each lane runs straight down to the last open row, then curves into the trunk at the first closed row of the Closed group (`M x 0 V lastOpen C x mid 28 mid 28 firstClosed`), so the lanes never end in a broken Y; with nothing closed they meet at the bottom. A closed child shown under an open parent sits on x=28, between the lanes, which run on past it. Your lane is drawn in your color at 42% opacity.

**One line language.** The rail is the signature, so it is the only line that moves between lanes. Everything else borrows its 1.5px stroke, its lane grey and its node shapes and stays still: the history is one straight lane, children are a list and a bar. Nodes come in three scales: 12px in the rail, 10px for a child, 8px in the history.

**Rows** read in three levels:

| Level | Spec |
| --- | --- |
| group header | 14/500 `--mut`, sentence case, its count in mono 12 (`--you-ink` only for *Waiting for you*), a hairline carrying it across; 60px tall (34px for the first), so groups get room above them |
| title | 15/600 `--ink` with the type icon (16px) before it, the field modules' row marks at the end of the line |
| meta | mono 12 `--mut` under the title: id · state · age (or who holds it and until when), and for a parent its segmented bar and `N of M open` behind a hairline |

A row is 66px with its node on the title line (y=24). The content starts at x=68 and the row highlight at x=58. The title is the row's link, stretched over the whole row, so the parent reference on the meta line can be a link of its own.

**Branches.** A child in the same group as its parent sits right under it, one line and one size smaller (44px, 14/500, a 10px node, its id and state at the end of the line), stepped in 20px a level; its node stays on its own lane. The parent's branch (`layoutBranches`, tested) leaves the bottom of its node, bends once with the lanes' S-curve into a sub-lane of its own at x=52 (right of your lane, left of the highlight), drops beside the children and turns into each child's icon column with an 8px elbow, ending 8px before the icon. It never comes near the parent's icon, title or highlight. A deeper level drops from the bottom of its parent row, 20px further right. The branch takes the color of the parent's lane.

## Workspace

The items view is the **Split** composition: three columns in one grid (`.workspace`, `ui/src/styles/workspace.css`).

| Column | Content |
| --- | --- |
| rail (13.75rem, from 64rem) | collections from `/api/collections`, plus "all items"; each shows what waits for you / what is still open (`railEntries` in `ui/src/workspace.ts`). Choosing one filters the list; the filter is local state. |
| list | list head (collection name, `j k to move · f to expand`), then the lanes list; it takes the rest of the width |
| detail | the selected item, the intake form, or a hint: a reading column of 39rem (624px) with 40px margins, `min(44rem, 54%)` wide, on the ground, apart from the list by a 1px `--line` hairline |

The rail keeps its grid track even when it is hidden (below 64rem it is 0 wide), so the list and detail never change tracks and the columns can animate. Below 48rem the workspace is the phone layout (see Phone). Routes: `#<id>` selects an item, `#/modules` opens the catalog, `#/triage` opens swipe triage.

The detail is a **margin index**. The header holds the node, the id, the state pill and whose turn it is, with the type icon and its name at the end of the row (`epic`; a preset without types is named after itself), then the title (30/700) and the moves. Below it, each section is named in a 96px left margin (14/600) above a hairline, its content in the reading column beside it (above it on a phone or in a pane narrower than 34rem):

| Section | Content |
| --- | --- |
| Brief | the `header` slot, then the `evidence` and `body` slots in their order; the `description` leads as plain text without a label, the other fields follow as a field list |
| Structure | the `children` and `relations` modules, wherever the layout places them (see Relations); absent when the layout places neither |
| Details | the rest of the `side` slot, then collection, created by (who and when), lease and updated |
| History | the timeline |

What the detail shows follows the item type's layout (`detailBlocks` in `ui/src/item-types.ts`, tested). The evidence list (every attached file) sits at the first evidence module (`images`, `recording`, `diff`, `log`), or after the fields when the layout places none. Reserved modules draw nothing yet. Values whose field the type does not declare still show, as plain text, at the end of the body. A type without a layout draws as before layouts: every field in the body. The list row draws the `row` slot, and the create form asks for the `intake` slot's fields, with a **Type** select after the collection when the collection has several types.

### Focus mode

A quiet 28px icon button at the end of the detail header row (icon 14px, stroke 1.25), tooltip `Expand · f` / `Collapse · esc`. Its four corners are one path whose `d` transitions between the two shapes (same commands in both), so the corners slide out to expand and in to collapse. Hidden below 48rem.

Turning it on, over `--travel` with `--e-move`:

- The grid columns animate from `rail 1fr min(44rem, 54%)` to `0 1fr min(60rem, 72%)` (equal track count, so Chrome interpolates them). The rail fades out in 220ms; coming back it waits 380ms so it never shows clipped.
- Rows shed their meta line and field marks (opacity first, then the row's second grid row closes), leaving node and title.
- The title grows from 30px to 32px; the detail stays a reading column.

State lives in React state, not the hash: focus is a way of looking, not a place, so links and history keep pointing at items and Back never toggles it.

### Keys

Pure logic in `ui/src/keys.ts` (tested): `f` toggles focus, `Escape` leaves it, `j` and `k` move the selection in list order (stopping at both ends; from nothing they start at the top) and keep the row in view. Keys are ignored while typing in an input, text area, select or editable element, and while Ctrl, Meta or Alt is held. Keys are only bound on the items view.

## Timeline

The history in the detail (`ui/src/components/Timeline.tsx`) is the item's past, newest first, on **one straight lane** in lane grey: it never swings between lanes. A dot (8px) per event says who acted: filled in your color when a human did, ink when an agent did. A decision the human made in conversation and an agent relayed (`otea relay`; the event carries `via`) is a **ring** in your color, never the filled dot of a decision made in the UI; its label reads `human, relayed by <agent>` instead of `human (ui)`, and the quote of what the human said follows on its own line, in quotation marks (`relayOf` in `ui/src/format.ts`, tested). The time is mono (`14:02` today, `28 Oct, 12:31` before; `momentLabel`). The lane is drawn in CSS, so an event that wraps keeps its dot on its first line. Events that arrive while the item is open fade in from 8px above (`--arrive`).

## Controls

- **Buttons** are pills: `Button` with `primary`, `quiet`, `sm` and `icon`. One primary per screen, always the move that hands the turn on (`moveVariants` in `ui/src/actions.ts`); moves that throw work away are quiet.
- **Pills** (`Pill`): mono tags; `ask` for an open question for you, `state` for a workflow state (tinted in your color when it waits for you); `size="sm"` inside a list row.
- **Type tag** (`TypeTag`): the item type's short name (`bug`, `impr`), mono 10.5/500 in `--mut`, in a square box (2px radius, 1px `--line` ring), so it never reads as a pill or a state; never in your color. Shown first in a row's meta line, in the detail and the triage card tags, only when the item's collection has two or more types and the type has no icon (the icon marks it then); the label (`Improvement`) is its tooltip.
- **Type icons** (`TypeIcon`, `ui/src/icons/`): the icon a preset gives a type (`icon: bug`), drawn by Otea on a 24 grid with a 1.5px non-scaling stroke, round caps and joins, current color; a plain circle is never the silhouette (a circle is a turn node). 96 icons in six groups (work, code, design and media, docs and talk, game and creatures, status and flow). The names come from the core (`ICON_NAMES` in `src/core/icons.ts`) and the catalog is keyed by them, so a name without a drawing fails the UI typecheck. 16px before a row's title, 14px in a child row, a children or relations row and the detail header. No icon means no icon, and a name the UI does not know draws nothing.
- **Severity** (`Severity`): four signal bars; level 4 in `--warn`.
- **Kbd** (`Kbd`): keyboard hints inside buttons.
- **Icons** (`Icon`): the interface's own, thin (stroke 1.25), 16px, current color. No emoji.
- **Tooltips** (`.tip` with `data-tip`): ink on surface, mono 11.5, below and right-aligned; on hover after 350ms and on keyboard focus.
- **Fields**: inputs are pills on the surface, text areas round to 8px; labels are `t-label`.
- Touch targets grow to 40px on coarse pointers.

## Field modules

Every preset field names a module (`text`, `markdown`, `enum`, `severity`). The UI draws each value through a registry in [`ui/src/modules/`](ui/src/modules/): one file per module plus `registry.ts`, so no component switches on module names. The names come from the core preset format (`FIELD_MODULES` in `src/core/preset.ts`, imported type-only), and the registry is keyed by them, so a module added to the format fails the UI typecheck until it is drawn.

A module (`FieldModuleUi` in `ui/src/modules/contract.ts`) declares:

| Part | Use |
| --- | --- |
| `name`, `summary`, `origin` | what it is; `official`, or `local` for `.otea/modules/` (not loaded yet; shown as unofficial, at your own risk) |
| `Row` | optional: what it adds to a list row, after the title |
| `Detail` | the value in the item detail |
| `Edit` | the intake control; the caller owns the label and the hint |
| `samples`, `yaml` | example fields and values for the catalog, and how a preset declares it |

| Module | Row | Detail | Edit |
| --- | --- | --- | --- |
| `text` | nothing (the list draws the title) | plain text | text input |
| `markdown` | nothing | rendered Markdown | text area |
| `enum` | a small pill, only off its default | pill | select (a blank choice only without a default) |
| `severity` | signal bars, at every level (they recede with a closed row) | bars and the level name | select of the four levels, least severe first |

Rules:

- Modules are built only from the kit primitives and tokens.
- A module name the UI does not know (a newer server, a local module) shows and edits as plain text. It never crashes the UI.
- Markdown renders with `micromark`, safe by default: raw HTML is shown as text and links with a dangerous protocol lose their href. Never enable its dangerous options. Headings use the human font at 15-17px, lists hang from muted markers, code and code blocks are Spline Sans Mono on `--well`, links are `--you-ink`.
- A row stays calm: an enum at its default puts nothing in the row. Severity is the exception, since a list of bugs is read by it: its bars always show, and only `critical` (level 4) is drawn in `--warn`.

### Catalog

`#/modules` opens the catalog in the two panes: the index of modules on the left, and on the right an overview of the loaded presets and which module each field picks. `#/modules/<name>` shows one module: its origin, a live preview of every sample in the row, the detail and the edit control (the edit control drives that sample's row and detail, locally; nothing is saved), the preset fields that use it (from `GET /api/presets`) and its `preset.yaml` snippet. Modules that presets name but the UI does not know are listed apart, as "unknown module · renders as plain text". Routes are parsed by `routeFromHash` in `ui/src/selection.ts`; item ids never start with a slash, so `#<item-id>` keeps working.

## Relations

Relation modules (`ui/src/components/relations/`, logic in `ui/src/relations.ts` and `ui/src/nesting.ts`, tested) draw an item's links with the list's own marks.

- **One row** for children and relations alike: the node (the same node kinds as the list), the id in mono, the type icon and title, and the state (with who holds it while an agent works on it); it links to the item, a closed one recedes to `--mut` and a discarded one is struck through. On a phone the id drops.
- **relations**: headed `3 relations` with **link** at the end, then one group per kind, read from the item (`parent`, `children`, `blocks`, `blocked by`, `duplicates`, `duplicated by`, `implements`, `implemented by`, `related`): the kind in mono in an 84px column, its rows beside it. Children are left to a `children` module when the layout has one. A signed-in browser removes a link with the quiet cross that shows on hover (always on touch screens), and adds one with **link**: a well with the kind (phrased from the item: "is blocked by") and a search by id or title. Nothing is in your color but your-turn nodes.
- **children**: a list, not a graph. Headed `4 children` with **+ child** at the end, then a segmented bar (`ChildBar`): one segment per child, colored like its node (yours in your color, an agent at work in ink, a queued or incomplete one an outline, done in the closed grey, discarded hatched), closed first, then yours, then the agents', so it fills from the left as children close (`childSegments` in `ui/src/relations.ts`, tested). A legend counts them (`1 yours · 2 with agents · 1 closed`), and each child follows as a row. **+ child** opens the create form with the parent set and its collection chosen (any other can be picked, and the parent dropped).
- **Waiting for children**: a move whose target state declares `close_requires: children_closed` (the move's `closeRequires`) is drawn disabled while the item's children summary has open children, never primary (the next eligible move takes it, or none), with a quiet mono note beside it (`3 children open`, `moveBlock` in `ui/src/actions.ts`). The same holds in the phone's sticky moves bar and on triage cards, where it sits under the swipe buttons and is never swiped. The server refuses the move anyway.
- **Empty**: with nothing to show, a module says so (`No children`, `No relations`) beside its action for a browser that can write; a read-only browser sees nothing.
- **List** (`nestSections` in `ui/src/nesting.ts`, tested): a parent's meta line always shows its segmented bar and `N of M open`, whatever its group. A child is nested under its parent (the branch, the step in) only when it falls in the same group. A child in another group (waiting for you while its parent is with agents) is a row of its own in its own group, with a muted reference to its parent at the end of its meta line (`↑ CRE-40 Create wolf`) that selects the parent: nothing waiting for you folds out of sight. A closed child whose siblings are still open stays under *Closed*, with the reference. A parent still open whose children are all closed (it typically comes back to you for review) takes them under it, folded by default so the row stays compact; unfolded, they sit between the lanes with their closed look. A parent with nested children gets a fold control at the end of its title line (a chevron, and the count when folded). Folds are per viewer, in `localStorage`: the parents folded (`otea.collapsed`) and the settled parents unfolded (`otea.expanded`); failures are ignored. Section counts are the items of their own turn, shown or folded.

## Motion

One gesture for every change: lift, carry, set down.

| Token | Value | Use |
| --- | --- | --- |
| `--travel` + `--e-move` | 680ms `cubic-bezier(.65,0,.35,1)` | carry: a node or lane changing place, focus mode columns |
| `--arrive` + `--e-out` | 520ms `cubic-bezier(.22,1,.36,1)` | arrive, morph |
| make room | 600ms `--e-out`, 90ms after | rows that shift to make room |
| ripple | 760ms `--e-out`, 560ms after | the halo when an item reaches your lane |
| `--micro` | 160ms | hover, press |

`TIMING` in `ui/src/motion.ts` mirrors these for animations started from script.

### Turn change

When an item changes turn, from a move in the UI or a change from the CLI that arrives over the live stream, the list animates the difference (FLIP), without a dependency:

1. `Carry` (`ui/src/components/Carry.tsx`) wraps the list body. In `getSnapshotBeforeUpdate`, the one React hook that reads the DOM before it changes, it records where every `[data-flip]` block sits (rows, section headings, "Nothing here."), each row's turn and lane, and its node's look (fill, stroke, dash) and text color.
2. After the update it measures again and `planMotion` (`ui/src/motion.ts`, tested) decides: a row whose turn changed is **carried** (or **closed** into the trunk, or **reopened**); any other block that shifted **makes room**; a new block **enters**. Changing the collection filter is a new list, not a motion.
3. The carried row travels from its old place (Web Animations `translateY`, `--travel`) while its node is carried across to the new lane (`translateX`) and lifted: up 8px and 118% at 42%, set down slightly under size at 84%. The row rides on a raised surface (`--sf`, shadow) above the others; arriving on your lane it is tinted in your color from 380ms and a halo ripples out from 560ms. A carry between lanes leaves a ghost ring that fades where it left.
4. A row that changes section is a new element, so its old look is played back into the new one: the node keeps its old fill until a third of the way, takes the new one by 81%, and the check or slash draws in after 560ms; the text recedes over 420ms; a discarded title's strike is drawn in.
5. Everything else slides from its old place (make room). The lanes reshape with a `d` transition over `--travel`.

Interrupted mid-flight, a row starts again from where it is on screen. Decorations are CSS keyframes switched on by `data-motion` and cleared after 1.5s.

Nothing blinks; only an agent at work keeps moving. Every animation has a `prefers-reduced-motion` fallback: transitions collapse to 1ms, the orbit stands still (the arc stays visible), focus mode switches at once, and a turn change does not travel: what changed crossfades in place (200ms) and the rest is already where it belongs.

## Phone

Below 48rem the workspace is one column (`ui/src/styles/phone.css`), the phone take on the **Unfold** composition.

- **Topbar** keeps brand, connection dot, Modules, theme and New item as 44px icon buttons; their words stay for screen readers (the connection label too).
- **Collections** become a row of 44px pills that scrolls sideways; the chosen one is filled with `--ink`.
- **Rows** keep what a line holds: a parent says `3 open` without its age, a child shows its state alone.
- **Unfold**: tapping a row opens its detail in place, under the row and beside the lanes (60px in, right of the branch sub-lane), which keep running through it (an unfolded row's block grows by the detail's height, and its node stays at the head: `node` in `layoutLanes`). There is no detail pane and no "select an item" card; the row is the header, so the detail drops its title. The rows below make room as the detail grows over `--arrive` (the box follows its content as it loads), and the row is scrolled to the top. Tapping the row again, or Back, folds it (the hash goes back to the list); choosing another row moves the detail there at once. The moves sit in a bar sticky to the bottom of the screen while the detail is on it, the one primary among them. A move made there folds the item and the row carries itself home (the turn-change motion). A detail belongs to the row on the turn it had when it opened (`ui/src/unfold.ts`, tested): if the row changes hands it moves to another section, and the detail is dropped rather than reopened there; a tap opens it again.
- **Intake** opens above the list.

### Swipe triage

`#/triage`, entered from a quiet **Triage** control at the end of the *Waiting for you* heading (only when something waits and the browser can act). It works on desktop too (one centred column), with the mouse.

One card per item on your turn, in list order, the next ones stacked behind (at most two). The rule lives in `ui/src/triage.ts` (tested):

- **Right** is the primary move: the same one the primary button gets (`moveVariants`).
- **Left** sends the item back: the first other move whose target state is an agent's turn (each move the API returns says the turn it hands the item to). If that move requires a reason, the swipe opens the reason form on the card and moves nothing; Confirm makes the move. A gesture never performs a move that requires a reason.
- A direction with no move snaps back. Buttons below the card do the same as the swipes (back, Skip, primary), for accessibility and for the mouse.
- A drag starts after 10px of mostly sideways motion (vertical motion scrolls the page: `touch-action: pan-y`). It commits past a third of the card's width (kept between 80 and 160px), or on a flick of at least 0.5px/ms over 40px in the same direction; otherwise the card settles back over `--arrive`. While it is dragged, the card tilts with the pull and a stamp names the move on the side it leans from; the cards behind rise with the pull.
- A committed card leaves to its side over `--arrive` while the move is posted; if the move fails it comes back with the error. The next card arrives from just behind.
- The end of the stack lists what was decided and skipped, with a way back to the list and to see the skipped again. Back, or **List**, leaves triage.

Reduced motion: the unfold is instant, the card does not travel while dragged, and cards crossfade.

## Bans

Side-stripe borders, gradient text, glassmorphism, hero-metric templates (big number, small label, stats), identical card grids, uppercase tracked eyebrows over every section, numbered section markers, cream or sand backgrounds, emoji icons.

## Layering

1. **Primitives** in `ui/src/kit/`: small, presentational, no data fetching. Done.
2. **Field and evidence modules**: the field module registry and its catalog are done (see Field modules). Evidence kinds (gif, mp4, png, diff, log, before/after compare) and loading local modules come next, on the same registry.
3. **Shells**: the workspace (Split with collections rail, focus mode, keys), the lanes timeline and the turn-change motion are done. The phone layout (Unfold and swipe triage) is done. Evidence-led review views come next.
