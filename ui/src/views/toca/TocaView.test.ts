import { createElement, Fragment, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { viewKeyOf } from '../../App.tsx';
import type { FeedEvent } from '../../activity.ts';
import {
  agent,
  ago,
  inMinutes,
  item,
  moved,
  NOW,
  officialType,
  you,
} from '../../derive/fixtures.ts';
import { setLanguage } from '../../i18n/i18n.ts';
import type { LaneBlock } from '../../lanes/LaneList.tsx';
import type { Item } from '../../types.ts';
import { roundOf, rowCall, tocaBlocks } from './TocaView.tsx';

afterEach(() => setLanguage('en'));

const bug = officialType('bug-triage');
const collectionOf = () => ({
  name: 'Errores',
  prefix: 'ERR',
  preset: 'bug-triage',
  types: [{ ...bug, name: 'item' }],
  view: { kind: 'list' as const, groupBy: 'state', columns: [] },
  icon: null,
});

const app = (
  all: Item[] = [
    item({ id: 'A' }),
    item({ id: 'B', turn: 'none', state: 'fixed', updatedAt: ago(5) }),
  ],
  feed: FeedEvent[] = [],
) => ({ all, now: NOW, feed, collectionOf, route: { view: 'toca' as const, item: 'A' } });

const markup = (n: ReactNode) => renderToStaticMarkup(createElement(Fragment, null, n));
const rows = (blocks: LaneBlock[]) => blocks.filter((b) => b.kind === 'row');
const html = (b: LaneBlock | undefined) => (b && b.kind === 'row' ? markup(b.content) : '');

describe('Te toca', () => {
  it('lists every section in order, each with its count, an empty line when it has nothing', () => {
    setLanguage('es');
    const blocks = tocaBlocks(app(), false);
    const secs = blocks
      .filter((b) => b.kind === 'sec')
      .map((b) => [b.title, b.kind === 'sec' && b.count, b.kind === 'sec' && b.gloss]);
    expect(secs).toEqual([
      ['Atasco', 0, undefined],
      ['Preguntas para ti', 0, undefined],
      ['Revisiones', 1, undefined],
      ['Tus propios pasos', 0, undefined],
      ['En camino', 0, 'vuelven a ti cuando terminen'],
      ['Cerrados', 1, 'hechos y descartados'],
    ]);
    expect(blocks.find((b) => b.key === 'empty:atasco')).toMatchObject({
      content: 'Nada atascado.',
    });
  });

  it('puts each row on its lane, selected when open, closed work on the trunk', () => {
    expect(
      rows(tocaBlocks(app(), false)).map(
        (r) => r.kind === 'row' && [r.key, r.lane, r.look, r.sec, !!r.selected],
      ),
    ).toEqual([
      ['A', 'you', 'yours', 'revisiones', true],
      ['B', 'none', 'done', 'cerrados', false],
    ]);
  });

  it('shows only Atasco in Atasco', () => {
    expect(tocaBlocks(app(), true).map((b) => b.key)).toEqual(['sec:atasco', 'empty:atasco']);
  });

  it('sorts the oldest waiting first, Cerrados newest first, at most twelve of the last week', () => {
    const closed = Array.from({ length: 14 }, (_, i) =>
      item({ id: `C${i}`, turn: 'none', state: 'fixed', updatedAt: ago(10 + i) }),
    );
    const all = [
      item({ id: 'new', updatedAt: ago(5) }),
      item({ id: 'old', updatedAt: ago(90) }),
      item({ id: 'week', turn: 'none', state: 'fixed', updatedAt: ago(60 * 24 * 8) }),
      ...closed,
    ];
    const keys = rows(tocaBlocks(app(all), false)).map((r) => r.key);
    expect(keys.slice(0, 2)).toEqual(['old', 'new']);
    expect(keys.slice(2)).toEqual(closed.slice(0, 12).map((c) => c.id));
  });

  it('offers Triaje on Revisiones when it holds more than one', () => {
    const two = app([item({ id: 'A' }), item({ id: 'B' })]);
    const sec = tocaBlocks(two, false).find((b) => b.key === 'sec:revisiones');
    expect(sec && sec.kind === 'sec' && markup(sec.action)).toContain('class="sact"');
    const one = tocaBlocks(app(), false).find((b) => b.key === 'sec:revisiones');
    expect(one && one.kind === 'sec' && one.action).toBeFalsy();
  });

  it('draws a row: title, id and where it is, the call to act and its small line, the age', () => {
    setLanguage('es');
    const feed = [moved('A', 'verify', agent('Mender'), { reason: 'Reforcé los anclajes.' })];
    const out = html(
      rows(tocaBlocks(app([item({ id: 'A', title: 'El puente' })], feed), false))[0],
    );
    expect(out).toContain('<span class="tt" data-s="A:t">El puente</span>');
    expect(out).toContain('data-title=""');
    expect(out).toContain(
      '<span class="id" data-s="A:id">A</span><span class="bd">Errores › A verificar</span>',
    );
    expect(out).toContain(
      '<div class="a" data-leaf="">Revisar<small>entrega <b>Mender</b></small></div>',
    );
    expect(out).toContain('<div class="age" data-leaf="" data-s="A:when">30 min</div>');
  });

  it('says who went quiet on a stuck row, in warn, and its lease expired', () => {
    setLanguage('es');
    const stuck = item({
      id: 'S',
      turn: 'agent',
      state: 'fixing',
      expiredLease: { holder: 'Kiln', expiresAt: ago(12) },
    });
    const out = html(rows(tocaBlocks(app([stuck]), true))[0]);
    expect(out).toContain('<span class="warn">Kiln callado · 12 min</span>');
    expect(out).toContain(
      '<div class="a warn" data-leaf="">Retomar o reasignar<small>lo tiene <b>Kiln</b></small></div>',
    );
    expect(out).toContain('class="age warn"');
  });
});

describe('a row’s call to act', () => {
  const ctx = (feed: FeedEvent[] = []) => ({ now: NOW, feed, types: () => bug });
  it('reads it from the section and who has the item', () => {
    setLanguage('es');
    const q = item({ id: 'Q', state: 'reported' });
    const qFeed = [moved('Q', 'reported', agent('Scout'), { reason: '¿La 0.9?' })];
    expect(rowCall(q, 'preguntas', ctx(qFeed))).toEqual({
      act: 'Responder',
      sub: { key: 'toca.sub.asks', agent: 'Scout' },
    });
    const own = item({ id: 'O', state: 'reported', createdBy: you });
    expect(rowCall(own, 'propios', ctx()).sub).toEqual({ key: 'toca.sub.thenAgent' });
    const working = item({
      id: 'W',
      turn: 'agent',
      state: 'fixing',
      lease: { holder: 'Mender', expiresAt: inMinutes(40) },
    });
    expect(rowCall(working, 'encamino', ctx())).toEqual({
      act: 'Vuelve a tu revisión',
      sub: { key: 'toca.sub.does', agent: 'Mender' },
    });
    const queued = item({ id: 'U', turn: 'agent', state: 'accepted' });
    expect(rowCall(queued, 'encamino', ctx()).sub).toEqual({ key: 'toca.sub.waitsAgent' });
    const done = item({ id: 'D', turn: 'none', state: 'fixed', closes: 'done' });
    const dFeed = [moved('D', 'verify', agent('Kiln'), { minutes: 40 })];
    expect(rowCall(done, 'cerrados', ctx(dFeed))).toEqual({
      act: 'Hecho',
      sub: { key: 'toca.sub.didIt', agent: 'Kiln' },
    });
    const dropped = item({ id: 'R', turn: 'none', state: 'rejected', closes: 'discarded' });
    const rFeed = [moved('R', 'rejected', you, { reason: 'No.' })];
    expect(rowCall(dropped, 'cerrados', ctx(rFeed))).toEqual({
      act: 'Descartado',
      sub: { key: 'toca.sub.closedByYou' },
    });
  });

  it('counts the rounds an item has been through', () => {
    const feed = [
      moved('A', 'verify', agent('Mender'), { minutes: 50 }),
      moved('A', 'fixing', you, { minutes: 40, from: 'verify', reason: 'Falta.' }),
      moved('A', 'verify', agent('Mender'), { minutes: 30 }),
    ];
    expect(roundOf(item({ id: 'A' }), feed, bug)).toBe(2);
    expect(roundOf(item({ id: 'A', turn: 'agent', state: 'fixing' }), feed.slice(0, 2), bug)).toBe(
      2,
    );
    expect(roundOf(item({ id: 'A' }), [], bug)).toBe(0);
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
