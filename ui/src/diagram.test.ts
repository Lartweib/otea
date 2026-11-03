import { describe, expect, it } from 'vitest';
import { addedLines, addedSince, layoutDiagram, parseDiagram } from './diagram.ts';

const ROTATION = `flowchart LR
  web[browser · sid cookie] -->|sid token| api
  mobile[mobile app · caches 36 h]:::new -->|bearer| api
  api[api · verifySession] -->|verify with each| keys
  keys[keys.active] -.-> kms{KMS}
  %% the job runs at midnight
  job(rotation job) -- daily --> keys`;

const parsed = (source: string) => {
  const result = parseDiagram(source);
  if (!result.ok) throw new Error(result.message);
  return result.diagram;
};

describe('the diagram module', () => {
  it('reads nodes, labels with a second line, shapes and labelled edges', () => {
    const diagram = parsed(ROTATION);

    expect(diagram.direction).toBe('LR');
    expect(diagram.nodes.map(({ id }) => id)).toEqual([
      'web',
      'api',
      'mobile',
      'keys',
      'kms',
      'job',
    ]);
    expect(diagram.nodes.find(({ id }) => id === 'web')).toEqual({
      id: 'web',
      title: 'browser',
      sub: 'sid cookie',
      shape: 'box',
    });
    expect(diagram.nodes.find(({ id }) => id === 'kms')?.shape).toBe('diamond');
    expect(diagram.nodes.find(({ id }) => id === 'job')?.shape).toBe('round');
    expect(diagram.edges).toEqual([
      { from: 'web', to: 'api', dashed: false, label: 'sid token' },
      { from: 'mobile', to: 'api', dashed: false, label: 'bearer' },
      { from: 'api', to: 'keys', dashed: false, label: 'verify with each' },
      { from: 'keys', to: 'kms', dashed: true },
      { from: 'job', to: 'keys', dashed: false, label: 'daily' },
    ]);
  });

  it('reads a chain of edges on one line and TB as TD', () => {
    const diagram = parsed('graph TB\n  a --> b --> c');
    expect(diagram.direction).toBe('TD');
    expect(diagram.edges.map(({ from, to }) => `${from}${to}`)).toEqual(['ab', 'bc']);
  });

  it('names the line that stops the parser, never drawing a half diagram', () => {
    expect(parseDiagram('sequenceDiagram\n  a->>b: hi')).toMatchObject({ ok: false, line: 1 });
    expect(parseDiagram('flowchart LR\n  a --> b\n  a ==> ')).toMatchObject({ ok: false, line: 3 });
    expect(parseDiagram('')).toMatchObject({ ok: false });
  });

  it('lays ranks along the flow, so every edge runs forward', () => {
    const drawing = layoutDiagram(parsed(ROTATION));
    const x = (id: string) => drawing.nodes.find((node) => node.id === id)?.x ?? -1;

    expect(x('web')).toBeLessThan(x('api'));
    expect(x('api')).toBeLessThan(x('keys'));
    expect(x('keys')).toBeLessThan(x('kms'));
    expect(drawing.edges).toHaveLength(5);
    expect(drawing.width).toBeGreaterThan(x('kms'));
  });

  it('survives a cycle', () => {
    const drawing = layoutDiagram(parsed('flowchart TD\n  a --> b --> a'));
    expect(drawing.nodes).toHaveLength(2);
    expect(drawing.edges).toHaveLength(2);
  });

  it('says what a version adds to the one before, in nodes, edges and lines', () => {
    const v1 = 'flowchart LR\n  web --> api\n  api --> keys';
    const v2 = 'flowchart LR\n  web --> api\n  mobile --> api\n  api --> keys';
    const added = addedSince(parsed(v2), parsed(v1));

    expect([...added.nodes]).toEqual(['mobile']);
    expect([...added.edges]).toEqual(['mobile->api']);
    expect([...addedLines(v2, v1)]).toEqual([2]);
    expect(addedSince(parsed(v2), undefined).nodes.size).toBe(0);
  });
});
