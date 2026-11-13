import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { ago, inMinutes, item, NOW } from '../derive/fixtures.ts';
import { setLanguage } from '../i18n/i18n.ts';
import type { Agent } from '../presence.ts';
import type { ProjectOverview } from '../types.ts';
import { AgentsMenuBody, ProjectMenuBody, Topbar } from './Topbar.tsx';
import { renderIn, testApp } from './test-app.ts';
import { agentCounts, agentRows, projectRows } from './topbar-model.ts';

afterEach(() => setLanguage('en'));

const agent = (name: string, o: Partial<Agent> = {}): Agent => ({
  name,
  harness: null,
  holding: [],
  lastSeen: ago(1),
  live: true,
  ...o,
});
const overview = (o: Partial<ProjectOverview> & { id: string }): ProjectOverview => ({
  name: o.id,
  storage: 'common',
  current: false,
  paths: [{ path: `/repos/${o.id}`, missing: false }] as ProjectOverview['paths'],
  waiting: [],
  withAgents: 0,
  open: 0,
  ...o,
});
const waiting = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `W-${i}` })) as unknown as ProjectOverview['waiting'];

const topbar = (o: Parameters<typeof testApp>[0] = {}) =>
  renderIn(testApp(o), createElement(Topbar));

describe('the topbar', () => {
  it('has no panel button: on the phone the sheet opens from the bottom', () => {
    expect(topbar()).not.toContain('navbtn');
  });

  it('puts the project on the left, the mark in the centre and the agents on the right', () => {
    const html = topbar({ agents: [agent('Scout'), agent('Quill')] });
    expect(html.indexOf('class="pill"')).toBeLessThan(html.indexOf('brand'));
    expect(html.indexOf('brand')).toBeLessThan(html.indexOf('class="apill"'));
  });

  it('names the project on its pill, with its monogram on the tile', () => {
    setLanguage('es');
    const html = topbar();
    expect(html).toContain('aria-label="Hollowmere, cambiar de proyecto"');
    expect(html).toContain('<span class="tile" aria-hidden="true">Ho</span>');
    expect(html).toContain('<span class="nm">Hollowmere</span>');
  });

  it('says what waits in other projects, only when something does', () => {
    setLanguage('es');
    const projects = [
      overview({ id: 'hm', current: true }),
      overview({ id: 'a', waiting: waiting(2) }),
      overview({ id: 'b', waiting: waiting(1) }),
    ];
    expect(topbar({ projects })).toContain('3 más te esperan en 2 proyectos');
    expect(topbar({ projects: [overview({ id: 'hm', current: true })] })).not.toContain(
      'elsewhere',
    );
  });

  it('fills the mark’s o while something is yours, and turns its orbit while an agent works', () => {
    const quiet = topbar({ all: [item({ id: 'A', turn: 'agent' })] });
    expect(quiet).toContain('class="brand"');
    const busy = topbar({
      all: [
        item({ id: 'A', turn: 'human' }),
        item({ id: 'B', turn: 'agent', lease: { holder: 'Scout', expiresAt: inMinutes(20) } }),
      ],
    });
    expect(busy).toContain('class="brand yours working"');
  });

  it('counts the agents connected and those working', () => {
    setLanguage('es');
    const html = topbar({
      agents: [agent('Scout', { holding: ['X'] }), agent('Quill'), agent('Old', { live: false })],
    });
    expect(html).toMatch(/data-v="2">2<\/span><\/span><span class="wl"> agentes<\/span>/);
    expect(html).toMatch(/data-v="1">1<\/span><\/span> trabajando/);
    expect(html).toContain('class="orb"');
  });

  it('quiets and disables the agents pill while the stream is down', () => {
    setLanguage('es');
    const html = topbar({ connection: 'reconnecting', agents: [agent('Scout')] });
    expect(html).toContain('sin conexión');
    expect(html).toMatch(/class="apill"[^>]*disabled=""/);
  });

  it('has no agents pill on a server without presence', () => {
    expect(topbar({ agents: null })).not.toContain('apill');
  });
});

describe('the project menu', () => {
  const projects = [
    overview({ id: 'hm', name: 'Hollowmere', current: true }),
    overview({
      id: 'mirefall',
      name: 'Mirefall',
      served: 'http://127.0.0.1:4700',
      waiting: waiting(2),
    }),
    overview({ id: 'quiet', name: 'Quiet' }),
  ];
  const menu = () => {
    setLanguage('es');
    const app = testApp({ projects });
    const { rows, total } = projectRows(
      app.project ?? { id: '', name: '', icon: null },
      projects,
      3,
    );
    return renderIn(
      app,
      createElement(ProjectMenuBody, {
        project: 'Hollowmere',
        rows,
        total,
        onClose: () => undefined,
      }),
    );
  };

  it('leads with Todos los proyectos and the total waiting', () => {
    const html = menu();
    expect(html).toContain('Todos los proyectos');
    expect(html).toContain('lo que te espera, en todos lados');
    expect(html).toMatch(/<span class="pw"><i class="dot"><\/i>5<\/span>/);
  });

  it('labels the projects with their count', () => {
    expect(menu()).toContain(
      '<div class="plabel" data-i=""><span>proyectos</span><span>3</span></div>',
    );
  });

  it('ticks the project open now, opens a served one in a new tab, keeps an unserved one inert', () => {
    const html = menu();
    expect(html).toMatch(/class="prow cur"[^>]*aria-current="page"/);
    expect(html).toContain('abierto ahora');
    expect(html).toContain('class="tick"');
    expect(html).toMatch(
      /<a class="prow" data-i="" href="http:\/\/127.0.0.1:4700\/" target="_blank"/,
    );
    expect(html).toMatch(/class="prow inert" data-i="" aria-disabled="true"/);
    expect(html).toContain('sin servidor · otea serve allí lo abre');
  });

  it('ends with the project’s settings and how to start another', () => {
    const html = menu();
    expect(html).toContain('configuración de Hollowmere');
    expect(html).toContain('proyecto nuevo: <code>otea init</code> en un repo');
  });
});

describe('the agents menu', () => {
  const items = [
    item({
      id: 'ERR-231',
      title: 'Huecos en la colisión',
      turn: 'agent',
      lease: { holder: 'Scout', expiresAt: inMinutes(30) },
    }),
    item({
      id: 'CRE-44',
      title: 'Tortuga musgosa',
      turn: 'agent',
      expiredLease: { holder: 'Kiln', expiresAt: ago(12) },
    }),
  ];
  const agents = [
    agent('Scout', { harness: 'Claude Code', holding: ['ERR-231'] }),
    agent('Quill'),
    agent('Kiln', { harness: 'cli', live: false, lastSeen: ago(12) }),
  ];
  const menu = () => {
    setLanguage('es');
    return renderIn(
      testApp(),
      createElement(AgentsMenuBody, {
        project: 'Hollowmere',
        rows: agentRows(agents, items, NOW),
        counts: agentCounts(agentRows(agents, items, NOW)),
        now: NOW,
        onOpen: () => undefined,
        onActivity: () => undefined,
        onConnect: () => undefined,
      }),
    );
  };

  it('heads with the project and who holds a lease, counting every agent it lists', () => {
    expect(menu()).toContain(
      '<div class="plabel" data-i=""><span>agentes en Hollowmere</span><span>1 con reserva · 2 inactivos</span></div>',
    );
  });

  it('shows each agent with its harness, what it holds as a mini node, or that it is idle', () => {
    const html = menu();
    expect(html).toContain('<span class="htag">Claude Code</span>');
    expect(html).toMatch(/class="held"[^>]*><svg class="cn"/);
    expect(html).toContain(
      '<span class="id">ERR-231</span><span class="tx">Huecos en la colisión</span>',
    );
    expect(html).toContain('inactivo · sin reserva');
  });

  it('warns of an agent gone quiet on its expired lease', () => {
    const html = menu();
    expect(html).toContain('<span class="htag">CLI</span>');
    expect(html).toContain('<div class="idle warn">callado · su reserva venció</div>');
  });

  it('offers the activity and how to connect another, then says what connected means', () => {
    const html = menu();
    expect(html).toContain(
      '<b>Ver actividad</b><small>reservas en curso, los últimos eventos</small>',
    );
    expect(html).toContain('<b>Conectar un agente</b><small>otea mcp --as &lt;nombre&gt;</small>');
    expect(html).toContain('conectado: tiene una reserva, o tuvo actividad en los últimos 5 min');
  });
});
