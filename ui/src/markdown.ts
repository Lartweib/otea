import { micromark } from 'micromark';

// CommonMark to HTML, safe by default: raw HTML is escaped, not injected, and links with a
// dangerous protocol (javascript:, data:…) lose their href. Never pass allowDangerousHtml.
// Links open in a new tab so following one never leaves Otea.
export function renderMarkdown(source: string): string {
  return micromark(source).replace(
    /<a href="([^"]*)"/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer"',
  );
}
