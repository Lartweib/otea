import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The phone's sheet (phone.css): the heading on the page's gutter, rows that never clip, and the
// bottom bar (Te toca · Nuevo · Panel) in place of the topbar's panel button.

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

  it('has no floating buttons: the sheet button and the + gave way to the bottom bar', () => {
    expect(phoneCss).not.toContain('.sheetbtn');
    expect(phoneCss).not.toContain('.fab');
  });

  it('draws the bottom bar on the screen’s foot, three tabs wide, clear of the home bar', () => {
    const bar = rules(phone, '.tabbar');
    expect(bar).toMatch(/position:\s*fixed/);
    expect(bar).toMatch(/bottom:\s*0/);
    expect(bar).toMatch(/grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
    expect(bar).toMatch(/env\(safe-area-inset-bottom/);
    expect(bar).toMatch(/border-top:\s*1px solid var\(--rule\)/);
    expect(rules(phoneCss, '.tabbar')).toMatch(/display:\s*none/);
    expect(rules(phone, '.tabbar .tab')).toMatch(/min-height:\s*56px/);
    const disc = rules(phone, '.tabbar .disc');
    expect(disc).toMatch(/width:\s*40px/);
    expect(disc).toMatch(/border-radius:\s*50%/);
    expect(disc).toMatch(/background:\s*var\(--ink\)/);
  });

  it('gives the step chips on a board a thumb’s height', () => {
    expect(rules(phone, '.stepchips button')).toMatch(/min-height:\s*44px/);
  });

  it('keeps the last row clear of them on every page', () => {
    expect(rules(phone, '.view > *')).toMatch(
      /padding-bottom:\s*calc\(90px \+ env\(safe-area-inset-bottom/,
    );
  });
});

describe('a finger’s size: every control on the phone is at least 44 px (#34)', () => {
  it('draws the buttons the 390 sweep found short at 44 px, as the mobile mock does', () => {
    for (const sel of [
      '.btn',
      '.ghost-btn',
      '.tri .thd .back',
      '.sec .sact',
      '.addbtn',
      '.plink',
      '.mi',
      '.rd-earlier summary',
      '.ffield input[type="text"]',
      '.ffield select',
    ])
      expect(rules(phone, sel), sel).toMatch(/min-height:\s*44px/);
    for (const sel of ['.rel-remove', '.prow .x']) {
      expect(rules(phone, sel), sel).toMatch(/width:\s*44px/);
      expect(rules(phone, sel), sel).toMatch(/height:\s*44px/);
    }
  });

  it('gives Preferences’ segments and their knob 44 px', () => {
    expect(rules(sheet('prefs.css'), '.pgroup .seg2 > button')).toMatch(/height:\s*44px/);
    expect(rules(sheet('prefs.css'), '.pgroup .seg2 .knob')).toMatch(/height:\s*44px/);
  });

  it('reaches 44 px around a link inside a line of text, without moving the line', () => {
    const finger = phoneCss.slice(phoneCss.indexOf('(pointer: coarse)'));
    const list = finger.slice(0, finger.indexOf('::after'));
    for (const sel of ['.d-head .lnk', 'a.id', '.rchip .x']) expect(list, sel).toContain(sel);
  });
});
