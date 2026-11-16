import { type CSSProperties, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { type DiffFile, type DiffLine, type LogLine, logView, parseDiff } from '../../evidence.ts';
import { useFileUrl } from '../../evidence-files.ts';
import { isErrorLine, logMatches, type SideRow, sideBySide } from '../../evidence-text.ts';
import { t } from '../../i18n/i18n.ts';
import { Button, Icon } from '../../kit/index.ts';
import type { Evidence } from '../../types.ts';
import { FileMeta } from './FileMeta.tsx';

// Line numbers take the width of the largest, so every line starts in one column.
function digits(largest: number): CSSProperties {
  return { '--digits': String(largest).length } as CSSProperties;
}

// Text larger than this is not drawn here: it opens on its own.
const MAX_TEXT_BYTES = 2 * 1024 * 1024;

export type Text = { status: 'loading' } | { status: 'ready'; text: string } | { status: 'failed' };

// An entry never changes, so its text is fetched once per page, by where it loads from.
const texts = new Map<string, string>();

// A file's text already in hand, read from here on without fetching it.
export function keepEvidenceText(url: string, text: string): void {
  texts.set(url, text);
}

export function useEvidenceText(evidence: Evidence): Text {
  const fileUrl = useFileUrl();
  const { size } = evidence;
  const url = fileUrl(evidence);
  const cached = texts.get(url);
  const [state, setState] = useState<Text>(
    cached === undefined ? { status: 'loading' } : { status: 'ready', text: cached },
  );
  useEffect(() => {
    if (texts.has(url) || size > MAX_TEXT_BYTES) return;
    const controller = new AbortController();
    fetch(url, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`GET failed with ${response.status}`);
        return response.text();
      })
      .then(
        (text) => {
          texts.set(url, text);
          setState({ status: 'ready', text });
        },
        () => {
          if (!controller.signal.aborted) setState({ status: 'failed' });
        },
      );
    return () => controller.abort();
  }, [url, size]);
  return size > MAX_TEXT_BYTES ? { status: 'failed' } : state;
}

export function TextState({ state, evidence }: { state: Text; evidence: Evidence }) {
  const message =
    state.status === 'loading'
      ? t('evidence.loading')
      : evidence.size > MAX_TEXT_BYTES
        ? t('evidence.tooLarge')
        : t('evidence.unreadable');
  return (
    <div className="ev-code-state well" aria-busy={state.status === 'loading'}>
      <span className="t-cap">{message}</span>
    </div>
  );
}

// What the person last chose for diffs (unified or side by side, wrapped or not), kept in this
// browser only; a private window or blocked storage just starts from the default.
function remembered(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function remember(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // Nothing to keep it in: the choice lasts for this page.
  }
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

// One side of a row side by side: the old file's line on the left, the new file's on the right, or
// nothing where the other side's run is longer.
function SideCell({
  side,
  line,
}: {
  side: 'old' | 'new';
  line: SideRow['left'] | SideRow['right'];
}) {
  const kind = line ? line.kind : 'none';
  const no = !line
    ? ''
    : side === 'old' && 'old' in line
      ? line.old
      : 'new' in line
        ? line.new
        : '';
  return (
    <div className="ev-line" data-kind={kind} data-side={side}>
      <span className="ev-gutter">
        <span className="ev-no">{no}</span>
      </span>
      <span className="ev-text">
        <span className="ev-sign" aria-hidden="true">
          {line ? SIGN[line.kind] : ''}
        </span>
        {line?.text ?? ''}
      </span>
    </div>
  );
}

function SplitHunk({ lines }: { lines: DiffLine[] }) {
  return sideBySide(lines).map((row, at) =>
    row.note ? (
      // biome-ignore lint/suspicious/noArrayIndexKey: rows have no identity beyond their place.
      <div key={at} className="ev-line ev-split-note" data-kind="note">
        <span className="ev-text">{row.note.text}</span>
      </div>
    ) : (
      // biome-ignore lint/suspicious/noArrayIndexKey: rows have no identity beyond their place.
      <div key={at} className="ev-split-row">
        <SideCell side="old" line={row.left} />
        <SideCell side="new" line={row.right} />
      </div>
    ),
  );
}

function DiffFileView({
  file,
  open,
  wrap,
  split,
}: {
  file: DiffFile;
  open: boolean;
  wrap: boolean;
  split: boolean;
}) {
  const largest = Math.max(
    0,
    ...file.hunks.flatMap(({ lines }) =>
      lines.map((line) => Math.max('old' in line ? line.old : 0, 'new' in line ? line.new : 0)),
    ),
  );
  return (
    <details className="ev-diff-file" open={open}>
      <summary className="ev-diff-head">
        <span className="ev-path">{file.path || t('evidence.changes')}</span>
        <span className="ev-counts">
          <span className="ev-plus">+{file.additions}</span>
          <span className="ev-minus">−{file.deletions}</span>
        </span>
      </summary>
      <div
        className={split ? 'ev-code ev-split' : 'ev-code'}
        data-wrap={wrap ? 'true' : undefined}
        style={digits(largest)}
      >
        <div className="ev-lines">
          {file.hunks.map((hunk, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: hunks have no identity beyond their place.
            <div key={index}>
              <div className="ev-line" data-kind="hunk">
                <span className="ev-gutter">
                  <span className="ev-no" />
                  {split ? null : <span className="ev-no" />}
                </span>
                <span className="ev-text">{hunk.header}</span>
              </div>
              {split ? (
                <SplitHunk lines={hunk.lines} />
              ) : (
                hunk.lines.map((line, at) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: lines have no identity beyond their place.
                  <DiffRow key={at} line={line} />
                ))
              )}
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}

// Diffs this long open their first file only; the rest wait folded.
const OPEN_LINES = 400;

const WRAP_KEY = 'otea.diff.wrap';
const SPLIT_KEY = 'otea.diff.layout';

// Unified or side by side, a long line wrapped or not: each on request, the person's last choice
// kept. Side by side always wraps: two columns scrolling sideways lose the line they face. `wrap`
// holds it unified and wrapped with no choice (the phone's diff); `split` opens it side
// by side.
export function DiffView({
  evidence,
  wrap: held,
  split: opensSplit,
}: {
  evidence: Evidence;
  wrap?: boolean;
  split?: boolean;
}) {
  const state = useEvidenceText(evidence);
  const [wrapped, setWrapped] = useState(() => remembered(WRAP_KEY) === 'true');
  const [splitChosen, setSplit] = useState(() => opensSplit ?? remembered(SPLIT_KEY) === 'split');
  const wrap = held ?? wrapped;
  const split = held === undefined && splitChosen;
  const chooseWrap = (on: boolean) => {
    setWrapped(on);
    remember(WRAP_KEY, String(on));
  };
  const chooseSplit = (on: boolean) => {
    setSplit(on);
    remember(SPLIT_KEY, on ? 'split' : 'unified');
  };
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
      <div className="ev-tools">
        <p className="ev-diff-sum t-cap">
          {t('common.files', { count: files.length })} ·{' '}
          <span className="ev-plus">+{additions}</span>{' '}
          <span className="ev-minus">−{deletions}</span>
        </p>
        {held === undefined ? (
          <span className="ev-tool-set">
            <fieldset className="dg-switch ev-seg" aria-label={t('evidence.layout')}>
              <button
                type="button"
                className="dg-seg"
                aria-pressed={!split}
                onClick={() => chooseSplit(false)}
              >
                {t('evidence.unified')}
              </button>
              <button
                type="button"
                className="dg-seg"
                aria-pressed={split}
                onClick={() => chooseSplit(true)}
              >
                {t('evidence.sideBySide')}
              </button>
            </fieldset>
            {split ? null : (
              <Button size="sm" aria-pressed={wrapped} onClick={() => chooseWrap(!wrapped)}>
                {t('evidence.wrap')}
              </Button>
            )}
          </span>
        ) : null}
      </div>
      {keyed.map(({ file, key, first }) => (
        <DiffFileView
          key={key}
          file={file}
          open={lines <= OPEN_LINES || first}
          wrap={wrap}
          split={split}
        />
      ))}
      <FileMeta evidence={evidence} />
    </div>
  );
}

function LogRows({
  lines,
  found,
  current,
}: {
  lines: LogLine[];
  found: ReadonlySet<number>;
  current: number | null;
}) {
  return lines.map(({ number, text }) => (
    <div
      key={number}
      className="ev-line"
      data-line={number}
      data-error={isErrorLine(text) ? 'true' : undefined}
      data-found={found.has(number) ? 'true' : undefined}
      data-current={current === number ? 'true' : undefined}
    >
      <span className="ev-gutter">
        <span className="ev-no">{number}</span>
      </span>
      <span className="ev-text">{text}</span>
    </div>
  ));
}

// The first of `stops` after `from`, round to the first again past the last.
function after(stops: readonly number[], from: number | null): number | null {
  return stops.find((n) => from === null || n > from) ?? stops[0] ?? null;
}

function before(stops: readonly number[], from: number | null): number | null {
  return [...stops].reverse().find((n) => from === null || n < from) ?? stops.at(-1) ?? null;
}

// Monospace and numbered. A long log keeps its start and its end until shown in full. It can be
// searched, and the lines that report a failure are marked, with a step to the next of them; a step
// shows the log in full, so the line is there to scroll to.
export function LogView({ evidence }: { evidence: Evidence }) {
  const state = useEvidenceText(evidence);
  const [wrap, setWrap] = useState(false);
  const [all, setAll] = useState(false);
  const [query, setQuery] = useState('');
  const [current, setCurrent] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (current === null) return;
    box.current
      ?.querySelector<HTMLElement>(`[data-line="${current}"]`)
      ?.scrollIntoView?.({ block: 'center' });
  }, [current]);
  if (state.status !== 'ready') return <TextState state={state} evidence={evidence} />;
  const whole = logView(state.text, true).head;
  const errors = whole.filter(({ text }) => isErrorLine(text)).map(({ number }) => number);
  const matches = logMatches(whole, query);
  const found = new Set(matches);
  const view = logView(state.text, all);
  const go = (to: number | null) => {
    if (to === null) return;
    setAll(true);
    setCurrent(to);
  };
  const place = current === null ? -1 : matches.indexOf(current);
  return (
    <div className="ev-log">
      <div className="ev-tools">
        <span className="t-cap">{t('evidence.lines', { count: view.total })}</span>
        <span className="ev-tool-set">
          <span className="ev-find">
            <input
              type="search"
              className="input ev-find-input"
              aria-label={t('evidence.searchLog')}
              placeholder={t('evidence.search')}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                go(logMatches(whole, e.target.value)[0] ?? null);
              }}
            />
            {query.trim() ? (
              <>
                <span className="ev-find-count t-cap" aria-live="polite">
                  {matches.length
                    ? t('evidence.ofMatches', { n: place + 1 || 1, total: matches.length })
                    : t('evidence.noMatch')}
                </span>
                <button
                  type="button"
                  className="btn quiet icon sm"
                  aria-label={t('evidence.prevMatch')}
                  disabled={matches.length === 0}
                  onClick={() => go(before(matches, current))}
                >
                  <Icon name="up" />
                </button>
                <button
                  type="button"
                  className="btn quiet icon sm"
                  aria-label={t('evidence.nextMatch')}
                  disabled={matches.length === 0}
                  onClick={() => go(after(matches, current))}
                >
                  <Icon name="down" />
                </button>
              </>
            ) : null}
          </span>
          {errors.length ? (
            <Button size="sm" className="ev-next-error" onClick={() => go(after(errors, current))}>
              {t('evidence.nextError', { count: errors.length })}
            </Button>
          ) : null}
          <Button size="sm" aria-pressed={wrap} onClick={() => setWrap(!wrap)}>
            {t('evidence.wrap')}
          </Button>
        </span>
      </div>
      <div
        ref={box}
        className="ev-code"
        data-wrap={wrap ? 'true' : undefined}
        style={digits(view.total)}
      >
        <div className="ev-lines">
          <LogRows lines={view.head} found={found} current={current} />
          {view.hidden > 0 ? (
            <button type="button" className="ev-more" onClick={() => setAll(true)}>
              {t('evidence.showAll', { total: view.total, hidden: view.hidden })}
            </button>
          ) : null}
          <LogRows lines={view.tail} found={found} current={current} />
        </div>
      </div>
      <FileMeta evidence={evidence} />
    </div>
  );
}
