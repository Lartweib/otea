// The lanes' gradients (SPEC §4.4, mock:956-965), mounted once by App in a hidden SVG. Colours go
// through style, so they follow the theme.
const DEFS = [
  '<linearGradient id="gY" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--you);stop-opacity:0"/><stop offset=".5" style="stop-color:color-mix(in oklch, var(--you) 45%, white);stop-opacity:1"/><stop offset="1" style="stop-color:var(--you);stop-opacity:0"/></linearGradient>',
  '<linearGradient id="gA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--ink);stop-opacity:0"/><stop offset=".5" style="stop-color:color-mix(in oklch, var(--ink) 80%, var(--ground) 0%);stop-opacity:1"/><stop offset="1" style="stop-color:var(--ink);stop-opacity:0"/></linearGradient>',
  '<linearGradient id="gL" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--lane-lit);stop-opacity:0"/><stop offset=".5" style="stop-color:var(--lane-lit);stop-opacity:1"/><stop offset="1" style="stop-color:var(--lane-lit);stop-opacity:0"/></linearGradient>',
  '<linearGradient id="gR" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--warn);stop-opacity:0"/><stop offset=".5" style="stop-color:var(--warn);stop-opacity:1"/><stop offset="1" style="stop-color:var(--warn);stop-opacity:0"/></linearGradient>',
  '<linearGradient id="gB" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--you);stop-opacity:0"/><stop offset=".5" style="stop-color:color-mix(in oklch, var(--you) 55%, white);stop-opacity:1"/><stop offset="1" style="stop-color:var(--you);stop-opacity:0"/></linearGradient>',
  '<linearGradient id="gAt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--ink);stop-opacity:0"/><stop offset=".55" style="stop-color:color-mix(in oklch, var(--ink) 70%, white);stop-opacity:1"/><stop offset="1" style="stop-color:color-mix(in oklch, var(--ink) 25%, white);stop-opacity:1"/></linearGradient>',
  '<linearGradient id="gWt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--warn);stop-opacity:0"/><stop offset=".55" style="stop-color:var(--warn);stop-opacity:1"/><stop offset="1" style="stop-color:color-mix(in oklch, var(--warn) 55%, white);stop-opacity:1"/></linearGradient>',
  '<linearGradient id="gW" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--warn);stop-opacity:0"/><stop offset=".5" style="stop-color:var(--warn);stop-opacity:.9"/><stop offset="1" style="stop-color:var(--warn);stop-opacity:0"/></linearGradient>',
].join('');

export function LaneDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: fixed gradient markup */}
      <defs dangerouslySetInnerHTML={{ __html: DEFS }} />
    </svg>
  );
}
