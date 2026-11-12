import { describe, expect, it } from 'vitest';
import type { BoardDefinition, Doer, Reviewer } from '../../../../src/core/board/model.ts';
import { blankBoard } from '../../../../src/core/board/templates.ts';
import { MINI_LANES, miniRoute } from './mini-route.ts';

// A board's small route on Studio's home: its steps laid flat on the two lanes, agents above and
// you below, fusing into Hecho; a review is a visit to the reviewer's lane before the next stop.

const ids = (() => {
  let n = 0;
  return (kind: string) => `${kind}${String(++n).padStart(7, '0')}`;
})();

function board(steps: Array<[Doer, Reviewer]>): BoardDefinition {
  const def = blankBoard('es', { name: 'Pruebas' }, ids);
  const [first] = def.steps;
  if (!first) throw new Error('a blank board has one step');
  return {
    ...def,
    steps: steps.map(([doer, reviewer], i) => ({ ...first, id: `s${i}`, doer, reviewer })),
  };
}

const lanes = MINI_LANES;

describe('the mini route', () => {
  it('walks from the creation form to the step, visits your lane to review, and ends in Hecho', () => {
    const r = miniRoute(blankBoard('es', { name: 'Notas' }, ids), 196);

    expect(r.points.map(([, y]) => y)).toEqual([lanes.mid, lanes.ag, lanes.you, lanes.mid]);
    expect(r.nodes.map((n) => n.kind)).toEqual(['ag', 'review', 'done']);
    expect(r.walked.startsWith(`M${r.points[0]?.[0]} ${lanes.mid}`)).toBe(true);
  });

  it('puts a step you do on your lane, and an agent review on the agents’ lane', () => {
    const r = miniRoute(
      board([
        ['you', 'none'],
        [{ agent: 'kiln' }, { agent: 'scout' }],
      ]),
      196,
    );

    expect(r.points.map(([, y]) => y)).toEqual([lanes.mid, lanes.you, lanes.ag, lanes.mid]);
    expect(r.nodes.map((n) => n.kind)).toEqual(['you', 'ag', 'done']);
  });

  it('keeps every stop inside the drawing, in order, Hecho last', () => {
    const r = miniRoute(
      board([
        ['any', 'you'],
        ['any', 'you'],
        ['you', 'none'],
        ['any', 'none'],
      ]),
      196,
    );
    const xs = r.points.map(([x]) => x);

    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    expect(Math.max(...xs)).toBeLessThanOrEqual(r.viewW);
    expect(r.nodes.at(-1)).toMatchObject({ kind: 'done' });
  });

  it('draws a board with no steps as the lanes fusing into Hecho', () => {
    const r = miniRoute(board([]), 196);

    expect(r.nodes).toEqual([expect.objectContaining({ kind: 'done' })]);
    expect(r.lanes.ag).toMatch(/^M10 /);
    expect(r.width).toBe(196);
  });
});
