import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../../i18n/i18n.ts';
import { ProofChecklist } from './ProofChecklist.tsx';
import type { ProofChecklistView } from './proof-checklist.ts';

afterEach(() => setLanguage('en'));

const list = (ticked: number): ProofChecklistView => ({
  part: 'checks',
  name: 'Comprobaciones',
  points: ['Arranca', 'Responde', 'Cierra'].map((name, i) => ({
    id: `p${i}`,
    name,
    ticked: i < ticked,
  })),
});

const render = (props: Parameters<typeof ProofChecklist>[0]) =>
  renderToStaticMarkup(createElement(ProofChecklist, props));
const foot = (html: string) => /<p class="([^"]*)">([^<]*)<\/p>/.exec(html);

describe('the footer of a checklist that asks for proof', () => {
  it('shows a checklist the step needs, and still lacks, short, saying how many points are left', () => {
    setLanguage('es');
    const [, cls, text] = foot(render({ list: list(0), short: true })) ?? [];
    expect(cls).toBe('proof-foot short');
    expect(text).toBe('0 de 3 marcados · 0 con prueba · faltan 3 puntos');
  });

  it('says one point left in the singular (UI3-5)', () => {
    setLanguage('es');
    const ticked: ProofChecklistView = {
      ...list(3),
      points: list(3).points.map((p, i) =>
        i < 2 ? { ...p, proof: { kind: 'file', evidence: 1, file: 'a.png' } } : p,
      ),
    };
    expect(foot(render({ list: ticked, short: true }))?.[2]).toBe(
      '3 de 3 marcados · 2 con prueba · falta 1 punto',
    );
    setLanguage('en');
    expect(foot(render({ list: ticked, short: true }))?.[2]).toBe(
      '3 of 3 ticked · 2 with proof · 1 point to go',
    );
  });

  it('never shows an optional checklist as lacking (DR3-10)', () => {
    setLanguage('es');
    const [, cls, text] = foot(render({ list: list(0) })) ?? [];
    expect(cls).toBe('proof-foot');
    expect(text).toBe('0 de 3 marcados · 0 con prueba');
  });

  it('says an optional checklist’s open point is not ticked, not that it is missing', () => {
    setLanguage('es');
    const gaps = (html: string) =>
      [...html.matchAll(/<span class="proof-gap">([^<]*)<\/span>/g)].map(([, text]) => text);
    expect(gaps(render({ list: list(0) }))).toEqual(['sin marcar', 'sin marcar', 'sin marcar']);
    expect(gaps(render({ list: list(0), short: true }))).toEqual(['falta', 'falta', 'falta']);
  });
});

describe('a checklist that does not ask for proof, with a point proved anyway (UI3-6)', () => {
  it('shows the proof without saying the checklist asks for one', () => {
    setLanguage('es');
    expect(render({ list: { ...list(1), asks: false } })).not.toContain('class="gloss"');
    expect(render({ list: list(1) })).toContain('class="gloss"');
  });
});
