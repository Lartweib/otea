import { parse } from 'yaml';
import { z } from 'zod';
import { EVIDENCE_ROLES, type EvidenceRole } from './evidence.ts';
import { valueProblem } from './fields.ts';
import type { ItemType, Preset } from './preset.ts';
import type { PresetNote } from './preset-notes.ts';
import { RELATION_VIEWS, type RelationView } from './relations.ts';

// Sample items: a few example items a preset carries in samples.yaml, beside preset.yaml, so Studio
// can draw the real detail, row, form and lanes from a draft. They never enter a collection or the
// database. Their evidence names files in the samples/ folder beside samples.yaml.
//
// A sample that does not fit the preset never stops it loading: what is wrong is noted against the
// preset, and the sample is drawn as best it can be (or left out, when it cannot be drawn at all).

export const SAMPLES_FILE = 'samples.yaml';

export const SAMPLES_DIR = 'samples';

// A plain file name in the samples folder: no folders, no way out of it.
export const SAMPLE_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export type SampleEvidence = {
  file: string;
  role: EvidenceRole;
  module?: string;
  caption?: string;
};

// The other end of a link, as the detail lists it; it lives in no collection, so it is described.
export type SampleRelation = {
  kind: RelationView;
  id: string;
  title: string;
  type?: string;
  state?: string;
};

// One line of the item's history. `ago` is how long before now it happened: 5m, 3h, 2d.
export type SampleEvent = {
  actor: 'human' | 'agent';
  name: string;
  event: string;
  from?: string;
  to?: string;
  reason?: string;
  ago?: string;
};

export type Sample = {
  type: string;
  id: string;
  title: string;
  state: string;
  fields: Record<string, string>;
  evidence: SampleEvidence[];
  relations: SampleRelation[];
  history: SampleEvent[];
};

export type SamplesReading = { samples: Sample[]; notes: PresetNote[] };

const text = z.string().min(1);

const evidenceSchema = z.strictObject({
  file: z.string().regex(SAMPLE_FILE, 'must be a file name in the samples folder'),
  role: z.enum(EVIDENCE_ROLES).optional(),
  module: text.optional(),
  caption: text.optional(),
});

const relationSchema = z.strictObject({
  kind: z.enum(RELATION_VIEWS),
  id: text,
  title: text,
  type: text.optional(),
  state: text.optional(),
});

const eventSchema = z.strictObject({
  actor: z.enum(['human', 'agent']),
  name: text,
  event: text,
  from: text.optional(),
  to: text.optional(),
  reason: text.optional(),
  ago: z
    .string()
    .regex(/^\d+[mhd]$/, 'minutes, hours or days: 5m, 3h, 2d')
    .optional(),
});

const sampleSchema = z.strictObject({
  type: text.optional(),
  id: text,
  title: text,
  state: text,
  fields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  evidence: z.array(evidenceSchema).optional(),
  relations: z.array(relationSchema).optional(),
  history: z.array(eventSchema).optional(),
});

const fileSchema = z.strictObject({ samples: z.array(z.unknown()) });

function note(
  code: PresetNote['code'],
  message: string,
  path: Omit<PresetNote['path'], 'section'>,
): PresetNote {
  return { code, level: 'warning', message, path: { section: 'samples', ...path } };
}

function issuesOf(error: z.ZodError, at: string): string {
  return error.issues
    .map((issue) => `${[at, ...issue.path.map(String)].join('.')}: ${issue.message}`)
    .join('; ');
}

function typeFor(preset: Preset, name: string | undefined): ItemType | undefined {
  if (name === undefined) return preset.types.length === 1 ? preset.types[0] : undefined;
  return preset.types.find((type) => type.name === name);
}

type Raw = z.infer<typeof sampleSchema>;

// The entry without the keys it leaves out.
function defined<T>(entry: object): T {
  return Object.fromEntries(Object.entries(entry).filter(([, value]) => value !== undefined)) as T;
}

function readOne(raw: Raw, index: number, preset: Preset, files: ReadonlySet<string>) {
  const at = `samples[${index}]`;
  const notes: PresetNote[] = [];
  const type = typeFor(preset, raw.type);
  if (!type) {
    const names = preset.types.map(({ name }) => name).join(', ');
    const message =
      raw.type === undefined
        ? `${at}.type: missing; the preset has several types (${names})`
        : `${at}.type: unknown type "${raw.type}" (types: ${names})`;
    const path = raw.type === undefined ? { index } : { index, type: raw.type };
    return { notes: [note('sample_unknown_type', message, path)] };
  }
  const { workflow } = type;
  let { state } = raw;
  if (!workflow.states.some(({ name }) => name === state)) {
    const states = workflow.states.map(({ name }) => name).join(', ');
    notes.push(
      note(
        'sample_unknown_state',
        `${at}.state: "${state}" is not a state of ${type.name} (states: ${states}); drawn as ${workflow.initial}`,
        { index, type: type.name, state },
      ),
    );
    state = workflow.initial;
  }
  const fields = Object.fromEntries(
    Object.entries(raw.fields ?? {}).map(([name, value]) => [name, String(value)]),
  );
  for (const [name, value] of Object.entries(fields)) {
    const spec = type.fields[name];
    const where = { index, type: type.name, field: name };
    if (!spec) {
      notes.push(
        note(
          'sample_unknown_field',
          `${at}.fields.${name}: ${type.name} has no field "${name}"`,
          where,
        ),
      );
      continue;
    }
    const problem = valueProblem(name, spec, value);
    if (problem)
      notes.push(note('sample_invalid_value', `${at}.fields.${name}: ${problem}`, where));
  }
  const evidence: SampleEvidence[] = [];
  (raw.evidence ?? []).forEach(({ file, role = 'single', module, caption }, position) => {
    if (!files.has(file)) {
      notes.push(
        note(
          'sample_missing_file',
          `${at}.evidence[${position}].file: ${SAMPLES_DIR}/${file} does not exist`,
          { index, file },
        ),
      );
      return;
    }
    evidence.push({
      file,
      role,
      ...(module === undefined ? {} : { module }),
      ...(caption === undefined ? {} : { caption }),
    });
  });
  const sample: Sample = {
    type: type.name,
    id: raw.id,
    title: raw.title,
    state,
    fields,
    evidence,
    relations: (raw.relations ?? []).map((relation) => defined<SampleRelation>(relation)),
    history: (raw.history ?? []).map((event) => defined<SampleEvent>(event)),
  };
  return { sample, notes };
}

// Reads samples.yaml against the preset (or a draft of it) and the files of its samples folder.
// `text` is undefined when the preset has no samples.yaml.
export function readSamples(
  text: string | undefined,
  preset: Preset,
  files: readonly string[],
): SamplesReading {
  if (text === undefined || text.trim() === '') return { samples: [], notes: [] };
  let value: unknown;
  try {
    value = parse(text);
  } catch (error) {
    const message = `${SAMPLES_FILE}: invalid YAML: ${(error as Error).message.split('\n')[0]}`;
    return { samples: [], notes: [note('sample_invalid', message, {})] };
  }
  const file = fileSchema.safeParse(value);
  if (!file.success) {
    return {
      samples: [],
      notes: [note('sample_invalid', issuesOf(file.error, SAMPLES_FILE), {})],
    };
  }
  const present = new Set(files);
  const reading: SamplesReading = { samples: [], notes: [] };
  file.data.samples.forEach((entry, index) => {
    const raw = sampleSchema.safeParse(entry);
    if (!raw.success) {
      const message = issuesOf(raw.error, `samples[${index}]`);
      reading.notes.push(note('sample_invalid', message, { index }));
      return;
    }
    const { sample, notes } = readOne(raw.data, index, preset, present);
    if (sample) reading.samples.push(sample);
    reading.notes.push(...notes);
  });
  return reading;
}
