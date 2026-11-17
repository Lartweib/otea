import { isUnknown } from '../../../src/core/profile.ts';
import { t } from '../i18n/i18n.ts';
import type { AgentProfile } from '../presence.ts';
import { profileValue } from '../profile-words.ts';

// A profile as every surface writes it (agents mock §5): the model and the effort in grey mono,
// after the agent's name in its usual letter; in parentheses where a round names who did it. A
// profile the agent could read none of says so once.
export function Prof({
  profile,
  paren = false,
  small = false,
}: {
  profile: Pick<AgentProfile, 'model' | 'effort'>;
  paren?: boolean;
  small?: boolean;
}) {
  const words = (
    <>
      {paren ? '(' : null}
      {isUnknown(profile.model) && isUnknown(profile.effort) ? (
        t('agent.notDeclared')
      ) : (
        <>
          {profileValue(profile.model)} <i>·</i> {profileValue(profile.effort)}
        </>
      )}
      {paren ? ')' : null}
    </>
  );
  return small ? <small className="prof">{words}</small> : <span className="prof">{words}</span>;
}
