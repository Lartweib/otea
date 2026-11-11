import { t } from '../../i18n/i18n.ts';

// Studio's home (home slice): your boards with their small route, the three ways to start, the
// templates, and the dialogs that create a board. A stub until the home slice builds it.
export type StudioHomeProps = { canWrite: boolean };

export function StudioHome(_props: StudioHomeProps) {
  return (
    <main className="pane-message">
      <h1>{t('bs.home.title')}</h1>
      <p className="t-small">{t('bs.home.soon')}</p>
    </main>
  );
}
