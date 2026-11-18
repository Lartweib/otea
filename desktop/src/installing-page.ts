// The small window shown while the Windows installer still writes the app's files (install-wait.ts).
// It may load no file of the app's, so the page is one string: the app's tokens, light and dark, the
// header's «otea» with its dot at work, and the line that says what is happening. `font` is
// Schibsted Grotesk as a data URL (main.ts has esbuild inline it), so the word is the header's.
import { COPY, type Lang } from './copy.ts';
import { BRAND_CSS, wordmark } from './wordmark.ts';

// The web UI's tokens (ui/src/styles/tokens.css) this page uses, as picker.html has them.
const TOKENS = `
:root {
  --sans: 'Schibsted Grotesk Variable', 'Helvetica Neue', Arial, sans-serif;
  --ground: oklch(0.98 0.005 268); --dot: oklch(0.885 0.009 268);
  --ink: oklch(0.215 0.022 266); --ink-2: oklch(0.43 0.017 267);
  --mark-you: oklch(0.6 0.21 266);
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root {
    --ground: oklch(0.2 0.013 266); --dot: oklch(0.3 0.013 266);
    --ink: oklch(0.945 0.006 266); --ink-2: oklch(0.77 0.012 266);
    color-scheme: dark;
  }
}`;

// The window's ground before the page paints, light and dark (--ground as sRGB).
export const INSTALLING_GROUND = { light: '#f7f8fc', dark: '#13161c' } as const;

const escapeHtml = (text: string) =>
  text.replace(/[&<>"]/g, (c) => `&${{ '&': 'amp', '<': 'lt', '>': 'gt', '"': 'quot' }[c]};`);

export function installingPage({ lang, font }: { lang: Lang; font: string }): string {
  const face = font
    ? `@font-face { font-family: 'Schibsted Grotesk Variable'; font-weight: 400 900; src: url('${font}') format('woff2-variations'); }`
    : '';
  const style = `${face}${TOKENS}
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; }
body {
  background-color: var(--ground);
  background-image: radial-gradient(circle, var(--dot) 0.9px, transparent 1.1px);
  background-size: 22px 22px;
  color: var(--ink);
  font: 400 14px/1.45 var(--sans);
  -webkit-font-smoothing: antialiased;
  display: grid; place-content: center; gap: 14px; padding: 0 32px;
}
p { margin: 0; color: var(--ink-2); max-width: 36ch; }
${BRAND_CSS}`;
  return `<!doctype html><html lang="${lang}"><meta charset="utf-8"><title>Otea</title><style>${style}</style><body>${wordmark(true)}<p>${escapeHtml(COPY[lang].installing)}</p></body></html>`;
}
