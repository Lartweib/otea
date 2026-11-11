# Design

The visual system of the Otea web UI, called **Editorial**. [`PRODUCT.md`](PRODUCT.md) says who it is for and how it should feel; this file says how it is built and why. The numbers live in the build contract (`SPEC.md` of the Otea next work) and, in code, in [`ui/src/styles/tokens.css`](ui/src/styles/tokens.css), [`ui/src/motion/`](ui/src/motion/), [`ui/src/lanes/`](ui/src/lanes/) and [`ui/src/kit/`](ui/src/kit/). Where this file and the code disagree, the code is right and this file is stale.

The bar is the owner's: *lindo, cuidado y detallista*. Simplifying must never make it poorer.

## The idea

Two vertical lanes run down every list: the **agents' lane** on the left (x 16.5), **your lane** on the right (x 40.5). Every item is a node on the lane of whoever has the turn. Where closed work starts, both lanes bend into one **trunk** (x 28.5) and run on together: done and discarded work rests on it, at the foot of the list. A parent's children hang from it on a thin **branch** with 7 px elbows. Whose turn it is can be read before any text, and the lanes carry light where something is alive.

## The look

**Ground.** A cool near-white (dark: a deep blue-grey), never pure white or black; every neutral carries a trace of hue 266. The main pane is a dotted ground: 22 px grid, a 0.9 px dot in `--dot`. Sheets (`--sheet`) sit on it a step lighter.

**Three faces**, all shipped in the bundle (Fontsource, no CDN; the app works offline):

| Face | Role | Where |
| --- | --- | --- |
| Newsreader (variable, opsz 6-72) | the voice | display titles (opsz 72), headlines (60), section heads (24), row titles (18), deks and notes in italic |
| Schibsted Grotesk (variable) | the interface | buttons, labels, the mark, meta lines |
| DM Mono | the machine | ids, ages, counts, states, commands |

**Colour means you.** `--you` (a saturated blue) belongs only to what is yours: your nodes, your lane, the one primary button, the light on your nodes. `--warn` is a stuck agent or a critical severity, never decoration. Agents are ink. Closed work is `--closed` grey. Text set in your colour uses `--you-ink`. Turn and state are never colour alone: the node's shape always says it too.

**Tokens** (`tokens.css`, light, `prefers-color-scheme: dark` unless the person chose light, and `data-theme="dark"`): `--ground --sheet --dot --well --hov --sel --ink --ink-2 --ink-3 --rule --rule-2 --lane --you --you-ink --you-wash --tint --on-you --warn --closed --fig --fig-line --shadow --scrim`, the agent-mark lightness and chroma `--mk-*`, the light's `--glow-*`, `--gl-a`, `--gl-ag`, `--lane-lit`, `--glow-lit`, and `--plus/--minus` for diffs. Not themed: the three families, `--ease` (hover and press only), the four curves `--o-settle --o-glide --o-drift --o-ink`, the steps `--t-hover 120 --t-fade 240 --t-small 360 --t-surface 440 --t-pane 600`, `--listw`, `--rail-w`, and the z-scale. `tokens-legacy.css` maps today's names onto these until nothing uses them.

**Type classes** (`base.css`): `.kicker` (caps 10.5, tracked), `.display` (serif 56), `.dek` (italic serif 18), `.id`, `.n` (mono counts that roll), `.margin-label`, `svg.ic` (16 px icons, stroke 1.35).

**Agent marks.** An agent is its lowercase initials on a small chip in one of five hues (150, 32, 318, 212, 75), picked by a stable hash of the name, the same everywhere; you are "tú" on your wash; nobody is a dash.

## The nodes

Seven looks (`lanes/looks.ts`), drawn exactly as the mock draws them, each on a 6 px knockout of the ground so the lane never runs through a node:

- **yours**: a filled blue disc.
- **working**: an ink ring with an orbit turning every 2.2 s (an agent holds a lease).
- **queued**: a quiet ring. **waiting**: the same, dashed (its children are open).
- **stuck**: a warn ring with a warn dot (the lease ran out, nobody released it).
- **done**: a grey disc with a check. **dropped**: a grey ring struck through.

## The lane light

The light lies **on top of** the lane, never under it (the SVG draws lines, then light, then branches, then effects). It is the Instrument's *litSegment*: a straight stretch of the lane carries current, brightest at the node, as a 4 px blurred stroke (blur 2.4, opacity `--glow-lit`) under a 1.5 px core.

- **Your nodes**: a 60 px blue stretch and a soft halo (r 13 blur 6 at .3, r 7.5 blur 2.5 at .5), breathing slowly (5.6 s), out of step node to node.
- **Working agents**: 30 px each way in `--lane-lit`, with a small halo.
- **Stuck agents**: 22 px each way in red, with a small halo.

Atasco lights only the stuck. The light rests (fades out, comes back where the rows land) while a list re-lays itself out. Under reduced motion it stays, still.

## Motion

Four curves, the same in CSS (`linear()` tokens) and JS (`motion/curves.ts`; a test keeps the strings equal): **settle** (critically damped, for things that land), **glide** (a little velocity, for things that slide in), **drift** (soft, for opacity), **ink** (the pen: an even stroke that lifts off softly, for lines). Nothing bounces.

Durations grow with distance on a square root (`Tt.travel`, `Tt.line`, `Tt.morph`); the handoff's travel is `clamp(480 + 28√d, 560, 1040)` ms.

The rules every gesture follows:

- **Lines lead**, surfaces follow 40-60 ms later, content resolves 70-90 ms after the surface, overlapped, never "then".
- **The first frame is the starting pose.** A gesture writes its first frame in the same task as the change, so nothing is ever painted at its destination first.
- **Every close is its open mirrored in space**: the same parts, durations and curves, the order reversed (`Choreo`, `mirrorDelays`).
- **Any gesture reverses from where it is** (a running part restarts from its computed value).
- **No global queue for gestures.** Only data writes are queued (`app/queue.ts`); opening, closing, switching views, folding and menus never wait.
- **Nothing blinks**: no layout change in one frame inside a gesture; a surface never shows empty; words that change swap in place (`Swap`), counts roll digit by digit (`Count`).
- **Reduced motion** (system, or the Movimiento preference): every recipe becomes a 160 ms crossfade in place; nothing travels, scales or blurs; lines appear drawn; perpetual motion rests.

**Lists draw in.** The first thing a person sees: the lanes draw top to bottom on ink, the light fades in behind, each row resolves as the pen reaches it. Leaving a view, its lanes undraw.

## The handoff

Every data change in a list is one gesture (`lanes/handoff.ts`): a row that changes lane or section is **carried**, the rows between **make room**, new rows **enter**, gone rows **leave**, a look that changes in place is **restyled**, and counts roll when the carried row is half-way. In Te toca closed work sinks into the trunk and work an agent hands you comes out of its lane.

Two styles, a preference (Traspaso):

- **Plegar** (default): the row folds into a line of light at its node's height, the line is absorbed into the node, a small fibre-optic pulse (6 px bright core, tight glow, a 46 px trail in its live colour) travels along the lane changing colour (you blue, agents ink, stuck red, closed grey), and the destination row unfolds from a line that grows out of the node; the pulse blooms as it lands and the new look grows out of it. Fold 420 ms, travel as above, unfold 460 ms.
- **Deslizar**: the row lifts in a bell, a raised plate, while its node shrinks into the pulse and grows out of it at the destination.

## Layout

A 60 px topbar (project pill and menu, the centred mark, the agents pill into Actividad) over the rail (244 px, folding to a 60 px strip) and the main pane. Views scroll inside the main pane. An open item sits **beside** the list: the list takes a third of the room (520-783 px, remembered per kind when dragged), the divider is 9 px, the sheet takes all the rest, and from a 1240 px sheet the detail becomes two columns. The phone (up to 720 px) is one column: the item is a page, the rail a sheet from below.

## The screens

- **Te toca**: Atasco, Preguntas para ti, Revisiones, Tus propios pasos, En camino, Cerrados (the closed work on the trunk), and the agents column with each agent's two-hour trace. **Atasco**: only what went quiet.
- **Boards**: Pasos (columns by step), Lista (the lanes) and Tabla (sortable, resizable columns, ticks and the bulk tray), morphing into each other.
- **The item**: the bar, the headline and its standfirst, the route (the two lanes laid flat, with a round dip for every send-back), the moves (Aprobar, Devolver…, answering a question in place, Deshacer), Detalles, the body and evidence, the structure and Historial; a pen-drawn line joins the row to the headline.
- **Triaje**, **Actividad** (leases running down, the latest events), **Te espera** (every project), **Configuración**, **Emparejar**, **Encargo**, **Nuevo ítem**, and **Studio**, **Personalizar vista** and the module catalog in the same language.

## Words

The interface speaks English and Spanish (`ui/src/i18n`, one file per area). Spanish is the mock's, *de tú*: ítem (never "elemento"), tablero, paso, Pasos, Lista, Tabla, ronda, turno, Te toca, Atasco, Hecho, Descartado; Devolver is only what you send back; agents *entregan*. The glossary heads `ui/src/i18n/es.ts`.
