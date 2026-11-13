import type { Doer, Reviewer } from '../../../../src/core/board/model.ts';
import { t } from '../../i18n/i18n.ts';

// Who, as the route and the card's blanks say it: "tú", "cualquier agente", "nadie". A step any
// agent reviews is reviewed by another agent than the one that did it: "otro agente".
export function whoWord(who: Doer | Reviewer, role: 'doer' | 'reviewer' = 'doer'): string {
  if (who === 'you') return t('bs.editor.who.you');
  if (who === 'any')
    return role === 'reviewer' ? t('bs.editor.who.another') : t('bs.editor.who.any');
  return t('bs.editor.who.none');
}

// The same word starting a sentence: "Cualquier agente", "Tú".
export function whoTitle(who: Doer | Reviewer, role: 'doer' | 'reviewer' = 'doer'): string {
  const word = whoWord(who, role);
  return word.charAt(0).toLocaleUpperCase() + word.slice(1);
}
