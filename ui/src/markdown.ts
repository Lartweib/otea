import { micromark, parse, postprocess, preprocess } from 'micromark';

// Whether each ordered list of the source, in the order the HTML opens them, is numbered "1)"
// rather than "1.": CommonMark takes both as a list and the HTML keeps no trace of which it was.
function parenLists(source: string): boolean[] {
  const events = postprocess(
    parse()
      .document()
      .write(preprocess()(source, undefined, true)),
  );
  return events.flatMap(([kind, token]) =>
    kind === 'enter' && token.type === 'listOrdered'
      ? [/^\d+\)/.test(source.slice(token.start.offset, token.end.offset).trimStart())]
      : [],
  );
}

// GFM tables, which CommonMark does not know: a header row, a delimiter row (---, :--, --:, :-:) and
// the rows under it, outside fenced code. Everything else is CommonMark.
const DELIMITER = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
const FENCE = /^\s{0,3}(`{3,}|~{3,})/;

type Align = 'left' | 'right' | 'center' | undefined;

// A row's cells: split on pipes not escaped with a backslash, the outer pipes dropped.
function cells(line: string): string[] {
  const trimmed = line
    .trim()
    .replace(/^\|/, '')
    .replace(/(?<!\\)\|$/, '');
  return trimmed.split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, '|'));
}

const alignOf = (cell: string): Align =>
  cell.startsWith(':') && cell.endsWith(':')
    ? 'center'
    : cell.endsWith(':')
      ? 'right'
      : cell.startsWith(':')
        ? 'left'
        : undefined;

// One cell's text as inline Markdown: micromark's paragraph without its <p>.
const inline = (text: string) =>
  micromark(text)
    .trim()
    .replace(/^<p>([\s\S]*)<\/p>$/, '$1');

function tableHtml(head: string, delimiter: string, rows: string[]): string {
  const aligns = cells(delimiter).map(alignOf);
  const cell = (tag: 'th' | 'td', text: string, at: number) => {
    const align = aligns[at];
    return `<${tag}${align ? ` style="text-align:${align}"` : ''}>${inline(text)}</${tag}>`;
  };
  const row = (tag: 'th' | 'td', line: string) => {
    const read = cells(line);
    return `<tr>${aligns.map((_, at) => cell(tag, read[at] ?? '', at)).join('')}</tr>`;
  };
  const body = rows.length ? `<tbody>${rows.map((line) => row('td', line)).join('')}</tbody>` : '';
  return `<div class="md-table"><table><thead>${row('th', head)}</thead>${body}</table></div>\n`;
}

// The source cut into CommonMark runs and tables, in order.
function blocks(source: string): { table: boolean; text: string; html?: string }[] {
  const lines = source.split(/\r?\n/);
  const out: { table: boolean; text: string; html?: string }[] = [];
  let run: string[] = [];
  let fence: string | undefined;
  const flush = () => {
    if (run.length) out.push({ table: false, text: run.join('\n') });
    run = [];
  };
  for (let at = 0; at < lines.length; at += 1) {
    const line = lines[at] ?? '';
    const opened = FENCE.exec(line)?.[1];
    if (fence !== undefined) {
      if (opened && opened[0] === fence[0] && opened.length >= fence.length) fence = undefined;
      run.push(line);
      continue;
    }
    if (opened) {
      fence = opened;
      run.push(line);
      continue;
    }
    const next = lines[at + 1] ?? '';
    const columns = cells(line).length;
    if (line.includes('|') && DELIMITER.test(next) && cells(next).length === columns) {
      let end = at + 2;
      while (
        end < lines.length &&
        (lines[end] ?? '').trim() !== '' &&
        (lines[end] ?? '').includes('|')
      )
        end += 1;
      flush();
      out.push({ table: true, text: '', html: tableHtml(line, next, lines.slice(at + 2, end)) });
      at = end - 1;
      continue;
    }
    run.push(line);
  }
  flush();
  return out;
}

function commonMark(source: string): string {
  const paren = parenLists(source);
  let list = 0;
  return micromark(source).replace(/<ol(?=[ >])/g, (open) =>
    paren[list++] ? '<ol class="paren"' : open,
  );
}

// CommonMark to HTML, safe by default: raw HTML is escaped, not injected, and links with a
// dangerous protocol (javascript:, data:…) lose their href. Never pass allowDangerousHtml.
// Links open in a new tab so following one never leaves Otea. A list numbered "1)" keeps its ")"
// (class "paren"), so the text reads as it was written. GFM tables are drawn too, each cell read as
// inline Markdown, in a box that scrolls sideways when the table is wider than the page.
export function renderMarkdown(source: string): string {
  return blocks(source)
    .map(({ table, text, html }) => (table ? (html ?? '') : commonMark(text)))
    .join('')
    .replace(/<a href="([^"]*)"/g, '<a href="$1" target="_blank" rel="noopener noreferrer"');
}
