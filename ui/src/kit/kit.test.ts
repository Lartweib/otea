import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { agentHue } from '../agent-mark.ts';
import { setLanguage } from '../i18n/i18n.ts';
import {
  AGENT_HUE_DEGREES,
  AgentMark,
  Count,
  Dialog,
  MenuItem,
  MenuLabel,
  Pop,
  Seg,
  SeverityBars,
} from './index.ts';

afterEach(() => setLanguage('en'));

const html = (type: unknown, props: object = {}, ...kids: unknown[]) =>
  renderToStaticMarkup(createElement(type as never, props as never, ...(kids as never[])));

describe('the kit', () => {
  it('marks an agent in its hue with its lowercase initials, you as tú, nobody as a dash', () => {
    const mark = html(AgentMark, { name: 'Mender' });
    expect(mark).toBe(
      `<span class="mk" style="--h:${AGENT_HUE_DEGREES[agentHue('Mender')]}" title="Mender">me</span>`,
    );
    setLanguage('es');
    expect(html(AgentMark, { you: true })).toBe('<span class="mk you" title="tú">tú</span>');
    expect(html(AgentMark, { name: null })).toBe(
      '<span class="mk none" aria-hidden="true">—</span>',
    );
  });

  it('draws severity as four rising bars, the top one in warn', () => {
    const bars = html(SeverityBars, { level: 3, label: 'crítica' });
    expect(bars).toBe(
      '<span class="svb s4" role="img" aria-label="crítica" title="crítica"><i class="on"></i><i class="on"></i><i class="on"></i><i class="on"></i></span>',
    );
    expect(html(SeverityBars, { level: 0 })).toContain('<i class="on"></i><i></i><i></i><i></i>');
    expect(html(SeverityBars, { level: null })).toBe('');
  });

  it('switches with a knob, as a radio group', () => {
    const seg = html(Seg, {
      value: 'full',
      label: 'Movimiento',
      well: true,
      onChange: () => undefined,
      options: [
        { value: 'system', label: 'Sistema' },
        { value: 'full', label: 'Completo' },
      ],
    });
    expect(seg).toBe(
      '<div class="seg2 well" role="radiogroup" aria-label="Movimiento"><i class="knob" aria-hidden="true"></i><button type="button" role="radio" aria-checked="false">Sistema</button><button type="button" role="radio" aria-checked="true" class="on">Completo</button></div>',
    );
  });

  it('rolls counts from the value it first showed', () => {
    expect(html(Count, { value: 3, tone: 'you' })).toBe(
      '<span class="n you"><span class="nv" data-v="3">3</span></span>',
    );
    expect(html(Count, { value: '<b>' })).toContain('&lt;b&gt;');
  });

  it('opens a pop with its line, its surface and its items', () => {
    const pop = html(
      Pop,
      { open: true, onClose: () => undefined, label: 'Agrupar', className: 'gmenu' },
      createElement(MenuLabel, null, 'agrupar por'),
      createElement(MenuItem, { on: true, small: '4' } as never, 'paso'),
    );
    expect(pop).toBe(
      '<div class="pop e-top gmenu" role="menu" aria-label="Agrupar"><i class="pline"><i class="glint"></i></i><div class="psurf"><div class="pin"><div class="plabel" data-i=""><span>agrupar por</span></div><button type="button" class="mi on" role="menuitem" data-i=""><span>paso</span><small>4</small></button></div></div></div>',
    );
    expect(html(Pop, { open: false, onClose: () => undefined }, 'x')).toBe('');
  });

  it('opens a dialog over a scrim', () => {
    const dialog = html(
      Dialog,
      { open: true, label: 'Conectar', onClose: () => undefined },
      'hola',
    );
    expect(dialog).toBe(
      '<div class="scrim"></div><div class="pop e-top dialog" role="dialog" aria-modal="true" aria-label="Conectar"><i class="pline"><i class="glint"></i></i><div class="psurf"><div class="pin">hola</div></div></div>',
    );
  });
});
