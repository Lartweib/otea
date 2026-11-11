import { useState } from 'react';
import { useApp } from '../app/context.tsx';
import { useWorkspace } from '../app/workspace.ts';
import { t } from '../i18n/i18n.ts';
import { Button } from '../kit/Button.tsx';
import { Dialog } from '../kit/pop/Dialog.tsx';
import { CopyGlyph } from './CopyCommand.tsx';

// Conectar un agente (SPEC §10.4, mock:3517-3519): what to add to an agent's configuration, as a
// command to copy, then Hecho. Opened by openConnect(), from the agents menu, the agents column and
// an empty board.
export function ConnectDialog() {
  const app = useApp();
  const ws = useWorkspace();
  const [copied, setCopied] = useState(false);
  const command = t('connect.command');
  const copy = () => {
    navigator.clipboard?.writeText(command).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1400);
      },
      () => undefined,
    );
  };
  return (
    <Dialog open={ws.connect} label={t('connect.title')} onClose={app.closeConnect}>
      <h4 data-i="">{t('connect.title')}</h4>
      <p data-i="">{t('connect.body')}</p>
      <div className="ccode" data-i="">
        <code>{command}</code>
        <button
          type="button"
          className="pj-copy"
          data-tip={copied ? t('settings.copied') : t('settings.copyCommand')}
          aria-label={t('settings.copyCommand')}
          onClick={copy}
        >
          <CopyGlyph />
        </button>
      </div>
      <div className="dbtns" data-i="">
        <Button variant="primary" onClick={app.closeConnect}>
          {t('connect.done')}
        </Button>
      </div>
    </Dialog>
  );
}
