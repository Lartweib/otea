import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../../i18n/i18n.ts';
import { undoneNotice } from './undone.ts';

afterEach(() => setLanguage('en'));

const info = (version: number) => ({ version, publishedAt: '', publishedBy: 'fede' });
const record = (live: number | null, versions: number[]) => ({
  live: live === null ? null : info(live),
  versions: versions.map(info),
});

describe('undoneNotice, after Deshacer put a publish back in the draft', () => {
  it('says the undone version stays in the draft while agents keep the one before', () => {
    setLanguage('es');
    expect(undoneNotice(record(2, [1, 2, 3]), true)).toBe(
      'Deshiciste la publicación de v3: los agentes siguen con v2. Lo que tenía v3 sigue en este borrador, sin publicar: publícalo otra vez o descarta los cambios.',
    );
    setLanguage('en');
    expect(undoneNotice(record(2, [1, 2, 3]), true)).toBe(
      'You undid publishing v3: agents keep v2. What v3 had is still in this draft, unpublished: publish it again or discard the changes.',
    );
  });

  it('says it of an undone first publish too', () => {
    setLanguage('es');
    expect(undoneNotice(record(null, [1]), true)).toBe(
      'Deshiciste la publicación: ningún agente ve este tablero. Lo que tenía sigue en este borrador: publícalo otra vez cuando quieras.',
    );
  });

  it('says nothing when no publish was undone, or the draft no longer holds changes', () => {
    expect(undoneNotice(record(2, [1, 2]), true)).toBeNull();
    expect(undoneNotice(record(null, []), true)).toBeNull();
    expect(undoneNotice(record(2, [1, 2, 3]), false)).toBeNull();
  });
});
