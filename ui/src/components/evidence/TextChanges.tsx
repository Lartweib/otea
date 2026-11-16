import { useState } from 'react';
import { t } from '../../i18n/i18n.ts';
import { diffText, type TextDiffMode } from '../../text-diff.ts';
import type { Evidence } from '../../types.ts';
import { TextState, useEvidenceText } from './TextViews.tsx';

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
          if (block.kind === 'same') return <p key={key}>{block.text}</p>;
          if (block.kind === 'added')
            return (
              <p key={key} className="ev-ins-block">
                <ins>{block.text}</ins>
              </p>
            );
          if (block.kind === 'removed')
            return (
              <p key={key} className="ev-del-block">
                <del>{block.text}</del>
              </p>
            );
          if (diff.mode === 'paragraphs')
            return (
              <div key={key} className="ev-para-pair">
                <p className="ev-del-block">
                  <del>{block.before}</del>
                </p>
                <p className="ev-ins-block">
                  <ins>{block.after}</ins>
                </p>
              </div>
            );
          return (
            <p key={key}>
              {block.words.map((w, i) =>
                w.op === 'same' ? (
                  // biome-ignore lint/suspicious/noArrayIndexKey: a piece is its place.
                  <span key={i}>{w.text}</span>
                ) : w.op === 'del' ? (
                  // biome-ignore lint/suspicious/noArrayIndexKey: a piece is its place.
                  <del key={i}>{w.text}</del>
                ) : (
                  // biome-ignore lint/suspicious/noArrayIndexKey: a piece is its place.
                  <ins key={i}>{w.text}</ins>
                ),
              )}
            </p>
          );
        })}
      </div>
    </div>
  );
}
