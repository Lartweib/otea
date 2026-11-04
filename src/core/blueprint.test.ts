import { describe, expect, it } from 'vitest';
import {
  assertInBlueprint,
  type Blueprint,
  blocksWaitingForNothing,
  blueprintTypeProblems,
  blueprintWarnings,
  blueprintYaml,
  describeDiff,
  diffBlueprints,
  parseBlueprint,
  readBlueprint,
} from './blueprint.ts';
import { OteaError } from './errors.ts';
import { tasks } from './testing.ts';

const PRODUCT_YAML = `
blueprint: product
blueprint_version: 1
playbook: ./playbook.md
boards:
  work: { preset: tasks }
  bugs: { preset: bug-triage }
  art: { preset: tasks }
connections:
  - bugs.bug blocks work.task
  - art.task implements work.task
  - art.task relates bugs.bug
`;

const product = parseBlueprint(PRODUCT_YAML);

const problemsOf = (text: string) => {
  const reading = readBlueprint(text);
  return reading.ok ? [] : reading.problems;
};

const withConnections = (...connections: string[]) =>
  [
    'blueprint: product',
    'blueprint_version: 1',
    'boards: { work: { preset: tasks }, bugs: { preset: bug-triage } }',
    'connections:',
    ...connections.map((connection) => `  - ${connection}`),
  ].join('\n');

describe('readBlueprint', () => {
  it('reads boards and connections in the order declared', () => {
    expect(product).toEqual({
      name: 'product',
      version: 1,
      playbook: './playbook.md',
      boards: [
        { name: 'work', preset: 'tasks' },
        { name: 'bugs', preset: 'bug-triage' },
        { name: 'art', preset: 'tasks' },
      ],
      connections: [
        {
          kind: 'blocks',
          from: { board: 'bugs', type: 'bug' },
          to: { board: 'work', type: 'task' },
        },
        {
          kind: 'implements',
          from: { board: 'art', type: 'task' },
          to: { board: 'work', type: 'task' },
        },
        {
          kind: 'relates',
          from: { board: 'art', type: 'task' },
          to: { board: 'bugs', type: 'bug' },
        },
      ],
    });
  });

  it('reads a blueprint without connections or playbook', () => {
    const blueprint = parseBlueprint(
      'blueprint: solo\nblueprint_version: 2\nboards: { work: { preset: tasks } }',
    );

    expect(blueprint).toEqual({
      name: 'solo',
      version: 2,
      boards: [{ name: 'work', preset: 'tasks' }],
      connections: [],
    });
  });

  it('refuses parent as a connection: parent links stay inside one board', () => {
    expect(problemsOf(withConnections('bugs.bug parent work.task'))).toEqual([
      'connections[0]: parent links stay inside one board; connect boards with blocks, implements, relates or duplicates',
    ]);
  });

  it('reports a malformed connection, an unknown kind and an unknown board', () => {
    expect(
      problemsOf(
        withConnections('bugs blocks work', 'bugs.bug fixes work.task', 'qa.task blocks work.task'),
      ),
    ).toEqual([
      'connections[0]: "bugs blocks work" does not read <board>.<type> <kind> <board>.<type>',
      'connections[1]: unknown link kind "fixes" (blocks, implements, relates, duplicates)',
      'connections[2]: unknown board "qa" (boards: work, bugs)',
    ]);
  });

  it('reports a connection listed twice, a relates one written either way included', () => {
    expect(
      problemsOf(
        withConnections(
          'bugs.bug blocks work.task',
          'bugs.bug blocks work.task',
          'bugs.bug relates work.task',
          'work.task relates bugs.bug',
        ),
      ),
    ).toEqual([
      'connections[1]: "bugs.bug blocks work.task" is listed twice',
      'connections[3]: "work.task relates bugs.bug" is listed twice',
    ]);
  });

  it('reports a connection from a board to itself, since links within a board are free', () => {
    expect(problemsOf(withConnections('work.task blocks work.task'))).toEqual([
      'connections[0]: joins board work to itself; links within a board are always allowed',
    ]);
  });

  it('reports schema problems by path', () => {
    expect(problemsOf('blueprint: Bad Name\nblueprint_version: 0\nboards: {}')).toEqual([
      'blueprint: must be lowercase letters, digits and dashes',
      'blueprint_version: Too small: expected number to be >0',
      'boards: declare at least one board',
    ]);
  });

  it('reads the source a project copy records', () => {
    const copy = parseBlueprint(
      `${PRODUCT_YAML}\nsource: { origin: path, path: /tmp/product/blueprint.yaml, hash: abc }`,
    );

    expect(copy.source).toEqual({
      origin: 'path',
      path: '/tmp/product/blueprint.yaml',
      hash: 'abc',
    });
  });

  it('writes a blueprint back to YAML that reads the same', () => {
    const copy: Blueprint = { ...product, source: { origin: 'official', hash: 'abc' } };

    expect(parseBlueprint(blueprintYaml(copy))).toEqual(copy);
  });
});

describe('blueprintTypeProblems', () => {
  const typesOf = (preset: string) =>
    ({ tasks: ['task'], 'bug-triage': ['bug'] })[preset] ?? `Preset "${preset}" not found`;

  it('accepts boards whose presets exist and connections whose types they declare', () => {
    expect(blueprintTypeProblems(product, typesOf)).toEqual([]);
  });

  it('reports unknown presets and unknown types', () => {
    const blueprint = parseBlueprint(
      [
        'blueprint: product',
        'blueprint_version: 1',
        'boards: { work: { preset: tasks }, bugs: { preset: bugz } }',
        'connections: [bugs.bug blocks work.story]',
      ].join('\n'),
    );

    expect(blueprintTypeProblems(blueprint, typesOf)).toEqual([
      'boards.bugs.preset: Preset "bugz" not found',
      'connections[0]: board work (preset tasks) has no type "story" (types: task)',
    ]);
  });
});

describe('assertInBlueprint', () => {
  const at = (id: string, collection: string, type = collection === 'bugs' ? 'bug' : 'task') => ({
    id,
    collection,
    type,
  });
  const refusal = (run: () => void) => {
    try {
      run();
    } catch (error) {
      if (error instanceof OteaError) return { code: error.code, message: error.message };
      throw error;
    }
    return undefined;
  };

  it('allows a declared connection, and relates either way', () => {
    expect(() =>
      assertInBlueprint(product, 'blocks', at('BUGS-1', 'bugs'), at('WORK-1', 'work')),
    ).not.toThrow();
    expect(() =>
      assertInBlueprint(product, 'relates', at('BUGS-1', 'bugs'), at('ART-1', 'art')),
    ).not.toThrow();
  });

  it('refuses an undeclared link between two boards of the blueprint, listing what is allowed', () => {
    expect(
      refusal(() =>
        assertInBlueprint(product, 'blocks', at('WORK-1', 'work'), at('BUGS-1', 'bugs')),
      ),
    ).toEqual({
      code: 'link_not_in_blueprint',
      message:
        'The blueprint "product" does not allow WORK-1 blocks BUGS-1 (work.task blocks bugs.bug); between work and bugs it allows: bugs.bug blocks work.task',
    });
  });

  it('refuses a link between boards the blueprint does not connect at all', () => {
    const solo = parseBlueprint(
      'blueprint: solo\nblueprint_version: 1\nboards: { a: { preset: tasks }, b: { preset: tasks } }',
    );

    expect(
      refusal(() => assertInBlueprint(solo, 'duplicates', at('A-1', 'a'), at('B-1', 'b'))),
    ).toEqual({
      code: 'link_not_in_blueprint',
      message:
        'The blueprint "solo" does not allow A-1 duplicates B-1 (a.task duplicates b.task); it declares no link between a and b',
    });
  });

  it('leaves parent links, links within a board and boards outside the blueprint alone', () => {
    for (const [kind, from, to] of [
      ['parent', at('BUGS-1', 'bugs'), at('WORK-1', 'work')],
      ['blocks', at('WORK-2', 'work'), at('WORK-1', 'work')],
      ['blocks', at('NOTES-1', 'notes'), at('WORK-1', 'work')],
    ] as const) {
      expect(() => assertInBlueprint(product, kind, from, to)).not.toThrow();
    }
  });

  it('changes nothing without a blueprint', () => {
    expect(() =>
      assertInBlueprint(undefined, 'blocks', at('WORK-1', 'work'), at('BUGS-1', 'bugs')),
    ).not.toThrow();
  });
});

describe('diffBlueprints', () => {
  it('lists the boards and connections the source added, removed or changed', () => {
    const source = parseBlueprint(`
blueprint: product
blueprint_version: 2
boards:
  work: { preset: tasks }
  bugs: { preset: tasks }
  qa: { preset: tasks }
connections:
  - bugs.bug blocks work.task
  - qa.task blocks work.task
`);

    const diff = diffBlueprints(product, source);

    expect(diff).toEqual({
      version: { from: 1, to: 2 },
      boardsAdded: [{ name: 'qa', preset: 'tasks' }],
      boardsRemoved: [{ name: 'art', preset: 'tasks' }],
      boardsChanged: [{ name: 'bugs', from: 'bug-triage', to: 'tasks' }],
      connectionsAdded: [source.connections[1]],
      connectionsRemoved: [product.connections[1], product.connections[2]],
    });
    expect(describeDiff(diff)).toEqual([
      'version 1 -> 2',
      '+ board qa (preset tasks)',
      '- board art (preset tasks)',
      '~ board bugs: preset bug-triage -> tasks',
      '+ qa.task blocks work.task',
      '- art.task implements work.task',
      '- art.task relates bugs.bug',
    ]);
  });

  it('finds nothing between a blueprint and itself', () => {
    expect(describeDiff(diffBlueprints(product, product))).toEqual([]);
  });
});

describe('blueprintWarnings', () => {
  const waiting = {
    ...tasks,
    states: tasks.states.map((state) =>
      state.name === 'in_progress' ? { ...state, requires: ['blockers_closed' as const] } : state,
    ),
  };

  it('warns about a blocks link whose target type waits for nothing', () => {
    expect(blueprintWarnings(product, () => tasks)).toEqual([
      'connections[0]: bugs.bug blocks work.task waits for nothing: no state of task (board work) requires blockers_closed, so no task waits for the bug that blocks it',
    ]);
  });

  it('says nothing once a state of the target type requires blockers_closed', () => {
    expect(blueprintWarnings(product, () => waiting)).toEqual([]);
  });

  it('says nothing about a board whose preset cannot be read: its problems say it', () => {
    expect(blueprintWarnings(product, () => undefined)).toEqual([]);
  });

  it('names the links that wait for nothing, for Studio to draw beside them', () => {
    expect(blocksWaitingForNothing(product, () => tasks)).toEqual([
      { index: 0, connection: product.connections[0] },
    ]);
    expect(blocksWaitingForNothing(product, () => waiting)).toEqual([]);
  });
});
