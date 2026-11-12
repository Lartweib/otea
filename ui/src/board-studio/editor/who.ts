import { type Doer, isAgent, type Reviewer } from '../../../../src/core/board/model.ts';
import { t } from '../../i18n/i18n.ts';

// Who, as the route and the card's blanks say it: "tú", "cualquier agente", "nadie", or the agent.
export function whoWord(who: Doer | Reviewer): string {
  if (isAgent(who)) return who.agent;
  if (who === 'you') return t('bs.editor.who.you');
  if (who === 'any') return t('bs.editor.who.any');
  return t('bs.editor.who.none');
}

// The same word starting a sentence: "Cualquier agente", "Tú".
export function whoTitle(who: Doer | Reviewer): string {
  const word = whoWord(who);
  return isAgent(who) ? word : word.charAt(0).toLocaleUpperCase() + word.slice(1);
}
