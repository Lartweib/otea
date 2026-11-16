import { useState } from 'react';
import { useApp } from '../app/context.tsx';
import { useWorkspace } from '../app/workspace.ts';
import { t, tx } from '../i18n/i18n.ts';
import { Button } from '../kit/Button.tsx';
import { Dialog } from '../kit/pop/Dialog.tsx';
import { CopyGlyph } from './CopyCommand.tsx';

// Copies a text, and says so for a moment.
function useCopy(text: string): [boolean, () => void] {
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
function withCode(text: string) {
  return text.split('`').map((part, index) =>
    index % 2 === 1 ? (
      <code key={part} className="inl">
        {part}
      </code>
    ) : (
      part
    ),
  );
}

// Conectar un agente (SPEC §10.4): the command that connects an agent once per project, as text to
// copy, and the instruction to paste each session so it works the queue until the person stops it
// (agents did one item and ended without it). Opened by openConnect(), from the agents menu, the
// agents column and an empty board.
export function ConnectDialog() {
  const app = useApp();
  const ws = useWorkspace();
  const command = t('connect.command');
  const prompt = t('connect.prompt');
  const [commandCopied, copyCommand] = useCopy(command);
  const [promptCopied, copyPrompt] = useCopy(prompt);
  return (
    <Dialog
      open={ws.connect}
      label={t('connect.title')}
      onClose={app.closeConnect}
      size="md"
      className="connect"
    >
      <h4 data-i="">{t('connect.title')}</h4>
      <p data-i="">{t('connect.body')}</p>
      <ol className="csteps" data-i="">
        <li>
          <span className="cstep">{t('connect.setup')}</span>
          <div className="ccode">
            <code>{command}</code>
            <button
              type="button"
              className="pj-copy"
              data-tip={commandCopied ? t('settings.copied') : t('settings.copyCommand')}
              aria-label={t('settings.copyCommand')}
              onClick={copyCommand}
            >
              <CopyGlyph />
            </button>
          </div>
          <span className="cnote">
            {tx('connect.others', { command: <code className="inl">otea init --agents-md</code> })}
          </span>
        </li>
        <li>
          <span className="cstep">{t('connect.session')}</span>
          <blockquote className="cprompt">{withCode(prompt)}</blockquote>
          <Button variant="quiet" onClick={copyPrompt}>
            <CopyGlyph />
            {promptCopied ? t('connect.copiedPrompt') : t('connect.copyPrompt')}
          </Button>
        </li>
      </ol>
      <p className="cnote" data-i="">
        {t('connect.appears')}
      </p>
      <div className="dbtns" data-i="">
        <Button variant="primary" onClick={app.closeConnect}>
          {t('connect.done')}
        </Button>
      </div>
    </Dialog>
  );
}
