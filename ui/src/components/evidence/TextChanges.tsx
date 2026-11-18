import { useState } from 'react';
import { t } from '../../i18n/i18n.ts';
import { renderMarkdown } from '../../markdown.ts';
import { diffText, plainMarkdown, type TextDiffMode } from '../../text-diff.ts';
import type { Evidence } from '../../types.ts';
import { useDocImages } from './item-evidence.ts';
import { TextState, useEvidenceText } from './TextViews.tsx';

// A Markdown paragraph drawn as the document draws it, never as raw markup (DR3-2).
function Md({ text, className }: { text: string; className?: string }) {
  const images = useDocImages();
  return (
    <div
      className={className ? `md ${className}` : 'md'}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: renderMarkdown escapes raw HTML and drops dangerous links
      dangerouslySetInnerHTML={{ __html: renderMarkdown(text, images) }}
    />
  );
}

// A GFM table: a row of pipes over a delimiter row.
const isTable = (text: string) => /^\s*\|?.*\|.*\n\s*\|?\s*:?-{3,}/m.test(text);

// A document against its version of the round before: inside a paragraph that changed, the words
// removed and added; once more than a third of it changed, paragraph by paragraph instead, with
// words a toggle away.
export function TextChanges({ evidence, earlier }: { evidence: Evidence; earlier: Evidence }) {
  const now = useEvidenceText(evidence);
  const was = useEvidenceText(earlier);
  const [mode, setMode] = useState<TextDiffMode | undefined>(undefined);
  if (now.status !== 'ready') return <TextState state={now} evidence={evidence} />;
  if (was.status !== 'ready') return <TextState state={was} evidence={earlier} />;
  const diff = diffText(was.text, now.text, mode);
  const share = Math.round(diff.changedShare * 100);
  return (
    <div className="ev-changes">
      <div className="ev-changes-head">
        <span className="t-small">{t('evidence.changes.share', { share })}</span>
        <fieldset className="dg-switch ev-seg" aria-label={t('evidence.changes.by')}>
          {(['words', 'paragraphs'] as const).map((m) => (
            <button
              key={m}
              type="button"
              className="dg-seg"
              aria-pressed={diff.mode === m}
              onClick={() => setMode(m)}
            >
              {t(m === 'words' ? 'evidence.changes.words' : 'evidence.changes.paragraphs')}
            </button>
          ))}
        </fieldset>
      </div>
      <div className="ev-changes-body well">
        {diff.blocks.map((block, at) => {
          // A block is its place in the text.
          const key = at;
          if (block.kind === 'same') return <Md key={key} text={block.text} />;
          if (block.kind === 'added')
            return <Md key={key} text={block.text} className="ev-ins-block" />;
          if (block.kind === 'removed')
            return <Md key={key} text={block.text} className="ev-del-block" />;
          // A table reads as a table: word by word it would show its pipes (P5-7).
          if (diff.mode === 'paragraphs' || isTable(block.before) || isTable(block.after))
            return (
              <div key={key} className="ev-para-pair">
                <Md text={block.before} className="ev-del-block" />
                <Md text={block.after} className="ev-ins-block" />
              </div>
            );
          return (
            <p key={key}>
              {block.words.map((w, i) =>
                w.op === 'same' ? (
                  // biome-ignore lint/suspicious/noArrayIndexKey: a piece is its place.
                  <span key={i}>{plainMarkdown(w.text)}</span>
                ) : w.op === 'del' ? (
                  // biome-ignore lint/suspicious/noArrayIndexKey: a piece is its place.
                  <del key={i}>{plainMarkdown(w.text)}</del>
                ) : (
                  // biome-ignore lint/suspicious/noArrayIndexKey: a piece is its place.
                  <ins key={i}>{plainMarkdown(w.text)}</ins>
                ),
              )}
            </p>
          );
        })}
      </div>
    </div>
  );
}
