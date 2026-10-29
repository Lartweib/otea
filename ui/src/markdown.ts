import { micromark } from 'micromark';

// CommonMark to HTML, safe by default: raw HTML is escaped, not injected, and links with a
// dangerous protocol (javascript:, data:…) lose their href. Never pass allowDangerousHtml.
export function renderMarkdown(source: string): string {
  return micromark(source);
}
