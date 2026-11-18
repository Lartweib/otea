import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import type { BoardDefinition } from '../../../../src/core/board/model.ts';
import { creatures } from '../../../../src/core/board/testing.ts';
import { setLanguage } from '../../i18n/i18n.ts';
import type { Item } from '../../types.ts';
import { PhoneMatrix } from './Matrix.tsx';

afterEach(() => setLanguage('en'));

function weighed(): BoardDefinition {
  const def = creatures();
  def.parts.feffort = {
    id: 'feffort',
    name: 'Esfuerzo',
    kind: 'choice',
    hint: '',
    options: [
      { id: 'cs', name: 'S' },
      { id: 'cm', name: 'M' },
      { id: 'cl', name: 'L' },
    ],
  };
  def.parts.frisk = { id: 'frisk', name: 'Riesgo', kind: 'level', hint: '', options: [] };
  def.analysis = { effort: 'feffort', risk: 'frisk' };
  return def;
}

const item = (id: string, fields: Record<string, string>): Item =>
  ({ id, title: id, fields }) as Item;

const render = () =>
  renderToStaticMarkup(
    <PhoneMatrix
      def={weighed()}
      items={[item('A', { feffort: 'cl', frisk: 'critical' })]}
      ticked={[]}
      onTick={() => undefined}
      onOpen={() => undefined}
      onPin={() => undefined}
      onOrder={() => undefined}
    />,
  );

// IDEA2-5: the phone's grid of counts named neither axis, and a zone «ALTA · CRÍTICA» did not say
// which value was which.
describe('the Matrix on the phone', () => {
  it('names both axes on the grid: each column’s value under it, each row’s value beside it', () => {
    setLanguage('es');
    const html = render();
    const xs = [...html.matchAll(/class="pmx-x"[^>]*>([^<]*)</g)].map((m) => m[1]);
    const ys = [...html.matchAll(/class="pmx-y"[^>]*>([^<]*)</g)].map((m) => m[1]);
    expect(xs).toEqual(['S', 'M', 'L']);
    // The top row is the highest risk.
    expect(ys).toEqual(['Crítica', 'Alta', 'Media', 'Baja']);
    expect(html).toMatch(/class="pmx-axis x"[^>]*>Esfuerzo →</);
    expect(html).toMatch(/class="pmx-axis y"[^>]*>↑ Riesgo</);
  });

  // The order the person fixed was invisible on the phone (IDEA2-5): it is listed, numbered.
  it('lists the order you fixed, in that order', () => {
    setLanguage('es');
    const html = renderToStaticMarkup(
      <PhoneMatrix
        def={weighed()}
        items={[
          { ...item('A', { feffort: 'cl', frisk: 'critical' }), priority: { rank: 2 } },
          { ...item('B', { feffort: 'cm', frisk: 'low' }), priority: { rank: 1 } },
          item('C', { feffort: 'cs', frisk: 'low' }),
        ]}
        ticked={[]}
        onTick={() => undefined}
        onOpen={() => undefined}
        onPin={() => undefined}
        onOrder={() => undefined}
      />,
    );
    expect(html).toMatch(/<span>Tu orden<\/span> <b>2<\/b>/);
    const order = html.slice(html.indexOf('class="mx-order"'));
    expect([...order.matchAll(/class="mx-oid"[^>]*>([^<]*)</g)].map((m) => m[1])).toEqual([
      'B',
      'A',
    ]);
  });

  it('heads a zone with its quadrant, then each value beside its axis', () => {
    setLanguage('es');
    expect(render()).toContain(
      '<span><em class="pmx-quad">Largas y delicadas · </em>Esfuerzo: L · Riesgo: Crítica</span>',
    );
  });
});
