import { describe, expect, it } from 'vitest';
import {
  defaultLayout,
  LAYOUT_SLOTS,
  MODULE_REGISTRY,
  moduleFamily,
  readLayout,
} from './modules.ts';
import type { FieldSpec } from './preset.ts';

const FIELDS: Record<string, FieldSpec> = {
  title: { module: 'text', required: 'create' },
  description: { module: 'markdown', required: 'complete' },
  severity: { module: 'severity', values: ['low', 'medium', 'high', 'critical'] },
  area: { module: 'text' },
};

const AT = 'types.bug.layout';

function problemsOf(raw: unknown): string[] {
  return readLayout(raw, FIELDS, AT).problems;
}

describe('the module registry', () => {
  it('knows the field, evidence and reserved modules', () => {
    expect(Object.keys(MODULE_REGISTRY)).toEqual([
      'text',
      'markdown',
      'enum',
      'severity',
      'images',
      'recording',
      'diff',
      'log',
      'questions',
      'rounds',
      'relations',
      'children',
      'score',
      'options',
      'diagram',
    ]);
    expect(moduleFamily('severity')).toBe('field');
    expect(moduleFamily('recording')).toBe('evidence');
    expect(moduleFamily('rounds')).toBe('reserved');
  });

  it('places every module in at least one slot', () => {
    for (const spec of Object.values(MODULE_REGISTRY)) {
      expect(spec.slots.length).toBeGreaterThan(0);
      for (const slot of spec.slots) expect(LAYOUT_SLOTS).toContain(slot);
    }
  });
});

describe('defaultLayout', () => {
  it('draws every field as the UI did before layouts: the body and the row skip the title', () => {
    const fields = (...names: string[]) =>
      names.map((field) => ({ module: FIELDS[field]?.module, field }));

    expect(defaultLayout(FIELDS)).toEqual({
      header: [],
      evidence: [],
      body: fields('description', 'severity', 'area'),
      side: [],
      row: fields('description', 'severity', 'area'),
      phone: [],
      intake: fields('title', 'description', 'severity', 'area'),
    });
  });
});

describe('readLayout', () => {
  it('reads field names and module references, keeping the default for slots left out', () => {
    const { layout, problems } = readLayout(
      {
        header: ['severity'],
        evidence: [
          { module: 'images', variant: 'compare', accepts: ['png', '.GIF'], required: true },
          { module: 'recording', variant: 'player', accepts: ['video'], label: 'Repro' },
        ],
        body: [{ module: 'markdown', field: 'description', label: 'What happens' }, 'area'],
        side: [{ module: 'relations' }],
      },
      FIELDS,
      AT,
    );

    expect(problems).toEqual([]);
    expect(layout.header).toEqual([{ module: 'severity', field: 'severity' }]);
    expect(layout.evidence).toEqual([
      {
        module: 'images',
        id: 'images',
        variant: 'compare',
        accepts: ['png', 'gif'],
        required: true,
      },
      {
        module: 'recording',
        id: 'recording',
        variant: 'player',
        accepts: ['video'],
        label: 'Repro',
      },
    ]);
    expect(layout.body).toEqual([
      { module: 'markdown', field: 'description', label: 'What happens' },
      { module: 'text', field: 'area' },
    ]);
    expect(layout.side).toEqual([{ module: 'relations' }]);
    expect(layout.intake).toEqual(defaultLayout(FIELDS).intake);
  });

  it('names each evidence module by its id, its module kind unless it declares one', () => {
    const { layout, problems } = readLayout(
      {
        evidence: [
          { module: 'images', variant: 'compare' },
          { module: 'images', id: 'screens', variant: 'gallery' },
        ],
        side: [{ module: 'log', id: 'test-output' }],
      },
      FIELDS,
      AT,
    );

    expect(problems).toEqual([]);
    expect(layout.evidence.map(({ id }) => id)).toEqual(['images', 'screens']);
    expect(layout.side).toEqual([{ module: 'log', id: 'test-output' }]);
  });

  it('accepts every reserved module in a slot it may sit in, before its component exists', () => {
    const { problems } = readLayout(
      {
        body: [
          { module: 'questions' },
          { module: 'rounds' },
          { module: 'children' },
          { module: 'options' },
          { module: 'diagram', label: 'Flow' },
        ],
        side: [{ module: 'score' }, { module: 'relations' }],
      },
      FIELDS,
      AT,
    );

    expect(problems).toEqual([]);
  });

  it.each<[string, unknown, string]>([
    ['a layout that is not a map', ['title'], `${AT}: must be a map of slots`],
    [
      'an unknown slot',
      { footer: [] },
      `${AT}.footer: unknown slot (slots: header, evidence, body, side, row, phone, intake)`,
    ],
    ['a slot that is not a list', { body: 'description' }, `${AT}.body: must be a list`],
    ['an unknown field', { body: ['steps'] }, `${AT}.body[0]: unknown field "steps"`],
    [
      'an unknown module',
      { body: [{ module: 'media' }] },
      `${AT}.body[0].module: unknown module "media"`,
    ],
    [
      'an entry that is neither a field nor a module',
      { body: [3] },
      `${AT}.body[0]: must be a field name or { module: <kind>, ... }`,
    ],
    [
      'a field module without its field',
      { body: [{ module: 'markdown' }] },
      `${AT}.body[0].field: Invalid input: expected string, received undefined`,
    ],
    [
      'a field module that does not match the field',
      { body: [{ module: 'markdown', field: 'area' }] },
      `${AT}.body[0].module: field "area" uses the text module, not markdown`,
    ],
    [
      'a module outside its slots',
      { header: [{ module: 'images' }] },
      `${AT}.header[0]: the images module cannot sit in header (slots: evidence, body, side, phone)`,
    ],
    [
      'a field in the evidence slot',
      { evidence: ['area'] },
      `${AT}.evidence[0]: the text module cannot sit in evidence (slots: header, body, side, row, phone, intake)`,
    ],
    [
      'an unknown variant',
      { evidence: [{ module: 'images', variant: 'player' }] },
      `${AT}.evidence[0].variant: Invalid option: expected one of "single"|"gallery"|"compare"`,
    ],
    [
      'an unknown config key',
      { evidence: [{ module: 'diff', variant: 'split' }] },
      `${AT}.evidence[0]: Unrecognized key: "variant"`,
    ],
    [
      'a reserved module with config it does not take yet',
      { body: [{ module: 'questions', items: ['ok?'] }] },
      `${AT}.body[0]: Unrecognized key: "items"`,
    ],
    [
      'an extension outside the module family',
      { evidence: [{ module: 'images', accepts: ['mp4'] }] },
      `${AT}.evidence[0].accepts: "mp4" is a video file; the images module accepts image`,
    ],
    [
      'a kind outside the module family',
      { evidence: [{ module: 'log', accepts: ['diff'] }] },
      `${AT}.evidence[0].accepts: "diff" is a diff file; the log module accepts log`,
    ],
    [
      'an unknown extension',
      { evidence: [{ module: 'recording', accepts: ['zip'] }] },
      `${AT}.evidence[0].accepts: "zip" is not a known file kind or extension`,
    ],
    [
      'the same field twice in a slot',
      { row: ['severity', { module: 'severity', field: 'severity' }] },
      `${AT}.row[1]: field "severity" is already in row`,
    ],
    [
      'an id that is not kebab-case',
      { evidence: [{ module: 'images', id: 'Before After' }] },
      `${AT}.evidence[0].id: ids are lowercase letters, digits and dashes, starting with a letter`,
    ],
    [
      'two evidence modules of one kind without ids',
      { evidence: [{ module: 'images' }], body: [{ module: 'images', variant: 'gallery' }] },
      `${AT}.body[0].id: "images" already names evidence[0]; give each images module its own id`,
    ],
    [
      'the same id twice',
      {
        evidence: [
          { module: 'images', id: 'proof' },
          { module: 'log', id: 'proof' },
        ],
      },
      `${AT}.evidence[1].id: "proof" already names evidence[0]; give each log module its own id`,
    ],
    [
      'an id on a field module',
      { body: [{ module: 'text', field: 'area', id: 'where' }] },
      `${AT}.body[0]: Unrecognized key: "id"`,
    ],
    [
      'an intake without a field required to create',
      { intake: ['description'] },
      `${AT}.intake: missing field "title", required to create`,
    ],
  ])('rejects %s, pointing at its path', (_, raw, problem) => {
    expect(problemsOf(raw)).toContain(problem);
  });
});
