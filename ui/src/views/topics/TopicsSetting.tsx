import { useState } from 'react';
import { switchTopics } from '../../api.ts';
import { t } from '../../i18n/i18n.ts';
import { Button, toast } from '../../kit/index.ts';
import { useTopics } from './use-topics.ts';

// Configuración's switch for side topics: off until the person turns them on; the agent guide
// mentions them only while they are on.
export function TopicsSetting({ canWrite }: { canWrite: boolean }) {
  const view = useTopics();
  const [on, setOn] = useState<boolean>();
  const shown = on ?? view?.on ?? false;
  const flip = () =>
    switchTopics(!shown).then(
      (next) => setOn(next.on),
      (error: unknown) => toast({ msg: error instanceof Error ? error.message : String(error) }),
    );
  return (
    <div className="tp-setting">
      <p className="pj-hint">{t('topics.settings.text')}</p>
      <p className="pj-hint" data-on={shown ? '' : undefined}>
        {shown ? t('topics.settings.on') : t('topics.settings.off')}
      </p>
      {shown ? <p className="pj-hint">{t('topics.settings.auto')}</p> : null}
      {canWrite ? (
        <Button size="sm" variant={shown ? 'quiet' : 'primary'} onClick={flip} aria-pressed={shown}>
          {shown ? t('topics.settings.turnOff') : t('topics.settings.turnOn')}
        </Button>
      ) : null}
    </div>
  );
}
