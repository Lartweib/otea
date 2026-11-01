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

**Rows** sit on one grid, at every nesting level (`ui/src/row-grid.ts`, tested; `.row` in `ui/src/styles/list.css`). Fixed slots, not fixed content: a row without children keeps its fold slot empty and a type without an icon keeps its type slot, so the title starts at the same x on every row of a level.

| Column | Width | Holds |
| --- | --- | --- |
| rail | 56 | the node on its lane, and the lanes |
| fold | 28, always reserved | a 20px chevron button when children are nested under the row |
| indent | 28 a level | nothing: children step in |
| type | 30, always reserved | a 20px slot: the type's icon (16px, 14px on a child, at 86% ink), or a small filled square (6px, 5px on a child, radius 1.5) for a type without one; never a circle (a node), a dash (a fold) or an outlined square (a checkbox) |
| title | the one that flexes | line one: the title, led by a muted parent breadcrumb when the parent sits in another group (`Create wolf › Movement`, it truncates first and selects the parent); line two: always `ID · state`, then a parent's segmented bar and `N of M open` behind a hairline, then signals (enum values off their default) |
| priority | 48 | the severity bars; priority never sits in line two |
| who | 80 | the agent holding the item, right-aligned up to the dot |
| when | 56 | starts after the dot: until when the agent holds it, or the age. Held by nobody, who is empty and the age stays in when |

| Level | Spec |
| --- | --- |
| group header | 14/500 `--mut`, sentence case, its count in mono 12 (`--you-ink` only for *Waiting for you*), a hairline carrying it across; 60px tall (34px for the first), the label on the type slot (x=84) |
| top-level row | 62px, padding 10px; title 15/600 on a 22px line (the node at y=21), line two mono 12 `--mut` on 18px |
| child row | 54px, padding 8px; two lines as well: title 14/500 on 20px (the node at y=18, 10px), line two on 16px |

A row stops at 760px, so on a wide pane the time stays near its title; past that the pane only gains margin. The row band starts at x=58 (right of the rail). On hover the band shows and a dotted leader in lane grey runs from the title across the empty priority cell to who, so the eye finds which time belongs to which title. The title is the row's link, stretched over the whole row, so the breadcrumb and the fold button can be links of their own above it.

**Hide order.** What a row shows is decided by the list pane's width alone (`hideTier`, tested; a `ResizeObserver` on the pane sets `data-tier`), the same while the divider is dragged, when the window changes, or on a phone. Things leave in one order and nothing else ever does:

| List width | Tier | What changes |
| --- | --- | --- |
| ≥ 600 | 1 | everything shows |
| 480 – 599 | 2 | the priority column and evidence chips go |
| 380 – 479 | 3 | who becomes a monogram (`monogram`: the first letter and the first of the suffix after the last dash, `cb` for claude-b; otherwise the first two letters; `you` stays `you`); a parent's count shortens to `N open` |
| < 380 | 4 | who goes; a parent keeps only its bar |

Always there: the node, the fold and type slots, the title, `ID · state` and the time.

**Branches.** A child in the same group as its parent sits right under it, stepped in 28px a level; its node stays on its own lane. The lanes mean turn and the branch means hierarchy, so the branch (`branchPieces`, tested) never touches the lanes: it is a quiet tree in lane grey, the same for a parent on either lane. It leaves from the parent's type slot, its horizontal centre 3px under the slot, icon or not (the origin belongs to the slot, never to the drawing in it), drops straight down and turns into each child with an 8px elbow, stopping 4px before the child's slot. A deeper level hangs the same way from its own parent's slot.

**Lines live in their rows.** Every block of the list (header, row, "Nothing here.") draws its own slice of the lanes and its own piece of the branch in an SVG of its own: the lanes are laid out once over the whole list (`layoutLanes`) and each block shows the slice it covers; the branch is cut into legs, elbows and a parent's stub, each tagged with the parent level it hangs from and the span the tree draw's head covers. A block that moves carries its lines with it; nothing is redrawn somewhere else, so nothing can jump to where it will be.

## Workspace

The items view is the **Split** composition: the sidebar, the list, the divider and the detail in one grid (`.workspace`, `ui/src/styles/workspace.css`).

| Column | Content |
| --- | --- |
| sidebar (13.75rem, from 64rem) | collections from `/api/collections`, plus "all items"; each shows what waits for you / what is still open (`railEntries` in `ui/src/workspace.ts`). Choosing one filters the list; the filter is local state. |
| list | list head, then the lanes list. Until the viewer sets a width it takes 34% of the workspace, between 520 and 783px (`defaultListWidth`, tested), so a wide screen spreads its room instead of piling it up on the right; the viewer can set 340–783px |
| divider | 9px: a 1px `--line` hairline that thickens to 2px with a grip under the pointer or on focus |
| detail | the selected item, the intake form, or a hint, anchored next to the divider with a 40px gutter, never under 440px. It stops at a 50rem (800px) reading measure, prose at 72ch; past that the screen keeps a plain right margin instead of a column floating in the middle |

**List head.** One row on one baseline: the lane names (`ag`, `you`, mono 11) centred on their lanes at x=16 and x=40, the title starting where the row titles do (x=114, the grid's title column), and the key hint (`j k to move · f collections`, mono 12, muted) ending where the time does. View names are in sentence case (*All items*); a collection's name shows as written.

Below 48rem the workspace is the phone layout (see Phone). Routes: `#<id>` selects an item, `#/modules` opens the catalog, `#/triage` opens triage.

The detail is a **margin index**. The header holds the node, the id, the state pill and whose turn it is, with the type icon and its name at the end of the row (`epic`; a preset without types is named after itself), then the title (30/700, at most 28ch, balanced), the handoff line and the moves. Below it, each section is named in a 96px left margin (14/600) above a hairline, its content in the reading column beside it (above it on a phone or in a pane narrower than 34rem):

| Section | Content |
| --- | --- |
| Brief | the `header` slot, then the `evidence` and `body` slots in their order; the `description` leads as plain text without a label, the other fields follow as a field list |
| Structure | the `children` and `relations` modules, wherever the layout places them (see Relations); absent when the layout places neither |
| Details | the rest of the `side` slot, then collection, created by (who and when), lease and updated |
| History | the timeline |

What the detail shows follows the item type's layout (`detailBlocks` in `ui/src/item-types.ts`, tested). The evidence list (every attached file) sits at the first evidence module (`images`, `recording`, `diff`, `log`), or after the fields when the layout places none. Reserved modules draw nothing yet. Values whose field the type does not declare still show, as plain text, at the end of the body. A type without a layout draws as before layouts: every field in the body. The list row draws the `row` slot (a module's `rowColumn` puts it in the priority column or among the signals), and the create form asks for the `intake` slot's fields, with a **Type** select after the collection when the collection has several types.

### The handoff line

One line under the title (`HandoffLine`, logic in `ui/src/handoff.ts`, tested) says who handed the item over, when and what they said, then what to look at first, each part after a short 1px rule (a part that wraps starts its line without one). It is read only from what the item holds, never guessed:

- **Who and when**: the item's last move, or its creation while nothing moved it: `claude-b moved it to review · 14m ago` (`created it` for a creation), the actor's two-letter mark in a mono chip first (`cb`; none for you). A relayed decision names the agent that relayed it (`claude-a relayed your move to discarded`). The reason the move carried, or your relayed words, follows in quotes. A move says its target state; Otea never turns a state's name into a verb.
- **Evidence**: two image thumbnails (40×26, for a signed-in browser) and the count of files.
- **Severity**: when the type has a `severity` field with a value, its bars and level.
- **One relation**: the first the detail lists, children aside (`duplicates BUGS-1`, linking to it).
- **A parent**: instead of the relation, its children's bar and `4 of 5 open`, then `waiting for you:` with a link to each child on your turn.

### The band and the aside

On a wide pane the detail becomes two columns (`composition` and `detailForm` in `ui/src/detail-form.ts`, tested). It **fills the pane**: with C = pane − 80 (its two 40px gutters), stacked (pane < 1240) main is C; in two columns the aside is clamp(340, round(340 + (C − 1160) / 4), 440) and main is C − 48 − aside, so the aside takes a quarter of every pixel past the threshold and main the rest. No screen leaves an empty band on the right. Prose (the lead and markdown) keeps its 72ch measure inside main; fields, the evidence list (files side by side), children, relations and tables use the full width. The list keeps the width it was given: the detail never moves the divider. CSS computes the same widths from the pane, its container (`--aside` from `100cqw`, main the rest), so nothing waits for script while the divider is dragged.

| | Spec |
| --- | --- |
| Widths | 2560 with the sidebar open (pane 1506): main 978, aside 400. Folded (1682): main 1114, aside 440. The 48px gap holds a 1px `--line` rule at its middle. |
| The band | The header and Details form a band; both start on the meta row ("Details" sits on its 22px line), and Details sits boxed in the second column, its rule running from the band's top to the line. |
| The line | One 1px `--line` hairline across both columns closes the band, 28px under the taller of the header and Details and 28px over the body. It replaces the Brief's own hairline. |
| Long Details | From the sixth row, Details shows five and a `N more` toggle (`detailsCut`), so the band never grows much past the header. |
| History | Below the line, beside Brief and Structure, its top on the Brief's label. Sticky 16px under the pane's top, never taller than the room under it (`asideHeight`, at least 240px), scrolling on its own; overscroll is contained. Mono time, the event wrapping under itself, who acted on a muted line below; one lane with today's dots (yours, an agent's, a relayed ring). In every form an older day sits over its time (31 Oct over 23:58, with the year from another year), and the time column is as wide as its longest label: 01:19 alone when everything happened today. |
| Stacked | No band: header, Brief, Structure, Details, History, in one column. |
| When it switches | The pane is measured with a `ResizeObserver` (`ui/src/components/detail-aside.ts`). While the divider is dragged the layout follows the pointer and the form waits for the release; a sidebar fold (or a step of the divider from the keyboard) switches at once; a window resize switches after 150ms of quiet. The pane always keeps its scrollbar's gutter (`scrollbar-gutter: stable`), so the width measured never depends on the form: otherwise a form that makes the pane scroll (the aside, or its travel, on a short item) narrows it under the threshold and the two forms swap every frame. |
| Motion | Details (into the band, or back under Structure) and History (beside the main column, or back to the end) travel from where they were (FLIP) on `--m-slow` with `--m-ease`, each on its own path of three legs (`travelPath`, tested): to two columns they go sideways first, out of the main column, then rise; back, they drop first while clear of it, then slide. The pane clips them horizontally, so a flight never gives it a scrollbar. Their content dips to 50% opacity while it re-flows. A pane that slides at the same time (a sidebar fold) carries them. Reduced motion: a 120ms crossfade. |

The phone's unfolded detail is always one column.

### Divider and sidebar

The divider (`Divider` in `ui/src/components/Split.tsx`, a `role="separator"` with `aria-valuemin`, `aria-valuemax` and `aria-valuenow`) resizes the list with pointer events. The list is 340–783px and the detail never goes under 440px (`clampListWidth`, `listMax` in `ui/src/split.ts`, tested). While it is dragged nothing animates: one CSS variable (`--list-w`) follows the pointer, frame by frame, without a render. Focused, the arrows move it 16px (64 with Shift) and Home and End jump to the limits. A double-click or Enter eases it back to the default (the list's share of the room; base, `--list-w` is a registered property so it animates on the tokens) and forgets the viewer's width. The width is kept per browser in `localStorage` (`otea.listWidth`); a browser that refuses storage starts from the default.

The collections sidebar (13.75rem, from 64rem) has a header of its own: a quiet toggle (the sidebar icon, `aria-expanded`, labelled *Hide collections* / *Show collections*, tooltip with `f`) in front of its label. Folding it leaves a strip just wide enough for that toggle (8 + 28 + 8px), and the toggle never moves, in either state: the label and the collections fade (base) and clip out towards it (slow), and nothing else of the sidebar catches the pointer. The track keeps 24px of air after the sidebar or its strip, so the first lane sits 40px clear of the sidebar's edge and 48px clear of the toggle. `f` folds and unfolds it from anywhere; the state is kept in `otea.sidebar`. Under reduced motion it folds at once. The list keeps the width it was given, so folding never reflows a row: the list and divider slide over and the detail takes the freed room, the panes measured before and after and played back as a transform (FLIP, slow). State lives in React state and storage, not the hash: the split is a way of looking, not a place, so links and history keep pointing at items. The phone layout is untouched: no divider, and the collections stay a row of pills.

### Keys

Pure logic in `ui/src/keys.ts` (tested): `f` folds or unfolds the collections sidebar, `j` and `k` move the selection in list order (stopping at both ends; from nothing they start at the top) and keep the row in view. Keys are ignored while typing in an input, text area, select or editable element, and while Ctrl, Meta or Alt is held. Keys are only bound on the items view.

## Timeline

The history in the detail (`ui/src/components/Timeline.tsx`) is the item's past, newest first, on **one straight lane** in lane grey: it never swings between lanes. A dot (8px) per event says who acted: filled in your color when a human did, ink when an agent did. A decision the human made in conversation and an agent relayed (`otea relay`; the event carries `via`) is a **ring** in your color, never the filled dot of a decision made in the UI; its label reads `human, relayed by <agent>` instead of `human (ui)`, and the quote of what the human said follows on its own line, in quotation marks (`relayOf` in `ui/src/format.ts`, tested). The time is mono, `14:02` today and, before, the day over the time (`28 Oct` over `12:31`, with the year from another year; `momentParts`, tested); the events share the list's columns, so the time column is as wide as its longest label and no wider. The lane is drawn in CSS, so an event that wraps keeps its dot on its first line. Events that arrive while the item is open fade in from 8px above (base).

## Controls

- **Buttons** are pills: `Button` with `primary`, `quiet`, `sm` and `icon`. One primary per screen, always the move that hands the turn on (`moveVariants` in `ui/src/actions.ts`); moves that throw work away are quiet.
- **Moves** (`ItemActions`) are text only: the target state's name, with `…` when the move asks a reason; no icons, route glyphs or key letters. Moves that throw work away sit last, after a short rule and `close as`, quieter. On hover a line draws itself around the move, the list's line language: ink around a plain move, a 1.5px ring in your color 3px outside the primary, an underline (and text from `--mut` to `--ink`) under a closing move. Nothing fills. Focus keeps the native ring and draws nothing. One mono line under the row says what the hovered or focused move does, the primary's by default (`moveSays`, tested): whose turn it becomes, from the target state's turn (the agent named is the last one that acted on the item, `turnAgent`), and whether it leaves or joins Waiting for you, or plainly that it closes the item (`closes the item as discarded`), then `asks a reason first`. A move waiting for children is dashed, never drawn, with its reason beside it. Moves that need a reason open the reason form. Once a move you made lands, the line becomes its receipt (`accepted · now claude-b’s turn · just now`) until another move is hovered. The phone's bar of moves keeps one run, without `close as` or the line.
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
- **Waiting for children**: a move whose target state declares `requires: children_closed` (the move's `requires`), closing or not, is drawn disabled while the item's children summary has open children, never primary (the next eligible move takes it, or none), with a quiet mono note beside it (`waits for 3 open children`, `moveBlock` in `ui/src/actions.ts`). Keys never take it: triage's `a` and `r` act only on the swipe moves. The same holds in the phone's sticky moves bar and on triage cards, where it sits under the swipe buttons and is never swiped. The server refuses the move anyway.
- **Empty**: with nothing to show, a module says so (`No children`, `No relations`) beside its action for a browser that can write; a read-only browser sees nothing.
- **List** (`nestSections` in `ui/src/nesting.ts`, tested): a parent's meta line always shows its segmented bar and `N of M open`, whatever its group. A child is nested under its parent (the branch, the step in) only when it falls in the same group. A child in another group (waiting for you while its parent is with agents) is a row of its own in its own group, with a muted reference to its parent at the end of its meta line (`↑ CRE-40 Create wolf`) that selects the parent: nothing waiting for you folds out of sight. A closed child whose siblings are still open stays under *Closed*, with the reference. A parent still open whose children are all closed (it typically comes back to you for review) takes them under it, folded by default so the row stays compact; unfolded, they sit between the lanes with their closed look. A parent with nested children gets a chevron in its fold slot; folding and unfolding draws the tree (see Motion). Folds are per viewer, in `localStorage`: the parents folded (`otea.collapsed`) and the settled parents unfolded (`otea.expanded`); failures are ignored. Section counts are the items of their own turn, shown or folded.

## Motion

One motion system: three durations and one easing, defined once as CSS custom properties (`ui/src/styles/tokens.css`) and mirrored by `MOTION` in `ui/src/motion.ts`. Everything that changes layout is measured before and after, and the difference is played back as a transform (FLIP). Nothing teleports.

| Token | Value | Use |
| --- | --- | --- |
| `--m-fast` | 120ms | hover, press, the selection band, the dotted leader; the reduced-motion crossfade |
| `--m-base` | 200ms | the fold chevron, content coming in (the detail on selection, a new list row, a new history event), fades, the divider easing home |
| `--m-slow` | 280ms | anything else that moves layout: the sidebar and the panes, rows making room, the phone unfold, triage cards |
| `--m-ease` | `cubic-bezier(.25, 1, .5, 1)` | every one of them: ease-out-quart starts at full speed, so it answers at once, and settles without overshoot. No bounce, no spring |

The turn change keeps its own family (see below): `--travel` 680ms with `--e-move` `cubic-bezier(.65,0,.35,1)`; when a row changes hands the rows making room follow its clock (600ms, 90ms after) and the halo ripples at 760ms. `TIMING` in `ui/src/motion.ts` mirrors it.

| Interaction | What moves | Property | ms |
| --- | --- | --- | --- |
| Unfold children | the line's head, down the branch from the parent's type slot | `stroke-dashoffset` per piece | tree |
| | each elbow, as the head reaches its child | `stroke-dashoffset` | 20px of travel |
| | the child's node, fold, icon, title, line two, priority, who, when | opacity · translateX −6px · blur 1.5px | 40px of travel, out-cubic |
| | the children's room and every block after it | `clip-path` · `translateY`, on the head | tree |
| Fold children | the same geometry upward: last child first, the line retracts into the parent | as unfold, reversed | tree × 0.8 |
| Fold chevron | its glyph | rotate | base |
| Collections sidebar | the sidebar; the list, divider and detail panes | translateX · opacity; translateX (FLIP) | slow · base |
| Drag the divider | list and detail | width, live layout | none |
| Reset the divider | list and detail | `--list-w`, eased | base |
| Select a row | the selection band; the detail coming in (the old one leaves at once) | background-color; opacity · translateY 6px | fast; base |
| Turn change | the carried row | lift, carry, set down | 680 |
| Hover a move | its line draws clockwise from the top-left round, and undraws the way it came | `stroke-dashoffset` 1 → 0 | slow in, base out |
| | a closing move's underline, left to right; its text to ink | scaleX; color | base; fast |
| Press a move | the pill | scale .97 | fast |
| Commit a move | the moves fade after the press; the line becomes a receipt; the node morphs and the row carries | opacity · translateY −4px; opacity; the turn change | slow at +120; slow; 680 |
| Reduced motion | a move's line or underline fades in whole: no draw, no scale | opacity | fast |

### Tree draw

Folding and unfolding a parent's children (`ui/src/components/tree-draw.ts`, timing in `ui/src/motion.ts`, tested) has a single clock: where the line's head is. One head travels down the branch from the parent's type slot at constant speed for 60% of the time (75% of the line), then eases out (`headAt`). Every piece of the branch, every child row and the room the block takes read their progress from the head, so they cannot drift apart:

- A leg fills as the head passes its span. An elbow draws out once the head reaches its child (over 20px of head travel), and the child resolves over the next 40px: opacity, a 6px slide and a 1.5px blur clearing.
- The children's room grows with the head (each row is fully open by the time the head reaches its elbow, `roomAt`) and every block after them rides its edge: no drop, no lag, no overlap. Open nested children cascade in the same pass.
- Duration: 180ms + 70ms per row drawn (open nested rows count), capped at 600ms (`treeDuration`): 2 rows 320, 4 rows 460, 6 rows 600. Folding runs at 0.8× in reverse: the last child undraws first and the line retracts into the parent; the rows are dropped once it is in, and the blocks after them are already where the drop puts them.
- Clicking the chevron again midway reverses the head from where it is.
- While the tree draws, the list's own FLIP (`Carry`) stands still for that change.

### Turn change

When an item changes turn, from a move in the UI or a change from the CLI that arrives over the live stream, the list animates the difference (FLIP), without a dependency:

1. `Carry` (`ui/src/components/Carry.tsx`) wraps the list body. In `getSnapshotBeforeUpdate`, the one React hook that reads the DOM before it changes, it records where every `[data-flip]` block sits (rows, section headings, "Nothing here."), each row's turn and lane, and its node's look (fill, stroke, dash) and text color.
2. After the update it measures again and `planMotion` (`ui/src/motion.ts`, tested) decides: a row whose turn changed is **carried** (or **closed** into the trunk, or **reopened**); any other block that shifted **makes room**; a new block **enters**. Changing the collection filter is a new list, not a motion. Without a turn change in the plan, making room is slow and entering is base, on `--m-ease`.
3. The carried row travels from its old place (Web Animations `translateY`, `--travel`) while its node is carried across to the new lane (`translateX`) and lifted: up 8px and 118% at 42%, set down slightly under size at 84%. The row rides on a raised surface (`--sf`, shadow) above the others; arriving on your lane it is tinted in your color from 380ms and a halo ripples out from 560ms. A carry between lanes leaves a ghost ring that fades where it left.
4. A row that changes section is a new element, so its old look is played back into the new one: the node keeps its old fill until a third of the way, takes the new one by 81%, and the check or slash draws in after 560ms; the text recedes over 420ms; a discarded title's strike is drawn in.
5. Everything else slides from its old place (make room), carrying its own slice of the lanes.

Interrupted mid-flight, a row starts again from where it is on screen. Decorations are CSS keyframes switched on by `data-motion` and cleared after 1.5s.

Nothing blinks; only an agent at work keeps moving. Under `prefers-reduced-motion` nothing travels: layout changes are instant (transforms and clips are skipped and the layout is simply where it ends), and new content crossfades in 120ms (children unfolding, the detail, a new row, the sidebar). Folding children is instant. The orbit stands still (the arc stays visible), and a turn change crossfades in place.

## Phone

Below 48rem the workspace is one column (`ui/src/styles/phone.css`), the phone take on the **Unfold** composition.

- **Topbar** keeps brand, connection dot, Modules, theme and New item as 44px icon buttons; their words stay for screen readers (the connection label too).
- **Collections** become a row of 44px pills that scrolls sideways; the chosen one is filled with `--ink`.
- **Rows** follow the list's width like everywhere else: at phone width the list is in tier 4, so who goes, a parent keeps only its bar, and the time stays.
- **Unfold**: tapping a row opens its detail in place, under the row and beside the lanes (60px in, right of the branch sub-lane), which keep running through it (an unfolded row's block grows by the detail's height, and its node stays at the head: `node` in `layoutLanes`). There is no detail pane and no "select an item" card; the row is the header, so the detail drops its title. The rows below make room as the detail grows (slow) (the box follows its content as it loads), and the row is scrolled to the top. Tapping the row again, or Back, folds it (the hash goes back to the list); choosing another row moves the detail there at once. The moves sit in a bar sticky to the bottom of the screen while the detail is on it, the one primary among them. A move made there folds the item and the row carries itself home (the turn-change motion). A detail belongs to the row on the turn it had when it opened (`ui/src/unfold.ts`, tested): if the row changes hands it moves to another section, and the detail is dropped rather than reopened there; a tap opens it again.
- **Intake** opens above the list.

### Triage

`#/triage`, entered from a quiet **Triage** control at the end of the *Waiting for you* heading (only when something waits and the browser can act). Triage is a mode of its own (`ui/src/components/Triage.tsx`, the Triage C board: one at a time), at a real size on every screen:

- **Head**: the way out (**List**, or Esc), what is left (`4 left on your turn`) with a tally (`2 decided · 1 for later`), and where the pass stands (`3 of 6`).
- **Stage**: one card at a time, 760px wide (the width on a phone), at least `clamp(18rem, 40vh, 26rem)` tall. The card holds the item's tags and a link to open it, its title (26/700), the description as plain text (72ch) and the other fields in a 96px-label list, and at its foot where it stands (who holds it, its children, its relations, how long ago it changed). The next cards wait behind it as edges only (at most two), so nothing of them shows through.
- **Moves**: back (`r`), later (`s`) and the primary move (`a`), each with its key; under them one mark per card of the pass (decided in ink, for later as a ring, the current one in your color).
- **Trays** (from 80rem): what was sent back to agents on the left, what was otherwise decided on the right, each settling in as it is decided.
- **Nothing to triage**: the stage keeps its size and says so (*Nothing waits for you*), with the way back. At the end of a pass the stage says *All caught up*, with what was decided and a way to see the ones left for later again.

The rule lives in `ui/src/triage.ts` (tested):

- **Right** is the primary move: the same one the primary button gets (`moveVariants`).
- **Left** sends the item back: the first other move whose target state is an agent's turn (each move the API returns says the turn it hands the item to). If that move requires a reason, the swipe (or `r`) opens the reason form on the card and moves nothing; Confirm makes the move, Esc cancels it. A gesture never performs a move that requires a reason.
- A direction with no move snaps back.
- A drag starts after 10px of mostly sideways motion (vertical motion scrolls the page: `touch-action: pan-y`). It commits past a third of the card's width (kept between 80 and 160px), or on a flick of at least 0.5px/ms over 40px in the same direction; otherwise the card settles back (slow). While it is dragged, the card tilts with the pull and a stamp names the move on the side it leans from; the cards behind rise with the pull.
- Motion, on the tokens (`ui/src/components/triage-flight.ts`): the mode comes in rising 8px (base). A decided card flies into its tray (slow, the shared easing): a copy above everything (`--z-flight`, from the z-index scale in `tokens.css`) moves onto the tray's new entry, shrinking to its size with at most a 1.5° tilt, and hands over to the entry, which is laid out from the start and fades in as the copy lands (`landingOf`, tested). Where the trays are not shown (under 80rem), and for a card left for later, it leaves with a short slide (48px in the move's direction, or 16px down) and is gone by 40% of it. The next card waits behind complete, its moves read ahead of time, so a card always rises whole. Keys pressed while a card leaves are ignored. Under reduced motion the card crossfades.
- On a phone the head stacks, the card takes the width and the moves wait in a bar sticky to the bottom, in reach of a thumb; the keys are hidden.

Reduced motion: the unfold is instant, the card does not travel while dragged, and cards and the mode crossfade (fast).

## Bans

Side-stripe borders, gradient text, glassmorphism, hero-metric templates (big number, small label, stats), identical card grids, uppercase tracked eyebrows over every section, numbered section markers, cream or sand backgrounds, emoji icons.

## Layering

1. **Primitives** in `ui/src/kit/`: small, presentational, no data fetching. Done.
2. **Field and evidence modules**: the field module registry and its catalog are done (see Field modules). Evidence kinds (gif, mp4, png, diff, log, before/after compare) and loading local modules come next, on the same registry.
3. **Shells**: the workspace (Split with collections sidebar, divider, keys), the lanes timeline and the turn-change motion are done. The phone layout (Unfold and swipe triage) is done. Evidence-led review views come next.
