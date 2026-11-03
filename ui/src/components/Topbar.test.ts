import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import type { Attention } from '../attention.ts';
import type { Connection } from '../hooks.ts';
import { setLanguage } from '../i18n/i18n.ts';
import { type Agent, pillState } from '../presence.ts';
import { Topbar } from './Topbar.tsx';

afterEach(() => setLanguage('en'));

const attention: Attention = { yours: 0, working: false };
const agent = (name: string, holding: string[] = []): Agent => ({
  name,
  harness: null,
  holding,
  lastSeen: '2026-11-03T10:00:00Z',
  live: true,
});

const render = (
  agents: Agent[] | null,
  o: { connection?: Connection; phone?: boolean; icon?: string | null } = {},
) => {
  const connection = o.connection ?? 'live';
  return renderToStaticMarkup(
    createElement(Topbar, {
      attention,
      project: { id: 'p', name: 'supervisor', ...(o.icon === undefined ? {} : { icon: o.icon }) },
      folded: false,
      phone: o.phone ?? false,
      connection,
      agents,
      pill: pillState(connection, agents),
      items: [],
      collectionOf: () => undefined,
    }),
  );
};

describe('Topbar', () => {
  it('puts the project on the left, the mark in the centre and the agents on the right', () => {
    const html = render([agent('claude-a', ['WORK-1']), agent('codex')]);

    expect(html.indexOf('project-pill')).toBeLessThan(html.indexOf('class="brand"'));
    expect(html.indexOf('class="brand"')).toBeLessThan(html.indexOf('live-pill'));
    expect(html).toContain('2 agents');
  });

  it('draws the project’s monogram when it has no icon, and its icon when it has one', () => {
    expect(render([], { icon: null })).toContain('>Su</span>');
    expect(render([], { icon: 'mountain' })).toContain('class="type-icon"');
  });

  it('shows no agents pill on a server without presence', () => {
    expect(render(null)).not.toContain('live-pill');
  });

  it('says offline, and opens nothing, while the stream is down', () => {
    const html = render([agent('a')], { connection: 'reconnecting' });

    expect(html).toContain('offline');
    expect(html).toContain('disabled');
  });

  it('says so quietly when nobody is connected', () => {
    expect(render([])).toContain('no agents');
  });

  it('on a phone, leaves the mark to the panel and counts the agents by number', () => {
    const html = render([agent('a'), agent('b'), agent('c')], { phone: true });

    expect(html).not.toContain('class="brand"');
    expect(html).toContain('<span class="live-text">3</span>');
  });

  it('speaks Spanish', () => {
    setLanguage('es');

    expect(render([agent('a')])).toContain('1 agente');
  });
});
