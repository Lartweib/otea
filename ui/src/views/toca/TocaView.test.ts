import { afterEach, describe, expect, it } from 'vitest';
import { viewKeyOf } from '../../App.tsx';
import { ago, item, NOW } from '../../derive/fixtures.ts';
import { setLanguage } from '../../i18n/i18n.ts';
import { tocaBlocks } from './TocaView.tsx';

afterEach(() => setLanguage('en'));

const app = (all = [item({ id: 'A' }), item({ id: 'B', turn: 'none', updatedAt: ago(5) })]) => ({
  all,
  now: NOW,
  feed: [],
  collectionOf: () => undefined,
  route: { view: 'toca' as const, item: 'A' },
});

describe('the stub Te toca', () => {
  it('lists every section in order, each with its count, an empty line when it has nothing', () => {
    setLanguage('es');
    const blocks = tocaBlocks(app(), false);
    const secs = blocks
      .filter((b) => b.kind === 'sec')
      .map((b) => [b.title, b.kind === 'sec' && b.count]);
    expect(secs).toEqual([
      ['Atasco', 0],
      ['Preguntas para ti', 0],
      ['Revisiones', 1],
      ['Tus propios pasos', 0],
      ['En camino', 0],
      ['Cerrados', 1],
    ]);
    expect(blocks.find((b) => b.key === 'empty:atasco')).toMatchObject({
      content: 'Nada atascado.',
    });
  });

  it('puts each row on its lane, selected when open, closed work on the trunk', () => {
    const rows = tocaBlocks(app(), false).filter((b) => b.kind === 'row');
    expect(
      rows.map((r) => r.kind === 'row' && [r.key, r.lane, r.look, r.sec, !!r.selected]),
    ).toEqual([
      ['A', 'you', 'yours', 'revisiones', true],
      ['B', 'none', 'done', 'cerrados', false],
    ]);
  });

  it('shows only Atasco in Atasco', () => {
    expect(tocaBlocks(app(), true).map((b) => b.key)).toEqual(['sec:atasco', 'empty:atasco']);
  });
});

describe('the view host', () => {
  it('keys a view by what it shows, the pairing dialog over Te toca', () => {
    expect(viewKeyOf({ view: 'toca', item: 'A' })).toBe('toca');
    expect(viewKeyOf({ view: 'lan' })).toBe('toca');
    expect(viewKeyOf({ view: 'board', board: 'Errores' })).toBe('board:Errores');
    expect(viewKeyOf({ view: 'studio', page: { kind: 'start' } })).toBe('studio');
  });
});
