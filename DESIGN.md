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
| `--agent-0` … `--agent-4` | the five hues that tint agent marks, never used alone |

## Agent marks

An agent is shown by one mark everywhere (`AgentMark` in `ui/src/kit/`, logic in `ui/src/agent-mark.ts`, tested): its initials in mono 10.5/500 on a small chip (22×18, `--r-s`), `cb` for claude-b, the first two letters of a one-word name. The chip is `--chip` mixed in OKLab with one of five hues (ochre, green, teal, plum, rose: away from your blue and from `--warn`), chosen by a stable hash of the name, so claude-b has the same tint in every row, theme and session. The text stays `--ink`, so the mark reads in both themes, and the tint is weak enough that the turn colors (your blue, the agents' ink) stay dominant: a mark identifies, it never says whose turn it is.

It leads the agent's name wherever an agent acted or acts: the handoff line, each History event (the agent that acted, or the one that relayed your words) and *created by* in Details. In the *who* of a list row or a grid it stands alone, the name only its tooltip (the mark sits above the row's stretched link so the tooltip shows) and the text assistive tech reads (`Holder` in `ItemList.tsx`); an item you hold shows `you` on a chip of your color instead, the same size. You never get a mark. Agents get their names from `otea connect`, which pins one per MCP server, so the marks stay stable.

Themes: light and dark follow the system by default. The topbar toggle cycles system, light and dark; the choice is stored in `localStorage` (failures fall back to system) and applied as `data-theme` on `<html>`. Switching it opens the new theme as a circle from the toggle (see Motion).

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

## Brand

The logo is the word: "otea" in Schibsted Grotesk 700, -0.02em, whose o is drawn as a node (the **letter node**). Its ring is the letter, in `--ink` at the letters' weight; its counter is the turn, in `--you` while something waits for you and empty otherwise. Hollow, it is simply the word.

**Construction** (1/1000 em of Schibsted Grotesk 700, `Brand` in `ui/src/App.tsx`). The node is a true circle on the o's centre (305.5, −263.5): outer radius 273 (the mean of the o's half-width and half-height, so it overshoots the baseline and the x-height as the o does), ring 128 (between the o's thin 107 and its stem 152), counter 145. It is an inline SVG on the o's own advance (584.44: 610.84, −20 of letter-spacing, −6.4 of kerning), so "tea" stays live text and starts exactly where it would after the font's o. The topbar sets it at 20px, 18px on the phone's 56px bar; the brand link keeps the label "otea, all items".

**States** come from one place, `ui/src/attention.ts` (tested): `attentionOf` counts the items waiting for you across every collection and says whether any agent holds an active lease; `attentionFrame` turns that into one of four frames. Yours comes first; the orbit is added while an agent works.

| Frame | Counter | Orbit | Favicon |
| --- | --- | --- | --- |
| `yours` | filled | none | `otea-yours.svg` |
| `yours-working` | filled | turning | `otea-yours-working.svg` |
| `working` | empty | turning | `otea-working.svg` |
| `idle` (all with agents) | empty | none | `otea-idle.svg` |

The items follow the live stream; a lease that runs out writes nothing, so `useAttention` reads the state again when the first active lease expires. The state never lives in the mark alone: the document title carries the count, "(2) Otea", and is plain "Otea" at zero.

**Motion** (the app's tokens, `ui/src/styles/shell.css`). Becoming yours, the counter fills from the centre: scale .2 → 1 over `--m-slow`, opacity over `--m-base`, on `--m-ease`; it empties the same way. When an agent starts, the orbit (r 378, weight 60, outside the o) draws in, dash 0 → 25 of 100 over `--m-slow`, and turns once every 1.7s, linear, the list's orbit; it undraws when the work stops. The orbit is masked from where the t begins, so it passes behind the word. The ring never moves. Under reduced motion the counter and the orbit crossfade over `--m-fast`, the orbit drawn still at 1 o'clock.

**Favicon.** Four static SVG files in `ui/public/` with their own 16px drawing (ring outer 7 at weight 3, counter 4, every edge on a whole pixel; working: node 5 at 2.14, orbit arc r 7.25 at 1.5, still at 1 o'clock). Each carries a `prefers-color-scheme` rule, so the ring is dark ink on a light tab strip and light ink on a dark one. `index.html` links the idle frame; the page swaps the link's href when the frame changes (`applyAttention`). A favicon swaps, it does not animate.

**The desktop shell** reads the same state without an API of its own: the window's title and favicon are the state (Electron's `page-title-updated` and `page-favicon-updated`), for the taskbar icon, the tray and a notification when the count grows. `attentionOf` is pure and takes the items as `/api/items` returns them, so the main process can derive it the same way.

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
| who | 38 | the mark of the agent holding the item (or your `you` chip), right-aligned up to the dot; the name is its tooltip |
| when | 74 | starts after the dot: the time left on the agent's lease (`12m left`, `2h left`, `2d left`; minutes rounded up), or the age. Held by nobody, who is empty and the age stays in when. A lease that ran out without a release (the server keeps it apart as `expiredLease`) says `expired` in `--warn`. A lease's holder and absolute expiry are its tooltip (above the row's link) and what assistive tech reads (`held by claude-b until 14:30`); its text changes on its own when it should (`timeCell` in `ui/src/lease.ts`, tested), the grid's age column the same |

| Level | Spec |
| --- | --- |
| group header | 14/500 `--mut`, sentence case, its count in mono 12 (`--you-ink` only for *Waiting for you*), a hairline carrying it across; 60px tall (34px for the first), the label on the title column (x=114, with the row titles and the list head's title), the label and its counts on one baseline (in the grid the label starts on the first column, x=84) |
| top-level row | 62px, padding 10px; title 15/600 on a 22px line (the node at y=21), line two mono 12 `--mut` on 18px |
| child row | 54px, padding 8px; two lines as well: title 14/500 on 20px (the node at y=18, 10px), line two on 16px |

A row stops at 760px, so on a wide pane the time stays near its title; past that the pane only gains margin. The row band starts at x=58 (right of the rail). On hover the band shows and a dotted leader in lane grey runs from the title across the empty priority cell to who, so the eye finds which time belongs to which title. The title is the row's link, stretched over the whole row, so the breadcrumb and the fold button can be links of their own above it.

**Hide order.** What a row shows is decided by the list pane's width alone (`hideTier`, tested; a `ResizeObserver` on the pane sets `data-tier`), the same while the divider is dragged, when the window changes, or on a phone. Things leave in one order and nothing else ever does:

| List width | Tier | What changes |
| --- | --- | --- |
| ≥ 600 | 1 | everything shows |
| 480 – 599 | 2 | the priority column and evidence chips go |
| 380 – 479 | 3 | a parent's count shortens to `N open` |
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

**List head.** One row on one baseline: the lane names (`ag`, `you`, mono 11) centred on their lanes at x=16 and x=40, and the title starting where the row titles do (x=114, the grid's title column). View names are in sentence case (*All items*); a collection's name shows as written.

Below 48rem the workspace is the phone layout (see Phone). Routes: `#<id>` selects an item, `#/modules` opens the catalog, `#/triage` opens triage.

The detail is a **margin index**. The header holds a meta row with the node, the id, the state pill and whose turn it is, then the title (30/700, at most 28ch, balanced), the handoff line and the moves. Below it, each section is named in a 96px left margin (14/600) above a hairline, its content in the reading column beside it (above it on a phone or in a pane narrower than 34rem):

| Section | Content |
| --- | --- |
| Brief | the `header` slot, then the `evidence` and `body` slots in their order; the `description` leads as plain text without a label, the other fields follow as a field list |
| Structure | the `children` and `relations` modules, wherever the layout places them (see Relations); absent when the layout places neither |
| Details | the type first (its icon and name, `epic`, a preset without types named after itself; its type tag when the type has no icon; no row when the collection never marks its type, `typeMark`), then the rest of the `side` slot, then collection, created by (who and when), lease and updated |
| History | the timeline |

What the detail shows follows the item type's layout (`detailBlocks` in `ui/src/item-types.ts`, tested). The evidence list (every attached file) sits at the first evidence module (`images`, `recording`, `diff`, `log`), or after the fields when the layout places none. Reserved modules draw nothing yet. Values whose field the type does not declare still show, as plain text, at the end of the body. A type without a layout draws as before layouts: every field in the body. The list row draws the `row` slot (a module's `rowColumn` puts it in the priority column or among the signals), and the create form asks for the `intake` slot's fields, with a **Type** select after the collection when the collection has several types.

### The handoff line

One line under the title (`HandoffLine`, logic in `ui/src/handoff.ts`, tested) says who handed the item over, when and what they said, then what to look at first, each part after a short 1px rule (a part that wraps starts its line without one). It is read only from what the item holds, never guessed:

- **Who and when**: the item's last move, or its creation while nothing moved it: `claude-b moved it to review · 14m ago` (`created it` for a creation), the agent's mark first (`cb`, see *Agent marks*; none for you). A relayed decision names the agent that relayed it (`claude-a relayed your move to discarded`). The reason the move carried, or your relayed words, follows in quotes. A move says its target state; Otea never turns a state's name into a verb.
- **Evidence**: two image thumbnails (40×26, for a signed-in browser) and the count of files.
- **Severity**: when the type has a `severity` field with a value, its bars and level.
- **One relation**: the first the detail lists, children aside (`duplicates BUGS-1`, linking to it).
- **A parent**: instead of the relation, its children's bar and `4 of 5 open`, then `waiting for you:` with a link to each child on your turn.

### The band and the aside

On a wide pane the detail becomes two columns (`composition` and `detailForm` in `ui/src/detail-form.ts`, tested). It **fills the pane**: with C = pane − 80 (its two 40px gutters), stacked (pane < 1240) main is C; in two columns the aside is clamp(340, round(340 + (C − 1160) / 4), 440) and main is C − 48 − aside, so the aside takes a quarter of every pixel past the threshold and main the rest. No screen leaves an empty band on the right. Prose (the lead and markdown) keeps its 72ch measure inside main; fields, the evidence list (files side by side), children, relations and tables use the full width. The list keeps the width it was given: the detail never moves the divider. CSS computes the same widths from the pane, its container (`--aside` from `100cqw`, main the rest), so nothing waits for script while the divider is dragged.

| | Spec |
| --- | --- |
| Widths | 2560 with the sidebar open (pane 1506): main 978, aside 400. Folded (1682): main 1114, aside 440. The 48px gap holds a 1px `--line` rule at its middle. |
| The band | The header and Details form a band of two rows: the meta row has the first to itself, and the header's body and Details share the second, so "Details" (a 22px line) starts level with the title however the meta row wraps (the header is a subgrid of both rows). Details sits boxed in the second column, its rule running from the band's top to the line. |
| The line | One 1px `--line` hairline across both columns closes the band, 28px under the taller of the header and Details and 28px over the body. It replaces the Brief's own hairline. |
| Long Details | From the sixth row, Details shows five and a `N more` toggle (`detailsCut`), so the band never grows much past the header. |
| History | Below the line, beside Brief and Structure, its top on the Brief's label. Sticky 16px under the pane's top, never taller than the room under it (`asideHeight`, at least 240px), scrolling on its own; overscroll is contained. Mono time, the event wrapping under itself, who acted on a muted line below; one lane with today's dots (yours, an agent's, a relayed ring). In every form an older day sits over its time (31 Oct over 23:58, with the year from another year), and the time column is as wide as its longest label: 01:19 alone when everything happened today. |
| Stacked | No band: header, Brief, Structure, Details, History, in one column. |
| When it switches | The pane is measured with a `ResizeObserver` (`ui/src/components/detail-aside.ts`). While the divider is dragged the layout follows the pointer and the form waits for the release; a sidebar fold (or a step of the divider from the keyboard) switches at once; a window resize switches after 150ms of quiet. The pane always keeps its scrollbar's gutter (`scrollbar-gutter: stable`), so the width measured never depends on the form: otherwise a form that makes the pane scroll (the aside, or its travel, on a short item) narrows it under the threshold and the two forms swap every frame. |
| Motion | Details (into the band, or back under Structure) and History (beside the main column, or back to the end) travel from where they were (FLIP) on `--m-slow` with `--m-ease`, each on its own path of three legs (`travelPath`, tested): to two columns they go sideways first, out of the main column, then rise; back, they drop first while clear of it, then slide. The pane clips them horizontally, so a flight never gives it a scrollbar. Their content dips to 50% opacity while it re-flows. A pane that slides at the same time (a sidebar fold) carries them. Reduced motion: a 120ms crossfade. |

The phone's unfolded detail is always one column.

### Divider and sidebar

The divider (`Divider` in `ui/src/components/Split.tsx`, a `role="separator"` with `aria-valuemin`, `aria-valuemax` and `aria-valuenow`) resizes the list with pointer events. The list is 340–783px and the detail never goes under 440px (`clampListWidth`, `listMax` in `ui/src/split.ts`, tested). While it is dragged nothing animates: one CSS variable (`--list-w`) follows the pointer, frame by frame, without a render. Focused, the arrows move it 16px (64 with Shift) and Home and End jump to the limits. A double-click or Enter eases it back to the default (the list's share of the room; base, `--list-w` is a registered property so it animates on the tokens) and forgets the viewer's width. The width is kept per browser in `localStorage` (`otea.listWidth`); a browser that refuses storage starts from the default.

The collections sidebar (13.75rem, from 64rem) has a header of its own: a quiet toggle (the sidebar icon, `aria-expanded`, labelled *Hide collections* / *Show collections*, the same words as its tooltip) in front of its label. Folding it leaves a strip just wide enough for that toggle (8 + 28 + 8px), and the toggle never moves, in either state: the label and the collections fade (base) and clip out towards it (slow), and nothing else of the sidebar catches the pointer. The track keeps 24px of air after the sidebar or its strip, so the first lane sits 40px clear of the sidebar's edge and 48px clear of the toggle. The state is kept in `otea.sidebar`. Under reduced motion it folds at once. The list keeps the width it was given, so folding never reflows a row: the list and divider slide over and the detail takes the freed room, the panes measured before and after and played back as a transform (FLIP, slow). State lives in React state and storage, not the hash: the split is a way of looking, not a place, so links and history keep pointing at items. The phone layout is untouched: no divider, and the collections stay a row of pills.

### Keyboard

The web UI has **no keyboard shortcuts**: people drive it with the mouse, and keys to learn are friction. Nothing is bound to a letter or a chord, and no control shows a key hint. What stays is the platform's own keyboard: Tab and Shift+Tab reach every control in order, Enter and Space press buttons and follow links, form fields behave natively, and Esc closes what is open on top (the reason form, the link form) or leaves triage (`keyTargetOf` in `ui/src/keys.ts`: an Esc typed in a field belongs to the field). Widgets keep their ARIA keys: the divider's arrows, Home, End and Enter, the compare slider's arrows, and the arrows that step through a gallery or a strip of frames.

## Grid

A collection can be seen as a **grid**: a table of its items beside the list (canvas page 15). The preset chooses (`view: { kind: grid, group_by, columns }`), and the viewer can switch with the **List / Grid** pair at the end of the list head, after **group**, **filter** and (over the grid) **columns**. The choice, the grouping, the sort, the filters, the columns shown and the widths given to them belong to the collection, not to the view: switching keeps them and the list honours the grouping, sort and filters too. Each is kept per collection in `localStorage` (`otea.view.<collection>`, `otea.group.…`, `otea.sort.…`, `otea.filters.…`, `otea.columns.…`, `otea.widths.…`, read and written in try/catch; `ui/src/view-prefs.ts`, tested); a browser that refuses storage follows the preset. On read, unknown columns go, id and title come back and the order is the preset's; only resizable columns keep a width, clamped to their limits; a sort stays only on a column shown. *All items* keeps the list grouped by turn. Below 48rem there is no switch and no columns: the phone draws the list with the collection's grouping, sort and filters.

- **Columns** (`ui/src/grid.ts`, tested) come from `view.columns`, or from the viewer's choice in the **columns** menu (words and a count, no icon): a checkbox for every column the collection can draw, the built-ins (id, title, state, type, who, age) and every one-line field (enum, severity, text), a field marked with its kind; id and title are always shown (`always`), a ticked column the room cannot fit says `no room`. No reordering: a column takes its place in the preset's order (`availableColumns`: id first, a field the preset does not list after its last field, a built-in before who). Under a rule, **Reset widths** while a width is set and **Reset to preset** while the set differs from `view.columns`. Hiding a sorted column clears the sort; a filter on it stays, as its token says. Every row starts with the turn node on its lanes (56) and a select box (28), which are not columns. Automatic widths: id 72 (wider for a longer prefix), title flexes, an enum its longest value or label (≤ 160), severity 112 (52 as bars), text 160, state its longest state, who 44 (the mark alone, as in the list), age 60 (an age, or a lease's `12m left` as in the list), right-aligned. Beside the detail the table stops at 1320px; while nothing is open it runs the whole room (its head and filter tokens too).
- **Spare width** (`gridTemplate`, tested): with R = the table's width − 100 (turn 56, box 28, the row's 16) − the other shown columns, a title up to 560 takes all of R (no air); past that each further pixel goes a third to the title and two thirds to the **air**, one equal gap before each column after the title (`padding-left: var(--air)` inside its track), at most 128: air = min(128, ⌊(R − 560) × ⅔ ÷ n⌋), title = R − n × air. The table always fills its room. bug-triage: 1440 → title 404, air 0; 1920 → 668 / 36; 2560 → 882 / 107; 2560 with an item open (1320) → 545 / 0; 3440 → 1636 / 128.
- **Resizing**: every column but id, title, who and age has a handle on its edge facing the title (a column after it: its left edge, 9.5px before its label), a 9px `role="separator"` with `aria-valuenow/min/max`. Hovering the header draws a `--lane` hairline per edge; the edge under the pointer is 2px of ink at 45%, cursor `col-resize`. Dragging, the title alone gives or takes (the air holds still, so the edge stays under the pointer), a line runs down the rows and a chip says the width (`state · 150`, `auto` when it snaps within 6px of automatic, `min`, `max`); on release the spare is shared again, eased on base (at once under reduced motion). Limits: enum, type, state 64, severity 52 (bars only and `sev` under 112), text 80, at most 480, and never a title under 240. A double-click on the edge, or Enter on it, gives that column its automatic width back; its arrows move it 16px (64 with Shift), Home and End to its limits. A width is the column's content width; the air is never set by hand. When the room shrinks so the title would go under 240, widened columns give back towards automatic in proportion, then the tiers' drop order continues (the kept widths are not rewritten). Titles truncate with the whole title as their tooltip; a discarded title is struck, closed rows recede to `--mut`. A row waiting for you says so with its node: its state pill is never tinted.
- **Narrow**: the table's width decides (`gridTier` and `fitColumns`, a `ResizeObserver` on the pane and the table): ≥ 1000 every column; 880–999 the last listed enum or text field goes; 760–879 severity keeps only its bars (its header loses its menu); 640–759 the other enum and text fields go; under 640 the table is no longer a table and the pane draws the list, with everything the grid was set to. Within a tier, a field also leaves (the last listed first) rather than leave the title under 240. Id, title, severity, state, type, who and age never leave; with nothing left to drop, the title takes what remains.
- **Header**: sticky, mono 11.5. A click sorts within each group: first direction (ascending, severity descending), the other, then back to the default order; the arrow says the direction and the list head says it in words (`sorted by severity ↓`). Each column's caret opens its menu (who, as narrow as its mark, has none: a click on its label sorts it): sort either way, clear the sort, group by it, and, for a column with a set of values (enum, severity, state, type) or free text, **Show only** with a count per value; values with nothing left to show drop out, unless chosen. A free text field's values come from the items (`normalText`, `textValues`): trimmed, inner spaces collapsed and lowercased, so `Farm` and ` farm ` are one value, `farm`; listed A to Z, the empty one last as **No <field>**. The menus, the tokens and the group headers show that lowercase form; a cell keeps its own spelling; the filter is kept as those values. **group** offers turn (or the preset's grouping, marked `default`), state, type with several types, and every one-line field all types have (enum, severity, text; never the title); **filter** lists the filterable columns shown. Each filtered column is a token under the head (`category · crash, gameplay ×`), with **clear all**. Menus are `role="menu"`, reached with Tab or the arrows, closed with Esc (the focus goes back) or a press outside.
- **Groups** (`groupItems` in `ui/src/sections.ts`, tested): grouped by turn as the list; by anything else only the groups that hold items, values in their order (severity from the worst, its bars before the label; free text A to Z, lowercase), then items whose value the preset no longer lists, then `no <field>`. A group header shows `· N for you` when grouped by anything but turn. The lanes keep meaning turn whatever the grouping: a closed item inside a group sits on the trunk between them.
- **Bulk moves** (`bulkPlan` in `ui/src/bulk.ts`, tested): ticking rows (the box shows on hover, once anything is ticked, and on focus; shift-click ticks a range) docks a tray to the bottom edge of the grid pane (`BulkTray`; canvas BM-A, BM-A2): how many and of which states, then only the moves **every** selected item can take now, read from the API as the detail reads them; a move waiting for open children of any of them (`requires: children_closed`) is kept out too. A line says what is hidden and why (`hidden · accepted, needs_info: not for BUGS-9 (verify) · done: CREATURES-5 waits for 1 open child`), and with several states **keep only ▾** opens a menu of the states (with a count each). A move that asks a reason asks once in the tray and records the same reason on each; then the tray counts the posting one item at a time and says what landed (and what did not, and why) for six seconds.
- **The tray**: 80px tall, from the lanes (52px in) to the pane's edge (the scrollbar stays clear), over the rows, never over the detail: it lives in the grid pane's own cell laid over the scroller, so it spans the grid pane only. On a wide grid (room for 1120 and 48px each side, from about 1920 with nothing open, or with the sidebar folded at 1440) it is capped at 1120 and centred over the table (the pane right of the lanes, so it follows the sidebar), still docked to the bottom edge (canvas BM-Wc): a free-standing tab whose sides carry the edge, and in dark the glow (`--tray-sh-tab`); the who zone is 232 and the zones stay together. Narrower, it spans the pane as above. Its width never changes between states. Three fixed zones that keep one size in every state: who (264, 200 in a pane under 760: the box, `2 selected` at 17/600, the states in mono 12 on two lines at most, breaking only between states; when even two do not hold them, the states with the most items and `+N more`, the whole summary its tooltip and what assistive tech reads, `countsSummary`, tested), what (one 34px line, the rule under it), the way out (keep only, clear; dismiss on the receipt). The moves are 34px buttons, the closing ones last after a muted `close as`, as in the detail; a closing move keeps a hairline pill at rest (the tray buttons' edge, muted text, filled on hover) so it reads as a button, while `close as` stays a plain mono label, starting on the rule's x when it opens the line; as many as the line holds (measured, six at most, `fitMoves` and `trayMoves`, tested), the rest under **N more**, a menu that opens upward with its own `close as`. The reason field takes the middle line (up to 620). While the tray is up the list keeps 80px of room under its last row, so it scrolls clear. Surfaces are tokens: light `--tray` is `--sf` with an edge of ink 16% into `--line` and a soft upward shadow; dark lifts it to `oklch(0.305 0.017 265)` with buttons at `0.355`, a top highlight, a hairline and a faint neutral glow (`--tray-sh`), never your blue. Measured: count 15.25:1 light / 10.91:1 dark, muted 6.6 / 5.81, a button 15.25 / 9.01. Menus are `role="menu"` (Tab or arrows, Esc closes and gives the focus back); Esc in the reason goes back to the moves with the focus on the move; leaving the tray gives the focus back to the first ticked row.
- **The tray's motion**: it rises from the bottom edge (the dock grows 0 → 80 over slow, 280ms, `--m-ease`); the rows stay put and the rising edge covers the last ones. The zones follow 6px up: who +40ms, what +80ms, the way out +100ms. It leaves on base (200ms), the zones fading first (120ms), and keeps its last look while it goes (never `0 selected`); switching to the list it leaves the same way, alongside the morph, and rises again when the grid comes back with the selection. States swap inside the fixed tray: the old layer fades in 120ms, the new one comes in over 200ms from 4px below, 60ms later. Reduced motion: no height motion, the tray crossfades in 120ms.
- **The detail beside it**: the grid keeps its own width (`otea.gridWidth`, 340px up to what leaves the detail 440; by default up to 1320 leaving it 520, `split.ts`, tested). While nothing is open the grid takes the whole room, at every width: no divider and no empty detail (`data-detail="off"`). When an item opens the grid narrows to its width (`--grid-w` eased on slow, 280ms, `MOTION.ease`) while the detail comes in from 16px, already laid out at the width it lands on, so its text never reflows on the way; the detail's form waits for the easing to land (`ROOM_EASE`, `detail-aside.ts`), and the table keeps the room's measure until then (`data-easing`), so it never jumps. The detail's close button gives the room back on the same curve. An item already in the URL opens beside the grid directly. Reduced motion: the room switches at once and the detail crossfades in 120ms. The list keeps its detail pane and its message; the phone is unchanged. The detail keeps its whole composition (aside, band, moves).

**The morph.** Switching views is the same items rearranging (`ui/src/morph.ts`, tested; `components/morph-engine.ts`). Both views are laid out stacked for its duration, the workspace keeping the grid's room and the list its own width. One clock of **480ms** (`MORPH.duration`) drives everything: the shared pieces (node, title, id, state, who, age, group name and count, matched by `data-m`) are carried from their list place to their cell over the first 72% on the turn change's carry curve (`cubic-bezier(.65,0,.35,1)`), every row on the same curve so rows never overlap; the node scales 12 → 10px and the title 15 → 14px while its width follows. What only the grid has (header, select boxes, the field cells, row rules, the pill outline) resolves from 42%, left to right (+16%) and down the viewport (+8% at most), 26% each, out-cubic: opacity, a 6px slide and a 1.5px blur clearing. What only the list has dissolves over the first 22%, so going back it resolves last. One overlay stands in for both views' lanes, blending their paths. Only what is in view, or within 160px, moves; the rest swaps at the midpoint. Switching back midway turns the clock around from where it is; a late frame slows the clock (34ms at most a frame), never skips it. Reduced motion: the new view crossfades in 120ms.

## Timeline

The history in the detail (`ui/src/components/Timeline.tsx`) is the item's past, newest first, on **one straight lane** in lane grey: it never swings between lanes. A dot (8px) per event says who acted: filled in your color when a human did, ink when an agent did; the agent's mark leads its name. A decision the human made in conversation and an agent relayed (`otea relay`; the event carries `via`) is a **ring** in your color, never the filled dot of a decision made in the UI; its label reads `human, relayed by <agent>` instead of `human (ui)`, and the quote of what the human said follows on its own line, in quotation marks (`relayOf` in `ui/src/format.ts`, tested). The time is mono, `14:02` today and, before, the day over the time (`28 Oct` over `12:31`, with the year from another year; `momentParts`, tested); the events share the list's columns, so the time column is as wide as its longest label and no wider. The lane is drawn in CSS, so an event that wraps keeps its dot on its first line. Events that arrive while the item is open fade in from 8px above (base).

## Controls

- **Buttons** are pills: `Button` with `primary`, `quiet`, `sm` and `icon`. One primary per screen, always the move that hands the turn on (`moveVariants` in `ui/src/actions.ts`); moves that throw work away are quiet.
- **Moves** (`ItemActions`) are text only: the target state's name, with `…` when the move asks a reason; no icons, route glyphs or key letters. Moves that throw work away sit last, after a short rule and `close as`, quieter. On hover a line draws itself around the move, the list's line language: ink around a plain move, a 1.5px ring in your color 3px outside the primary, an underline (and text from `--mut` to `--ink`) under a closing move. Nothing fills. Focus keeps the native ring and draws nothing. One mono line under the row says what the hovered or focused move does, the primary's by default (`moveSays`, tested): whose turn it becomes, from the target state's turn (the agent named is the last one that acted on the item, `turnAgent`), and whether it leaves or joins Waiting for you, or plainly that it closes the item (`closes the item as discarded`), then `asks a reason first`. A move waiting for children is dashed, never drawn, with its reason beside it. Moves that need a reason open the reason form. Once a move you made lands, the line becomes its receipt (`accepted · now claude-b’s turn · just now`) until another move is hovered. The phone's bar of moves keeps one run, without `close as` or the line.
- **Pills** (`Pill`): mono tags; `ask` for an open question for you, `state` for a workflow state (tinted in your color when it waits for you); `size="sm"` inside a list row.
- **Type tag** (`TypeTag`): the item type's short name (`bug`, `impr`), mono 10.5/500 in `--mut`, in a square box (2px radius, 1px `--line` ring), so it never reads as a pill or a state; never in your color. Shown first in a row's meta line, in the detail's Details and the triage card tags, only when the item's collection has two or more types and the type has no icon (the icon marks it then); the label (`Improvement`) is its tooltip.
- **Type icons** (`TypeIcon`, `ui/src/icons/`): the icon a preset gives a type (`icon: bug`), drawn by Otea on a 24 grid with a 1.5px non-scaling stroke, round caps and joins, current color; a plain circle is never the silhouette (a circle is a turn node). 96 icons in six groups (work, code, design and media, docs and talk, game and creatures, status and flow). The names come from the core (`ICON_NAMES` in `src/core/icons.ts`) and the catalog is keyed by them, so a name without a drawing fails the UI typecheck. 16px before a row's title, 14px in a child row, a children or relations row and the detail's type row. No icon means no icon, and a name the UI does not know draws nothing.
- **Severity** (`Severity`): four signal bars; level 4 in `--warn`.
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
- **Waiting for children**: a move whose target state declares `requires: children_closed` (the move's `requires`), closing or not, is drawn disabled while the item's children summary has open children, never primary (the next eligible move takes it, or none), with a quiet mono note beside it (`waits for 3 open children`, `moveBlock` in `ui/src/actions.ts`). Triage's swipes and buttons never take it. The same holds in the phone's sticky moves bar and on triage cards, where it sits under the swipe buttons and is never swiped. The server refuses the move anyway.
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

**The theme switch** (`switchChoice` in `ui/src/theme-dom.ts`, CSS in `ui/src/styles/tokens.css`) is on the turn change's clock: the new theme opens as a circle from the centre of the toggle that was pressed until it covers the farthest corner of the window (`revealRadius` in `ui/src/motion.ts`, tested), `--travel` 680ms on `--e-move`. It is a same-document View Transition: the old snapshot holds still (no crossfade, `animation: none; mix-blend-mode: normal`) and `clip-path: circle()` animates on `::view-transition-new(root)`. It runs only when the theme on screen changes (`shownChanges` in `ui/src/theme.ts`, tested): system to light on a light system changes nothing. While it runs, `data-theme-switching` on `<html>` sets `transition: none` on everything, so no colour tweens inside the new snapshot; `color-scheme` flips with `data-theme`, so native scrollbars and inputs switch in step. A second press skips the running switch (`skipTransition()`) and starts the next from where the page is. The stored choice is applied before React mounts, so a load never transitions. Reduced motion: no view transition at all, the theme swaps at once (`switchMotion` in `ui/src/theme.ts`, tested), with transitions off for two frames so no colour tweens; a crossfade between light and dark passes through a washed-out grey. Without the API the theme changes at once. Same-document View Transitions ship in Chrome and Edge 111, Safari 18 (macOS and iOS) and Firefox 144 (MDN browser-compat-data), so an Electron shell gets it too.

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
- **Moves**: back, **Later** and the primary move; under them one mark per card of the pass (decided in ink, for later as a ring, the current one in your color).
- **Trays** (from 80rem): what was sent back to agents on the left, what was otherwise decided on the right, each settling in as it is decided.
- **Nothing to triage**: the stage keeps its size and says so (*Nothing waits for you*), with the way back. At the end of a pass the stage says *All caught up*, with what was decided and a way to see the ones left for later again.

The rule lives in `ui/src/triage.ts` (tested):

- **Right** is the primary move: the same one the primary button gets (`moveVariants`).
- **Left** sends the item back: the first other move whose target state is an agent's turn (each move the API returns says the turn it hands the item to). If that move requires a reason, the swipe (or the back button) opens the reason form on the card and moves nothing; Confirm makes the move, Esc cancels it. A gesture never performs a move that requires a reason.
- A direction with no move snaps back.
- A drag starts after 10px of mostly sideways motion (vertical motion scrolls the page: `touch-action: pan-y`). It commits past a third of the card's width (kept between 80 and 160px), or on a flick of at least 0.5px/ms over 40px in the same direction; otherwise the card settles back (slow). While it is dragged, the card tilts with the pull and a stamp names the move on the side it leans from; the cards behind rise with the pull.
- Motion, on the tokens (`ui/src/components/triage-flight.ts`): the mode comes in rising 8px (base). A decided card flies into its tray (slow, the shared easing): a copy above everything (`--z-flight`, from the z-index scale in `tokens.css`) moves onto the tray's new entry, shrinking to its size with at most a 1.5° tilt, and hands over to the entry, which is laid out from the start and fades in as the copy lands (`landingOf`, tested). Where the trays are not shown (under 80rem), and for a card left for later, it leaves with a short slide (48px in the move's direction, or 16px down) and is gone by 40% of it. The next card waits behind complete, its moves read ahead of time, so a card always rises whole. Under reduced motion the card crossfades.
- On a phone the head stacks, the card takes the width and the moves wait in a bar sticky to the bottom, in reach of a thumb.

Reduced motion: the unfold is instant, the card does not travel while dragged, and cards and the mode crossfade (fast).

## Bans

Side-stripe borders, gradient text, glassmorphism, hero-metric templates (big number, small label, stats), identical card grids, uppercase tracked eyebrows over every section, numbered section markers, cream or sand backgrounds, emoji icons.

## Layering

1. **Primitives** in `ui/src/kit/`: small, presentational, no data fetching. Done.
2. **Field and evidence modules**: the field module registry and its catalog are done (see Field modules). Evidence kinds (gif, mp4, png, diff, log, before/after compare) and loading local modules come next, on the same registry.
3. **Shells**: the workspace (Split with collections sidebar and divider), the lanes timeline and the turn-change motion are done. The phone layout (Unfold and swipe triage) is done. Evidence-led review views come next.
