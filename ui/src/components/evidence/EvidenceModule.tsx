import { type ReactNode, useContext, useState } from 'react';
import { comparePair, emptyText, evidenceOf, latestFirst, moduleTitle } from '../../evidence.ts';
import { t } from '../../i18n/i18n.ts';
import { Button } from '../../kit/index.ts';
import type { Evidence, LayoutEntry } from '../../types.ts';
import { EvidenceList } from '../EvidenceList.tsx';
import { DiagramView } from './DiagramView.tsx';
import { BlindPick } from './EvidenceViewer.tsx';
import { FileView } from './FileViews.tsx';
import { ImageCompare, ImageGallery, ImageSingle } from './ImageViews.tsx';
import { ItemReview } from './item-evidence.ts';
import { pickAt, READ_AT } from './reader-pick.ts';
import { ReportOr } from './TestReportView.tsx';
import { DiffView, LogView } from './TextViews.tsx';
import { VideoFrames, VideoPlayer } from './VideoViews.tsx';

// What a module takes when its layout entry does not narrow it.
const DEFAULT_ACCEPTS: Readonly<Record<string, string>> = {
  images: 'png, jpg, gif, webp',
  recording: 'mp4, webm, mov',
  diff: 'diff, patch',
  log: 'log, txt',
  diagram: 'mmd, mermaid',
};

function acceptsText(entry: LayoutEntry): string {
  return entry.accepts?.join(', ') ?? DEFAULT_ACCEPTS[entry.module] ?? '';
}

// What an empty module asks the agent to attach. A blind compare asks for A and B, never «one from
// before and one from after» (P5-R2-3).
export function attachHint(entry: LayoutEntry): string {
  const pair = entry.module === 'images' && entry.variant === 'compare';
  const key = !pair
    ? 'evidence.attach'
    : entry.blind
      ? 'evidence.attachBlind'
      : 'evidence.attachPair';
  return t(key, { accepts: acceptsText(entry) });
}

// A quiet well that says what the agent should attach. A required module still empty is drawn
// dashed, as an incomplete item's node is.
function Empty({ entry }: { entry: LayoutEntry }) {
  return (
    <div className="ev-empty well" data-required={entry.required ? 'true' : undefined}>
      <span className="t-ui">{emptyText(entry)}</span>
      <span className="t-cap">{attachHint(entry)}</span>
    </div>
  );
}

// Several files in a module that shows one: newest first, the newest shown until another is picked.
// Each says the round it came in; images of two rounds can be compared side by side (P5-5).
function OneOf({
  evidence,
  label,
  children,
}: {
  evidence: Evidence[];
  label: string;
  children: (shown: Evidence) => ReactNode;
}) {
  const { roundOf } = useContext(ItemReview);
  const newest = latestFirst(evidence);
  const [picked, setPicked] = useState<number | undefined>(undefined);
  const [comparing, setComparing] = useState(false);
  const shown = newest.find(({ id }) => id === picked) ?? newest[0];
  if (!shown) return null;
  const round = (e: Evidence) => roundOf?.get(e.id);
  // The newest against the one picked (else the one before it), both images.
  const latest = newest[0];
  const other = shown === latest ? newest[1] : shown;
  const images = !!latest && !!other && latest.kind === 'image' && other.kind === 'image';
  const compared = comparing && images && latest && other;
  const tag = (e: Evidence) => {
    const n = round(e);
    return n === undefined ? e.filename : t('evidence.roundTag', { n });
  };
  return (
    <div className="ev-one">
      {newest.length > 1 ? (
        <fieldset className="ev-picker" aria-label={t('evidence.files', { label })}>
          {newest.map((entry, index) => (
            <Button
              key={entry.id}
              size="sm"
              className="ev-pick"
              aria-pressed={!compared && entry.id === shown.id}
              onClick={() => {
                setPicked(entry.id);
                setComparing(false);
              }}
            >
              {round(entry) !== undefined ? (
                <span className="ev-round">{t('evidence.roundTag', { n: round(entry) ?? 0 })}</span>
              ) : null}
              {entry.filename}
              {index === 0 ? <span className="ev-latest">{t('evidence.latest')}</span> : null}
            </Button>
          ))}
          {images ? (
            <Button
              size="sm"
              className="ev-pick ev-pick-rounds"
              aria-pressed={!!compared}
              onClick={() => setComparing(!comparing)}
            >
              {t('evidence.rounds')}
            </Button>
          ) : null}
        </fieldset>
      ) : null}
      {compared ? (
        <ImageCompare
          key={`${other.id}-${latest.id}`}
          evidence={[
            { ...other, role: 'before' },
            { ...latest, role: 'after' },
          ]}
          names={{ before: tag(other), after: tag(latest) }}
          initial="side"
        />
      ) : (
        children(shown)
      )}
    </div>
  );
}

// A blind A and B: named so, never before and after, with «Me quedo con A/B» while you review.
function BlindCompare({ held }: { held: Evidence[] }) {
  const { note } = useContext(ItemReview);
  const { before, after } = comparePair(held);
  return (
    <>
      <ImageCompare evidence={held} blind />
      {note && before && after ? (
        <div className="ev-blind-pick">
          <BlindPick ids={[before.id, after.id]} shown={before} side="A" note={note} />
          <BlindPick ids={[before.id, after.id]} shown={after} side="B" note={note} />
        </div>
      ) : null}
    </>
  );
}

// A line of the diff on the item's page takes a note the way the reader's does (P3C-R3-7): while a
// note can be left, a click on it opens the reader there, the line picked and the note box ready.
export function NotableDiff({ evidence }: { evidence: Evidence }) {
  const { note } = useContext(ItemReview);
  if (!note) return <DiffView evidence={evidence} />;
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: a click on a line opens the reader on it; the reader takes notes by keyboard too
    // biome-ignore lint/a11y/useKeyWithClickEvents: the reader, a button away, is the keyboard's way to a line
    <div
      className="ev-notable"
      data-picking="true"
      title={t('evidence.noteLine')}
      onClick={(e) => {
        const hit = pickAt(e.target);
        if (!hit) return;
        const detail = { evidence: evidence.id, pick: hit.pick };
        window.dispatchEvent(new CustomEvent(READ_AT, { detail }));
      }}
    >
      <DiffView evidence={evidence} />
    </div>
  );
}

function Body({ entry, held, title }: { entry: LayoutEntry; held: Evidence[]; title: string }) {
  const { module, variant } = entry;
  if (module === 'images' && variant === 'compare')
    return entry.blind ? <BlindCompare held={held} /> : <ImageCompare evidence={held} />;
  if (module === 'diagram') return <DiagramView evidence={held} />;
  if (module === 'images' && variant === 'gallery') {
    return <ImageGallery evidence={held} label={title} />;
  }
  return (
    <OneOf evidence={held} label={title}>
      {(shown) => {
        if (module === 'images') return <ImageSingle key={shown.id} evidence={shown} />;
        if (module === 'recording' && variant === 'frames') {
          return <VideoFrames key={shown.id} evidence={shown} />;
        }
        if (module === 'recording') return <VideoPlayer key={shown.id} evidence={shown} />;
        if (module === 'diff') return <NotableDiff key={shown.id} evidence={shown} />;
        if (module === 'files') return <FileView key={shown.id} evidence={shown} />;
        return (
          <ReportOr key={shown.id} evidence={shown}>
            <LogView evidence={shown} />
          </ReportOr>
        );
      }}
    </OneOf>
  );
}

type EvidenceModuleProps = {
  entry: LayoutEntry;
  evidence: readonly Evidence[];
  canWrite: boolean;
  // The data attributes of its place in the layout (slotData), for Studio to find it.
  slot?: Readonly<Record<string, string>>;
  // How many of the person's notes are on each piece of evidence, by its id: the module says how
  // many are on its files, and a note's cite finds it by them.
  noted?: ReadonlyMap<number, number>;
  // Opens the reader at a file: the module's newest one.
  onRead?: ((id: number) => void) | undefined;
};

// One evidence module of the item's layout, where the layout places it. Files are served only to a
// signed-in browser, so a read-only one lists their names.
export function EvidenceModule({
  entry,
  evidence,
  canWrite,
  slot,
  noted,
  onRead,
}: EvidenceModuleProps) {
  const held = evidenceOf(evidence, entry);
  const notes = held.reduce((sum, { id }) => sum + (noted?.get(id) ?? 0), 0);
  const title = moduleTitle(entry);
  const headingId = `evidence-${entry.id}`;
  return (
    <section
      className="ev-module"
      aria-labelledby={headingId}
      data-module={entry.module}
      data-variant={entry.variant}
      data-ev-ids={held.length ? held.map(({ id }) => id).join(' ') : undefined}
      {...slot}
    >
      <header className="ev-head">
        <h2 className="t-label" id={headingId}>
          {title}
        </h2>
        {entry.required ? (
          <span className="ev-required t-cap">{t('evidence.required')}</span>
        ) : null}
        {notes ? <span className="ev-noted">{t('notes.count', { count: notes })}</span> : null}
        {onRead && canWrite && held.length ? (
          <Button
            size="sm"
            variant="text"
            className="ev-read"
            aria-label={t('evidence.reader.openAt', { file: latestFirst(held)[0]?.filename ?? '' })}
            onClick={() => {
              const newest = latestFirst(held)[0];
              if (newest) onRead(newest.id);
            }}
          >
            {t('evidence.reader.open')}
          </Button>
        ) : null}
      </header>
      {held.length === 0 ? (
        <Empty entry={entry} />
      ) : canWrite ? (
        <Body entry={entry} held={held} title={title} />
      ) : (
        <EvidenceList evidence={held} canWrite={false} />
      )}
    </section>
  );
}
