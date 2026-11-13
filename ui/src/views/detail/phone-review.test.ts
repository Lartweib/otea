import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../../i18n/i18n.ts';
import type { Round } from '../../rounds.ts';
import type { Evidence } from '../../types.ts';
import { compareFiles, phoneRounds, roundTagWord, splitEvidence } from './phone-review.ts';

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
});
