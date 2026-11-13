import { type BoardDefinition, stepIndex } from '../../../../src/core/board/model.ts';
import { t } from '../../i18n/i18n.ts';

// The card's Mover menu: each choice names the step it moves before or after, so it reads as a
// change of order on the route, not as a way to go to the previous or next card.

export type ReorderChoice = { dir: -1 | 1; text: string };

const named = (name: string | undefined) => name?.trim() || t('bs.editor.unnamed');

export function reorderChoices(def: BoardDefinition, id: string): ReorderChoice[] {
  const i = stepIndex(def, id);
  if (i < 0) return [];
  const before = def.steps[i - 1];
  const after = def.steps[i + 1];
  return [
    ...(before
      ? [{ dir: -1 as const, text: t('bs.editor.card.earlier', { step: named(before.name) }) }]
      : []),
    ...(after
      ? [{ dir: 1 as const, text: t('bs.editor.card.later', { step: named(after.name) }) }]
      : []),
  ];
}
