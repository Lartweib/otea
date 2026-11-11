import { describe, expect, it } from 'vitest';
import { mentionables, mentionSegments, mentionText, toMentions } from './mentions.ts';
import type { BoardDefinition } from './model.ts';

const def = {
  title: 'Título',
  parts: {
    fcause: { id: 'fcause', name: 'Causa probable', kind: 'long', hint: '', options: [] },
    fsteps: { id: 'fsteps', name: 'Pasos', kind: 'check', hint: '', options: [] },
  },
  steps: [{ id: 'srefine', name: 'Refinar' }],
} as unknown as BoardDefinition;

describe('mentions', () => {
  it('turns typed @names into id tokens, longest name first', () => {
    expect(toMentions(def, 'Lee la @Causa probable de @Refinar y los @Pasos.')).toBe(
      'Lee la @[fcause] de @[srefine] y los @[fsteps].',
    );
  });

  it('leaves an @ that names nothing as written', () => {
    expect(toMentions(def, 'Escribe a @nadie')).toBe('Escribe a @nadie');
  });

  it('reads tokens back with the current names, so they follow renames', () => {
    const renamed = { ...def, steps: [{ id: 'srefine', name: 'Pulir' }] } as BoardDefinition;
    expect(mentionText(renamed, 'Parte de @[srefine] y @[fcause].')).toBe(
      'Parte de Pulir y Causa probable.',
    );
  });

  it('splits a text into plain runs and mentions, a removed ref marked as gone', () => {
    expect(mentionSegments(def, 'A @[fcause] y @[gone].')).toEqual([
      { text: 'A ' },
      { ref: 'fcause', name: 'Causa probable' },
      { text: ' y ' },
      { ref: 'gone', name: null },
      { text: '.' },
    ]);
  });

  it('lists what can be mentioned: steps, then parts', () => {
    expect(mentionables(def).map(({ name }) => name)).toEqual([
      'Refinar',
      'Causa probable',
      'Pasos',
    ]);
  });
});
