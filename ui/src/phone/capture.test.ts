import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CollectionView, FieldView, Layout, TypeView } from '../types.ts';
import {
  captureBoards,
  captureNow,
  capturePayload,
  closeCapture,
  landsStep,
  lastBoard,
  noteField,
  openCapture,
  pickBoard,
  rememberBoard,
} from './capture.ts';

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
  states: [
    { name: 'todo', turn: 'agent' },
    { name: 'fill', turn: 'agent' },
  ] as TypeView['states'],
  fields: [title],
  layout: LAYOUT,
  ...o,
});
const board = (name: string, types: TypeView[]): CollectionView => ({
  name,
  prefix: name.slice(0, 3).toUpperCase(),
  preset: name,
  types,
  view: { kind: 'list' } as CollectionView['view'],
  icon: null,
});

const severity: FieldView = {
  name: 'severity',
  module: 'severity',
  required: 'create',
  label: 'Severidad',
};
const tasks = board('Tareas', [type()]);
const errors = board('Errores', [type({ fields: [title, severity] })]);
const requests = board('Pedidos', [
  type({
    incomplete: 'fill',
    fields: [title, { name: 'description', module: 'markdown', required: 'complete' }],
  }),
]);

describe('captureBoards', () => {
  it('takes the boards that accept a title alone, a field required only to complete included', () => {
    const boards = captureBoards([tasks, errors, requests]);
    expect(boards.map((b) => [b.name, !!b.type])).toEqual([
      ['Tareas', true],
      ['Errores', false],
      ['Pedidos', true],
    ]);
  });

  it('says what a board asks for at creation, in its words', () => {
    expect(captureBoards([errors])[0]?.needs).toEqual(['Severidad']);
  });

  it('a field with a default asks for nothing', () => {
    const withDefault = board('Bugs', [
      type({ fields: [title, { ...severity, default: 'medium' }] }),
    ]);
    expect(captureBoards([withDefault])[0]?.type).toBeDefined();
  });

  it('leaves out a board that is always part of another', () => {
    const [b] = captureBoards([tasks], (name) => (name === 'Tareas' ? 'Cambios' : undefined));
    expect(b).toEqual({ name: 'Tareas', partOf: 'Cambios' });
  });
});

describe('a board that asks for its long text at creation', () => {
  const asks = board('Pedidos', [
    type({
      fields: [
        title,
        { name: 'p2', module: 'markdown', required: 'create', label: 'Qué necesitas' },
      ],
    }),
  ]);
  const two = board('Bugs', [
    type({
      fields: [
        title,
        { name: 'description', module: 'markdown', required: 'create', label: 'Descripción' },
        severity,
      ],
    }),
  ]);

  it('takes it from the note, which it then asks for by name', () => {
    const [b] = captureBoards([asks]);
    expect(b?.type).toBeDefined();
    expect(b?.noteNeeded).toBe('Qué necesitas');
    expect(noteField(asks.types[0] as TypeView)).toBe('p2');
  });

  it('is left out when it asks for more than the note', () => {
    const [b] = captureBoards([two]);
    expect(b?.type).toBeUndefined();
    expect(b?.needs).toEqual(['Descripción', 'Severidad']);
  });

  it('lands where an item with its note starts', () => {
    expect(landsStep(asks.types[0] as TypeView)).toBe('todo');
  });
});

describe('pickBoard', () => {
  const boards = captureBoards([tasks, errors, requests]);

  it('takes the board it was opened from', () => {
    expect(pickBoard(boards, { here: 'Pedidos', last: 'Tareas' })).toMatchObject({
      board: { name: 'Pedidos' },
      why: 'here',
    });
  });

  it('else the last one used on this device', () => {
    expect(pickBoard(boards, { last: 'Pedidos' })).toMatchObject({
      board: { name: 'Pedidos' },
      why: 'last',
    });
  });

  it('else the first that takes a title, skipping a remembered board that no longer does', () => {
    expect(pickBoard(boards, { last: 'Errores' })).toMatchObject({
      board: { name: 'Tareas' },
      why: 'first',
    });
    expect(pickBoard(boards, { last: 'Gone' })).toMatchObject({ why: 'first' });
  });

  it('says when the board it was opened from asks for more', () => {
    expect(pickBoard(boards, { here: 'Errores', last: 'Pedidos' })).toMatchObject({
      board: { name: 'Pedidos' },
      why: 'last',
      skipped: 'Errores',
    });
  });

  it('has nothing to offer when no board takes a title alone', () => {
    expect(pickBoard(captureBoards([errors]), {})).toEqual({ board: undefined, why: 'none' });
  });
});

describe('where it lands and what it sends', () => {
  it('lands in the start state, or the step to complete it', () => {
    expect(landsStep(type())).toBe('todo');
    expect(landsStep(requests.types[0] as TypeView)).toBe('fill');
    // A note fills the description the board needs to complete it: it starts ready.
    expect(landsStep(requests.types[0] as TypeView, true)).toBe('todo');
  });

  it('puts the note in the description, else the first long text, else nowhere', () => {
    expect(noteField(requests.types[0] as TypeView)).toBe('description');
    expect(
      noteField(type({ fields: [title, { name: 'p3', module: 'markdown', label: 'Contexto' }] })),
    ).toBe('p3');
    expect(noteField(type())).toBeUndefined();
  });

  it('sends the title, the note and the photo as evidence', () => {
    const photo = new File(['x'], 'IMG_1.jpg', { type: 'image/jpeg' });
    const { fields, files } = capturePayload(requests.types[0] as TypeView, {
      title: '  Niebla con parallax ',
      note: ' dos capas ',
      photo,
    });
    expect(fields).toEqual({ title: 'Niebla con parallax', description: 'dos capas' });
    expect(files).toEqual([{ file: photo, role: 'single' }]);
  });

  it('sends no empty note and no files without a photo', () => {
    expect(
      capturePayload(requests.types[0] as TypeView, { title: 'A', note: '  ', photo: null }),
    ).toEqual({ fields: { title: 'A' }, files: [] });
  });
});

describe('the last board used on this device', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is kept per project', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
    });
    rememberBoard('p1', 'Pedidos');
    expect(lastBoard('p1')).toBe('Pedidos');
    expect(lastBoard('p2')).toBeUndefined();
  });

  it('survives storage that throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    expect(() => rememberBoard('p1', 'Pedidos')).not.toThrow();
    expect(lastBoard('p1')).toBeUndefined();
  });
});

describe('openCapture', () => {
  it('opens on the board given, closes, and starts a new capture on each opening', () => {
    openCapture({ board: 'Tareas' });
    const first = captureNow();
    expect(first).toMatchObject({ open: true, o: { board: 'Tareas' } });
    closeCapture();
    expect(captureNow()).toMatchObject({ open: false, seq: first.seq });
    openCapture();
    expect(captureNow()).toMatchObject({ open: true, seq: first.seq + 1, o: {} });
    closeCapture();
  });
});
