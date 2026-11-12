import { type BoardDefinition, clone, DONE, isEvidenceKind, SAME, TITLE } from './model.ts';

// Hidden ids: a kind letter (b board, s step, f field, e evidence, c choice) and seven base-36
// characters. They are valid field keys (snake_case) and evidence module ids (dashes) at once, so
// the compiled workflow and layout take them as they are.
export type IdKind = 'b' | 's' | 'f' | 'e' | 'c';

export const ID_PATTERN = /^[a-z][a-z0-9]*$/;

export type IdSource = (kind: IdKind) => string;

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

export function newId(kind: IdKind): string {
  const bytes = new Uint8Array(7);
  globalThis.crypto.getRandomValues(bytes);
  return kind + Array.from(bytes, (byte) => ALPHABET[byte % 36]).join('');
}

// Predictable ids for tests: s1, s2, f3…
export function sequenceIds(): IdSource {
  let next = 0;
  return (kind) => `${kind}${++next}`;
}

const MENTION = /@\[([a-z][a-z0-9_-]*)\]/g;

function rewriteMentions(text: string, map: ReadonlyMap<string, string>): string {
  return text.replace(MENTION, (whole, ref: string) => {
    const next = map.get(ref);
    return next ? `@[${next}]` : whole;
  });
}

// A copy of a definition with a new id under every step, part and choice, and every reference
// rewritten: what a template or a duplicate gives, so nothing stays linked to the original.
export function freshIds(def: BoardDefinition, ids: IdSource = newId): BoardDefinition {
  const out = clone(def);
  const map = new Map<string, string>();
  const choiceMaps = new Map<string, Map<string, string>>();
  const parts: BoardDefinition['parts'] = {};
  for (const part of Object.values(out.parts)) {
    const id = ids(isEvidenceKind(part.kind) ? 'e' : 'f');
    map.set(part.id, id);
    const choices = new Map<string, string>();
    part.options = part.options.map((choice) => {
      const fresh = ids('c');
      choices.set(choice.id, fresh);
      return { ...choice, id: fresh };
    });
    choiceMaps.set(id, choices);
    parts[id] = { ...part, id };
  }
  out.parts = parts;
  for (const step of out.steps) map.set(step.id, ids('s'));
  out.drop = {
    ...out.drop,
    motives: out.drop.motives.map((motive) => ({ ...motive, id: ids('c') })),
  };
  const ref = (old: string) => (old === TITLE ? TITLE : (map.get(old) ?? old));
  const target = (old: string) => (old === DONE || old === SAME ? old : ref(old));
  for (const step of out.steps) {
    step.id = ref(step.id);
    step.ways = step.ways.map(target);
    step.back = target(step.back);
    step.hand = step.hand.map((hand) => {
      const next = { ...hand, ref: ref(hand.ref) };
      if (hand.when) {
        const part = ref(hand.when.part);
        const value = choiceMaps.get(part)?.get(hand.when.value) ?? hand.when.value;
        next.when = { part, value };
      }
      return next;
    });
    step.instructions = {
      take: rewriteMentions(step.instructions.take, map),
      before: rewriteMentions(step.instructions.before, map),
      review: rewriteMentions(step.instructions.review, map),
    };
  }
  for (const part of Object.values(out.parts)) {
    if (part.initial !== undefined)
      part.initial = choiceMaps.get(part.id)?.get(part.initial) ?? part.initial;
    if (part.guard)
      part.guard = {
        push: part.guard.push.map(ref),
        ...(part.guard.repo === undefined ? {} : { repo: ref(part.guard.repo) }),
      };
  }
  if (out.list.group !== undefined) out.list = { ...out.list, group: ref(out.list.group) };
  out.form = out.form.map((entry) => ({ ...entry, ref: ref(entry.ref) }));
  out.anytime = out.anytime.map(ref);
  out.row = out.row.map(ref);
  out.layout = Object.fromEntries(
    Object.entries(out.layout).map(([key, zone]) => [ref(key), zone]),
  );
  out.about = rewriteMentions(out.about, map);
  out.idle = rewriteMentions(out.idle, map);
  return out;
}
