import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../i18n/i18n.ts';
import { LaneHead } from './LaneHead.tsx';
import { blocksSignature, type LaneBlock, LaneList } from './LaneList.tsx';
import { NodeGlyph } from './NodeGlyph.tsx';

afterEach(() => setLanguage('en'));

const blocks: LaneBlock[] = [
  { kind: 'sec', key: 'sec:revisiones', title: 'Revisiones', count: 2, gloss: 'para ti' },
  {
    kind: 'row',
    key: 'ERR-214',
    lane: 'you',
    look: 'yours',
    sec: 'revisiones',
    selected: true,
    content: createElement('div', { className: 'main-c' }, 'El puente'),
  },
  {
    kind: 'row',
    key: 'ERR-9',
    lane: 'none',
    look: 'dropped',
    sec: 'cerrados',
    child: true,
    inert: true,
    content: 'Viejo',
  },
  { kind: 'empty', key: 'empty:atasco', content: 'Nada atascado.' },
  { kind: 'other', key: 'x', className: 'note', content: 'otro' },
];

const render = (props: Partial<Parameters<typeof LaneList>[0]> = {}) =>
  renderToStaticMarkup(createElement(LaneList, { list: 'toca', blocks, sink: true, ...props }));

describe('a list on the lanes', () => {
  it('draws the lines, the light, the branches and the effects in that order', () => {
    const html = render();
    const order = ['class="lines"', 'class="glow"', 'class="branch"', 'class="fx"'].map((g) =>
      html.indexOf(g),
    );
    expect(order.every((at) => at > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).toMatch(/^<div class="lanes" data-list="toca" data-sink="1"><svg class="ink"/);
  });

  it('keys every row and gives it its lane, look and section', () => {
    const html = render();
    expect(html).toContain(
      '<div class="row sel" data-k="ERR-214" data-h="you" data-look="yours" data-sec="revisiones" role="button" tabindex="0" aria-current="true" style="--x:40.5px">',
    );
    expect(html).toContain('class="row closed dropped child inert" data-k="ERR-9" data-h="none"');
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain(
      '<div class="lift"><div class="band" data-leaf=""></div><svg class="nd"',
    );
    expect(html).toContain('data-s="ERR-214:node"');
  });

  it('heads a section with its name, its count, its gloss and a hairline', () => {
    expect(render()).toContain(
      '<div class="sec" data-k="sec:revisiones"><h2 data-leaf="">Revisiones</h2><span class="n" data-leaf=""><span class="nv" data-v="2">2</span></span><span class="gloss" data-leaf="">para ti</span><i class="rl" data-leaf=""></i></div>',
    );
  });

  it('says an empty section in its own line, big when the whole list is empty', () => {
    expect(render()).toContain(
      '<div class="empty" data-k="empty:atasco" data-leaf="">Nada atascado.</div>',
    );
    const big = render({ blocks: [{ kind: 'empty', key: 'e', content: 'Nada', big: true }] });
    expect(big).toContain('class="empty empty-big"');
  });

  it('runs the handoff when a row changes lane, look or section, or a count changes', () => {
    const moved = blocks.map((b) =>
      b.kind === 'row' && b.key === 'ERR-214' ? { ...b, lane: 'ag' as const } : b,
    );
    expect(blocksSignature(moved)).not.toBe(blocksSignature(blocks));
    const recounted = blocks.map((b) => (b.kind === 'sec' ? { ...b, count: 3 } : b));
    expect(blocksSignature(recounted)).not.toBe(blocksSignature(blocks));
    const retitled = blocks.map((b) => (b.kind === 'row' ? { ...b, content: 'otro' } : b));
    expect(blocksSignature(retitled)).toBe(blocksSignature(blocks));
  });
});

describe('the lane names and the nodes', () => {
  it('names the lanes in the language on screen', () => {
    expect(renderToStaticMarkup(createElement(LaneHead))).toBe(
      '<div class="lane-head" aria-hidden="true" data-leaf="" data-enter="fade"><span class="ag">ag</span><span class="you">you</span></div>',
    );
    setLanguage('es');
    expect(renderToStaticMarkup(createElement(LaneHead))).toContain('<span class="you">tú</span>');
  });

  it('puts a row node on its knockout, and a mini node on the sheet without one', () => {
    const row = renderToStaticMarkup(createElement(NodeGlyph, { look: 'working' }));
    expect(row).toMatch(/^<svg class="nd" width="24" height="24" viewBox="-12 -12 24 24"/);
    expect(row).toContain('<circle class="ko" r="6"/>');
    const mini = renderToStaticMarkup(createElement(NodeGlyph, { look: 'working', size: 14 }));
    expect(mini).toMatch(/^<svg class="cn" width="14"/);
    expect(mini).not.toContain('class="ko"');
    expect(mini).toContain('var(--sheet)');
  });
});
