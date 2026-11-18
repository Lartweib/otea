// The word «otea» as the web UI's header draws it (ui/src/shell/Topbar.tsx, shell.css): its o is a
// letter of the word, a ring at the weight of the other stems with the blue dot on it, in
// Schibsted's font units. The picker and the window shown while the installer works wear it too.
// `working` grows the dot, adds its trail and turns it, as the header does while an agent works.

export const BRAND_O =
  '<svg class="brand-o" viewBox="0 -600 611 640" aria-hidden="true">' +
  '<circle class="brand-ring" cx="305.5" cy="-265.6" r="206" stroke-width="150"/>' +
  '<g class="brand-spin">' +
  '<path class="brand-trail" d="M187.3 -434.3 A206 206 0 0 1 440.6 -421.1" stroke-width="150"/>' +
  '<circle class="brand-dot" cx="451.2" cy="-411.3" r="76" stroke-width="34"/>' +
  '</g></svg>';

export const wordmark = (working = false) =>
  `<span class="brand${working ? ' working' : ''}" role="img" aria-label="otea">${BRAND_O}tea</span>`;

// Needs the page's --sans, --ink, --ground and --mark-you.
export const BRAND_CSS = `
.brand { display: inline-block; font: 700 30px/1 var(--sans); letter-spacing: -0.02em; color: var(--ink); white-space: nowrap; }
.brand-o { width: 0.611em; height: 0.64em; vertical-align: -0.04em; margin-right: -0.02em; overflow: visible; }
.brand-ring { fill: none; stroke: var(--ink); }
.brand-dot { fill: var(--mark-you); stroke: var(--ground); paint-order: stroke; transform-box: view-box; transform-origin: 451.2px -411.3px; transition: transform 420ms ease; }
.brand-trail { fill: none; stroke: var(--mark-you); stroke-opacity: 0.5; opacity: 0; transition: opacity 300ms ease; }
.brand-spin { transform-box: view-box; transform-origin: 305.5px -265.6px; }
.brand.working .brand-dot { transform: scale(1.22); }
.brand.working .brand-trail { opacity: 1; }
.brand.working .brand-spin { animation: brand-spin 2.6s linear infinite; }
@keyframes brand-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .brand.working .brand-spin { animation: none; } }
`;
