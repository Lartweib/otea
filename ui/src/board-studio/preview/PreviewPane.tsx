import { t } from '../../i18n/i18n.ts';
import type { ReadyDraft } from '../use-board-draft.ts';

// The editor's preview pane (preview slice): Lo que ves (with Acomodar), Lo que lee el agente and
// El tablero, drawn with the new design's item page and list rows. A stub until the slice builds it.
export type PreviewPaneProps = { draft: ReadyDraft };

export function PreviewPane(_props: PreviewPaneProps) {
  return (
    <ul className="t-small">
      <li>{t('bs.preview.see')}</li>
      <li>{t('bs.preview.agent')}</li>
      <li>{t('bs.preview.board')}</li>
    </ul>
  );
}
