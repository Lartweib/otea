import { type BoardDefinition, partOf, TITLE } from './model.ts';

// Instructions mention steps, fields and evidence as `@[id]` tokens, so a mention follows a rename.
// People type `@Name`; the editor stores the token and shows the name.

const TOKEN = /@\[([a-z][a-z0-9_-]*)\]/g;

export type Mentionable = { ref: string; name: string; kind: 'step' | 'part' };

export type MentionSegment = { text: string } | { ref: string; name: string | null };

// What `@` can name: the steps in order, then the parts.
export function mentionables(def: BoardDefinition): Mentionable[] {
  return [
    ...def.steps.map(({ id, name }) => ({ ref: id, name, kind: 'step' as const })),
    ...Object.values(def.parts).map(({ id, name }) => ({ ref: id, name, kind: 'part' as const })),
  ];
}

function nameOf(def: BoardDefinition, ref: string): string | null {
  const step = def.steps.find(({ id }) => id === ref);
  if (step) return step.name;
  if (ref === TITLE) return def.title;
  return partOf(def, ref)?.name ?? null;
}

// Typed `@Name`s as tokens, matching the longest known name first; an `@` that names nothing stays.
export function toMentions(def: BoardDefinition, text: string): string {
  const names = mentionables(def)
    .filter(({ name }) => name.trim() !== '')
    .sort((a, b) => b.name.length - a.name.length);
  let out = '';
  for (let at = 0; at < text.length; at++) {
    const char = text[at];
    if (char === '@' && text[at + 1] !== '[') {
      const rest = text.slice(at + 1);
      const hit = names.find(({ name }) => rest.startsWith(name));
      if (hit) {
        out += `@[${hit.ref}]`;
        at += hit.name.length;
        continue;
      }
    }
    out += char;
  }
  return out;
}

export function mentionSegments(def: BoardDefinition, text: string): MentionSegment[] {
  const out: MentionSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    const ref = match[1] ?? '';
    if (match.index > last) out.push({ text: text.slice(last, match.index) });
    out.push({ ref, name: nameOf(def, ref) });
    last = match.index + match[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

// The text as an agent reads it: every token replaced by the current name (a removed one by "…").
export function mentionText(def: BoardDefinition, text: string): string {
  return mentionSegments(def, text)
    .map((segment) => ('text' in segment ? segment.text : (segment.name ?? '…')))
    .join('');
}

// The refs a text mentions, for "what changes when this is removed".
export function mentionedRefs(text: string): string[] {
  return [...text.matchAll(TOKEN)].map((match) => match[1] ?? '');
}
