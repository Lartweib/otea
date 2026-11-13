import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GroupLabel } from '../components/GroupLabel.tsx';
import { ItemActions } from '../components/ItemActions.tsx';
import { ageLabel, agoLabel, momentLabel } from '../format.ts';
import { leaseLeft } from '../lease.ts';
import { groupByTurn } from '../sections.ts';
import type { Item, Move } from '../types.ts';
import { en } from './en.ts';
import { es } from './es.ts';
import {
  chooseLanguage,
  chooseLanguageSetting,
  language,
  languageChoice,
  listOf,
  type Plural,
  setLanguage,
  t,
  tx,
} from './i18n.ts';

afterEach(() => setLanguage('en'));

const forms = (message: string | Plural) =>
  typeof message === 'string' ? [message] : Object.values(message);
const holes = (message: string | Plural) =>
  [
    ...new Set(
      forms(message)
        .join(' ')
        .match(/\{\w+\}/g) ?? [],
    ),
  ].sort();

describe('the catalogs', () => {
  it('give Spanish every English key and no other', () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
  });

  it('keep each message’s holes and shape, and leave none empty', () => {
    for (const [key, source] of Object.entries(en)) {
      const target = es[key as keyof typeof en];
      expect(holes(target), key).toEqual(holes(source));
      expect(typeof target, key).toBe(typeof source);
      for (const form of forms(target)) expect(form.trim(), key).not.toBe('');
      if (typeof target !== 'string') expect(target.other, key).toBeDefined();
    }
  });

  // Words both languages say alike: names, units, codes, holes alone. Any other Spanish message
  // equal to its English one was left untranslated.
  const SAID_ALIKE = new Set([
    'app.studio',
    'nav.studio',
    'phone.nav',
    'phone.transport.tailscale',
    'catalog.kicker',
    'bs.home.title',
    'bs.editor.kicker.studio',
    'when.hoursMinutes',
    'when.hours',
    'when.minutes',
    'perf.underMinute',
    'toca.axis.from',
    'toca.axis.mid',
    'evidence.seconds',
    'lanes.agents',
    'list.laneAgents',
    'bs.editor.lane.ag',
    'shell.cli',
    'prefs.auto',
    'prefs.english',
    'prefs.spanish',
    'column.id',
    'bulk.stateCount',
    'bulk.whoOne',
    'bulk.blockedOne',
    'bulk.hiddenMoves',
    'bulk.landed',
    'relations.labelled',
    'rounds.closedAs',
    'evidence.alt',
    'sheet.typeBoard',
    'evidence.diff',
    'diagram.version',
    'diagram.v',
    'bs.board.version',
    'brief.markdown',
    'pair.token',
    'catalog.local',
    'bs.kind.audio',
    'bs.kind.log',
    'bs.no',
    'bs.editor.part.no_short',
    'bs.preview.branch.sample',
    'bs.preview.branch.repo',
  ]);

  it('leave no English message untranslated in Spanish', () => {
    const same = Object.keys(en).filter(
      (key) =>
        !SAID_ALIKE.has(key) &&
        JSON.stringify(en[key as keyof typeof en]) === JSON.stringify(es[key as keyof typeof en]),
    );
    expect(same).toEqual([]);
  });

  it('let no Spanish into the English catalog', () => {
    const spanish = Object.entries(en)
      .filter(([key]) => key !== 'prefs.spanish')
      .filter(([, message]) => /[áéíóúñ¿¡«»]/i.test(forms(message).join(' ')))
      .map(([key]) => key);
    expect(spanish).toEqual([]);
  });
});

describe('t', () => {
  it('fills holes and picks the plural form of the language on screen', () => {
    expect(t('list.childOf', { id: 'BUG-1' })).toBe('Child of BUG-1');
    expect(t('common.files', { count: 1 })).toBe('1 file');
    expect(t('common.files', { count: 3 })).toBe('3 files');
    setLanguage('es');
    expect(t('list.childOf', { id: 'BUG-1' })).toBe('Hijo de BUG-1');
    expect(t('common.files', { count: 1 })).toBe('1 archivo');
    expect(t('common.files', { count: 0 })).toBe('0 archivos');
    // Spanish has a `many` category for millions; without its own form, `other` says it.
    expect(t('common.files', { count: 1_000_000 })).toBe('1000000 archivos');
  });

  it('gives back a key it does not know, as a lookup by a computed key expects', () => {
    const lookup = t as (key: string) => string;
    expect(lookup('boardView.dek.bk3j9x2q')).toBe('boardView.dek.bk3j9x2q');
  });

  it('checks keys and params at compile time', () => {
    // Never called: the typecheck is the test.
    const wrong = () => [
      // @ts-expect-error: no such key
      t('app.nothing'),
      // @ts-expect-error: the message needs its id
      t('list.childOf'),
      // @ts-expect-error: a hole the message does not have
      t('list.childOf', { name: 'x' }),
    ];
    expect(wrong).toBeTypeOf('function');
  });

  it('puts elements in a message’s holes for JSX', () => {
    const html = renderToStaticMarkup(
      createElement('p', null, tx('list.empty', { command: createElement('code', null, 'x') })),
    );
    expect(html).toBe('<p>No items yet. Create one with <code>x</code>.</p>');
  });
});

describe('times and lists in Spanish', () => {
  const now = Date.parse('2026-10-31T18:00:00.000Z');
  const ago = (minutes: number) => new Date(now - minutes * 60_000).toISOString();

  it('say ages, leases and moments the Spanish way', () => {
    setLanguage('es');
    expect(ageLabel(ago(0), now)).toBe('ahora');
    expect(ageLabel(ago(12), now)).toBe('12 min');
    expect(ageLabel(ago(30 * 60), now)).toBe('ayer');
    expect(agoLabel(ago(0), now)).toBe('ahora mismo');
    expect(agoLabel(ago(180), now)).toBe('hace 3 h');
    expect(agoLabel(ago(5 * 1440), now)).toBe('hace 5 d');
    const lease = { holder: 'claude', expiresAt: new Date(now + 12 * 60_000).toISOString() };
    expect(leaseLeft(lease, now)).toBe('quedan 12 min');
    expect(leaseLeft({ ...lease, expiresAt: ago(1) }, now)).toBe('vencida');
    expect(momentLabel('2026-10-28T12:31:00.000Z', now, 'UTC')).toBe('28 oct, 12:31');
    expect(momentLabel('2025-01-02T09:05:00.000Z', now, 'UTC')).toBe('2 ene 2025, 09:05');
    expect(listOf(['A', 'B', 'C'])).toBe('A, B y C');
  });
});

describe('chooseLanguage', () => {
  it('takes the address, then the stored choice, then the browser, then English', () => {
    expect(chooseLanguage({ asked: 'es', stored: 'en', preferred: ['en-US'] })).toBe('es');
    expect(chooseLanguage({ asked: 'fr', stored: 'es', preferred: ['en-US'] })).toBe('es');
    expect(chooseLanguage({ stored: 'xx', preferred: ['fr-FR', 'es-AR', 'en'] })).toBe('es');
    expect(chooseLanguage({ preferred: ['en-GB', 'es'] })).toBe('en');
    expect(chooseLanguage({ preferred: ['de'] })).toBe('en');
    expect(chooseLanguage({})).toBe('en');
  });
});

describe('the language in Preferences', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('remembers a language, and auto forgets it and follows the browser', () => {
    const stored = new Map<string, string>();
    const localStorage = {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value),
      removeItem: (key: string) => stored.delete(key),
    };
    vi.stubGlobal('window', { localStorage });
    vi.stubGlobal('navigator', { languages: ['es-AR'] });

    expect(languageChoice()).toBe('auto');
    chooseLanguageSetting('en');
    expect([languageChoice(), language()]).toEqual(['en', 'en']);
    chooseLanguageSetting('auto');
    expect([languageChoice(), language()]).toEqual(['auto', 'es']);
  });
});

describe('a component in Spanish', () => {
  const item = { id: 'BUG-1', turn: 'human', updatedAt: '2026-10-31T00:00:00.000Z' } as Item;

  it('draws its chrome in Spanish and the preset’s words as written', () => {
    setLanguage('es');
    const [waiting] = groupByTurn([item]);
    const group = waiting ? createElement(GroupLabel, { section: waiting, total: 1 }) : null;
    expect(renderToStaticMarkup(group)).toContain('Te esperan');

    const moves: Move[] = [
      { to: 'verify', by: 'human', turn: 'agent' } as Move,
      { to: 'wontfix', by: 'human', turn: 'none', closes: 'discarded' } as Move,
    ];
    const html = renderToStaticMarkup(
      createElement(ItemActions, { id: 'BUG-1', moves, turn: 'human', agent: 'claude' }),
    );
    expect(html).toContain('aria-label="Acciones"');
    expect(html).toContain('cerrar como');
    expect(html).toContain('turno de claude · sale de Te esperan');
    // State names come from the preset and stay as written.
    expect(html).toContain('verify');
    expect(html).toContain('wontfix');
  });
});
