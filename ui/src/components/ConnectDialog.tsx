import { useApp } from '../app/context.tsx';
import { useWorkspace } from '../app/workspace.ts';
import { t } from '../i18n/i18n.ts';
import { Button } from '../kit/Button.tsx';
import { Dialog } from '../kit/pop/Dialog.tsx';

// Conectar un agente (SPEC §10.4, mock:3517-3519). Opened by openConnect().
export function ConnectDialog() {
  const app = useApp();
  const ws = useWorkspace();
  return (
    <Dialog open={ws.connect} label={t('connect.title')} onClose={app.closeConnect}>
      <h4 data-i="">{t('connect.title')}</h4>
      <p data-i="">{t('connect.body')}</p>
      <code data-i="">{t('connect.command')}</code>
      <div className="dbtns" data-i="">
        <Button variant="primary" onClick={app.closeConnect}>
          {t('connect.done')}
        </Button>
      </div>
    </Dialog>
  );
}
