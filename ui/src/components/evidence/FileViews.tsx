import { useState } from 'react';
import { useFileUrl } from '../../evidence-files.ts';
import { t } from '../../i18n/i18n.ts';
import { sizeLabel } from '../../intake-files.ts';
import { Button } from '../../kit/index.ts';
import { renderMarkdown } from '../../markdown.ts';
import type { Evidence } from '../../types.ts';
import { FileMeta } from './FileMeta.tsx';
import { fileViewOf } from './file-view.ts';
import { LogView, TextState, useEvidenceText } from './TextViews.tsx';

// A Markdown file (a design document, a README) read as formatted text, its source a toggle away.
export function MarkdownFileView({ evidence }: { evidence: Evidence }) {
  const state = useEvidenceText(evidence);
  const [source, setSource] = useState(false);
  if (state.status !== 'ready') return <TextState state={state} evidence={evidence} />;
  return (
    <div className="ev-doc">
      <div className="ev-tools">
        <FileMeta evidence={evidence} />
        <Button size="sm" aria-pressed={source} onClick={() => setSource(!source)}>
          {t('evidence.source')}
        </Button>
      </div>
      {source ? (
        <pre className="ev-doc-source">{state.text}</pre>
      ) : (
        <div
          className="md ev-doc-body"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: renderMarkdown escapes raw HTML and drops dangerous links
          dangerouslySetInnerHTML={{ __html: renderMarkdown(state.text) }}
        />
      )}
    </div>
  );
}

// A file the page cannot read: its name and size, to open on its own or download.
export function FileOffer({ evidence }: { evidence: Evidence }) {
  const url = useFileUrl()(evidence);
  return (
    <div className="ev-offer well">
      <span className="ev-offer-name">{evidence.filename}</span>
      <span className="t-cap">{sizeLabel(evidence.size)}</span>
      <span className="ev-offer-acts">
        <a className="btn quiet sm" href={url} target="_blank" rel="noreferrer">
          {t('evidence.open')}
        </a>
        <a className="btn quiet sm" href={url} download={evidence.filename}>
          {t('evidence.download')}
        </a>
      </span>
      {evidence.caption ? <span className="t-small ev-offer-cap">{evidence.caption}</span> : null}
    </div>
  );
}

// A file of a files part, read the way its type is: Markdown formatted, code and text as lines,
// anything else offered to open or download.
export function FileView({ evidence }: { evidence: Evidence }) {
  const view = fileViewOf(evidence);
  if (view === 'markdown') return <MarkdownFileView evidence={evidence} />;
  if (view === 'text') return <LogView evidence={evidence} />;
  return <FileOffer evidence={evidence} />;
}
