import { type ReactNode, useState } from 'react';
import { mappedScales, rolePart, type ScaleRole } from '../../../../src/core/board/analysis.ts';
import type { BoardDefinition } from '../../../../src/core/board/model.ts';
import { roleWord } from '../../board-studio/words.ts';
import { t } from '../../i18n/i18n.ts';
import type { Item } from '../../types.ts';
import {
  type Axes,
  axesOf,
  heatOf,
  type Matrix,
  type MatrixCell,
  matrixOf,
  orderList,
  quadrantOf,
} from './matrix.ts';

// The Matrix (approved mock, "Vistas de análisis"), the fourth way to look at a board: its open
// items in cells, one mapped scale role across and another up, effort × risk by default. Tapping an
// item ticks it into the tray (Aceptar, Devolver, Encargo, Poner arriba, Fijar el orden), as in
// Tabla; its id opens it. What has no estimate waits aside; "Tu orden" is what agents take first.

const AXES_KEY = (collection: string) => `otea.matrix.axes.${collection}`;

function readAxes(collection: string): Partial<Axes> {
  try {
    const text = localStorage.getItem(AXES_KEY(collection));
    return text ? (JSON.parse(text) as Partial<Axes>) : {};
  } catch {
    return {};
  }
}

function keepAxes(collection: string, axes: Axes): void {
  try {
    localStorage.setItem(AXES_KEY(collection), JSON.stringify(axes));
  } catch {
    // A browser that refuses storage keeps the axes for this visit only.
  }
}

// The words of a step of a scale: a level reads in the language on screen.
function stepWord(def: BoardDefinition, role: ScaleRole, value: string, name: string): string {
  const part = rolePart(def, role);
  if (part?.kind !== 'level') return name;
  const word = t(`bs.level.${value}` as 'bs.level.low');
  return word.charAt(0).toLocaleUpperCase() + word.slice(1);
}

export function MatrixView({
  collection,
  def,
  items,
  ticked,
  onTick,
  onOpen,
  children,
}: {
  collection: string;
  def: BoardDefinition;
  items: readonly Item[];
  ticked: readonly string[];
  onTick: (id: string) => void;
  onOpen: (id: string) => void;
  children?: ReactNode;
}) {
  const [picked, setPicked] = useState<Partial<Axes>>(() => readAxes(collection));
  const axes = axesOf(def, picked);
  if (!axes) return null;
  const m = matrixOf(def, items, axes);
  const scales = mappedScales(def);
  const pick = (which: 'x' | 'y', role: ScaleRole) => {
    const next = axesOf(def, { ...axes, [which]: role }) ?? axes;
    setPicked(next);
    keepAxes(collection, next);
  };
  const order = orderList(items);
  return (
    <div className="matriz" data-mode="matriz">
      <div className="mx-axes">
        <label>
          <span>{t('matrix.across')}</span>
          <select value={axes.x} onChange={(e) => pick('x', e.target.value as ScaleRole)}>
            {scales.map((role) => (
              <option key={role} value={role}>
                {roleWord(role)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{t('matrix.up')}</span>
          <select value={axes.y} onChange={(e) => pick('y', e.target.value as ScaleRole)}>
            {scales.map((role) => (
              <option key={role} value={role}>
                {roleWord(role)}
              </option>
            ))}
          </select>
        </label>
        <p className="mx-hint">{t('matrix.hint')}</p>
      </div>
      <div className="mx-body">
        <Grid def={def} m={m} ticked={ticked} onTick={onTick} onOpen={onOpen} />
        <aside className="mx-side">
          <section>
            <h4>
              {t('matrix.aside')} · {m.aside.length}
            </h4>
            {m.aside.length === 0 ? (
              <p className="mx-none">{t('matrix.asideNone')}</p>
            ) : (
              <div className="mx-chips">
                {m.aside.map((it) => (
                  <Chip
                    key={it.id}
                    item={it}
                    on={ticked.includes(it.id)}
                    onTick={onTick}
                    onOpen={onOpen}
                  />
                ))}
              </div>
            )}
          </section>
          <section>
            <h4>{t('matrix.order')}</h4>
            {order.length === 0 ? (
              <p className="mx-none">{t('matrix.orderNone')}</p>
            ) : (
              <ol className="mx-order">
                {order.map((it) => (
                  <li key={it.id}>
                    {it.priority?.pin !== undefined ? (
                      <span className="mx-top">{t('matrix.top')}</span>
                    ) : null}
                    <button type="button" className="mx-oid" onClick={() => onOpen(it.id)}>
                      {it.id}
                    </button>
                    <span className="mx-ot">{it.title}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </aside>
      </div>
      {children}
    </div>
  );
}

// The name of a cell's quadrant, said once per quadrant: in the corner cell of the grid it holds.
function quadrantWord(m: Matrix, cell: MatrixCell): string | undefined {
  const quadrant = quadrantOf(m, cell);
  return quadrant ? t(`matrix.quad.${quadrant}` as 'matrix.quad.quick') : undefined;
}
function corner(m: Matrix, cell: MatrixCell): string | undefined {
  const edgeX = cell.x === 0 || cell.x === m.xs.length - 1;
  const edgeY = cell.y === 0 || cell.y === m.ys.length - 1;
  return edgeX && edgeY ? quadrantWord(m, cell) : undefined;
}

function Grid(p: {
  def: BoardDefinition;
  m: Matrix;
  ticked: readonly string[];
  onTick: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const cols = p.m.xs.length;
  return (
    <section
      className="mx-wrap"
      aria-label={t('matrix.label', { x: roleWord(p.m.axes.x), y: roleWord(p.m.axes.y) })}
    >
      <div
        className="mx-grid"
        style={{ gridTemplateColumns: `minmax(48px, auto) repeat(${cols}, minmax(92px, 1fr))` }}
      >
        {p.m.rows.map((row, r) => {
          const step = p.m.ys[p.m.ys.length - 1 - r];
          return (
            <div key={step?.value ?? r} className="mx-row">
              <div className="mx-ylab">
                {step ? stepWord(p.def, p.m.axes.y, step.value, step.name) : ''}
              </div>
              {row.map((cell) => (
                <div key={cell.x} className={`mx-cell h${heatOf(p.m, cell)}`}>
                  {corner(p.m, cell) ? <span className="mx-quad">{corner(p.m, cell)}</span> : null}
                  {cell.items.map((it) => (
                    <Chip
                      key={it.id}
                      item={it}
                      on={p.ticked.includes(it.id)}
                      onTick={p.onTick}
                      onOpen={p.onOpen}
                    />
                  ))}
                </div>
              ))}
            </div>
          );
        })}
        <div className="mx-row mx-xrow">
          <div className="mx-corner" />
          {p.m.xs.map((step) => (
            <div key={step.value} className="mx-xlab">
              {stepWord(p.def, p.m.axes.x, step.value, step.name)}
            </div>
          ))}
        </div>
      </div>
      <p className="mx-title">
        {roleWord(p.m.axes.x)} → · {roleWord(p.m.axes.y)} ↑
      </p>
      {p.m.rows.some((row) =>
        row.some((cell) => cell.items.some((it) => Object.keys(it.estimates ?? {}).length > 0)),
      ) ? (
        <p className="mx-legend">{t('matrix.legend')}</p>
      ) : null}
    </section>
  );
}

function Chip({
  item,
  on,
  onTick,
  onOpen,
}: {
  item: Item;
  on: boolean;
  onTick: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const guessed = Object.keys(item.estimates ?? {}).length > 0;
  const by = Object.values(item.estimates ?? {})[0];
  const pinned = item.priority?.pin !== undefined;
  return (
    <span className={`mx-chip${on ? ' on' : ''}${guessed ? ' guess' : ''}`}>
      <button
        type="button"
        className="mx-tick"
        aria-pressed={on}
        onClick={() => onTick(item.id)}
        title={
          guessed ? `${item.title} · ${t('matrix.estimated', { agent: by ?? '' })}` : item.title
        }
      >
        <span className="mx-t">{item.title}</span>
      </button>
      <span className="mx-meta">
        <button type="button" className="mx-id" onClick={() => onOpen(item.id)}>
          {item.id}
        </button>
        {pinned ? <span className="mx-pin">{t('matrix.top')}</span> : null}
        {guessed ? (
          <span className="mx-guess" title={t('matrix.estimated', { agent: by ?? '' })}>
            {t('matrix.guess')}
          </span>
        ) : null}
      </span>
    </span>
  );
}

// The Matrix on the phone (approved mock): a matrix does not fit 390 px, so a small grid of counts
// is the index (tapping a cell keeps the list to it) and the list below goes zone by zone, rows of
// 48 px whose whole width ticks the item. The tray docks at the bottom: Poner arriba, Fijar el
// orden. The axes are effort × risk, or the board's first two scales.
export function PhoneMatrix({
  def,
  items,
  ticked,
  onTick,
  onOpen,
  onPin,
  onOrder,
}: {
  def: BoardDefinition;
  items: readonly Item[];
  ticked: readonly string[];
  onTick: (id: string) => void;
  onOpen: (id: string) => void;
  onPin: (ids: string[], pinned: boolean) => void;
  onOrder: (ids: string[]) => void;
}) {
  const [zone, setZone] = useState<string | null>(null);
  const axes = axesOf(def);
  if (!axes) return null;
  const m = matrixOf(def, items, axes);
  const ykey = (y: number) => m.ys[y];
  const xWord = (x: number) => stepWord(def, axes.x, m.xs[x]?.value ?? '', m.xs[x]?.name ?? '');
  const yWord = (y: number) => stepWord(def, axes.y, ykey(y)?.value ?? '', ykey(y)?.name ?? '');
  // Each value beside its axis («Esfuerzo: L · Riesgo: Crítica»): two bare values did not say
  // which was which (IDEA2-5).
  const zoneName = (x: number, y: number) =>
    `${roleWord(axes.x)}: ${xWord(x)} · ${roleWord(axes.y)}: ${yWord(y)}`;
  const cells = m.rows.flat().filter((cell) => cell.items.length > 0);
  const shown = zone === null ? cells : cells.filter((cell) => `${cell.x},${cell.y}` === zone);
  const picked = items.filter((it) => ticked.includes(it.id));
  const order = orderList(items);
  const allPinned = picked.length > 0 && picked.every((it) => it.priority?.pin !== undefined);
  return (
    <div className="pmx" data-mode="matriz">
      <p className="pmx-sub">
        {roleWord(axes.x)} × {roleWord(axes.y)} · {t('matrix.estimatedCount', { count: m.placed })}
      </p>
      <div className="pmx-plot">
        {/* The axes named on the grid, as the desk names them (IDEA2-5): the rows' values beside
          them, the columns' under them; the cells already say both to a screen reader. */}
        <span className="pmx-axis y" aria-hidden="true">
          ↑ {roleWord(axes.y)}
        </span>
        <div
          className="pmx-ys"
          aria-hidden="true"
          style={{ gridTemplateRows: `repeat(${m.rows.length}, minmax(0, 1fr))` }}
        >
          {m.rows.map((row) => (
            <span key={row[0]?.y} className="pmx-y">
              {row[0] ? yWord(row[0].y) : ''}
            </span>
          ))}
        </div>
        <fieldset
          className="pmx-grid"
          style={{ gridTemplateColumns: `repeat(${m.xs.length}, minmax(0, 1fr))` }}
          aria-label={t('matrix.label', { x: roleWord(axes.x), y: roleWord(axes.y) })}
        >
          {m.rows.flat().map((cell) => {
            const key = `${cell.x},${cell.y}`;
            return (
              <button
                key={key}
                type="button"
                className={`pmx-cell h${heatOf(m, cell)}`}
                aria-pressed={zone === key}
                aria-label={`${zoneName(cell.x, cell.y)}: ${cell.items.length}`}
                disabled={cell.items.length === 0}
                onClick={() => setZone(zone === key ? null : key)}
              >
                {cell.items.length}
              </button>
            );
          })}
        </fieldset>
        <div
          className="pmx-xs"
          aria-hidden="true"
          style={{ gridTemplateColumns: `repeat(${m.xs.length}, minmax(0, 1fr))` }}
        >
          {m.xs.map((x, i) => (
            <span key={x.value} className="pmx-x">
              {xWord(i)}
            </span>
          ))}
        </div>
        <span className="pmx-axis x" aria-hidden="true">
          {roleWord(axes.x)} →
        </span>
      </div>
      {shown.map((cell) => (
        <section key={`${cell.x},${cell.y}`} className="pmx-zone">
          <h3>
            <span>
              {quadrantWord(m, cell) ? (
                <em className="pmx-quad">{quadrantWord(m, cell)} · </em>
              ) : null}
              {zoneName(cell.x, cell.y)}
            </span>{' '}
            <b>{cell.items.length}</b>
          </h3>
          {cell.items.map((it) => (
            <PhoneRow
              key={it.id}
              item={it}
              on={ticked.includes(it.id)}
              onTick={onTick}
              onOpen={onOpen}
            />
          ))}
        </section>
      ))}
      {zone === null && m.aside.length > 0 ? (
        <section className="pmx-zone">
          <h3>
            <span>{t('matrix.aside')}</span> <b>{m.aside.length}</b>
          </h3>
          {m.aside.map((it) => (
            <PhoneRow
              key={it.id}
              item={it}
              on={ticked.includes(it.id)}
              onTick={onTick}
              onOpen={onOpen}
            />
          ))}
        </section>
      ) : null}
      {zone === null && order.length > 0 ? (
        // The order you fixed, as the desk's side column lists it (IDEA2-5).
        <section className="pmx-zone">
          <h3>
            <span>{t('matrix.order')}</span> <b>{order.length}</b>
          </h3>
          <ol className="mx-order">
            {order.map((it) => (
              <li key={it.id}>
                {it.priority?.pin !== undefined ? (
                  <span className="mx-top">{t('matrix.top')}</span>
                ) : null}
                <button type="button" className="mx-oid" onClick={() => onOpen(it.id)}>
                  {it.id}
                </button>
                <span className="mx-ot">{it.title}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
      {picked.length > 0 ? (
        <div className="pmx-tray">
          <button
            type="button"
            onClick={() =>
              onPin(
                picked.map((it) => it.id),
                !allPinned,
              )
            }
          >
            {allPinned ? t('boardView.tray.unpin') : t('boardView.tray.pin')}
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => onOrder(picked.map((it) => it.id))}
          >
            {t('boardView.tray.setOrder')} · {picked.length}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function PhoneRow({
  item,
  on,
  onTick,
  onOpen,
}: {
  item: Item;
  on: boolean;
  onTick: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const guessed = Object.keys(item.estimates ?? {}).length > 0;
  return (
    <div className={`pmx-row${on ? ' on' : ''}`}>
      <button type="button" className="pmx-tick" aria-pressed={on} onClick={() => onTick(item.id)}>
        <span className="pmx-box" aria-hidden="true">
          {on ? '✓' : ''}
        </span>
        <span className="pmx-title">{item.title}</span>
        {item.priority?.pin !== undefined ? (
          <span className="mx-pin">{t('matrix.top')}</span>
        ) : null}
        {guessed ? <span className="mx-guess">{t('matrix.guess')}</span> : null}
      </button>
      <button type="button" className="pmx-id" onClick={() => onOpen(item.id)}>
        {item.id}
      </button>
    </div>
  );
}
