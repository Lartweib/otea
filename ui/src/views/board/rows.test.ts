import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { ago, item, NOW, officialType } from '../../derive/fixtures.ts';
import { setLanguage } from '../../i18n/i18n.ts';
import type { CollectionView, Item } from '../../types.ts';
import { FoldButton, listaBlocks, type RowCtx } from './rows.tsx';

afterEach(() => setLanguage('en'));

const fold = (open: boolean) =>
  renderToStaticMarkup(
    createElement(FoldButton, { item: item({ id: 'TAR-1' }), n: 2, open, onFold: () => {} }),
  );
const said = (html: string) => html.replace(/<[^>]+>/g, '').trim();

describe('the fold on a parent row', () => {
  it('says how many are inside, with no sign that reads as a subtraction', () => {
    setLanguage('es');
    expect(said(fold(true))).toBe('2 dentro');
    expect(said(fold(false))).toBe('2 dentro');
    setLanguage('en');
    expect(said(fold(true))).toBe('2 inside');
  });

  it('shows open or folded by its chevron and aria-expanded', () => {
    expect(fold(true)).toContain('aria-expanded="true"');
    expect(fold(false)).toContain('aria-expanded="false"');
    expect(fold(true)).toContain('class="fg"');
  });
});

// P7-R3-1: a row the only agent had set aside read «nadie está escuchando», as if one would come.
describe('a row an agent set aside for later', () => {
  const errores = {
    name: 'Errores',
    prefix: 'ERR',
    preset: 'bug-triage',
    types: [{ ...officialType('bug-triage'), name: 'item' }],
  } as unknown as CollectionView;
  const idle = { name: 'claude-haiku', harness: null, holding: [], lastSeen: ago(30), live: true };
  const ctx: RowCtx = {
    collection: errores,
    now: NOW,
    feed: [],
    selected: undefined,
    ticked: new Set(),
    open: () => true,
    onFold: () => undefined,
    onTick: () => undefined,
    agents: [{ ...idle, waiting: false }],
    busy: [],
  };
  const row = (it: Item) => {
    const entry = {
      kind: 'row',
      item: it,
      sec: 's',
      child: false,
      kids: 0,
      folded: false,
    } as const;
    const [block] = listaBlocks([{ ...entry, hidden: false }], ctx);
    return block?.kind === 'row'
      ? renderToStaticMarkup(createElement(Fragment, null, block.content))
      : '';
  };
  const queued = item({ id: 'ERR-1', turn: 'agent', state: 'fixing' });

  it('says calmly who set it aside, where nobody listening would show', () => {
    setLanguage('es');
    expect(row(queued)).toContain('data-unheard');
    const aside = row({ ...queued, setAside: { by: 'claude-haiku', at: ago(5) } });
    expect(aside).toContain(
      '<span class="mpt" data-aside=""><span class="sep">·</span><span class="calm">apartado por claude-haiku</span></span>',
    );
    expect(aside).not.toContain('data-unheard');
    setLanguage('en');
    expect(row({ ...queued, setAside: { by: 'kiln', at: ago(5) } })).toContain('set aside by kiln');
  });
});
