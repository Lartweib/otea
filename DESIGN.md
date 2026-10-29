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
- **Raised** (`.raised`): `--sf` with a 1px `--line` ring, radius 8px. Panels such as the item detail.
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

How an item maps to a kind (`ui/src/node-kind.ts`): turn `human` is yours; turn `agent` is working while a lease is held, incomplete when the item sits in its collection's `incomplete` state, queued otherwise; turn `none` is discarded when the state name reads as thrown away (`discard`, `cancel`, `reject`, `drop`, `wont`, `duplicate`, `obsolete`, `abandon`) and done otherwise. Presets do not mark closed states as success or failure, so the name is the only signal today.

## Lanes

Geometry lives in `ui/src/lanes.ts` (tested). The list gutter is 56px: agent lane at x=16, your lane at x=40, trunk at x=28. Rows are 56px. Open sections come first and closed items last, most recently closed on top. Each lane runs straight down to the last open row, then curves into the trunk at the first closed row (`M x 0 V lastOpen C x mid 28 mid 28 firstClosed`), so the lanes never end in a broken Y; with nothing closed they meet at the bottom. Your lane is drawn in your color at 42% opacity.

## Workspace

The items view is the **Split** composition: three columns in one grid (`.workspace`, `ui/src/styles/workspace.css`).

| Column | Content |
| --- | --- |
| rail (13.75rem, from 64rem) | collections from `/api/collections`, plus "all items"; each shows what waits for you / what is still open (`railEntries` in `ui/src/workspace.ts`). Choosing one filters the list; the filter is local state. |
| list | list head (collection name, `j k to move · f to expand`), then the lanes list |
| detail | the selected item, the intake form, or a hint |

The rail keeps its grid track even when it is hidden (below 64rem it is 0 wide), so the list and detail never change tracks and the columns can animate. Below 48rem the workspace is the phone layout (see Phone). Routes: `#<id>` selects an item, `#/modules` opens the catalog, `#/triage` opens swipe triage.

The detail has two parts: the **primary** column (head, moves, missing fields, field values) and the **side** (collection, creator, lease, history). Stacked by default.

### Focus mode

A quiet 28px icon button at the end of the detail header row (icon 14px, stroke 1.25), tooltip `Expand · f` / `Collapse · esc`. Its four corners are one path whose `d` transitions between the two shapes (same commands in both), so the corners slide out to expand and in to collapse. Hidden below 48rem.

Turning it on, over `--travel` with `--e-move`:

- The grid columns animate from `rail 1.1fr 1fr` to `0 0.5fr 1.375fr` (equal track count, so Chrome interpolates them). The rail fades out in 220ms; coming back it waits 380ms so it never shows clipped.
- Rows shed their meta line and field marks (opacity first, then the row's second grid row closes), leaving node and title.
- The title grows from 28px to 32px.
- Once the detail pane is wider than 56rem (a container query on the pane, so it happens on the way, when there is room), the side moves beside the primary column (20rem) and arrives from 16px to the right. Below that width focus mode is a wider single column.

State lives in React state, not the hash: focus is a way of looking, not a place, so links and history keep pointing at items and Back never toggles it.

### Keys

Pure logic in `ui/src/keys.ts` (tested): `f` toggles focus, `Escape` leaves it, `j` and `k` move the selection in list order (stopping at both ends; from nothing they start at the top) and keep the row in view. Keys are ignored while typing in an input, text area, select or editable element, and while Ctrl, Meta or Alt is held. Keys are only bound on the items view.

## Timeline

The history in the detail is the item's own path (`ui/src/timeline.ts`, tested; drawn by `ui/src/components/Timeline.tsx`). Newest first. At the top sits the **current state node** (the item's node kind, on the lane of whose turn it is, or on the trunk at x=28 when closed), with `now` and its state. Below it, one stop per event: on your lane (x=40, filled in your color) when a human acted, on the agent lane (x=16, ink) when an agent did. A decision the human made in conversation and an agent relayed (`otea relay`; the event carries `via`) is still on your lane, but as a **ring** in your color on `--sf`, never the filled dot of a decision made in the UI; its label reads `human, relayed by <agent>` instead of `human (ui)`, and the quote of what the human said follows on its own line, in quotation marks (`relayOf` in `ui/src/format.ts`, tested). The path runs straight down while the lane stays and swings across with a cubic curve (`C x0 mid x1 mid x1 y`, `mid` halfway between the two stops) when it changes, ending at creation. Both lanes are drawn behind it as quiet guides.

Each block is measured (ResizeObserver), so an event that wraps keeps its stop centred on it. When the timeline is narrower than 26rem (a phone, the focus side column), the time goes above the event. Events that arrive while the item is open fade in from 8px above (`--arrive`).

## Controls

- **Buttons** are pills: `Button` with `primary`, `quiet`, `sm` and `icon`. One primary per screen, always the move that hands the turn on (`moveVariants` in `ui/src/actions.ts`); moves that throw work away are quiet.
- **Pills** (`Pill`): mono tags; `ask` for an open question for you, `state` for a workflow state (tinted in your color when it waits for you); `size="sm"` inside a list row.
- **Severity** (`Severity`): four signal bars; level 4 in `--warn`.
- **Kbd** (`Kbd`): keyboard hints inside buttons.
- **Icons** (`Icon`): thin (stroke 1.25), 16px, current color. No emoji.
- **Tooltips** (`.tip` with `data-tip`): ink on surface, mono 11.5, below and right-aligned; on hover after 350ms and on keyboard focus.
- **Fields**: inputs are pills on the surface, text areas round to 8px; labels are `t-label`.
- Touch targets grow to 40px on coarse pointers.

## Field modules

Every preset field names a module (`text`, `markdown`, `enum`). The UI draws each value through a registry in [`ui/src/modules/`](ui/src/modules/): one file per module plus `registry.ts`, so no component switches on module names. The names come from the core preset format (`FIELD_MODULES` in `src/core/preset.ts`, imported type-only), and the registry is keyed by them, so a module added to the format fails the UI typecheck until it is drawn.

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

Rules:

- Modules are built only from the kit primitives and tokens.
- A module name the UI does not know (a newer server, a local module) shows and edits as plain text. It never crashes the UI.
- Markdown renders with `micromark`, safe by default: raw HTML is shown as text and links with a dangerous protocol lose their href. Never enable its dangerous options. Headings use the human font at 15-17px, lists hang from muted markers, code and code blocks are Spline Sans Mono on `--well`, links are `--you-ink`.
- A row stays calm: an enum at its default puts nothing in the row.

### Catalog

`#/modules` opens the catalog in the two panes: the index of modules on the left, and on the right an overview of the loaded presets and which module each field picks. `#/modules/<name>` shows one module: its origin, a live preview of every sample in the row, the detail and the edit control (the edit control drives that sample's row and detail, locally; nothing is saved), the preset fields that use it (from `GET /api/presets`) and its `preset.yaml` snippet. Modules that presets name but the UI does not know are listed apart, as "unknown module · renders as plain text". Routes are parsed by `routeFromHash` in `ui/src/selection.ts`; item ids never start with a slash, so `#<item-id>` keeps working.

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
- **Unfold**: tapping a row opens its detail in place, under the row and beside the lanes, which keep running through it (an unfolded row's block grows by the detail's height, and its node stays at the head: `node` in `layoutLanes`). There is no detail pane and no "select an item" card; the row is the header, so the detail drops its title. The rows below make room as the detail grows over `--arrive` (the box follows its content as it loads), and the row is scrolled to the top. Tapping the row again, or Back, folds it (the hash goes back to the list); choosing another row moves the detail there at once. The moves sit in a bar sticky to the bottom of the screen while the detail is on it, the one primary among them. A move made there folds the item and the row carries itself home (the turn-change motion). A detail belongs to the row on the turn it had when it opened (`ui/src/unfold.ts`, tested): if the row changes hands it moves to another section, and the detail is dropped rather than reopened there; a tap opens it again.
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
