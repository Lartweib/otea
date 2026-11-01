import { agentHue, initialsOf } from '../agent-mark.ts';

type AgentMarkProps = {
  name: string;
  className?: string;
  // Hidden from assistive tech when the name is written next to it.
  decorative?: boolean;
};

// An agent's initials on a small chip, tinted with the hue its name always gets.
export function AgentMark({ name, className, decorative = false }: AgentMarkProps) {
  return (
    <span
      className={className ? `agent-mark ${className}` : 'agent-mark'}
      data-hue={agentHue(name)}
      title={decorative ? undefined : name}
      aria-hidden={decorative || undefined}
    >
      {initialsOf(name)}
    </span>
  );
}
