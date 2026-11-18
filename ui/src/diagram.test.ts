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

  // The page words the failure in its own language: the English detail once showed inside a
  // Spanish sentence (IDEA-7).
  it('says why it stopped as data, for the page to word', () => {
    expect(parseDiagram('sequenceDiagram
  a->>b: hi')).toMatchObject({ why: 'header' });
    expect(parseDiagram('flowchart LR
  a --> b
  a ==> ')).toMatchObject({ why: 'edgeEnd' });
    expect(parseDiagram('flowchart LR
  a{{hex}} --> b')).toMatchObject({ why: 'edge', at: '{{hex}} --> b' });
    expect(parseDiagram('')).toMatchObject({ why: 'empty' });
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

  const finite = (drawing: ReturnType<typeof layoutDiagram>) =>
    [drawing.width, drawing.height]
      .concat(drawing.nodes.flatMap(({ x, y, w, h }) => [x, y, w, h]))
      .concat(drawing.edges.flatMap(({ lx, ly }) => [lx, ly]))
      .every(Number.isFinite) && drawing.edges.every(({ d }) => !d.includes('NaN'));

  const overlap = (drawing: ReturnType<typeof layoutDiagram>) =>
    drawing.nodes.some((a, i) =>
      drawing.nodes
        .slice(i + 1)
        .some((b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h),
    );

  it('lays out a cycle back to the start next to nodes nothing links', () => {
    const loose = layoutDiagram(parsed('flowchart TD\n  X[Suelto]\n  A --> B\n  B --> A'));
    const loop = layoutDiagram(
      parsed(
        'flowchart TD\n  Habitos[Vista]\n  Ajustes[Ajustes]\n  Hoy --> Store\n  Store --> Racha{¿Racha?}\n  Racha -->|calcula al leer| Hoy',
      ),
    );
    const back = layoutDiagram(parsed('flowchart LR\n  A --> B --> C --> D\n  D --> A'));
    for (const drawing of [loose, loop, back]) {
      expect(finite(drawing)).toBe(true);
      expect(overlap(drawing)).toBe(false);
    }
    const y = (id: string) => loop.nodes.find((node) => node.id === id)?.y ?? -1;
    expect(y('Hoy')).toBeLessThan(y('Store'));
    expect(y('Store')).toBeLessThan(y('Racha'));
    // Nodes nothing links stand first in their rank, clear of the loop round the far side.
    const left = (id: string) => loop.nodes.find((node) => node.id === id)?.x ?? -1;
    expect(left('Ajustes')).toBeLessThan(left('Hoy'));
    expect(left('Habitos')).toBeLessThan(left('Hoy'));
    const x = (id: string) => back.nodes.find((node) => node.id === id)?.x ?? -1;
    expect(x('A')).toBeLessThan(x('B'));
    expect(x('C')).toBeLessThan(x('D'));
    const ahead = layoutDiagram(parsed('flowchart LR\n  a --> b'));
    const behind = layoutDiagram(parsed('flowchart RL\n  a --> b'));
    expect(behind.height).toBe(ahead.height);
    expect(back.height).toBeGreaterThan(ahead.height);
  });

  it('runs a loop back round the outside, never through a node beside one of its ends', () => {
    const drawing = layoutDiagram(
      parsed(
        `flowchart LR
  A[Pedido] --> B{¿Todo?}
  B -- sí --> C[Hacerlo]
  B -- no --> D[Completar la información pendiente]
  C --> E[Revisión]
  E -->|aprobado| F[Listo]
  E -->|devuelto| C`,
      ),
    );
    const at = (id: string) => drawing.nodes.find((node) => node.id === id);
    const c = at('C');
    const d = at('D');
    // The loop leaves C's far side: nothing of its rank stands beyond it.
    expect(c && d && c.y > d.y).toBe(true);
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
