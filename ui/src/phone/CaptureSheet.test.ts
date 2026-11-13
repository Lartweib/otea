import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../i18n/i18n.ts';
import type { CollectionView, FieldView, Layout, TypeView } from '../types.ts';
import { CaptureBody, type CaptureBodyProps } from './CaptureSheet.tsx';
import { captureBoards } from './capture.ts';

afterEach(() => setLanguage('en'));

const LAYOUT: Layout = {
  header: [],
  evidence: [],
  body: [],
  side: [],
  row: [],
  phone: [],
  intake: [],
};
const title: FieldView = { name: 'title', module: 'text', required: 'create' };
const type = (o: Partial<TypeView> = {}): TypeView => ({
  name: 'item',
  label: 'Item',
  initial: 'todo',
  incomplete: 'Completar',
  states: [] as TypeView['states'],
  fields: [title, { name: 'description', module: 'markdown', required: 'complete' }],
  layout: LAYOUT,
  ...o,
});
const board = (name: string, t: TypeView): CollectionView => ({
  name,
  prefix: 'X',
  preset: name,
  types: [t],
  view: { kind: 'list' } as CollectionView['view'],
  icon: null,
});
const boards = captureBoards([
  board('Pedidos', type()),
  board(
    'Errores',
    type({
      fields: [title, { name: 'sev', module: 'severity', required: 'create', label: 'Severidad' }],
    }),
  ),
]);

const props = (o: Partial<CaptureBodyProps> = {}): CaptureBodyProps => ({
  boards,
  board: boards[0],
  why: 'last',
  picking: false,
  title: '',
  note: '',
  photo: null,
  posting: false,
  onPick: () => {},
  onChoose: () => {},
  onTitle: () => {},
  onNote: () => {},
  onPhoto: () => {},
  onSave: () => {},
  ...o,
});
const render = (p: CaptureBodyProps) => renderToStaticMarkup(createElement(CaptureBody, p));

describe('the capture sheet (mock screen 3)', () => {
  it('shows the board chip, why that board, the title, the note, the photo, where it lands and Guardar', () => {
    setLanguage('es');
    const html = render(props());
    const order = [
      'class="boardpick"',
      'Pedidos',
      'el último que usaste',
      'class="ftitle"',
      'Nota (opcional)',
      'class="photo"',
      'llega a Pedidos › Completar',
      'Guardar',
    ];
    let at = -1;
    for (const w of order) {
      const i = html.indexOf(w, at + 1);
      expect(i, w).toBeGreaterThan(at);
      at = i;
    }
  });

  it('says the capture waits in the queue while the PC does not answer, and still saves', () => {
    setLanguage('es');
    const html = render(props({ title: 'Niebla', queues: true }));

    expect(html).toContain('en cola para Pedidos hasta que tu PC responda');
    expect(html).not.toContain('llega a Pedidos');
    expect(html).not.toMatch(/type="submit"[^>]*disabled/);
  });

  it('opens the system camera for the photo', () => {
    const html = render(props());
    expect(html).toMatch(/<input type="file" accept="image\/\*" capture="environment"/);
  });

  it('saves once there is a title', () => {
    expect(render(props())).toMatch(/<button type="submit" class="btn primary" disabled=""/);
    expect(render(props({ title: 'Niebla' }))).not.toMatch(/type="submit"[^>]*disabled/);
    expect(render(props({ title: '   ' }))).toMatch(/type="submit"[^>]*disabled/);
    expect(render(props({ title: 'Niebla', posting: true }))).toMatch(/type="submit"[^>]*disabled/);
  });

  it('asks for the note by name when the board needs it to create, and saves only with it', () => {
    const [asks] = captureBoards([
      board(
        'Pedidos',
        type({
          fields: [
            title,
            { name: 'p2', module: 'markdown', required: 'create', label: 'Qué necesitas' },
          ],
        }),
      ),
    ]);
    const html = render(props({ board: asks, title: 'Niebla' }));
    expect(html).toMatch(/<textarea[^>]*aria-required="true"[^>]*placeholder="Qué necesitas"/);
    expect(html).toMatch(/type="submit"[^>]*disabled/);
    expect(render(props({ board: asks, title: 'Niebla', note: 'Dos capas' }))).not.toMatch(
      /type="submit"[^>]*disabled/,
    );
  });

  it('says this board when opened from it, and what the board it was opened from asks for', () => {
    expect(render(props({ why: 'here' }))).toContain('this board');
    expect(render(props({ why: 'first' }))).not.toContain('class="cap-why"');
    expect(render(props({ skipped: 'Errores' }))).toContain('Errores asks for more to create');
  });

  it('lists the boards in the same sheet, those that ask for more unpickable and why', () => {
    const html = render(props({ picking: true }));
    expect(html).toContain('aria-expanded="true"');
    expect(html).toMatch(/class="nrow on"[^>]*>.*?Pedidos/);
    expect(html).toMatch(
      /<button type="button" class="nrow" disabled="">.*?Errores.*?asks for Severidad to create · on the computer/,
    );
    // The fields stay (with what was typed) while the list is open.
    expect(html).toMatch(/class="cap-fields" hidden=""/);
  });

  it('shows the photo taken and keeps Guardar off when it is too large', () => {
    const photo = { name: 'IMG_2041.jpg', size: 3_200_000, url: 'blob:x', tooLarge: false };
    const html = render(props({ title: 'A', photo }));
    expect(html).toContain('IMG_2041.jpg');
    expect(html).toContain('3.1 MB');
    expect(html).toContain('Take another photo');
    const big = render(props({ title: 'A', photo: { ...photo, tooLarge: true } }));
    expect(big).toContain('Over 50 MB');
    expect(big).toMatch(/type="submit"[^>]*disabled/);
  });

  it('says why when no board takes a title alone', () => {
    const html = render(props({ board: undefined, why: 'none' }));
    expect(html).toContain('No board takes a title alone');
    expect(html).not.toContain('type="submit"');
  });

  it('says a refusal from the server', () => {
    expect(render(props({ error: 'Not reachable' }))).toContain(
      '<p class="cap-err" role="alert">Not reachable</p>',
    );
  });
});

describe('the capture sheet on the phone (phone.css)', () => {
  const css = readFileSync(new URL('../styles/phone.css', import.meta.url), 'utf8');

  it('sits on the keyboard', () => {
    expect(css).toMatch(/\.nsheet\.capture \{[^}]*bottom: var\(--kb, 0px\)/);
  });

  it('puts its toast under the top bar, not over it', () => {
    expect(css).toMatch(
      /\.toast\.at-top \{[^}]*top: calc\(56px \+ 8px \+ env\(safe-area-inset-top, 0px\)\);[^}]*bottom: auto/,
    );
  });

  it('gives the board chip, the photo and Guardar a thumb’s size', () => {
    expect(css).toMatch(/\.capture \.boardpick \{[^}]*min-height: 44px/);
    expect(css).toMatch(/\.capture \.photo \{[^}]*width: 48px;[^}]*height: 48px/);
    expect(css).toMatch(/\.capture \.cap-acts \.btn \{[^}]*height: 48px/);
  });
});
