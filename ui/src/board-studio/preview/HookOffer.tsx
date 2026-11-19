import { useEffect, useState } from 'react';
import { fetchProjectSettings, installGitHook } from '../../api.ts';
import { tx } from '../../i18n/i18n.ts';
import { Checkbox } from '../../kit/Marks.tsx';
import type { ProjectSettings } from '../../types.ts';
import { hookResultText } from './publish.ts';
import { failedText } from './toasts.tsx';

// Publicar's offer of Otea's pre-push hook (P2S-R3-1): a board that protects a branch refuses a
// push before the review only where git asks Otea, so the dialog offers to write the hook in the
// repos without it, ticked, naming them and the command; the person sees it before anything is
// written, and unticks it to keep their repos as they are.

// The project's settings, read again each time the dialog opens (the hook may be in place since).
export function useProjectSettings(open: boolean): ProjectSettings | null {
  const [settings, setSettings] = useState<ProjectSettings | null>(null);
  useEffect(() => {
    if (!open) return;
    const abort = new AbortController();
    fetchProjectSettings(abort.signal).then(setSettings, () => setSettings(null));
    return () => abort.abort();
  }, [open]);
  return settings;
}

export function HookOffer({
  repos,
  checked,
  onChange,
}: {
  repos: readonly string[];
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  if (repos.length === 0) return null;
  return (
    <label className="bsp-request" htmlFor="bsp-git-hook" data-i="">
      <Checkbox id="bsp-git-hook" checked={checked} onChange={onChange} />
      <span>
        {tx('bs.preview.publish.hook', { repos: <b>{repos.join(', ')}</b> })}{' '}
        <code className="bsp-cmd">otea hook install --git</code>
      </span>
    </label>
  );
}

// Writes the hook and says what happened, for the publish toast; a failure says the server's
// reason, never swallowed.
export async function writeGitHook(): Promise<string> {
  try {
    return hookResultText(await installGitHook());
  } catch (error) {
    return failedText(error instanceof Error ? error.message : String(error));
  }
}
