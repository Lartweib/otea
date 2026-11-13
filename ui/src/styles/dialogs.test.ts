import { readdirSync, readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import type { PairWorkspace } from '../board-studio/pair.ts';
import { DiscardDialog } from '../board-studio/preview/dialogs.tsx';
import type { ReadyDraft } from '../board-studio/use-board-draft.ts';
import { setLanguage } from '../i18n/i18n.ts';
import { Button, Dialog } from '../kit/index.ts';
import type { ItemView } from '../types.ts';
import { DropDialog } from '../views/detail/BoardSections.tsx';

// Every dialog sits on one line under the top bar and takes one of three widths; none places itself.
// A confirmation that throws work away says so with the kit's destructive button.

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r/g, '');
const sheets = readdirSync(new URL('./', import.meta.url)).filter((f) => f.endsWith('.css'));
const css = Object.fromEntries(sheets.map((f) => [f, read(`./${f}`)]));
const kit = read('../kit/kit.css');

// Rules as [selector, body], innermost blocks only (a @media's rules come out one by one).
const rules = (text: string): [string, string][] =>
  [...text.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => [
    (m[1] as string).trim(),
    m[2] as string,
  ]);
const body = (file: string, selector: string, from = 0): string => {
  const text = css[file] as string;
  const at = text.indexOf(`${selector} {`, from);
  if (at < 0) return '';
  const open = text.indexOf('{', at);
  return text.slice(open + 1, text.indexOf('}', open));
};
const px = (decl: string, name: string): number => {
  const m = decl.match(new RegExp(`${name}: (\\d+)px;`));
  return m ? Number(m[1]) : Number.NaN;
};

const html = (type: unknown, props: object = {}, ...kids: unknown[]) =>
  renderToStaticMarkup(createElement(type as never, props as never, ...(kids as never[])));

afterEach(() => setLanguage('en'));

describe('where a dialog sits', () => {
  // the dialog's own box, its surface or its body: not a field or a line inside it
  const box = /(\.dialog|-dialog|-dlg|\.st-confirmd)(\.[\w-]+)*( > )?( ?\.(psurf|pin))?$/;
  const placing = /(^|\s|;)(top|left|width|margin-left|max-height):/;

  it('is set in pops.css alone', () => {
    const elsewhere: string[] = [];
    for (const [file, text] of Object.entries(css)) {
      if (file === 'pops.css') continue;
      for (const [selector, decls] of rules(text))
        for (const one of selector.split(','))
          if (box.test(one.trim()) && placing.test(decls)) elsewhere.push(`${file}: ${one.trim()}`);
    }
    expect(elsewhere).toEqual([]);
  });

  it('is one line under the top bar, at every width', () => {
    const top = body('pops.css', '\n.dialog');
    expect(top).toMatch(/\btop: var\(--dlg-top\);/);
    const desk = px(body('shell.css', '\n.topbar'), 'height');
    expect(desk).toBeGreaterThan(0);
    expect(top).toMatch(new RegExp(`--dlg-top: calc\\(${desk}px \\+ `));

    const narrow = css['phone.css']?.indexOf('@media (max-width: 720px)') ?? -1;
    const phone = px(body('phone.css', '\n  .topbar', narrow), 'height');
    expect(phone).toBeGreaterThan(0);
    const media = (css['pops.css'] as string).indexOf('@media (max-width: 720px)');
    expect(media).toBeGreaterThan(-1);
    expect(body('pops.css', '\n  .dialog', media)).toMatch(
      new RegExp(`--dlg-top: calc\\(${phone}px \\+ `),
    );
  });

  it('never runs past the bottom of the screen: its body scrolls', () => {
    const pin = body('pops.css', '\n.dialog .pin');
    expect(pin).toMatch(/max-height: calc\(100dvh - var\(--dlg-top\) - var\(--dlg-foot\)\);/);
    expect(pin).toMatch(/overflow-y: auto;/);
  });

  it('takes one of three widths', () => {
    expect(body('pops.css', '\n.dialog')).toMatch(/--dlg-w: 440px;/);
    expect(body('pops.css', '\n.dialog.d-md')).toMatch(/^\s*--dlg-w: 640px;\s*$/);
    expect(body('pops.css', '\n.dialog.d-lg')).toMatch(/^\s*--dlg-w: 860px;\s*$/);
    const md = html(Dialog, { open: true, label: 'x', onClose: () => undefined, size: 'md' }, 'x');
    expect(md).toContain('class="pop e-top dialog d-md"');
    const sm = html(Dialog, { open: true, label: 'x', onClose: () => undefined }, 'x');
    expect(sm).toContain('class="pop e-top dialog"');
  });
});

describe('the destructive button', () => {
  const rule = (selector: string) => {
    const at = kit.indexOf(`\n${selector} {`);
    return at < 0 ? '' : kit.slice(kit.indexOf('{', at) + 1, kit.indexOf('}', at));
  };

  it('is a kit variant, filled with the warning colour', () => {
    expect(html(Button, { variant: 'danger' }, 'Discard')).toBe(
      '<button type="button" class="btn danger">Discard</button>',
    );
    expect(rule('.btn.danger')).toMatch(/background: var\(--warn\);/);
    expect(rule('.btn.danger')).toMatch(/color: var\(--on-you\);/);
    expect(rule('.btn.danger:hover:not(:disabled)')).toMatch(/background: /);
  });

  it('when disabled, leaves the fill as a disabled primary does', () => {
    const off = rule('.btn.danger:disabled');
    expect(off).toMatch(/background: var\(--well\);/);
    expect(off).toMatch(/color: var\(--ink-3\);/);
    expect(off).not.toMatch(/opacity/);
  });

  const destructive = (markup: string) =>
    [...markup.matchAll(/<button[^>]*class="([^"]*)"[^>]*>([^<]*)<\/button>/g)].map(
      (m) => `${m[2]}: ${m[1]}`,
    );

  it('confirms discarding an item', () => {
    const item = { id: 'BUG-1' } as ItemView;
    const markup = html(DropDialog, {
      open: true,
      item,
      choices: [{ to: 'dropped', name: 'Dropped' }],
      onClose: () => undefined,
      onDrop: () => undefined,
    });
    expect(destructive(markup)).toEqual(['Cancel: btn quiet', 'Discard: btn danger']);
  });

  it('confirms discarding a board draft', () => {
    const draft = {
      def: { name: 'Bugs' },
      record: { id: 'bugs', live: null },
    } as unknown as ReadyDraft;
    const markup = html(DiscardDialog, {
      draft,
      open: true,
      onClose: () => undefined,
      onDiscarded: () => undefined,
    });
    expect(destructive(markup)).toEqual(['Keep editing: btn quiet', 'Discard: btn danger']);
  });

  it('confirms discarding both drafts of a pair, the one-board way kept quieter', () => {
    const one = (id: string, name: string) =>
      ({
        def: { name },
        record: { id, live: { version: 2 }, draft: {} },
      }) as unknown as ReadyDraft;
    const pair = {
      ids: { parent: 'cambios', child: 'tareas' },
      parent: one('cambios', 'Cambios'),
      child: one('tareas', 'Tareas'),
      active: 'parent',
      setActive: () => undefined,
    } as unknown as PairWorkspace;
    const markup = html(DiscardDialog, {
      draft: pair.parent,
      pair,
      open: true,
      onClose: () => undefined,
      onDiscarded: () => undefined,
    });
    const buttons = destructive(markup);
    expect(buttons[0]).toBe('Keep editing: btn quiet');
    expect(buttons.at(-1)).toMatch(/: btn danger$/);
    expect(buttons.filter((b) => b.endsWith('btn danger'))).toHaveLength(1);
  });
});
