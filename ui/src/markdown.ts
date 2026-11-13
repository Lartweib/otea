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

// CommonMark to HTML, safe by default: raw HTML is escaped, not injected, and links with a
// dangerous protocol (javascript:, data:…) lose their href. Never pass allowDangerousHtml.
// Links open in a new tab so following one never leaves Otea. A list numbered "1)" keeps its ")"
// (class "paren"), so the text reads as it was written.
export function renderMarkdown(source: string): string {
  const paren = parenLists(source);
  let list = 0;
  return micromark(source)
    .replace(/<ol(?=[ >])/g, (open) => (paren[list++] ? '<ol class="paren"' : open))
    .replace(/<a href="([^"]*)"/g, '<a href="$1" target="_blank" rel="noopener noreferrer"');
}
