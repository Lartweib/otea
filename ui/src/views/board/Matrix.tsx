import { type ReactNode, useState } from 'react';
import { mappedScales, rolePart, type ScaleRole } from '../../../../src/core/board/analysis.ts';
import type { BoardDefinition } from '../../../../src/core/board/model.ts';
import { roleWord } from '../../board-studio/words.ts';
import { t } from '../../i18n/i18n.ts';
import type { Item } from '../../types.ts';
import { type Axes, axesOf, heatOf, type Matrix, matrixOf, orderList } from './matrix.ts';

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
        style={{ gridTemplateColumns: `minmax(64px, auto) repeat(${cols}, minmax(120px, 1fr))` }}
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
        title={guessed ? t('matrix.estimated', { agent: by ?? '' }) : item.title}
      >
        {pinned ? <span className="mx-pin">{t('matrix.top')}</span> : null}
        <span className="mx-t">{item.title}</span>
        {guessed ? <span className="mx-guess">{t('matrix.guess')}</span> : null}
      </button>
      <button type="button" className="mx-id" onClick={() => onOpen(item.id)}>
        {item.id}
      </button>
    </span>
  );
}
