import { type ReactNode, useLayoutEffect, useRef } from 'react';
import { EvidenceList } from '../../components/EvidenceList.tsx';
import { EvidenceModule } from '../../components/evidence/EvidenceModule.tsx';
import { OptionsModule } from '../../components/OptionsModule.tsx';
import { RoundsModule } from '../../components/RoundsModule.tsx';
import { whenText } from '../../derive/when.ts';
import { latestFirst, leftovers } from '../../evidence.ts';
import { useFileUrl } from '../../evidence-files.ts';
import { t } from '../../i18n/i18n.ts';
import { type DetailBlock, detailBlocks, slotData } from '../../item-types.ts';
import { moduleFor } from '../../modules/registry.ts';
import { C } from '../../motion/curves.ts';
import { reduced } from '../../motion/reduced.ts';
import type { BoardRounds } from '../../rounds.ts';
import type { Evidence, ItemView, TypeView } from '../../types.ts';
import type { Facts } from './facts.ts';
import { Structure } from './Structure.tsx';

// The body (SPEC §10.3, mock:2740-2749): sections over hairlines, each named in its margin: what the
// agent says, your notes, what you answered, the type's layout (its fields, rounds, options), the
// evidence, the structure. When the item changes, sections are diffed by key: unchanged ones stay,
// added ones unroll, removed ones collapse (mock:3165-3178).

export type Sec = { key: string; node: ReactNode };

const agoOf = (item: ItemView, at: string, now: number) =>
  t('sheet.ago', { time: whenText({ ...item, updatedAt: at, turn: 'none' }, now).text });

function Note({
  k,
  label,
  aside,
  text,
  mine,
}: {
  k: string;
  label: string;
  aside: string;
  text: string;
  mine?: boolean;
}) {
  return (
    <section className={mine ? 'note mine' : 'note'} data-key={k}>
      <div className="margin-label">
        {label}
        <span>{aside}</span>
      </div>
      <blockquote>{text}</blockquote>
    </section>
  );
}

function Plain({
  k,
  label,
  aside,
  children,
  className = 'd-sec',
}: {
  k: string;
  label: string;
  aside?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={className} data-key={k}>
      <div className="margin-label">
        {label}
        {aside ? <span>{aside}</span> : null}
      </div>
      <div className="d-body">{children}</div>
    </section>
  );
}

export function bodySections(o: {
  item: ItemView;
  type: TypeView | undefined;
  facts: Facts;
  canWrite: boolean;
  now: number;
  // On a Studio board: the long texts it shows as options side by side, the notes of each round
  // (drawn where its layout puts Rondas, else after the fields), and its own sections (Partes,
  // Enlaces) in place of Structure.
  board?:
    | {
        options: ReadonlySet<string>;
        rounds: ReactNode;
        roundsAfter: boolean;
        sections: Sec[];
        // The board and the step whose rounds the rail shows (the one the item is on unless
        // another was unfolded in Rondas), as the step engine counts them; that step's name when
        // the item went through several.
        steps: BoardRounds;
        railName?: string | undefined;
        // How many of the person's notes are on each piece of evidence, by its id.
        noted?: ReadonlyMap<number, number> | undefined;
      }
    | undefined;
}): Sec[] {
  const { item, type, facts, canWrite, now, board } = o;
  let roundsDrawn = false;
  const out: Sec[] = [];
  const agent = facts.handed?.agent ?? facts.agent ?? '';
  if (facts.handed?.reason && !facts.question)
    out.push({
      key: 'say',
      node: (
        <Note
          k="say"
          label={t('sheet.says', { agent })}
          aside={agoOf(item, facts.handed.at, now)}
          text={facts.handed.reason}
        />
      ),
    });
  if (facts.mine && item.turn === 'human')
    out.push({
      key: 'mine',
      node: (
        <Note
          k="mine"
          mine
          label={t('sheet.mine')}
          aside={t('sheet.round', { n: facts.mine.round })}
          text={facts.mine.reason}
        />
      ),
    });
  const asked = facts.answered?.asked;
  if (asked && item.turn !== 'human')
    out.push({
      key: 'asked',
      node: (
        <Note
          k="asked"
          label={t('sheet.asked', { agent: asked.agent })}
          aside=""
          text={asked.text}
        />
      ),
    });
  if (facts.answered && item.turn !== 'human')
    out.push({
      key: 'answer',
      node: (
        <Note
          k="answer"
          mine
          label={t('sheet.answered')}
          aside={agoOf(item, facts.answered.at, now)}
          text={facts.answered.reason}
        />
      ),
    });

  const { primary, sections } = detailBlocks(type, item.fields);
  const evidence: ReactNode[] = [];
  const loose = leftovers(type, item.evidence);
  const fieldSecs = (block: DetailBlock, i: number, label?: string): Sec[] => {
    if (block.kind === 'fields')
      return block.values
        .filter((v) => v.value !== '' && v.field.module === 'markdown')
        .map((v) => {
          const { Detail } = moduleFor(v.field.module);
          const k = `f:${v.field.name}`;
          if (board?.options.has(v.field.name))
            return {
              key: k,
              node: (
                <Plain
                  k={k}
                  label={label && block.values.length === 1 ? label : v.label}
                  className="d-sec mod"
                >
                  <OptionsModule
                    slot={slotData(v.at)}
                    item={item}
                    entry={{ module: 'options', label: v.label }}
                    field={v.field.name}
                    sideBySide
                  />
                </Plain>
              ),
            };
          return {
            key: k,
            node: (
              <Plain
                k={k}
                label={label && block.values.length === 1 ? label : v.label}
                className="d-sec field"
              >
                <div {...slotData(v.at)}>
                  <Detail field={v.field} value={v.value} />
                </div>
              </Plain>
            ),
          };
        });
    if (block.kind === 'reserved' && type) {
      const k = `r:${block.entry.module}:${i}`;
      if (block.entry.module === 'rounds') {
        roundsDrawn = true;
        return [
          {
            key: k,
            node: (
              <Plain k={k} label={label ?? t('rounds.title')} className="d-sec mod">
                {board?.rounds}
                <RoundsModule
                  key={board?.steps.step}
                  slot={slotData(block.at)}
                  item={item}
                  type={type}
                  entry={block.entry}
                  canWrite={canWrite}
                  quiet={!!board}
                  {...(board ? { board: board.steps, stepName: board.railName } : {})}
                />
              </Plain>
            ),
          },
        ];
      }
      if (block.entry.module === 'options')
        return [
          {
            key: k,
            node: (
              <Plain k={k} label={label ?? t('options.title')} className="d-sec mod">
                <OptionsModule slot={slotData(block.at)} item={item} entry={block.entry} />
              </Plain>
            ),
          },
        ];
      return [];
    }
    if (block.kind === 'module') {
      evidence.push(
        <EvidenceModule
          key={`m:${block.entry.id}`}
          slot={slotData(block.at)}
          entry={block.entry}
          evidence={item.evidence}
          canWrite={canWrite}
          {...(board?.noted ? { noted: board.noted } : {})}
        />,
      );
      return [];
    }
    if (block.kind === 'evidence' && loose.length > 0) {
      const images = canWrite ? loose.filter((e) => e.kind === 'image') : [];
      const rest = loose.filter((e) => !images.includes(e));
      if (images.length) evidence.push(<Figures key="figs" images={images} />);
      if (rest.length)
        evidence.push(<EvidenceList key="loose" evidence={rest} canWrite={canWrite} />);
    }
    return [];
  };
  primary.forEach((b, i) => {
    out.push(...fieldSecs(b, i));
  });
  for (const s of sections ?? [])
    s.blocks.forEach((b, i) => {
      out.push(...fieldSecs(b, 100 * (s.index + 1) + i, s.title));
    });
  if (board?.rounds && board.roundsAfter && !roundsDrawn)
    out.push({
      key: 'r:notes',
      node: (
        <Plain k="r:notes" label={t('bi.rounds.title')} className="d-sec mod">
          {board.rounds}
        </Plain>
      ),
    });
  const count = item.evidence.length;
  out.push({
    key: 'evidence',
    node: (
      <section className="evidence" data-key="evidence">
        <div className="margin-label">
          {t('sheet.evidence')}
          <span>{count ? t('sheet.files', { count }) : '—'}</span>
        </div>
        {evidence.length ? (
          <div className="evs">{evidence}</div>
        ) : (
          <p className="noev">{t('sheet.noEvidence')}</p>
        )}
      </section>
    ),
  });
  if (board) out.push(...board.sections);
  else out.push({ key: 'structure', node: <Structure item={item} /> });
  return out;
}

// Images no module draws, as figures: before and after side by side, a caption led by its kicker.
function Figures({ images }: { images: Evidence[] }) {
  const url = useFileUrl();
  const pair = (role: Evidence['role']) => latestFirst(images.filter((e) => e.role === role))[0];
  const before = pair('before');
  const after = pair('after');
  const shown = before && after ? [before, after] : latestFirst(images).slice(0, 4);
  const kicker = (e: Evidence) =>
    t(
      e.role === 'before'
        ? 'evidence.before'
        : e.role === 'after'
          ? 'evidence.after'
          : 'evidence.image',
    );
  return (
    <div className={shown.length === 1 ? 'figs one' : 'figs'}>
      {shown.map((e) => (
        <figure key={e.id}>
          <a href={url(e)} target="_blank" rel="noreferrer">
            <img src={url(e)} alt={e.caption ?? e.filename} loading="lazy" />
          </a>
          <figcaption>
            <b>{kicker(e)}</b>
            {e.caption ?? e.filename}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

// Sections diffed by key: on a change, added ones unroll and removed ones collapse.
export function Body({ id, sections }: { id: string; sections: Sec[] }) {
  const host = useRef<HTMLDivElement>(null);
  const was = useRef<{ id: string; keys: string[]; els: Map<string, Element> } | null>(null);
  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    const els = new Map(
      [...el.querySelectorAll(':scope > section[data-key]')].map((s) => [
        (s as HTMLElement).dataset.key ?? '',
        s,
      ]),
    );
    const keys = sections.map((s) => s.key);
    const before = was.current;
    // React is done with a removed section's node: it is laid back in place while it collapses.
    was.current = { id, keys, els };
    if (!before || before.id !== id || reduced()) return;
    for (const k of keys) {
      if (before.keys.includes(k)) continue;
      els.get(k)?.animate(
        [
          { clipPath: 'inset(0px 0px 100% 0px)', transform: 'translateY(-8px)', opacity: 0 },
          { clipPath: 'inset(0px 0px 0px 0px)', transform: 'none', opacity: 1 },
        ],
        { duration: 440, delay: 80, easing: C.settle, fill: 'backwards' },
      );
    }
    before.keys.forEach((k, i) => {
      if (keys.includes(k)) return;
      const ghost = before.els.get(k) as HTMLElement | undefined;
      if (!ghost) return;
      const after = before.keys
        .slice(0, i)
        .reverse()
        .map((p) => els.get(p))
        .find(Boolean);
      if (after) after.after(ghost);
      else el.prepend(ghost);
      ghost.setAttribute('aria-hidden', 'true');
      ghost.setAttribute('inert', '');
      const hh = ghost.offsetHeight;
      ghost
        .animate(
          [
            { opacity: 1, maxHeight: `${hh}px`, overflow: 'hidden' },
            {
              opacity: 0,
              maxHeight: '0px',
              marginTop: '0px',
              paddingTop: '0px',
              overflow: 'hidden',
            },
          ],
          { duration: 440, easing: C.settle, fill: 'forwards' },
        )
        .finished.then(
          () => ghost.remove(),
          () => ghost.remove(),
        );
    });
  });
  return (
    <div className="d-main" data-c ref={host}>
      {sections.map((s) => (
        <SecSlot key={s.key}>{s.node}</SecSlot>
      ))}
    </div>
  );
}

function SecSlot({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
