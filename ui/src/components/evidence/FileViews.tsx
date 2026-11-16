import { type ReactNode, useState } from 'react';
import { useFileUrl } from '../../evidence-files.ts';
import { t } from '../../i18n/i18n.ts';
import { sizeLabel } from '../../intake-files.ts';
import { Button } from '../../kit/index.ts';
import { renderMarkdown } from '../../markdown.ts';
import type { Evidence } from '../../types.ts';
import { compareCells, parseDelimited } from './data-view.ts';
import { FileMeta } from './FileMeta.tsx';
import { fileViewOf } from './file-view.ts';
import { PdfFileView } from './PdfView.tsx';
import { mayBeReport, ReportOr } from './TestReportView.tsx';
import { LogView, TextState, useEvidenceText } from './TextViews.tsx';

// The source of a data file (the lines it came as), a toggle away from how it reads.
function WithSource({
  evidence,
  label,
  children,
}: {
  evidence: Evidence;
  label: string;
  children: ReactNode;
}) {
  const [source, setSource] = useState(false);
  return (
    <div className="ev-data">
      <div className="ev-tools">
        <span className="t-cap">{label}</span>
        <Button size="sm" aria-pressed={source} onClick={() => setSource(!source)}>
          {t('evidence.source')}
        </Button>
      </div>
      {source ? <LogView evidence={evidence} /> : children}
      {source ? null : <FileMeta evidence={evidence} />}
    </div>
  );
}

// A CSV or TSV as a table under its header row; a header sorts the rows by its column, again the
// other way. On a narrow screen each row reads as a card, each cell under its column's name.
export function TableFileView({ evidence }: { evidence: Evidence }) {
  const state = useEvidenceText(evidence);
  const [sort, setSort] = useState<{ col: number; down: boolean } | null>(null);
  if (state.status !== 'ready') return <TextState state={state} evidence={evidence} />;
  const tab = /\.tsv$/i.test(evidence.filename) || evidence.contentType.includes('tab-separated');
  const [head = [], ...body] = parseDelimited(state.text, tab ? '\t' : ',');
  const rows = sort
    ? [...body].sort((a, b) => {
        const by = compareCells(a[sort.col] ?? '', b[sort.col] ?? '');
        return sort.down ? -by : by;
      })
    : body;
  const width = Math.max(head.length, ...body.map((r) => r.length));
  const cols = Array.from({ length: width }, (_, i) => head[i] ?? '');
  return (
    <WithSource evidence={evidence} label={t('evidence.rows', { count: body.length })}>
      <div className="ev-table-wrap">
        <table className="ev-table">
          <thead>
            <tr>
              {cols.map((name, col) => (
                <th
                  // biome-ignore lint/suspicious/noArrayIndexKey: a column is its place.
                  key={col}
                  scope="col"
                  aria-sort={
                    sort?.col === col ? (sort.down ? 'descending' : 'ascending') : undefined
                  }
                >
                  <button
                    type="button"
                    className="ev-th"
                    onClick={() =>
                      setSort(sort?.col === col ? { col, down: !sort.down } : { col, down: false })
                    }
                  >
                    {name}
                    <span className="ev-sort" aria-hidden="true">
                      {sort?.col === col ? (sort.down ? '↓' : '↑') : ''}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, at) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: a row is its place.
              <tr key={at}>
                {cols.map((name, col) => (
                  <td
                    // biome-ignore lint/suspicious/noArrayIndexKey: a cell is its place.
                    key={col}
                    data-label={name}
                    data-num={NUMBER.test(row[col] ?? '') ? 'true' : undefined}
                  >
                    {row[col] ?? ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </WithSource>
  );
}

// A cell that holds a number reads right-aligned, its digits in columns.
const NUMBER = /^-?[\d.,]+%?$/;

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

// Branches deeper than this start folded.
const OPEN_DEPTH = 2;

function JsonNode({ name, value, depth }: { name: ReactNode; value: Json; depth: number }) {
  const key = name === null ? null : <span className="ev-json-key">{name}</span>;
  if (value !== null && typeof value === 'object') {
    const list = Array.isArray(value);
    const entries: [string, Json][] = list
      ? value.map((v, i) => [String(i), v])
      : Object.entries(value);
    const count = list
      ? t('evidence.jsonItems', { count: entries.length })
      : t('evidence.jsonKeys', { count: entries.length });
    return (
      <details className="ev-json-branch" open={depth < OPEN_DEPTH}>
        <summary>
          {key}
          <span className="ev-json-count">
            {list ? '[ ' : '{ '}
            {count}
            {list ? ' ]' : ' }'}
          </span>
        </summary>
        <div className="ev-json-kids">
          {entries.map(([k, v]) => (
            <JsonNode
              key={k}
              name={list ? <span className="ev-json-at">{k}</span> : k}
              value={v}
              depth={depth + 1}
            />
          ))}
        </div>
      </details>
    );
  }
  const kind = value === null ? 'null' : typeof value;
  return (
    <div className="ev-json-leaf">
      {key}
      <span className="ev-json-val" data-kind={kind}>
        {typeof value === 'string' ? `"${value}"` : String(value)}
      </span>
    </div>
  );
}

// JSON as a tree whose objects and lists fold; what does not parse reads as lines.
export function JsonFileView({ evidence }: { evidence: Evidence }) {
  const state = useEvidenceText(evidence);
  if (state.status !== 'ready') return <TextState state={state} evidence={evidence} />;
  let data: Json;
  try {
    data = JSON.parse(state.text) as Json;
  } catch {
    return <LogView evidence={evidence} />;
  }
  return (
    <WithSource evidence={evidence} label={t('evidence.kindJson')}>
      <div className="ev-json well">
        <JsonNode name={null} value={data} depth={0} />
      </div>
    </WithSource>
  );
}

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

// A file of a files part, read the way its type is: Markdown formatted, a PDF as its pages, a test
// report as its results, code and text as lines, anything else offered to open or download.
export function FileView({ evidence }: { evidence: Evidence }) {
  const view = fileViewOf(evidence);
  if (view === 'markdown') return <MarkdownFileView evidence={evidence} />;
  if (view === 'table') return <TableFileView evidence={evidence} />;
  if (view === 'pdf') return <PdfFileView evidence={evidence} />;
  if (view === 'json' || view === 'text') {
    const plain =
      view === 'json' ? <JsonFileView evidence={evidence} /> : <LogView evidence={evidence} />;
    // A test run's report (JUnit XML, vitest or jest JSON) reads as its results.
    return mayBeReport(evidence) ? <ReportOr evidence={evidence}>{plain}</ReportOr> : plain;
  }
  return <FileOffer evidence={evidence} />;
}
