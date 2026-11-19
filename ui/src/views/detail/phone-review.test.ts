import { afterEach, describe, expect, it } from 'vitest';
import { creatures } from '../../../../src/core/board/testing.ts';
import { pairIn, roleWord } from '../../evidence.ts';
import { setLanguage } from '../../i18n/i18n.ts';
import type { Round } from '../../rounds.ts';
import type { Evidence, Layout } from '../../types.ts';
import {
  compareFiles,
  fileMarks,
  handedFields,
  imagePairs,
  notesDock,
  partNames,
  phoneRounds,
  readerOf,
  requestLine,
  roundTagWord,
  splitEvidence,
} from './phone-review.ts';

afterEach(() => setLanguage('en'));

let id = 0;
const file = (filename: string, kind: Evidence['kind'] = 'file'): Evidence => ({
  id: ++id,
  itemId: 'TAR-1',
  role: 'single',
  module: null,
  kind,
  filename,
  contentType: kind === 'image' ? 'image/png' : 'text/plain',
  size: 10,
  sha256: '',
  caption: null,
  createdAt: '2026-11-11T10:00:00Z',
  actor: { kind: 'agent', name: 'kiln' },
  channel: 'cli',
});
const kiln = { kind: 'agent', name: 'kiln' } as const;
const you = { kind: 'human', name: 'fede' } as const;

const rounds: Round[] = [
  {
    n: 1,
    endedAt: '2026-11-11T09:00:00Z',
    to: 'todo__review',
    by: kiln,
    note: 'Sube la partida.',
    evidence: [file('primera.png', 'image')],
    verdict: {
      kind: 'sent-back',
      to: 'todo',
      at: '2026-11-11T09:30:00Z',
      actor: you,
      reason: 'Pruébalo con la red lenta.',
    },
  },
  {
    n: 2,
    endedAt: '2026-11-11T11:00:00Z',
    to: 'todo__review',
    by: kiln,
    note: 'Reintenta la subida.',
    evidence: [file('subiendo.png', 'image'), file('saves.ts')],
  },
];

describe('the rounds of the step under review, on the phone', () => {
  it('lists them newest first, each with what was asked of it and how it ended', () => {
    const out = phoneRounds(rounds, true);
    expect(out.map((r) => [r.n, r.tag, r.note, r.asked?.n, r.asked?.text, r.reason])).toEqual([
      [2, 'yours', 'Reintenta la subida.', 1, 'Pruébalo con la red lenta.', undefined],
      [1, 'sentBack', 'Sube la partida.', undefined, undefined, 'Pruébalo con la red lenta.'],
    ]);
    expect(out[0]?.by).toBe('kiln');
  });

  it('leaves the last one without a tag when it is not your turn', () => {
    expect(phoneRounds(rounds, false)[0]?.tag).toBeNull();
  });

  it('says how each one ended in words', () => {
    setLanguage('es');
    expect(roundTagWord('yours')).toBe('tu veredicto');
    expect(roundTagWord('sentBack')).toBe('devuelta');
    expect(roundTagWord('approved')).toBe('aprobada');
    expect(roundTagWord(null)).toBe('');
  });

  it('splits the evidence into images and other files', () => {
    const { images, files } = splitEvidence(rounds[1]?.evidence ?? []);
    expect(images.map((e) => e.filename)).toEqual(['subiendo.png']);
    expect(files.map((e) => e.filename)).toEqual(['saves.ts']);
  });

  it('marks what is new, what is gone and what stayed from one round to the next', () => {
    const a = [file('a.png', 'image'), file('saves.ts'), file('old.log', 'log')];
    const b = [file('a.png', 'image'), file('saves.ts'), file('new.ts')];
    expect(compareFiles(a, b).map((c) => [c.name, c.change])).toEqual([
      ['new.ts', 'new'],
      ['a.png', 'same'],
      ['saves.ts', 'same'],
      ['old.log', 'gone'],
    ]);
  });

  // Comparar listed the files only; the rounds' pictures could not be seen together (P5-5).
  it('pairs the pictures of two rounds: by name, else in their order, the rest alone', () => {
    const logo1 = file('logo.png', 'image');
    const v1 = file('post-v1.png', 'image');
    const log = file('run.log', 'log');
    const logo2 = file('logo.png', 'image');
    const v2 = file('post-v2.png', 'image');
    const extra = file('story.png', 'image');
    const pairs = imagePairs([logo1, v1, log], [v2, logo2, extra]);
    expect(pairs.map((p) => [p.before?.filename ?? null, p.after?.filename ?? null])).toEqual([
      ['post-v1.png', 'post-v2.png'],
      ['logo.png', 'logo.png'],
      [null, 'story.png'],
    ]);
    expect(imagePairs([v1], []).map((p) => [p.before?.filename, p.after])).toEqual([
      ['post-v1.png', undefined],
    ]);
  });

  it('marks a file that came again with other contents as changed, not the same', () => {
    const before = { ...file('app.ts'), sha256: 'aaa' };
    const kept = { ...file('readme.md'), sha256: 'bbb' };
    const after = { ...file('app.ts'), sha256: 'ccc' };
    const again = { ...file('readme.md'), sha256: 'bbb' };
    expect(compareFiles([before, kept], [after, again]).map((c) => [c.name, c.change])).toEqual([
      ['app.ts', 'changed'],
      ['readme.md', 'same'],
    ]);
  });

  it('says how each file of a round stands against the round before, by its id', () => {
    const before = { ...file('app.ts'), sha256: 'aaa' };
    const after = { ...file('app.ts'), sha256: 'ccc' };
    const fresh = file('nuevo.ts');
    const marks = fileMarks([before], [after, fresh]);
    expect(marks.get(after.id)).toBe('changed');
    expect(marks.get(fresh.id)).toBe('new');
    expect(fileMarks([], [fresh]).size).toBe(0);
  });

  // On a blind compare the old round's image read «igual» and gave away which was old (P5-R2-2).
  it('leaves the files of a blind compare unmarked', () => {
    const a = { ...file('A.png', 'image'), module: 'pick', sha256: 'aaa' };
    const b = { ...file('B.png', 'image'), module: 'pick', sha256: 'bbb' };
    const log = file('run.log', 'log');
    const marks = fileMarks([a, log], [a, b, log], new Set(['pick']));
    expect(marks.has(a.id)).toBe(false);
    expect(marks.has(b.id)).toBe(false);
    expect(marks.get(log.id)).toBe('same');
  });
});

describe('the note dock on the phone', () => {
  it('gives way to Retomar and Reasignar when the item is stuck', () => {
    expect(notesDock('stuck', true)).toBe(false);
    expect(notesDock('moves', true)).toBe(true);
    expect(notesDock('moves', false)).toBe(false);
  });
});

describe('partNames: which part of the board each file was attached to', () => {
  it('names each evidence module by its board part, so one file in two parts reads as two', () => {
    const layout = {
      header: [],
      body: [
        { module: 'recording', id: 'evideo', label: 'Grabación' },
        { module: 'recording', id: 'estrip', variant: 'frames', label: 'Tira de fotogramas' },
        { module: 'markdown', field: 'fdesc', label: 'Descripción' },
      ],
      side: [],
      evidence: [{ module: 'files', id: 'efile' }],
      phone: [],
    } as unknown as Layout;
    const names = partNames(layout);
    expect(names.get('evideo')).toBe('Grabación');
    expect(names.get('estrip')).toBe('Tira de fotogramas');
    expect(names.has('fdesc')).toBe(false);
    expect(names.has('efile')).toBe(false);
  });
});

describe('readerOf: what the reader reads', () => {
  it('reads the newest round, images first, marked against the round before', () => {
    const read = readerOf(phoneRounds(rounds, true), []);
    expect(read.files.map((e) => e.filename)).toEqual(['subiendo.png', 'saves.ts']);
    expect([...read.marks.values()]).toEqual(['new', 'new']);
  });

  it('reads every file of the item, newest first, when no round was handed', () => {
    const loose = [file('a.log'), file('b.png', 'image')];
    const read = readerOf([], loose);
    expect(read.files.map((e) => e.filename)).toEqual(['b.png', 'a.log']);
    expect(read.marks.size).toBe(0);
  });
});

describe('handedFields: what a step handed off that is not a file', () => {
  it('lists the step’s handed-off fields that hold a value, by name, in the step’s order', () => {
    const def = creatures();
    const animate = def.steps.find((s) => s.id === 'sanimate');
    if (!animate) throw new Error('sanimate');
    animate.hand = [
      { ref: 'fdesc', req: 'always', fresh: false },
      { ref: 'eart', req: 'always', fresh: true },
      { ref: 'fbiome', req: 'always', fresh: false },
    ];
    expect(handedFields(def, 'sanimate', { fdesc: 'Lenta', fbiome: '' })).toEqual([
      { ref: 'fdesc', name: 'Descripción', value: 'Lenta', long: true },
    ]);
    expect(handedFields(def, 'sanimate', { fdesc: 'Lenta', fbiome: 'cswamp' })).toEqual([
      { ref: 'fdesc', name: 'Descripción', value: 'Lenta', long: true },
      { ref: 'fbiome', name: 'Bioma', value: 'cswamp', long: false },
    ]);
    expect(handedFields(def, null, { fdesc: 'Lenta' })).toEqual([]);
  });

  it('marks a field the board shows as options (P7-R2-5)', () => {
    const def = creatures();
    const animate = def.steps.find((s) => s.id === 'sanimate');
    const desc = def.parts.fdesc;
    if (!animate || desc?.kind !== 'long') throw new Error('sanimate');
    desc.show = 'options';
    animate.hand = [{ ref: 'fdesc', req: 'always', fresh: false }];
    expect(handedFields(def, 'sanimate', { fdesc: '### A · Una' })).toEqual([
      { ref: 'fdesc', name: 'Descripción', value: '### A · Una', long: true, options: true },
    ]);
  });
});

describe('requestLine: the folded request, one line of its prose (IDEA2-2, DR2-22)', () => {
  it('reads the first line of prose, never a heading mark, a table or a fence', () => {
    const brief = [
      '## Problema',
      'Sostener **hábitos** diarios cuesta; ver la [racha](https://x.y) ayuda.',
      '',
      '| Entra | Fuera |',
      '|---|---|',
    ].join('\n');
    expect(requestLine(brief)).toBe('Sostener hábitos diarios cuesta; ver la racha ayuda.');
    expect(requestLine('| Entra | Fuera |\n|---|---|\n| Marcar | Cuentas |')).toBe('Entra · Fuera');
    expect(requestLine('- `otea` falla en *CI*\n- otra')).toBe('otea falla en CI');
    expect(requestLine('## Solo un título')).toBe('Solo un título');
    expect(requestLine('```\nnpm test\n```\nY después')).toBe('Y después');
    expect(requestLine('  ')).toBe('');
  });

  it('keeps the underscores inside a word and inside code (P7-10)', () => {
    expect(requestLine('Falla user_name_here con _cursiva_ y __init__')).toBe(
      'Falla user_name_here con cursiva y init',
    );
    expect(requestLine('Lee `__dunder__` y `a_b_c` en snake_case')).toBe(
      'Lee __dunder__ y a_b_c en snake_case',
    );
  });
});

describe('before and after in the reader', () => {
  const side = (filename: string, role: Evidence['role'], module = 'eba') => ({
    ...file(filename, 'image'),
    role,
    module,
  });

  it('finds the other side of a before or an after of the same part, and nothing for a single', () => {
    const before = side('antes.png', 'before');
    const after = side('despues.png', 'after');
    const other = side('otra.png', 'after', 'eimg');
    const single = file('captura.png', 'image');
    const files = [single, after, other, before];
    expect(pairIn(files, after)).toEqual({ before, after });
    expect(pairIn(files, before)).toEqual({ before, after });
    expect(pairIn(files, other)).toBeNull();
    expect(pairIn(files, single)).toBeNull();
  });

  it('reads a before next to its after, and names each side', () => {
    const before = side('antes.png', 'before');
    const after = side('despues.png', 'after');
    const shot = file('captura.png', 'image');
    const { files } = readerOf([], [after, shot, before]);
    expect(files.indexOf(after) - files.indexOf(before)).toBe(1);
    const ahead = readerOf([], [before, shot, after]).files;
    expect(ahead.indexOf(after) - ahead.indexOf(before)).toBe(1);
    setLanguage('es');
    expect([roleWord(before), roleWord(after), roleWord(shot)]).toEqual(['antes', 'después', null]);
  });
});
