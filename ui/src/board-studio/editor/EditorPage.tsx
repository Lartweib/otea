import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../app/context.tsx';
import { t, tx } from '../../i18n/i18n.ts';
import { Swap } from '../../kit/Swap.tsx';
import { studioHash } from '../../selection.ts';
import { fetchBoards } from '../api.ts';
import { DiscardDialog, PracticeDialog, PublishDialog } from '../preview/dialogs.tsx';
import { PreviewPane } from '../preview/PreviewPane.tsx';
import { type ReadyDraft, useBoardDraft } from '../use-board-draft.ts';
import { Bar } from './Bar.tsx';
import { Card } from './Card.tsx';
import { type Agents, cardOf, EditorContext, useEditor } from './context.ts';
import { setBoardName } from './edits.ts';
import { Glyph } from './glyphs.tsx';
import { Route } from './Route.tsx';
import { sentenceNode } from './SentenceText.tsx';
import { plain, summary } from './sentences.ts';
import { VRoute } from './VRoute.tsx';

// The board editor (mock editorHtml): the bar, the name and the sentence that sums the board up,
// the route on the two lanes, the card of the selected stop and, beside it, the preview. Loads the
// draft and says why when it cannot, with Reintentar.
export type EditorPageProps = { board: string; canWrite: boolean };

export function EditorPage({ board }: EditorPageProps) {
  const app = useApp();
  // An agent Otea has seen is connected; one named on the board but never seen is not.
  const names = (app.agents ?? []).map((a) => a.name).join('\n');
  const agents: Agents = useMemo(
    () => (names ? names.split('\n').map((name) => ({ name, connected: true })) : []),
    [names],
  );
  const [taken, setTaken] = useState<readonly string[]>([]);
  useEffect(() => {
    const abort = new AbortController();
    fetchBoards(abort.signal).then(
      (boards) => setTaken(boards.filter((b) => b.id !== board).map((b) => b.name)),
      () => undefined,
    );
    return () => abort.abort();
  }, [board]);
  const options = useMemo(() => ({ agents, takenNames: taken }), [agents, taken]);
  const draft = useBoardDraft(board, options);
  if (draft.status === 'loading')
    return <p className="pane-message se-msg">{t('bs.editor.loading')}</p>;
  if (draft.status === 'failed')
    return (
      <div className="pane-message se-msg" role="alert">
        <p>{t('bs.editor.failed', { reason: draft.message })}</p>
        <button type="button" className="btn quiet sm" onClick={draft.retry}>
          {t('bs.editor.retry')}
        </button>
      </div>
    );
  return <Editor draft={draft} agents={agents} />;
}

// The summary follows the edits a moment later, so typing a name does not shimmer it on every key.
function useSettled<T>(value: T, ms = 260): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), ms);
    return () => window.clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

function Head() {
  const { draft } = useEditor();
  const def = draft.def;
  const later = useSettled(def);
  const lines = summary(later);
  const text = lines.map(plain).join(' ');
  const note = draft.record.draft?.agentNote;
  return (
    <header className="se-head">
      <p className="kicker">
        <b>{t('bs.editor.kicker.studio')}</b> ·{' '}
        {draft.record.live ? t('bs.editor.kicker.edit') : t('bs.editor.kicker.new')}
      </p>
      <div className="se-nameline">
        <input
          className="se-bigname"
          value={def.name}
          size={Math.max(4, def.name.length + 1)}
          maxLength={40}
          aria-label={t('bs.editor.name.label')}
          onChange={(e) => draft.mutate((d) => setBoardName(d, e.target.value), 'board:name')}
          onBlur={() => draft.endBurst()}
        />
      </div>
      <Swap as="div" className="dek se-dek" k={text}>
        {lines.map((s, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: the sentences of one summary, in order
          <span key={i}>
            {i ? ' ' : ''}
            {sentenceNode(s)}
          </span>
        ))}
      </Swap>
      {note ? (
        <div className="se-agentdraft">
          <p>{t('bs.editor.agentnote')}</p>
          {note.length ? (
            <ul>
              {note.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </header>
  );
}

function Editor({ draft, agents }: { draft: ReadyDraft; agents: Agents }) {
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'practice' | 'publish' | 'discard' | null>(null);
  const dialogs = useMemo(
    () => ({
      practice: () => setDialog('practice'),
      publish: () => setDialog('publish'),
      discard: () => setDialog('discard'),
    }),
    [],
  );
  // A selection of a part opens its row.
  const sel = draft.selection;
  useEffect(() => {
    if (sel.kind === 'part') setOpenRow(null);
  }, [sel]);
  const editor = useMemo(
    () => ({ draft, agents, openRow, setOpenRow, dialogs }),
    [draft, agents, openRow, dialogs],
  );
  const def = draft.def;
  const card = cardOf(def, sel);
  const close = () => setDialog(null);
  return (
    <EditorContext.Provider value={editor}>
      <div className="se" data-card={card.kind}>
        <Bar />
        <Head />
        <section className="se-canvas" aria-label={t('bs.editor.route.label', { board: def.name })}>
          <Route />
          <VRoute />
          <div className="se-ends">
            <button
              type="button"
              className={card.kind === 'about' ? 'se-endbtn on' : 'se-endbtn'}
              onClick={() => {
                setOpenRow(null);
                draft.select({ kind: 'about' });
              }}
            >
              <Glyph name="board" />
              {t('bs.editor.ends.about')}
            </button>
            <span className="se-hint">{tx('bs.editor.ends.hint', { plus: <b>+</b> })}</span>
            <button
              type="button"
              className={card.kind === 'anytime' ? 'se-endbtn on' : 'se-endbtn'}
              onClick={() => {
                setOpenRow(null);
                draft.select({ kind: 'anytime' });
              }}
            >
              {t('bs.editor.ends.anytime')}
              <span className="n">{def.anytime.length}</span>
            </button>
          </div>
        </section>
        <div className="se-grid">
          <Card />
          <section className="se-pv">
            <PreviewPane draft={draft} />
          </section>
        </div>
      </div>
      <PublishDialog
        draft={draft}
        open={dialog === 'publish'}
        onClose={close}
        onPublished={() => draft.reload()}
      />
      <DiscardDialog
        draft={draft}
        open={dialog === 'discard'}
        onClose={close}
        onDiscarded={({ deleted }) => {
          if (deleted) window.location.hash = studioHash({ kind: 'boards' });
          else draft.reload();
        }}
      />
      <PracticeDialog draft={draft} open={dialog === 'practice'} onClose={close} />
    </EditorContext.Provider>
  );
}
