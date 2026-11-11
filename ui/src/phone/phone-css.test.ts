import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The phone's sheet (phone.css): the heading on the page's gutter, rows that never clip, and the
// two round buttons at the bottom in place of the topbar's panel button.

const sheet = (name: string) =>
  readFileSync(new URL(`../styles/${name}`, import.meta.url), 'utf8').replace(
    /\/\*[\s\S]*?\*\//g,
    '',
  );
const phoneCss = sheet('phone.css');
// Everything from the first phone media query on.
const phone = phoneCss.slice(phoneCss.indexOf('@media (max-width: 720px)'));

// Every declaration block whose selector list holds `selector` exactly, joined.
function rules(css: string, selector: string): string {
  const out: string[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (let m = re.exec(css); m; m = re.exec(css)) {
    const sels = (m[1] ?? '').split(',').map((s) => s.trim().replace(/\s+/g, ' '));
    if (sels.includes(selector)) out.push(m[2] ?? '');
  }
  return out.join(';');
}

describe('the phone heading', () => {
  it('sits on the content’s left gutter, not indented by the lanes', () => {
    for (const sel of ['.head', '.bhead', '.tools', '.ftoks']) {
      expect(rules(phone, sel), sel).toMatch(/padding-left:\s*0/);
      expect(rules(phone, sel), sel).not.toMatch(/padding-left:\s*60px/);
    }
  });
});

describe('a row on the phone', () => {
  it('lets the meta line run under the age and wrap instead of clipping', () => {
    expect(rules(phone, '.row .main-c')).toMatch(/display:\s*contents/);
    expect(rules(phone, '.row .m')).toMatch(/grid-column:\s*1 \/ -1/);
    expect(rules(phone, '.row .m')).toMatch(/flex-wrap:\s*wrap/);
    expect(rules(phone, '.row .m')).toMatch(/overflow:\s*visible/);
    expect(rules(phone, '.row .age')).toMatch(/grid-column:\s*2/);
  });

  it('hides the separator that leads a wrapped line', () => {
    expect(rules(phone, '.row .m')).toMatch(/clip-path:\s*inset\(/);
    expect(rules(phone, '.row .m > :first-child')).toMatch(/margin-left:/);
  });

  it('wraps a child’s title on the item page, its id and step on a line under it', () => {
    expect(rules(phone, '.krow')).toMatch(/grid-template-columns:\s*22px minmax\(0, 1fr\) auto/);
    expect(rules(phone, '.krow')).toMatch(/height:\s*auto/);
    expect(rules(phone, '.krow .kt')).toMatch(/white-space:\s*normal/);
    expect(rules(phone, '.krow .id')).toMatch(/grid-row:\s*2/);
    expect(rules(phone, '.krow .ks')).toMatch(/grid-row:\s*2/);
  });

  it('wraps a long board name in the nav sheet', () => {
    expect(rules(phoneCss, '.nsheet .nav .lb')).toMatch(/white-space:\s*normal/);
    expect(rules(phoneCss, '.nsheet .nav > .nrow')).toMatch(/min-height:\s*44px/);
  });
});

describe('the bottom buttons', () => {
  it('has no panel button in the topbar any more', () => {
    expect(phoneCss).not.toContain('.navbtn');
    expect(sheet('shell.css')).not.toContain('.navbtn');
  });

  it('draws the sheet button and the + as two 48 px rounds, left and right', () => {
    for (const sel of ['.sheetbtn', '.fab']) {
      const r = rules(phone, sel);
      expect(r, sel).toMatch(/width:\s*48px/);
      expect(r, sel).toMatch(/height:\s*48px/);
      expect(r, sel).toMatch(/border-radius:\s*50%/);
      expect(r, sel).toMatch(/env\(safe-area-inset-bottom/);
    }
    expect(rules(phone, '.sheetbtn')).toMatch(/left:\s*max\(16px, env\(safe-area-inset-left/);
    expect(rules(phone, '.fab')).toMatch(/right:\s*max\(16px, env\(safe-area-inset-right/);
  });

  it('keeps the last row clear of them on every page', () => {
    expect(rules(phone, '.view > *')).toMatch(
      /padding-bottom:\s*calc\(90px \+ env\(safe-area-inset-bottom/,
    );
  });
});
