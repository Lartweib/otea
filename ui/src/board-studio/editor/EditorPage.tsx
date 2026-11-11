import { useMemo } from 'react';
import { t } from '../../i18n/i18n.ts';
import { PreviewPane } from '../preview/PreviewPane.tsx';
import { useBoardDraft } from '../use-board-draft.ts';

// The board editor (editor slice): the name and summary, the route on the lanes, the card of the
// selection, the bar with the draft chip, Deshacer, Descartar, Probar and Publicar, and the preview
// pane beside it. A stub until the slice builds it: it already loads the draft and says why when it
// cannot.
export type EditorPageProps = { board: string; canWrite: boolean };

export function EditorPage({ board }: EditorPageProps) {
  const options = useMemo(() => ({ agents: [], takenNames: [] }), []);
  const draft = useBoardDraft(board, options);
  if (draft.status === 'loading') return <p className="pane-message">{t('bs.editor.loading')}</p>;
  if (draft.status === 'failed')
    return (
      <div className="pane-message">
        <p>{t('bs.editor.failed', { reason: draft.message })}</p>
        <button type="button" className="btn" onClick={draft.retry}>
          {t('bs.editor.retry')}
        </button>
      </div>
    );
  return (
    <main className="pane-message">
      <h1>{draft.def.name}</h1>
      <PreviewPane draft={draft} />
    </main>
  );
}
