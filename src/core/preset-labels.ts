import { z } from 'zod';

// A preset's own words in another language than the one it is written in: per language, a word for
// each of its types, states and fields. Optional, and all or nothing: a language that labels a
// preset labels every type, state and field of it, so a screen never mixes translated words with
// keys. The keys stay what agents, the CLI and the history use; only the web UI shows the labels.
export type TypeLabels = {
  // Absent for the implicit type of a preset without types, unless the preset gives it one.
  label?: string;
  states: Record<string, string>;
  fields: Record<string, string>;
};

// By language code (es, pt): a type's labels in each language its preset speaks.
export type Labels = Record<string, TypeLabels>;

const words = z.record(z.string(), z.string().trim().min(1, 'a label cannot be empty'));

export const labelsSchema = z.record(
  z.string().regex(/^[a-z]{2,3}$/, 'languages are two- or three-letter codes (es, pt)'),
  z.strictObject({
    types: words.optional(),
    states: words.optional(),
    fields: words.optional(),
  }),
);

export type RawLabels = z.infer<typeof labelsSchema>;

// What labels are checked against and given to: a type, its fields and its workflow's states.
type Labelled = {
  name: string;
  fields: Record<string, unknown>;
  workflow: { states: readonly { name: string }[] };
};

type Kind = 'types' | 'states' | 'fields';

const SINGULAR: Record<Kind, string> = { types: 'type', states: 'state', fields: 'field' };

function namesOf(types: readonly Labelled[], kind: Kind): string[] {
  if (kind === 'types') return types.map(({ name }) => name);
  if (kind === 'fields') return [...new Set(types.flatMap((type) => Object.keys(type.fields)))];
  return [...new Set(types.flatMap((type) => type.workflow.states.map(({ name }) => name)))];
}

// `implicit`: the preset declares no types, so naming its only type is optional.
export function labelProblems(
  raw: RawLabels | undefined,
  types: readonly Labelled[],
  implicit: boolean,
): string[] {
  return Object.entries(raw ?? {}).flatMap(([language, given]) =>
    (['types', 'states', 'fields'] as const).flatMap((kind) => {
      const at = `labels.${language}.${kind}`;
      const known = namesOf(types, kind);
      const labelled = Object.keys(given[kind] ?? {});
      const unknown = labelled
        .filter((name) => !known.includes(name))
        .map((name) => `${at}.${name}: unknown ${SINGULAR[kind]} "${name}"`);
      const missing =
        kind === 'types' && implicit ? [] : known.filter((n) => !labelled.includes(n));
      if (missing.length === 0) return unknown;
      return [
        ...unknown,
        `${at}: missing ${missing.join(', ')}; a language labels every type, state and field`,
      ];
    }),
  );
}

function pick(words: Record<string, string> | undefined, names: readonly string[]) {
  return Object.fromEntries(names.flatMap((name) => (words?.[name] ? [[name, words[name]]] : [])));
}

// A type's labels in each language, or undefined when its preset speaks only its own.
export function typeLabels(raw: RawLabels | undefined, type: Labelled): Labels | undefined {
  const languages = Object.entries(raw ?? {});
  if (languages.length === 0) return undefined;
  return Object.fromEntries(
    languages.map(([language, given]) => {
      const labels: TypeLabels = {
        states: pick(
          given.states,
          type.workflow.states.map(({ name }) => name),
        ),
        fields: pick(given.fields, Object.keys(type.fields)),
      };
      const label = given.types?.[type.name];
      return [language, label === undefined ? labels : { label, ...labels }];
    }),
  );
}
