import { isUnknown } from '../../src/core/profile.ts';
import { t } from './i18n/i18n.ts';

// A declared model or effort as every surface writes it: as the agent declared it, or plainly
// "unknown" (desconocido) when the agent said it could not read it (src/core/profile.ts).
export const profileValue = (value: string) => (isUnknown(value) ? t('agent.unknown') : value);

export const profilePair = (model: string, effort: string) =>
  isUnknown(model) && isUnknown(effort)
    ? t('agent.unknown')
    : `${profileValue(model)} · ${profileValue(effort)}`;
