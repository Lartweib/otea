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

## Controls

- **Buttons** are pills: `Button` with `primary`, `quiet`, `sm` and `icon`. One primary per screen, always the move that hands the turn on (`moveVariants` in `ui/src/actions.ts`); moves that throw work away are quiet.
- **Pills** (`Pill`): mono tags; `ask` for an open question for you, `state` for a workflow state (tinted in your color when it waits for you); `size="sm"` inside a list row.
- **Severity** (`Severity`): four signal bars; level 4 in `--warn`.
- **Kbd** (`Kbd`): keyboard hints inside buttons.
- **Icons** (`Icon`): thin (stroke 1.25), 16px, current color. No emoji.
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
| `--travel` + `--e-move` | 680ms `cubic-bezier(.65,0,.35,1)` | carry: a node or lane changing place |
| `--arrive` + `--e-out` | 520ms `cubic-bezier(.22,1,.36,1)` | arrive, morph |
| `--micro` | 160ms | hover, press |

Nothing blinks; only an agent at work keeps moving. Every animation has a `prefers-reduced-motion` fallback: transitions collapse to 1ms and the orbit stands still (the arc stays visible).

## Bans

Side-stripe borders, gradient text, glassmorphism, hero-metric templates (big number, small label, stats), identical card grids, uppercase tracked eyebrows over every section, numbered section markers, cream or sand backgrounds, emoji icons.

## Layering

1. **Primitives** in `ui/src/kit/`: small, presentational, no data fetching. Done.
2. **Field and evidence modules**: the field module registry and its catalog are done (see Field modules). Evidence kinds (gif, mp4, png, diff, log, before/after compare) and loading local modules come next, on the same registry.
3. **Shells** after: triage and review views composed from modules, including the detail timeline drawn as the item's own path swinging between lanes.
