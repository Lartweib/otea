import { createElement, Fragment, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { ago, item, NOW, officialType } from '../../derive/fixtures.ts';
import { setLanguage } from '../../i18n/i18n.ts';
import type { ItemEvent, ItemView } from '../../types.ts';
import { detailCells } from './Details.tsx';
import { factsOf } from './facts.ts';
import { historyOf } from './history.ts';

// The profile on every action (agents mock §5): each agent event names the profile it was written
// with; "Quién lo hace" names the one the doer acted with.

afterEach(() => setLanguage('en'));

const bug = officialType('bug-triage');
const opus = { harness: 'claude-code', model: 'opus', effort: 'high', family: 'opus' };
const gpt = { harness: 'codex', model: 'gpt-5.5', effort: 'high', family: 'gpt-5' };
const markup = (n: ReactNode) => renderToStaticMarkup(createElement(Fragment, null, n));

const events: ItemEvent[] = [
  {
    id: 1,
    type: 'created',
    actor: { kind: 'human', name: 'fede' },
    at: ago(90),
    data: { state: 'reported' },
  },
  {
    id: 2,
    type: 'claimed',
    actor: { kind: 'agent', name: 'codex-b' },
    at: ago(80),
    data: {},
    profile: gpt,
  },
  {
    id: 3,
    type: 'transitioned',
    actor: { kind: 'agent', name: 'claude-d' },
    at: ago(10),
    data: { from: 'fixing', to: 'verify' },
    profile: opus,
  },
  {
    id: 4,
    type: 'transitioned',
    actor: { kind: 'agent', name: 'claude-d' },
    at: ago(5),
    data: { from: 'verify', to: 'fixed', via: 'claude-d', quote: 'ok' },
    profile: opus,
  },
];

describe('the profile in the history', () => {
  it('keeps the profile of each agent event, never on yours or on a decision relayed for you', () => {
    const lines = historyOf(events, bug, (s) => s, NOW);
    expect(lines.map((l) => [l.who, l.profile?.model ?? null])).toEqual([
      ['you', null],
      ['claude-d', 'opus'],
      ['codex-b', 'gpt-5.5'],
      ['you', null],
    ]);
  });
});

describe('Quién lo hace', () => {
  it('names the doer with the profile it acted with', () => {
    setLanguage('es');
    const view = {
      ...item({ id: 'ERR-1', turn: 'human', state: 'verify' }),
      events: events.slice(0, 3),
      transitions: [],
      relayable: [],
      missing: [],
      evidence: [],
      relations: [],
    } as unknown as ItemView;
    const facts = factsOf(view, bug, NOW);
    const [doer] = detailCells({ item: view, type: bug, facts, own: false, now: NOW });
    expect(markup(doer?.value)).toContain('claude-d<small class="prof">opus <i>·</i> high</small>');
  });
});
