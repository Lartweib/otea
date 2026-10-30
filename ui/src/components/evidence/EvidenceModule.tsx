import { type ReactNode, useState } from 'react';
import { emptyText, evidenceOf, latestFirst, moduleTitle } from '../../evidence.ts';
import { Button } from '../../kit/index.ts';
import type { Evidence, LayoutEntry } from '../../types.ts';
import { EvidenceList } from '../EvidenceList.tsx';
import { ImageCompare, ImageGallery, ImageSingle } from './ImageViews.tsx';
import { DiffView, LogView } from './TextViews.tsx';
import { VideoFrames, VideoPlayer } from './VideoViews.tsx';

// What a module takes when its layout entry does not narrow it.
const DEFAULT_ACCEPTS: Readonly<Record<string, string>> = {
  images: 'png, jpg, gif, webp',
  recording: 'mp4, webm, mov',
  diff: 'diff, patch',
  log: 'log, txt',
};

function acceptsText(entry: LayoutEntry): string {
  return entry.accepts?.join(', ') ?? DEFAULT_ACCEPTS[entry.module] ?? '';
}

function hint(entry: LayoutEntry): string {
  const roles =
    entry.module === 'images' && entry.variant === 'compare'
      ? ', one with --role before and one with --role after'
      : '';
  return `Agents attach ${acceptsText(entry)}${roles}.`;
}

// A quiet well that says what the agent should attach. A required module still empty is drawn
// dashed, as an incomplete item's node is.
function Empty({ entry }: { entry: LayoutEntry }) {
  return (
    <div className="ev-empty well" data-required={entry.required ? 'true' : undefined}>
      <span className="t-ui">{emptyText(entry)}</span>
      <span className="t-cap">{hint(entry)}</span>
    </div>
  );
}

// Several files in a module that shows one: newest first, the newest shown until another is picked.
function OneOf({
  evidence,
  label,
  children,
}: {
  evidence: Evidence[];
  label: string;
  children: (shown: Evidence) => ReactNode;
}) {
  const newest = latestFirst(evidence);
  const [picked, setPicked] = useState<number | undefined>(undefined);
  const shown = newest.find(({ id }) => id === picked) ?? newest[0];
  if (!shown) return null;
  return (
    <div className="ev-one">
      {newest.length > 1 ? (
        <fieldset className="ev-picker" aria-label={`${label}: files`}>
          {newest.map((entry, index) => (
            <Button
              key={entry.id}
              size="sm"
              className="ev-pick"
              aria-pressed={entry.id === shown.id}
              onClick={() => setPicked(entry.id)}
            >
              {entry.filename}
              {index === 0 ? <span className="ev-latest">latest</span> : null}
            </Button>
          ))}
        </fieldset>
      ) : null}
      {children(shown)}
    </div>
  );
}

function Body({ entry, held, title }: { entry: LayoutEntry; held: Evidence[]; title: string }) {
  const { module, variant } = entry;
  if (module === 'images' && variant === 'compare') return <ImageCompare evidence={held} />;
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
        if (module === 'diff') return <DiffView key={shown.id} evidence={shown} />;
        return <LogView key={shown.id} evidence={shown} />;
      }}
    </OneOf>
  );
}

type EvidenceModuleProps = { entry: LayoutEntry; evidence: readonly Evidence[]; canWrite: boolean };

// One evidence module of the item's layout, where the layout places it. Files are served only to a
// signed-in browser, so a read-only one lists their names.
export function EvidenceModule({ entry, evidence, canWrite }: EvidenceModuleProps) {
  const held = evidenceOf(evidence, entry);
  const title = moduleTitle(entry);
  const headingId = `evidence-${entry.id}`;
  return (
    <section
      className="ev-module"
      aria-labelledby={headingId}
      data-module={entry.module}
      data-variant={entry.variant}
    >
      <header className="ev-head">
        <h2 className="t-label" id={headingId}>
          {title}
        </h2>
        {entry.required ? <span className="ev-required t-cap">required</span> : null}
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
