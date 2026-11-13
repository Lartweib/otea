// The update notice: a small pill in the window's corner ("Otea se actualizó · reiniciar"), drawn by
// the preload over whatever page the window shows. It never takes focus and never covers the page's
// middle; it lives in a shadow root so the page's styles and the pill's never touch, and it reads
// the page's tokens (--sheet, --ink…) so it sits in the same light or dark.
export type NoticeView = { text: string; action: string; dismiss: string };

const HOST = 'otea-desktop-notice';

const STYLE = `
:host { all: initial; }
.pill {
  position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
  display: flex; align-items: center; gap: 2px;
  padding: 4px 4px 4px 14px; border-radius: 999px;
  background: var(--sheet, oklch(0.995 0.0025 268));
  border: 1px solid var(--rule-2, oklch(0.855 0.009 268));
  box-shadow: 0 10px 28px -14px var(--shadow, oklch(0.32 0.05 266 / 0.2));
  color: var(--ink-2, oklch(0.43 0.017 267));
  font: 500 13px/20px var(--sans, system-ui, sans-serif);
  animation: in 240ms cubic-bezier(0.2, 0.7, 0.2, 1) both;
}
@media (max-width: 720px) { .pill { bottom: 76px; right: 12px; } }
@media (prefers-reduced-motion: reduce) { .pill { animation: none; } }
@keyframes in { from { opacity: 0; transform: translateY(6px); } }
.sep { color: var(--ink-3, oklch(0.51 0.016 268)); padding: 0 6px; }
button {
  font: inherit; border: 0; background: none; cursor: pointer; border-radius: 999px;
  transition: background-color 120ms ease;
}
.act { color: var(--you-ink, oklch(0.455 0.18 266)); font-weight: 600; padding: 2px 8px; margin-left: -8px; }
.act:hover, .x:hover { background: var(--hov, oklch(0.962 0.009 268)); }
.x {
  width: 24px; height: 24px; display: grid; place-items: center; margin-left: 4px;
  color: var(--ink-3, oklch(0.51 0.016 268));
}
button:focus-visible { outline: 2px solid var(--you, oklch(0.5 0.2 266)); outline-offset: 1px; }
`;

const CROSS =
  '<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M1.5 1.5l7 7m0-7l-7 7" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"/></svg>';

export function clearNotice(doc: Document): void {
  doc.getElementById(HOST)?.remove();
}

export function drawNotice(
  doc: Document,
  view: NoticeView,
  on: { act(): void; dismiss(): void },
): void {
  clearNotice(doc);
  const host = doc.createElement('div');
  host.id = HOST;
  const root = host.attachShadow({ mode: 'closed' });
  const style = doc.createElement('style');
  style.textContent = STYLE;
  const pill = doc.createElement('div');
  pill.className = 'pill';
  pill.setAttribute('role', 'status');
  const text = doc.createElement('span');
  text.textContent = view.text;
  const sep = doc.createElement('span');
  sep.className = 'sep';
  sep.textContent = '·';
  sep.setAttribute('aria-hidden', 'true');
  const act = doc.createElement('button');
  act.className = 'act';
  act.textContent = view.action;
  act.addEventListener('click', () => on.act());
  const close = doc.createElement('button');
  close.className = 'x';
  close.title = view.dismiss;
  close.setAttribute('aria-label', view.dismiss);
  close.innerHTML = CROSS;
  close.addEventListener('click', () => {
    clearNotice(doc);
    on.dismiss();
  });
  pill.append(text, sep, act, close);
  root.append(style, pill);
  doc.body.append(host);
}
