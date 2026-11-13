import type { AgentProfile } from '../presence.ts';

// A profile as every surface writes it (agents mock §5): the model and the effort in grey mono,
// after the agent's name in its usual letter; in parentheses where a round names who did it.
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
      {profile.model} <i>·</i> {profile.effort}
      {paren ? ')' : null}
    </>
  );
  return small ? <small className="prof">{words}</small> : <span className="prof">{words}</span>;
}
