import { isUnknown } from '../../src/core/profile.ts';
import { t } from './i18n/i18n.ts';

// A declared model or effort as every surface writes it: as the agent declared it, or plainly "not
// declared" when the agent could not read it (src/core/profile.ts).
export const profileValue = (value: string) => (isUnknown(value) ? t('agent.notDeclared') : value);

export const profilePair = (model: string, effort: string) =>
  `${profileValue(model)} · ${profileValue(effort)}`;
