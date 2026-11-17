import { useCallback, useState } from 'react';
import { type AgentPromptView, fetchAgentPrompt } from '../api.ts';
import { useRemote } from '../hooks.ts';
import { language, t } from '../i18n/i18n.ts';
import { Button } from '../kit/Button.tsx';
import type { Remote } from '../remote.ts';
import { CopyGlyph } from './CopyCommand.tsx';

// Copies a text, and says so for a moment.
export function useCopy(text: string): [boolean, () => void] {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1400);
      },
      () => undefined,
    );
  };
  return [copied, copy];
}

// The instruction as the agent gets it, its `commands` set as code (copied as written).
export function withCode(text: string) {
  return text.split('`').map((part, index) =>
    index % 2 === 1 ? (
      // biome-ignore lint/suspicious/noArrayIndexKey: the parts never move
      <code key={index} className="inl">
        {part}
      </code>
    ) : (
      part
    ),
  );
}

// The prompt the server writes for this project and this screen's language, read again when the
// project changes (`version`): who listens and what waits move.
export function useAgentPrompt(
  kind: AgentPromptView['kind'] | undefined,
  version: number,
): Remote<AgentPromptView> {
  const lang = language();
  const load = useCallback(
    (signal: AbortSignal) => fetchAgentPrompt(kind, lang, signal),
    [kind, lang],
  );
  return useRemote(load, version, 'live');
}

// What to paste into the agent's chat, one numbered line per paragraph, and the button that copies
// it whole. `primary` when it is the first thing to do on the page.
export function PromptBlock({ prompt, primary = false }: { prompt: string; primary?: boolean }) {
  const [copied, copy] = useCopy(prompt);
  return (
    <div className="cprompt-wrap">
      <blockquote className="cprompt">
        {prompt.split('\n').map((line) => (
          <p key={line}>{withCode(line)}</p>
        ))}
      </blockquote>
      <Button variant={primary ? 'primary' : 'quiet'} onClick={copy}>
        <CopyGlyph />
        {copied ? t('connect.copiedPrompt') : t('connect.copyPrompt')}
      </Button>
    </div>
  );
}
