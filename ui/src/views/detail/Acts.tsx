import { type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { useApp } from '../../app/context.tsx';
import { mainPath } from '../../derive/path.ts';
import { whenText } from '../../derive/when.ts';
import { t, tx } from '../../i18n/i18n.ts';
import { Button, MenuItem, MenuLabel, MenuNote, Pop, Swap, toast } from '../../kit/index.ts';
import type { Look } from '../../lanes/looks.ts';
import { C } from '../../motion/curves.ts';
import { reduced } from '../../motion/reduced.ts';
import { parseOptions } from '../../options.ts';
import type { ItemView, TypeView } from '../../types.ts';
import type { Facts } from './facts.ts';
import { toastOf } from './frame.ts';
import { type MoveChoice, type MovePlan, moveSaysOf } from './moves.ts';

// The moves and what stands in for them (SPEC §10.3, mock:2689-2702): the moves with the line that
// says what the hovered one does; a question answered in place; the stuck item's commands; the
// dashed block of a move waiting for children; the receipt of an agent's or a closed item's turn.
// When the item changes, the old block and the new are both present while one leaves and the other
// arrives, and the box's height glides (mock:3150-3162).

export type ActsMode = 'moves' | 'qa' | 'stuck' | 'wait' | 'receipt' | 'read';

export function actsModeOf(o: {
  look: Look;
  canWrite: boolean;
  question: boolean;
  plan: MovePlan;
}): ActsMode {
  if (!o.canWrite) return 'read';
  if (o.look === 'yours') {
    if (o.question && o.plan.quiet.some((c) => c.kind === 'sendback')) return 'qa';
    if (!o.plan.primary && o.plan.quiet.some((c) => c.blocked)) return 'wait';
    return 'moves';
  }
  if (o.look === 'stuck') return 'stuck';
  if (o.look === 'waiting') return 'wait';
  return 'receipt';
}

type ActsProps = {
  item: ItemView;
  type: TypeView | undefined;
  facts: Facts;
  look: Look;
  plan: MovePlan;
  mode: ActsMode;
  word: (state: string) => string;
  notesOpen: MoveChoice | null;
  onNotes: (choice: MoveChoice, button: HTMLButtonElement) => void;
};

// Both blocks present while one leaves and the other arrives; the height glides 440 settle, and the
// blocks below it follow (mock:3150-3162).
function ActsBox({ k, children }: { k: string; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const cur = useRef<HTMLDivElement>(null);
  const last = useRef<{ k: string; html: string; h: number } | null>(null);
  useLayoutEffect(() => {
    const el = box.current;
    const now = cur.current;
    if (!el || !now) return;
    const before = last.current;
    last.current = { k, html: now.innerHTML, h: el.offsetHeight };
    if (!before || before.k === k) return;
    if (reduced()) {
      now.animate([{ opacity: 0.3 }, { opacity: 1 }], { duration: 160, easing: C.drift });
      return;
    }
    const old = document.createElement('div');
    old.innerHTML = before.html;
    old.setAttribute('aria-hidden', 'true');
    old.setAttribute('inert', '');
    Object.assign(old.style, {
      position: 'absolute',
      left: '0',
      right: '0',
      top: '0',
      pointerEvents: 'none',
    });
    el.appendChild(old);
    old
      .animate(
        [
          { opacity: 1, transform: 'none' },
          { opacity: 0, transform: 'translateY(-4px)' },
        ],
        { duration: 260, easing: C.glide, fill: 'forwards' },
      )
      .finished.then(
        () => old.remove(),
        () => old.remove(),
      );
    now.animate(
      [
        { opacity: 0, transform: 'translateY(6px)', filter: 'blur(1px)' },
        { opacity: 1, transform: 'none', filter: 'blur(0px)' },
      ],
      { duration: 380, delay: 60, easing: C.glide, fill: 'backwards' },
    );
    const h1 = el.offsetHeight;
    if (Math.abs(h1 - before.h) > 1) {
      el.animate([{ height: `${before.h}px` }, { height: `${h1}px` }], {
        duration: 440,
        easing: C.settle,
      });
      const sheet = el.closest('.sheet-in');
      const below = [sheet?.querySelector('.d-details'), sheet?.querySelector('.d-main')].filter(
        (x): x is Element => !!x && getComputedStyle(x).gridColumnStart !== '2',
      );
      for (const x of below)
        x.animate([{ transform: `translateY(${before.h - h1}px)` }, { transform: 'none' }], {
          duration: 440,
          easing: C.settle,
        });
    }
  });
  return (
    <div className="acts" data-c data-k={k} ref={box}>
      <div ref={cur}>{children}</div>
    </div>
  );
}

function SaysLine({ text }: { text: { verb: string; state: string; tail: string } | null }) {
  const k = text ? `${text.verb}|${text.state}|${text.tail}` : '';
  return (
    <Swap k={k} as="div" className="movesays" dy={3} outT={200} inT={300} inDelay={40}>
      {text ? (
        <>
          {text.verb} <b>→ {text.state}</b> · {text.tail}
        </>
      ) : (
        ' '
      )}
    </Swap>
  );
}

function copy(text: string): void {
  void navigator.clipboard?.writeText(text).catch(() => undefined);
  toast({ msg: tx('sheet.stuck.copied', { command: <code>{text}</code> }) });
}

export function Acts({ item, type, facts, look, plan, mode, word, notesOpen, onNotes }: ActsProps) {
  const app = useApp();
  const [pointed, setPointed] = useState<MoveChoice | null>(null);
  const [reassign, setReassign] = useState<HTMLButtonElement | null>(null);
  const [stuckSays, setStuckSays] = useState<'resume' | 'reassign'>('resume');
  const [opt, setOpt] = useState<string | null>(null);
  const [free, setFree] = useState('');
  const agent = facts.agent;
  const says = (c: MoveChoice | null) =>
    c ? moveSaysOf(c, { agent, round: facts.round, word }) : null;

  const make = (c: MoveChoice, reason = '') => {
    const kind = c.move.closes === 'done' && c.kind !== 'own' ? 'close' : c.kind;
    void app.move(item.id, c.move.to, reason, toastOf(kind, item.title, word(c.move.to)));
  };
  const choose = (c: MoveChoice, button: HTMLButtonElement) => {
    if (c.move.reasonRequired) onNotes(c, button);
    else make(c);
  };
  const hover = (c: MoveChoice) => ({
    onMouseEnter: () => setPointed(c),
    onFocus: () => setPointed(c),
  });
  const btn = (c: MoveChoice, variant: 'primary' | 'quiet' | 'text') => (
    <Button
      key={`${c.kind}:${c.move.to}`}
      variant={variant}
      className={notesOpen === c || notesOpen?.move.to === c.move.to ? 'on' : undefined}
      disabled={!!c.blocked}
      aria-expanded={c.move.reasonRequired ? notesOpen?.move.to === c.move.to : undefined}
      onClick={(e) => choose(c, e.currentTarget)}
      {...hover(c)}
    >
      {c.label}
    </Button>
  );
  const closeAs =
    plan.close.length > 0 ? (
      <>
        <span className="vr" />
        <span className="closeas">{t('sheet.move.closeAs')}</span>
        {plan.close.map((c) => btn(c, 'text'))}
      </>
    ) : null;

  let body: ReactNode = null;
  if (mode === 'read') {
    body = <p className="receipt">{tx('detail.readOnly', { command: <code>otea open</code> })}</p>;
  } else if (mode === 'moves') {
    const first = plan.primary ?? plan.quiet[0] ?? plan.close[0] ?? null;
    body = (
      <>
        <div className="actions">
          {plan.primary ? btn(plan.primary, 'primary') : null}
          {plan.quiet.map((c) => btn(c, 'quiet'))}
          {closeAs}
        </div>
        <SaysLine text={says(pointed ?? first)} />
      </>
    );
  } else if (mode === 'qa') {
    const back = plan.quiet.find((c) => c.kind === 'sendback') as MoveChoice;
    const hasOptions = !!type?.fields.some((f) => f.name === 'options');
    const options = hasOptions ? parseOptions(item.fields.options ?? '') : [];
    const answer = [opt, free.trim()].filter(Boolean).join('. ');
    const ago = facts.handed
      ? whenText({ ...item, updatedAt: facts.handed.at, turn: 'none' }, app.now).text
      : '';
    body = (
      <section className="qa" data-key="qa">
        <div className="margin-label">
          {t('sheet.qa.asks', { agent: agent ?? '—' })}
          <span>{t('sheet.ago', { time: ago })}</span>
        </div>
        <div>
          <p className="q">{facts.handed?.reason}</p>
          {options.length > 0 ? (
            <div className="opts">
              {options.map((o) => {
                const label = `${o.letter} · ${o.name}`;
                return (
                  <button
                    key={o.letter}
                    type="button"
                    className={opt === label ? 'opt on' : 'opt'}
                    aria-pressed={opt === label}
                    onClick={() => setOpt(opt === label ? null : label)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          ) : null}
          <label className="free">
            {t('sheet.qa.free')}
            <textarea
              placeholder={t('sheet.qa.placeholder')}
              rows={2}
              value={free}
              onChange={(e) => setFree(e.target.value)}
            />
          </label>
          <div className="actions">
            <Button
              variant="primary"
              disabled={!answer}
              onClick={() =>
                void app.move(item.id, back.move.to, answer, toastOf('answer', item.title, ''))
              }
            >
              {t('sheet.qa.send')}
            </Button>
            <span className="closeas">{t('sheet.qa.goesOn', { agent: agent ?? '—' })}</span>
            {plan.primary ? btn(plan.primary, 'text') : null}
            {closeAs}
          </div>
        </div>
      </section>
    );
  } else if (mode === 'stuck') {
    const who = agent ?? '—';
    const lines = {
      resume: { verb: t('sheet.stuck.resume'), tail: t('sheet.says.resume', { agent: who }) },
      reassign: {
        verb: t('sheet.stuck.reassign').replace('…', ''),
        tail: t('sheet.says.reassign'),
      },
    };
    const line = lines[stuckSays];
    const agents = app.agents ?? [];
    body = (
      <>
        <div className="actions">
          <Button
            variant="primary"
            onMouseEnter={() => setStuckSays('resume')}
            onFocus={() => setStuckSays('resume')}
            onClick={() => copy(`otea claim ${item.id} --as ${who}`)}
          >
            {t('sheet.stuck.resume')}
          </Button>
          <Button
            variant="quiet"
            aria-haspopup="menu"
            aria-expanded={!!reassign}
            className={reassign ? 'on' : undefined}
            onMouseEnter={() => setStuckSays('reassign')}
            onFocus={() => setStuckSays('reassign')}
            onClick={(e) => setReassign(reassign ? null : e.currentTarget)}
          >
            {t('sheet.stuck.reassign')}
          </Button>
          {closeAs}
        </div>
        <Swap k={stuckSays} as="div" className="movesays" dy={3} outT={200} inT={300} inDelay={40}>
          {line.verb} · {line.tail}
        </Swap>
        <Pop
          open={!!reassign}
          anchor={reassign}
          place="below-left"
          label={t('sheet.stuck.reassign')}
          onClose={() => setReassign(null)}
        >
          <MenuLabel>{t('sheet.stuck.agents')}</MenuLabel>
          {agents.length === 0 ? <MenuNote>{t('sheet.stuck.none')}</MenuNote> : null}
          {agents
            .filter((a) => a.name !== who)
            .map((a) => (
              <MenuItem
                key={a.name}
                small={t(
                  a.holding.length > 0
                    ? 'sheet.stuck.working'
                    : a.live
                      ? 'sheet.stuck.free'
                      : 'sheet.stuck.quiet',
                )}
                onPick={() => copy(`otea claim ${item.id} --as ${a.name}`)}
              >
                {a.name}
              </MenuItem>
            ))}
        </Pop>
      </>
    );
  } else if (mode === 'wait') {
    const total = item.children?.total ?? 0;
    const open = item.children?.open ?? 0;
    const path = type ? mainPath(type) : [];
    const next = path[path.indexOf(item.state) + 1] ?? path.at(-1) ?? item.state;
    const blocked = plan.quiet.find((c) => c.blocked)?.blocked;
    body = (
      <>
        <div className="waitkids">
          {total > 0
            ? t('sheet.waitkids', { count: total, closed: total - open, state: word(next) })
            : blocked}
        </div>
        {closeAs ? <div className="actions">{closeAs}</div> : null}
      </>
    );
  } else {
    const holder = item.lease?.holder ?? agent;
    let text: ReactNode;
    if (look === 'dropped') text = t('sheet.receipt.dropped');
    else if (look === 'done')
      text = holder
        ? tx('sheet.receipt.done', { agent: <b>{holder}</b> })
        : t('sheet.receipt.doneYou');
    else if (look === 'queued')
      text = holder
        ? tx('sheet.receipt.queued', { agent: <b>{holder}</b> })
        : t('sheet.receipt.queuedAny');
    else {
      const left = whenText(item, app.now);
      text = (
        <>
          {holder ? tx('sheet.receipt.has', { agent: <b>{holder}</b> }) : t('sheet.receipt.hasAny')}
          {item.lease && !left.warn ? (
            <> {tx('sheet.receipt.lease', { time: <b>{left.text}</b> })}</>
          ) : null}{' '}
          {t('sheet.receipt.back')}
        </>
      );
    }
    body = (
      <>
        <p className="receipt">{text}</p>
        {closeAs && look !== 'done' && look !== 'dropped' ? (
          <div className="actions">{closeAs}</div>
        ) : null}
      </>
    );
  }
  return <ActsBox k={`${mode}:${item.state}`}>{body}</ActsBox>;
}
