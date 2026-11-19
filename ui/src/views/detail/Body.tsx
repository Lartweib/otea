import { type ReactNode, useLayoutEffect, useRef } from 'react';
import type { ItemChoice } from '../../../../src/core/board/choices.ts';
import { attachFiles } from '../../api.ts';
import { EvidenceList } from '../../components/EvidenceList.tsx';
import { EvidenceModule } from '../../components/evidence/EvidenceModule.tsx';
import { OptionsModule } from '../../components/OptionsModule.tsx';
import { RoundsModule } from '../../components/RoundsModule.tsx';
import { agoText } from '../../derive/when.ts';
import { latestFirst, leftovers } from '../../evidence.ts';
import { useFileUrl } from '../../evidence-files.ts';
import { t } from '../../i18n/i18n.ts';
import { type DetailBlock, detailBlocks, slotData } from '../../item-types.ts';
import { Button, toast } from '../../kit/index.ts';
import { moduleFor } from '../../modules/registry.ts';
import { C } from '../../motion/curves.ts';
import { reduced } from '../../motion/reduced.ts';
import type { BoardRounds } from '../../rounds.ts';
import type { Evidence, ItemView, TypeView } from '../../types.ts';
import type { Facts } from './facts.ts';
import { Structure } from './Structure.tsx';

// The body (SPEC §10.3, mock:2740-2749): sections over hairlines, each named in its margin: what the
// agent says, your notes, what you answered, the type's layout (its fields, options), the evidence,
// the rounds, the structure. When the item changes, sections are diffed by key: unchanged ones stay,
// added ones unroll, removed ones collapse (mock:3165-3178).

export type Sec = { key: string; node: ReactNode };

const agoOf = (_item: ItemView, at: string, now: number) => agoText(at, now);

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
  // Opens the reader, at a file or at the round's first.
  onRead?: ((id?: number) => void) | undefined;
  // On a Studio board: the long texts it shows as options side by side, the notes of each round
  // (drawn after the deliverable, with Rondas), and its own sections (Partes,
  // Enlaces) in place of Structure.
  board?:
    | {
        options: ReadonlySet<string>;
        // The option you picked last of those options, with your comment; `picking` while you
        // pick one as you approve (the rounds then draw no verdict of their own).
        chosen?: ItemChoice | undefined;
        picking?: boolean;
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
  const { item, type, facts, canWrite, now, board, onRead } = o;
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
  // What you answered the agent while it did the round you review: next to the work it shaped.
  if (facts.answers?.length && item.turn === 'human')
    out.push({
      key: 'answers',
      node: (
        <section className="note qa-answers" data-key="answers">
          <div className="margin-label">
            {t('sheet.answers')}
            <span>{t('sheet.answersTo', { agent: facts.answers[0]?.agent ?? '' })}</span>
          </div>
          <dl>
            {facts.answers.map((a, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: answers keep their order
              <div key={i}>
                <dt>{a.question}</dt>
                <dd>{a.answer}</dd>
              </div>
            ))}
          </dl>
        </section>
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
  // Rondas come after the deliverable, wherever the layout places them: what was handed in is
  // what the person reads first, as on the phone.
  const rounds: Sec[] = [];
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
                    chosen={board.chosen}
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
        rounds.push({
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
                // On a board the page's own Devolver and Aprobar decide: a second note box here
                // left the top «Enviar» disabled with words typed below (P4-R2-9).
                noVerdict={!!board}
                {...(board ? { board: board.steps, stepName: board.railName } : {})}
              />
            </Plain>
          ),
        });
        return [];
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
          onRead={onRead}
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
    rounds.push({
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
          {onRead && canWrite && count ? (
            <Button size="sm" variant="text" className="ev-read-all" onClick={() => onRead()}>
              {t('evidence.reader.open')}
            </Button>
          ) : null}
          {canWrite && item.turn !== 'none' ? <AttachFile id={item.id} /> : null}
        </div>
        {evidence.length ? (
          <div className="evs">{evidence}</div>
        ) : (
          <p className="noev">{t('sheet.noEvidence')}</p>
        )}
      </section>
    ),
  });
  out.push(...rounds);
  if (board) out.push(...board.sections);
  else out.push({ key: 'structure', node: <Structure item={item} /> });
  return out;
}

// The person adds a file to the item as it stands (ONB-18): a screenshot of what is wrong before a
// send-back, a log to go with a note. On a board it stays with the item, outside the parts the
// agents hand; the agent sees it in show among the other files.
function AttachFile({ id }: { id: string }) {
  const input = useRef<HTMLInputElement>(null);
  const send = (list: FileList | null) => {
    const files = [...(list ?? [])];
    if (input.current) input.current.value = '';
    if (files.length === 0) return;
    attachFiles(id, files).then(
      () =>
        toast({
          msg: t('sheet.attached', { count: files.length, file: files[0]?.name ?? '', id }),
          id,
        }),
      (error: unknown) =>
        toast({
          msg: t('sheet.attachFailed', { why: error instanceof Error ? error.message : '' }),
          id,
        }),
    );
  };
  return (
    <>
      <Button size="sm" variant="text" className="ev-attach" onClick={() => input.current?.click()}>
        {t('sheet.attach')}
      </Button>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        onChange={(event) => send(event.currentTarget.files)}
      />
    </>
  );
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
