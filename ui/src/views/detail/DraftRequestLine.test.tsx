import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../../i18n/i18n.ts';
import { DraftRequestLine } from './BoardSections.tsx';
import type { DraftRequest } from './board-item.ts';

afterEach(() => setLanguage('en'));

const request: DraftRequest = {
  board: 'bsdx1fzo',
  name: 'Lanzamientos',
  arrived: false,
  instructions: 'How to hand it in: start from the draft with otea board draft PED-1 > board.json,',
};

const render = (shown = request, canConfigure = true) =>
  renderToStaticMarkup(<DraftRequestLine request={shown} canConfigure={canConfigure} />);

describe('the board a Pedido drafts', () => {
  it('names the board, says it waits, and links to its draft in Studio', () => {
    setLanguage('es');
    const html = render();

    expect(html).toContain('Lanzamientos');
    expect(html).toContain('espera el esbozo');
    expect(html).toContain('href="#/studio/board/bsdx1fzo"');
    expect(html).toContain('Abrir el borrador en Studio');
  });

  it('says the draft arrived once the agent handed it in', () => {
    const html = render({ ...request, arrived: true });

    expect(html).toContain('the draft arrived');
  });

  it('keeps the hand-in apart, as the step instructions the agent reads, folded', () => {
    const html = render();

    expect(html).toMatch(/<details[^>]*class="bi-instr"/);
    expect(html).not.toMatch(/<details[^>]* open/);
    expect(html).toContain('Step instructions');
    expect(html).toContain('otea board draft PED-1 &gt; board.json');
  });

  it('once the board is published, says so and links to it, with no hand-in left', () => {
    setLanguage('es');
    const html = render({ ...request, arrived: true, published: true, instructions: '' });

    expect(html).toContain('Publicó el tablero');
    expect(html).toContain('Lanzamientos');
    expect(html).toContain('href="#/studio/board/bsdx1fzo"');
    expect(html).toContain('Abrir en Studio');
    expect(html).not.toContain('esbozo');
    expect(html).not.toContain('bi-instr');
  });

  it('says it in English too', () => {
    const html = render({ ...request, arrived: true, published: true, instructions: '' });

    expect(html).toContain('Published the board');
    expect(html).toContain('Open in Studio');
  });

  it('offers no link where Studio is not open to this browser', () => {
    expect(render(request, false)).not.toContain('href=');
  });
});
