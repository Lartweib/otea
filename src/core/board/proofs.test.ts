import { describe, expect, it } from 'vitest';
import type { EventRecord } from '../../store/queries.ts';
import { findTest, logLine, POINT_PROVED, proofsFrom, provedPoints } from './proofs.ts';

function proved(at: string, data: Record<string, unknown>): EventRecord {
  return {
    id: 1,
    itemId: 'BUG-1',
    type: POINT_PROVED,
    at,
    actor: { kind: 'agent', name: 'claude' },
    data,
  } as EventRecord;
}

const JUNIT = `<?xml version="1.0"?>
<testsuites><testsuite name="jump">
  <testcase classname="jump" name="slope resets floor flag"/>
  <testcase classname="jump" name="double jump"><failure message="boom">x</failure></testcase>
</testsuite></testsuites>`;

describe('proofs of checklist points', () => {
  it('keeps the newest proof of each point since the round began', () => {
    const events = [
      proved('2026-01-01T00:00:00Z', {
        part: 'fsteps',
        point: 'cone',
        kind: 'file',
        evidence: 1,
        file: 'a.png',
      }),
      proved('2026-01-02T00:00:00Z', {
        part: 'fsteps',
        point: 'cone',
        kind: 'log',
        evidence: 2,
        file: 'b.log',
        line: 3,
        text: 'ok',
      }),
      proved('2026-01-02T00:00:00Z', {
        part: 'fsteps',
        point: 'ctwo',
        kind: 'test',
        evidence: 3,
        file: 'j.xml',
        test: 'x',
      }),
    ];
    const proofs = proofsFrom(events, '2026-01-01T12:00:00Z');
    expect(proofs.map(({ point, kind }) => [point, kind])).toEqual([
      ['cone', 'log'],
      ['ctwo', 'test'],
    ]);
    expect(provedPoints(proofs)).toEqual({ fsteps: ['cone', 'ctwo'] });
    expect(proofsFrom(events, '2026-01-03T00:00:00Z')).toEqual([]);
  });

  it('reads a log line by its number, refusing one past the end or blank', () => {
    expect(logLine('first\n\nthird\n', 3)).toEqual({ ok: true, text: 'third' });
    expect(logLine('first\n\nthird\n', 2)).toEqual({
      ok: false,
      why: 'line 2 is blank',
    });
    expect(logLine('first\n\nthird\n', 4)).toEqual({
      ok: false,
      why: 'it has 3 lines',
    });
    expect(logLine('a', 0).ok).toBe(false);
  });

  it('finds a test by its name or its suite and name, in any case', () => {
    expect(findTest(JUNIT, 'Slope resets floor flag')?.status).toBe('passed');
    expect(findTest(JUNIT, 'jump › double jump')?.status).toBe('failed');
    expect(findTest(JUNIT, 'nothing')).toBeUndefined();
    expect(findTest('not a report', 'double jump')).toBeUndefined();
  });
});
