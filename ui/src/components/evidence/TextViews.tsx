import { type CSSProperties, useEffect, useState } from 'react';
import { evidenceFileUrl } from '../../api.ts';
import { type DiffFile, type DiffLine, type LogLine, logView, parseDiff } from '../../evidence.ts';
import { Button } from '../../kit/index.ts';
import type { Evidence } from '../../types.ts';
import { FileMeta } from './FileMeta.tsx';

// Line numbers take the width of the largest, so every line starts in one column.
function digits(largest: number): CSSProperties {
  return { '--digits': String(largest).length } as CSSProperties;
}

// Text larger than this is not drawn here: it opens on its own.
const MAX_TEXT_BYTES = 2 * 1024 * 1024;

type Text = { status: 'loading' } | { status: 'ready'; text: string } | { status: 'failed' };

// An entry never changes, so its text is fetched once per page.
const texts = new Map<number, string>();

function useEvidenceText(evidence: Evidence): Text {
  const { id, size } = evidence;
  const cached = texts.get(id);
  const [state, setState] = useState<Text>(
    cached === undefined ? { status: 'loading' } : { status: 'ready', text: cached },
  );
  useEffect(() => {
    if (texts.has(id) || size > MAX_TEXT_BYTES) return;
    const controller = new AbortController();
    fetch(evidenceFileUrl(id), { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`GET failed with ${response.status}`);
        return response.text();
      })
      .then(
        (text) => {
          texts.set(id, text);
          setState({ status: 'ready', text });
        },
        () => {
          if (!controller.signal.aborted) setState({ status: 'failed' });
        },
      );
    return () => controller.abort();
  }, [id, size]);
  return size > MAX_TEXT_BYTES ? { status: 'failed' } : state;
}

function TextState({ state, evidence }: { state: Text; evidence: Evidence }) {
  const message =
    state.status === 'loading'
      ? 'loading…'
      : evidence.size > MAX_TEXT_BYTES
        ? 'Too large to show here: open the file.'
        : 'Could not load this file: open it on its own.';
  return (
    <div className="ev-code-state well" aria-busy={state.status === 'loading'}>
      <span className="t-cap">{message}</span>
    </div>
  );
}

const SIGN: Record<DiffLine['kind'], string> = { add: '+', del: '-', ctx: ' ', note: '' };

function DiffRow({ line }: { line: DiffLine }) {
  const old = line.kind === 'ctx' || line.kind === 'del' ? line.old : '';
  const now = line.kind === 'ctx' || line.kind === 'add' ? line.new : '';
  return (
    <div className="ev-line" data-kind={line.kind}>
      <span className="ev-gutter">
        <span className="ev-no">{old}</span>
        <span className="ev-no">{now}</span>
      </span>
      <span className="ev-text">
        <span className="ev-sign" aria-hidden="true">
          {SIGN[line.kind]}
        </span>
        {line.text}
      </span>
    </div>
  );
}

function DiffFileView({ file, open }: { file: DiffFile; open: boolean }) {
  const largest = Math.max(
    0,
    ...file.hunks.flatMap(({ lines }) =>
      lines.map((line) => Math.max('old' in line ? line.old : 0, 'new' in line ? line.new : 0)),
    ),
  );
  return (
    <details className="ev-diff-file" open={open}>
      <summary className="ev-diff-head">
        <span className="ev-path">{file.path || 'changes'}</span>
        <span className="ev-counts">
          <span className="ev-plus">+{file.additions}</span>
          <span className="ev-minus">−{file.deletions}</span>
        </span>
      </summary>
      <div className="ev-code" style={digits(largest)}>
        <div className="ev-lines">
          {file.hunks.map((hunk, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: hunks have no identity beyond their place.
            <div key={index}>
              <div className="ev-line" data-kind="hunk">
                <span className="ev-gutter">
                  <span className="ev-no" />
                  <span className="ev-no" />
                </span>
                <span className="ev-text">{hunk.header}</span>
              </div>
              {hunk.lines.map((line, at) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: lines have no identity beyond their place.
                <DiffRow key={at} line={line} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}

// Diffs this long open their first file only; the rest wait folded.
const OPEN_LINES = 400;

export function DiffView({ evidence }: { evidence: Evidence }) {
  const state = useEvidenceText(evidence);
  if (state.status !== 'ready') return <TextState state={state} evidence={evidence} />;
  const files = parseDiff(state.text);
  if (files.length === 0) return <LogView evidence={evidence} />;
  const lines = files.reduce(
    (sum, file) => sum + file.hunks.reduce((count, hunk) => count + hunk.lines.length, 0),
    0,
  );
  const additions = files.reduce((sum, file) => sum + file.additions, 0);
  const deletions = files.reduce((sum, file) => sum + file.deletions, 0);
  // A diff can name one path twice, so its place keys each file.
  const keyed = files.map((file, place) => ({
    file,
    key: `${place}:${file.path}`,
    first: place === 0,
  }));
  return (
    <div className="ev-diff">
      <p className="ev-diff-sum t-cap">
        {files.length} {files.length === 1 ? 'file' : 'files'} ·{' '}
        <span className="ev-plus">+{additions}</span> <span className="ev-minus">−{deletions}</span>
      </p>
      {keyed.map(({ file, key, first }) => (
        <DiffFileView key={key} file={file} open={lines <= OPEN_LINES || first} />
      ))}
      <FileMeta evidence={evidence} />
    </div>
  );
}

function LogRows({ lines }: { lines: LogLine[] }) {
  return lines.map(({ number, text }) => (
    <div key={number} className="ev-line">
      <span className="ev-gutter">
        <span className="ev-no">{number}</span>
      </span>
      <span className="ev-text">{text}</span>
    </div>
  ));
}

// Monospace and numbered. A long log keeps its start and its end until shown in full.
export function LogView({ evidence }: { evidence: Evidence }) {
  const state = useEvidenceText(evidence);
  const [wrap, setWrap] = useState(false);
  const [all, setAll] = useState(false);
  if (state.status !== 'ready') return <TextState state={state} evidence={evidence} />;
  const view = logView(state.text, all);
  return (
    <div className="ev-log">
      <div className="ev-tools">
        <span className="t-cap">
          {view.total} {view.total === 1 ? 'line' : 'lines'}
        </span>
        <Button size="sm" aria-pressed={wrap} onClick={() => setWrap(!wrap)}>
          wrap
        </Button>
      </div>
      <div className="ev-code" data-wrap={wrap ? 'true' : undefined} style={digits(view.total)}>
        <div className="ev-lines">
          <LogRows lines={view.head} />
          {view.hidden > 0 ? (
            <button type="button" className="ev-more" onClick={() => setAll(true)}>
              show all {view.total} lines · {view.hidden} hidden
            </button>
          ) : null}
          <LogRows lines={view.tail} />
        </div>
      </div>
      <FileMeta evidence={evidence} />
    </div>
  );
}
