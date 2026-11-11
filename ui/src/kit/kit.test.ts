import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { agentHue } from '../agent-mark.ts';
import { setLanguage } from '../i18n/i18n.ts';
import {
  AGENT_HUE_DEGREES,
  AgentMark,
  Button,
  Checkbox,
  Chevron,
  ChipButton,
  Count,
  Dialog,
  EnumChip,
  GhostButton,
  Icon,
  IconButton,
  MenuItem,
  MenuLabel,
  Pop,
  Seg,
  SeverityBars,
  StepPill,
  Swap,
  Tile,
} from './index.ts';

afterEach(() => setLanguage('en'));

const html = (type: unknown, props: object = {}, ...kids: unknown[]) =>
  renderToStaticMarkup(createElement(type as never, props as never, ...(kids as never[])));

describe('the kit', () => {
  it('draws the mock’s buttons', () => {
    expect(html(Button, { variant: 'primary' }, 'Aprobar')).toBe(
      '<button type="button" class="btn primary">Aprobar</button>',
    );
    expect(html(Button, {}, 'Cancelar')).toBe(
      '<button type="button" class="btn quiet">Cancelar</button>',
    );
    expect(html(Button, { variant: 'default', size: 'sm' }, 'x')).toContain('class="btn quiet sm"');
    expect(html(Button, { variant: 'text' }, 'quitar')).toContain('class="btn text"');
    expect(html(GhostButton, {}, 'Ampliar')).toContain('class="ghost-btn"');
    expect(html(IconButton, { 'aria-label': 'Nuevo ítem' })).toContain('class="ibtn"');
    expect(html(ChipButton, { on: true }, 'Errores')).toContain(
      'class="chipb on" aria-pressed="true"',
    );
  });

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

  it('draws pills, enums, tiles, the checkbox and the chevron', () => {
    expect(html(StepPill, { tone: 'you' }, 'Comprobado')).toBe(
      '<span class="stp-pill you">Comprobado</span>',
    );
    expect(html(EnumChip, {}, 'visual')).toBe('<span class="enum">visual</span>');
    expect(html(Tile, { large: true }, 'Hm')).toBe(
      '<span class="tile lg" aria-hidden="true">Hm</span>',
    );
    expect(html(Checkbox, { checked: true, readOnly: true })).toContain('class="ck"');
    expect(html(Chevron)).toContain('<svg class="chev" viewBox="0 0 12 12"');
  });

  it('draws the mock’s icons on svg.ic', () => {
    expect(html(Icon, { name: 'toca' })).toMatch(
      /^<svg class="ic icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 9.5h3l1 2h3l1-2h3"\/>/,
    );
    expect(html(Icon, { name: 'close' })).toContain('<path d="M4.75 4.75');
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

  it('swaps words inside an inner span React owns', () => {
    expect(html(Swap, { k: 1, as: 'p', className: 'dek' }, 'Nada espera por ti.')).toBe(
      '<p class="dek" style="position:relative"><span class="swin" style="display:block">Nada espera por ti.</span></p>',
    );
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
