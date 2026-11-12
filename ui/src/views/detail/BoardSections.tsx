import { type ReactNode, useState } from 'react';
import { useApp } from '../../app/context.tsx';
import { listOr, t, tx } from '../../i18n/i18n.ts';
import {
  Button,
  ChipButton,
  Dialog,
  Icon,
  MenuItem,
  MenuLabel,
  MenuNote,
  Pop,
  toast,
} from '../../kit/index.ts';
import { lookOf } from '../../lanes/looks.ts';
import { NodeGlyph } from '../../lanes/NodeGlyph.tsx';
import type { Item, ItemView, RelatedItem } from '../../types.ts';
import {
  type BranchStrip,
  type HandRow,
  type ItemLinks,
  type LinkedView,
  partsCount,
  type Round,
  type RoundNote,
  type WaitRow,
} from './board-item.ts';

// The item page of a Studio board (the mock's itemHtml, 75-cover.js): what its step waits for in
// the checklist's words (F12), the protected branch after the buttons (F10), the notes of every
// round (F9), its parts and its links both ways across boards (F11), and Descartar with a motive.

const lookOfLinked = (x: LinkedView, now: number) =>
  lookOf(
    {
      turn: x.turn ?? (x.closed ? 'none' : 'agent'),
      closes: x.ended,
      lease: null,
    } as unknown as Item,
    now,
  );

// The handoff checklist of your own step (the mock's itemChecklist): the note, then each part the
// step hands, with Rellenar on a field still missing; it opens in place and saves as you.
export function HandChecklist({
  item,
  rows,
  canWrite,
}: {
  item: Pick<ItemView, 'id' | 'title' | 'fields'>;
  rows: readonly HandRow[];
  canWrite: boolean;
}) {
  const app = useApp();
  const [open, setOpen] = useState<string | null>(null);
  const [value, setValue] = useState('');
  const [failed, setFailed] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  if (!rows.length) return null;
  const fill = (row: HandRow) => {
    setOpen(open === row.ref ? null : row.ref);
    setValue(item.fields[row.ref] ?? '');
    setFailed(null);
  };
  const save = (row: HandRow) => {
    if (!value.trim() || saving) return;
    setSaving(true);
    app
      .update(item.id, { [row.ref]: value })
      .then(
        () => {
          setOpen(null);
          toast({ msg: t('bi.hand.saved', { part: row.name, title: item.title }), id: item.id });
        },
        () => setFailed(t('bi.hand.failed', { part: row.name })),
      )
      .finally(() => setSaving(false));
  };
  return (
    <div className="bi-check bi-hand" data-c>
      {rows.map((row) => {
        const editing = open === row.ref && !!row.part;
        const options = row.part?.options ?? [];
        return (
          <div key={row.ref} className="bi-hrow">
            <div className={['hc', row.ok ? 'ok' : 'miss', row.required ? 'req' : ''].join(' ')}>
              <span className="bx">{row.ok ? <Icon name="check" /> : null}</span>
              <span className="hn">
                {row.name}
                {!row.ok && row.part && canWrite ? (
                  <>
                    {' '}
                    <button
                      type="button"
                      className="lnk"
                      aria-expanded={editing}
                      onClick={() => fill(row)}
                    >
                      {t('bi.hand.fill')}
                    </button>
                  </>
                ) : null}
              </span>
              <small>
                {row.ok
                  ? t('bi.hand.ready')
                  : row.required
                    ? t('bi.hand.missing')
                    : t('bi.hand.optional')}
              </small>
            </div>
            {editing && row.part ? (
              <form
                className="bi-fill"
                onSubmit={(e) => {
                  e.preventDefault();
                  save(row);
                }}
              >
                {options.length > 0 ? (
                  <select
                    aria-label={row.name}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                  >
                    <option value="" disabled>
                      {row.name}
                    </option>
                    {options.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                ) : row.part.kind === 'long' ? (
                  <textarea
                    aria-label={row.name}
                    rows={3}
                    value={value}
                    placeholder={row.part.hint || row.name}
                    onChange={(e) => setValue(e.target.value)}
                    // biome-ignore lint/a11y/noAutofocus: opened by its own button, to type at once
                    autoFocus
                  />
                ) : (
                  <input
                    aria-label={row.name}
                    value={value}
                    placeholder={row.part.hint || row.name}
                    onChange={(e) => setValue(e.target.value)}
                    // biome-ignore lint/a11y/noAutofocus: opened by its own button, to type at once
                    autoFocus
                  />
                )}
                <div className="actions">
                  <Button variant="primary" type="submit" disabled={!value.trim() || saving}>
                    {t('bi.hand.save')}
                  </Button>
                  <Button variant="quiet" type="button" onClick={() => setOpen(null)}>
                    {t('bi.hand.cancel')}
                  </Button>
                </div>
                {failed ? (
                  <p className="said warn" role="alert">
                    {failed}
                  </p>
                ) : null}
              </form>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

// "Que terminen Tareas de repo · 2 de 3 sin terminar", "Que nada lo frene · 1 lo frena / listo".
export function WaitChecklist({
  rows,
  child,
  now,
}: {
  rows: readonly WaitRow[];
  child: string;
  now: number;
}) {
  const app = useApp();
  if (!rows.length) return null;
  return (
    <div className="bi-check" data-c>
      {rows.map((row) => {
        const ok = row.open.length === 0;
        const name = row.kind === 'parts' ? t('bi.wait.parts', { child }) : t('bi.wait.blockers');
        const small =
          row.kind === 'parts'
            ? ok
              ? row.total
                ? t('bi.wait.partsClear')
                : t('bi.wait.partsNone')
              : t('bi.wait.partsOpen', { open: row.open.length, total: row.total })
            : ok
              ? t('bi.wait.ready')
              : t('bi.wait.blockersOpen', { count: row.open.length });
        return (
          <div key={row.kind} className={ok ? 'hc ok' : 'hc miss req'}>
            <span className="bx">{ok ? <Icon name="check" /> : null}</span>
            <span className="hn">
              {name}
              {ok ? null : (
                <span className="lks">
                  {row.open.map((x) => (
                    <button
                      key={x.id}
                      type="button"
                      className="lk2"
                      onClick={() => app.openItem(x.id)}
                    >
                      <NodeGlyph look={lookOfLinked(x, now)} size={12} />
                      {x.id}
                      {row.kind === 'blockers' ? ` · ${x.board}` : ''}
                      {x.step ? `${row.kind === 'blockers' ? ',' : ' ·'} ${x.step}` : ''}
                    </button>
                  ))}
                </span>
              )}
            </span>
            <small>{small}</small>
          </div>
        );
      })}
    </div>
  );
}

// "Rama feat/x en api · se puede subir / congelada mientras la revisas / se puede fusionar".
export function BranchLine({ strip }: { strip: BranchStrip | null }) {
  if (!strip) return null;
  const said =
    strip.key === 'noPush'
      ? t('bi.branch.noPush', { step: strip.step ?? '' })
      : t(`bi.branch.${strip.key}` as 'bi.branch.push');
  return (
    <div className={`bstrip ${strip.tone}`} data-c title={t('bi.branch.label')}>
      <Icon name="branch" />
      <span className="mono">{strip.value}</span>
      {strip.repo ? <span className="pvtag">{t('bi.branch.in', { repo: strip.repo })}</span> : null}
      <span className="sep">·</span>
      <span>{said}</span>
    </div>
  );
}

// "Parte de CAM-1 · Ajustar la nube", under the standfirst of a part.
export function PartOfLine({ parent }: { parent: LinkedView | null }) {
  const app = useApp();
  if (!parent) return null;
  return (
    <p className="relln" data-c>
      {t('bi.partOf')}{' '}
      <button type="button" className="lnk" onClick={() => app.openItem(parent.id)}>
        {parent.id}
        {parent.title ? ` · ${parent.title}` : ''}
      </button>{' '}
      <span className="pvtag">
        {parent.board}
        {parent.step ? `, ${parent.step}` : ''}
      </span>
    </p>
  );
}

function Sec({ label, gloss, children }: { label: string; gloss: string; children: ReactNode }) {
  return (
    <section className="isec" data-key={`isec:${label}`}>
      <div className="ch">
        <span className="margin-label">{label}</span>
        <span className="gloss">{gloss}</span>
      </div>
      {children}
    </section>
  );
}

function Prow({ x, now, extra }: { x: LinkedView; now: number; extra?: ReactNode }) {
  const app = useApp();
  const look = lookOfLinked(x, now);
  return (
    <div className="prow">
      <button type="button" className="pmain" onClick={() => app.openItem(x.id)}>
        <NodeGlyph look={look} size={16} />
        <span className="pid">{x.id}</span>
        <span className="pt2">{x.title ?? ''}</span>
        <span className={look === 'yours' ? 'pst you' : 'pst'}>{x.step ?? x.board}</span>
      </button>
      {extra}
    </div>
  );
}

// Partes: the parts with their step, how many have finished, and "+ Crear · Tarea de repo, parte
// de CAM-1" (the create dialog on the parts' board, the parent filled in).
export function PartsSection({
  item,
  links,
  boardName,
  childItem,
  childCollection,
  canWrite,
  now,
}: {
  item: ItemView;
  links: ItemLinks;
  boardName: string;
  childItem: string;
  childCollection: string;
  canWrite: boolean;
  now: number;
}) {
  const app = useApp();
  const n = partsCount(links.parts);
  return (
    <Sec
      label={boardName}
      gloss={n.total ? t('bi.parts.gloss', { ended: n.ended, total: n.total }) : t('bi.parts.none')}
    >
      <div className="plist">
        {links.parts.map((x) => (
          <Prow key={x.id} x={x} now={now} />
        ))}
      </div>
      {canWrite ? (
        <div className="addrow">
          <button
            type="button"
            className="addbtn"
            onClick={() =>
              app.newItem({
                board: childCollection,
                parent: {
                  id: item.id,
                  title: item.title,
                  collection: item.collection,
                  type: item.type,
                },
              })
            }
          >
            <Icon name="plus" />
            {t('bi.parts.add', { item: childItem, id: item.id })}
          </button>
        </div>
      ) : null}
    </Sec>
  );
}

// Enlaces: "Lo frena" and "Frena a", each with its picker and its note (F11), across boards.
export function LinksSection({
  item,
  links,
  canWrite,
  now,
  boardOf,
}: {
  item: ItemView;
  links: ItemLinks;
  canWrite: boolean;
  now: number;
  boardOf: (x: Item) => string;
}) {
  const app = useApp();
  const [pick, setPick] = useState<{ kind: 'blocked_by' | 'blocks'; anchor: HTMLElement } | null>(
    null,
  );
  const relation = (kind: RelatedItem['kind'], id: string) =>
    item.relations.find((r) => r.kind === kind && r.id === id);
  const unlink = (kind: 'blocked_by' | 'blocks', x: LinkedView) => {
    const r = relation(kind, x.id);
    if (!r) return;
    const [a, b] = kind === 'blocked_by' ? [x.id, item.id] : [item.id, x.id];
    void app.unlink(item.id, r).then(() =>
      toast({
        msg: tx('bi.links.removed', { a: <b>{a}</b>, b: <b>{b}</b> }),
        undo: () => void app.link(item.id, kind, x.id),
      }),
    );
  };
  const un = (kind: 'blocked_by' | 'blocks', x: LinkedView) =>
    canWrite ? (
      <button
        type="button"
        className="x"
        aria-label={t('bi.links.remove')}
        title={t('bi.links.remove')}
        onClick={() => unlink(kind, x)}
      >
        <Icon name="x" />
      </button>
    ) : null;
  const linked = new Set([
    item.id,
    ...item.relations.filter((r) => r.kind === 'parent' || r.kind === 'child').map((r) => r.id),
  ]);
  const candidates = (kind: 'blocked_by' | 'blocks') => {
    const taken = new Set(item.relations.filter((r) => r.kind === kind).map((r) => r.id));
    return app.all.filter((x) => !linked.has(x.id) && !taken.has(x.id) && !x.closes).slice(0, 9);
  };
  return (
    <Sec label={t('bi.links.title')} gloss={t('bi.links.gloss')}>
      {links.blockers.length ? (
        <>
          <p className="lsub">{t('bi.links.by')}</p>
          <div className="plist">
            {links.blockers.map((x) => (
              <Prow key={x.id} x={x} now={now} extra={un('blocked_by', x)} />
            ))}
          </div>
        </>
      ) : null}
      {links.blocking.length ? (
        <>
          <p className="lsub">{t('bi.links.to')}</p>
          <div className="plist">
            {links.blocking.map((x) => (
              <Prow key={x.id} x={x} now={now} extra={un('blocks', x)} />
            ))}
          </div>
        </>
      ) : null}
      {!links.blockers.length && !links.blocking.length ? (
        <p className="emptyx">{t('bi.links.none')}</p>
      ) : null}
      {canWrite ? (
        <div className="addrow">
          {(['blocked_by', 'blocks'] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              className="addbtn"
              aria-haspopup="menu"
              aria-expanded={pick?.kind === kind}
              onClick={(e) =>
                setPick(pick?.kind === kind ? null : { kind, anchor: e.currentTarget })
              }
            >
              <Icon name="plus" />
              {kind === 'blocked_by' ? t('bi.links.addBy') : t('bi.links.addTo')}
            </button>
          ))}
        </div>
      ) : null}
      <Pop
        open={!!pick}
        anchor={pick?.anchor ?? null}
        place="below-left"
        label={pick?.kind === 'blocks' ? t('bi.links.to') : t('bi.links.by')}
        onClose={() => setPick(null)}
      >
        <MenuLabel>{pick?.kind === 'blocks' ? t('bi.links.addTo') : t('bi.links.addBy')}</MenuLabel>
        {pick && candidates(pick.kind).length === 0 ? (
          <MenuNote>{t('bi.links.nothing')}</MenuNote>
        ) : null}
        {pick
          ? candidates(pick.kind).map((x) => (
              <MenuItem
                key={x.id}
                small={boardOf(x)}
                onPick={() => {
                  const kind = pick.kind;
                  setPick(null);
                  const [a, b] = kind === 'blocked_by' ? [x.id, item.id] : [item.id, x.id];
                  void app
                    .link(item.id, kind, x.id)
                    .then(() =>
                      toast({ msg: tx('bi.links.added', { a: <b>{a}</b>, b: <b>{b}</b> }) }),
                    );
                }}
              >
                <span className="bi-mi">
                  <NodeGlyph look={lookOf(x, now)} size={14} />
                  {x.id} · {x.title}
                </span>
              </MenuItem>
            ))
          : null}
        <MenuNote>
          {pick?.kind === 'blocks' ? t('bi.links.noteTo', { id: item.id }) : t('bi.links.noteBy')}
        </MenuNote>
      </Pop>
    </Sec>
  );
}

// Who wrote a round's note: you, or the agent by name.
const bylineOf = (n: RoundNote): string => {
  if (n.person) return n.kind === 'back' ? t('bi.rounds.backYou') : t('bi.rounds.handoffYou');
  return n.kind === 'back'
    ? t('bi.rounds.back', { by: n.by })
    : t('bi.rounds.handoff', { by: n.by });
};

// Rondas: each round of the step with its notes, the current one marked; a first round says so.
export function RoundNotes({ rounds, step }: { rounds: readonly Round[]; step: string }) {
  const last = rounds.length;
  const first = last === 1 && (rounds[0]?.notes.length ?? 0) === 0;
  return (
    <div className="bi-rounds" title={t('bi.rounds.gloss', { step })}>
      {first ? (
        <div className="rd on">
          <span className="rk">{t('bi.rounds.round', { n: 1 })}</span>
          <span className="rs">{t('bi.rounds.now')}</span>
          <p>{t('bi.rounds.first')}</p>
        </div>
      ) : (
        [...rounds].reverse().map((r) => (
          <div key={r.round} className={r.round === last ? 'rd on' : 'rd'}>
            <span className="rk">{t('bi.rounds.round', { n: r.round })}</span>
            <span className="rs">{r.round === last ? t('bi.rounds.now') : ''}</span>
            {r.notes.length ? (
              r.notes.map((n) => (
                <p key={`${n.at}:${n.kind}`}>
                  {n.text}
                  <small>{bylineOf(n)}</small>
                </p>
              ))
            ) : (
              <p className="none">{t('bi.rounds.none')}</p>
            )}
          </div>
        ))
      )}
    </div>
  );
}

// Descartar: the motives as a radio, a reason always. Each motive is its closed state
// dropped__<id>; a board without motives discards to plain dropped.
export type DropChoice = { to: string; name: string };

export function DropDialog({
  open,
  item,
  choices,
  onClose,
  onDrop,
}: {
  open: boolean;
  item: ItemView;
  choices: readonly DropChoice[];
  onClose: () => void;
  onDrop: (choice: DropChoice, reason: string) => void;
}) {
  return (
    <Dialog
      open={open}
      label={t('bi.drop.title', { id: item.id })}
      onClose={onClose}
      className="bi-dlg"
    >
      <DropForm
        key={String(open)}
        item={item}
        choices={choices}
        onClose={onClose}
        onDrop={onDrop}
      />
    </Dialog>
  );
}

function DropForm({
  item,
  choices,
  onClose,
  onDrop,
}: {
  item: ItemView;
  choices: readonly DropChoice[];
  onClose: () => void;
  onDrop: (choice: DropChoice, reason: string) => void;
}) {
  const motives = choices.length > 1 || choices[0]?.to !== 'dropped';
  const [picked, setPicked] = useState<DropChoice | null>(motives ? null : (choices[0] ?? null));
  const [why, setWhy] = useState('');
  const [hint, setHint] = useState('');
  const ok = () => {
    if (!picked) {
      setHint(t('bi.drop.pick', { list: listOr(choices.map((c) => c.name)) }));
      return;
    }
    if (!why.trim()) {
      setHint(t('bi.drop.needWhy'));
      return;
    }
    onDrop(picked, why.trim());
  };
  return (
    <>
      <h4 data-i="">{t('bi.drop.title', { id: item.id })}</h4>
      <p className="lede" data-i="">
        {t('bi.drop.lede')}
      </p>
      {motives ? (
        <div data-i="">
          <span className="flab">{t('bi.drop.motive')}</span>
          <div className="radios" role="radiogroup" aria-label={t('bi.drop.motive')}>
            {choices.map((c) => (
              <ChipButton
                key={c.to}
                on={picked?.to === c.to}
                onClick={() => {
                  setPicked(c);
                  setHint('');
                }}
              >
                {c.name}
              </ChipButton>
            ))}
          </div>
        </div>
      ) : null}
      <div data-i="">
        <label className="flab" htmlFor="bi-drop-why">
          {t('bi.drop.why')}
        </label>
        <textarea
          id="bi-drop-why"
          rows={2}
          value={why}
          placeholder={t('bi.drop.placeholder')}
          onChange={(e) => {
            setWhy(e.target.value);
            setHint('');
          }}
        />
      </div>
      <p className="dhint" role="alert">
        {hint}
      </p>
      <div className="dbtns" data-i="">
        <Button variant="quiet" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button variant="quiet" className="warn" onClick={ok}>
          {t('bi.drop.ok')}
        </Button>
      </div>
    </>
  );
}
