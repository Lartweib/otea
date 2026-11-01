import { type Attention, attentionFrame, attentionTitle, FAVICONS } from './attention.ts';

// The tab carries the attention too: the title counts what waits for you, and the favicon swaps to
// the frame's file (a favicon is a file: it swaps, it does not animate). A desktop shell reads both
// off the page it hosts.
export function applyAttention(attention: Attention): void {
  document.title = attentionTitle(attention);
  const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  const href = FAVICONS[attentionFrame(attention)];
  if (icon && icon.getAttribute('href') !== href) icon.setAttribute('href', href);
}
