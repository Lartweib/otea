import { describe, expect, it } from 'vitest';
import { type ProofChecklistView, pointState, proofCount, proofLabel } from './proof-checklist.ts';

const list: ProofChecklistView = {
  part: 'fsteps',
  name: 'Pasos',
  points: [
    {
      id: 'a',
      name: 'Abrir el nivel 3',
      ticked: true,
      proof: { kind: 'file', evidence: 1, file: 'nivel3.png' },
    },
    {
      id: 'b',
      name: 'Ver el flag',
      ticked: true,
      proof: {
        kind: 'log',
        evidence: 2,
        file: 'build.log',
        line: 212,
        text: 'flag on',
      },
    },
    { id: 'c', name: 'Probado a 60 Hz', ticked: true },
    { id: 'd', name: 'En pausa', ticked: false },
  ],
};

describe('a checklist that asks for proof', () => {
  it('says each point proved, ticked without proof, or not ticked', () => {
    expect(list.points.map(pointState)).toEqual(['proved', 'proved', 'unproved', 'unticked']);
  });

  it('counts what is ticked and proved, of every point', () => {
    expect(proofCount(list)).toEqual({ ticked: 3, proved: 2, total: 4 });
  });

  it('names a proof by its file, its log line or its test', () => {
    expect(list.points.map(({ proof }) => (proof ? proofLabel(proof) : ''))).toEqual([
      'nivel3.png',
      'build.log:212',
      '',
      '',
    ]);
    expect(
      proofLabel({
        kind: 'test',
        evidence: 3,
        file: 'junit.xml',
        test: 'jump › slope',
      }),
    ).toBe('jump › slope');
  });
});
