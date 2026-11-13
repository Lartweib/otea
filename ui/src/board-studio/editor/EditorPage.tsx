import { useEffect, useMemo, useRef, useState } from 'react';
import { SAME, type Selection } from '../../../../src/core/board/model.ts';
import type { BoardRef } from '../../../../src/core/board/problems.ts';
import { fetchProjectSettings } from '../../api.ts';
import { useApp } from '../../app/context.tsx';
import { t, tx } from '../../i18n/i18n.ts';
import { Swap } from '../../kit/Swap.tsx';
import { C } from '../../motion/curves.ts';
import { reduced } from '../../motion/reduced.ts';
import { studioHash } from '../../selection.ts';
import { type BoardSummary, fetchBoards } from '../api.ts';
import { madeWithOf, type PairIds, type PairRole } from '../pair.ts';
import { DiscardDialog, PracticeDialog, PublishDialog } from '../preview/dialogs.tsx';
import { PreviewPane } from '../preview/PreviewPane.tsx';
import { setBoardPrefixes } from '../preview/samples.ts';
import { type DraftOptions, type ReadyDraft, useBoardDraft } from '../use-board-draft.ts';
import { Bar } from './Bar.tsx';
import { Card } from './Card.tsx';
import {
  type Agents,
  cardOf,
  EditorContext,
  type Editor as EditorValue,
  type PairView,
  useEditor,
} from './context.ts';
import { setBoardName } from './edits.ts';
import { boardGlyph, Glyph } from './glyphs.tsx';
import { withDrafts } from './joined.ts';
import { PairDek, PairRoutes, VPair } from './Pair.tsx';
import { Route } from './Route.tsx';
import { sentenceNode } from './SentenceText.tsx';
import { SetupPanel } from './Setup.tsx';
import { plain, summary } from './sentences.ts';
import { setupLeft } from './setup.ts';
import { type PairState, usePair } from './use-pair.ts';
import { VRoute } from './VRoute.tsx';

// The board editor (mock editorHtml): the bar, the name and the sentence that sums the board up,
// the route on the two lanes, the card of the selected stop and, beside it, the preview. Loads the
// draft and says why when it cannot, with Reintentar. A board joined to another by "se divide en"
// opens with that board in one workspace (WORKSPACE.md): both routes, tabs, one history.
export type EditorPageProps = { board: string; canWrite: boolean };

// The other board of a joined pair, from the board's own draft (its split) or the boards that
// divide into it.
function pairOther(
  boards: readonly BoardSummary[],
  id: string,
  draft: ReadyDraft,
): { ids: PairIds; other: string; role: PairRole } | null {
  const split = draft.def.split;
  if (
    split &&
    split.board !== SAME &&
    split.board !== id &&
    boards.some((b) => b.id === split.board)
  )
    return {
      ids: { parent: id, child: split.board, always: split.always },
      other: split.board,
      role: 'parent',
    };
  const parent = boards.find((b) => b.id !== id && b.definition.split?.board === id);
  if (parent)
    return {
      ids: { parent: parent.id, child: id, always: parent.definition.split?.always ?? false },
      other: parent.id,
      role: 'child',
    };
  return null;
}

function useProject(board: string) {
  const app = useApp();
  // An agent Otea has seen is connected; one named on the board but never seen is not.
  const names = (app.agents ?? []).map((a) => a.name).join('\n');
  const agents: Agents = useMemo(
    () => (names ? names.split('\n').map((name) => ({ name, connected: true })) : []),
    [names],
  );
  const [boards, setBoards] = useState<BoardSummary[] | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: read again for each board opened
  useEffect(() => {
    const abort = new AbortController();
    fetchBoards(abort.signal).then(setBoards, () => setBoards([]));
    return () => abort.abort();
  }, [board]);
  // Whether any of the project's repositories has Otea's guard on its pushes (Ajustes ›
  // Repositorios); unknown while it loads or when it cannot be read.
  const [guard, setGuard] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    const abort = new AbortController();
    fetchProjectSettings(abort.signal).then(
      (s) => setGuard(s.paths.some((p) => p.repos.some((r) => r.gate === 'hard'))),
      () => undefined,
    );
    return () => abort.abort();
  }, []);
  // The previews show each board's items by the prefix they already go by (ERRORES-12, not
  // BUG-12): a published board's collection keeps the prefix it was made with.
  const { collectionOf } = app;
  useMemo(() => {
    const prefixes = new Map<string, string>();
    for (const b of boards ?? []) {
      const prefix = b.collection ? collectionOf(b.collection)?.prefix : undefined;
      if (!prefix) continue;
      for (const name of [b.name, b.definition.name]) prefixes.set(name, prefix);
    }
    setBoardPrefixes(prefixes);
  }, [boards, collectionOf]);
  return { agents, boards, guard };
}

function optionsFor(
  id: string,
  agents: Agents,
  boards: readonly BoardSummary[] | null,
  keepHistory: boolean,
): DraftOptions {
  const list = boards ?? [];
  return {
    agents,
    takenNames: list.filter((b) => b.id !== id).map((b) => b.name),
    boards: list.map(
      (b): BoardRef => ({
        id: b.id,
        name: b.name,
        ...(b.definition.split ? { split: b.definition.split } : {}),
      }),
    ),
    keepHistory,
  };
}

function Failed({ draft }: { draft: { message: string; code?: string; retry: () => void } }) {
  return (
    <div className="pane-message se-msg" role="alert">
      <p>
        {draft.code === 'not_found'
          ? t('bs.editor.missing')
          : t('bs.editor.failed', { reason: draft.message })}
      </p>
      <button type="button" className="btn quiet sm" onClick={draft.retry}>
        {t('bs.editor.retry')}
      </button>
    </div>
  );
}

export function EditorPage({ board }: EditorPageProps) {
  const { agents, boards, guard } = useProject(board);
  const twin = boards ? madeWithOf(boards, board)[0] : undefined;
  const options = useMemo(
    () => optionsFor(board, agents, boards, twin !== undefined),
    [board, agents, boards, twin],
  );
  const draft = useBoardDraft(board, options);
  if (draft.status === 'loading' || boards === null)
    return <p className="pane-message se-msg">{t('bs.editor.loading')}</p>;
  if (draft.status === 'failed') return <Failed draft={draft} />;
  const other = pairOther(boards, board, draft);
  if (other)
    return (
      <PairLoader
        key={other.other}
        main={draft}
        other={other}
        agents={agents}
        boards={boards}
        guard={guard}
      />
    );
  return <Editor draft={draft} agents={agents} boards={boards} twin={twin} guard={guard} />;
}

function PairLoader({
  main,
  other,
  agents,
  boards,
  guard,
}: {
  main: ReadyDraft;
  other: { ids: PairIds; other: string; role: PairRole };
  agents: Agents;
  boards: readonly BoardSummary[];
  guard: boolean | undefined;
}) {
  const options = useMemo(
    () => optionsFor(other.other, agents, boards, false),
    [other.other, agents, boards],
  );
  const draft = useBoardDraft(other.other, options);
  if (draft.status === 'loading')
    return <p className="pane-message se-msg">{t('bs.editor.loading')}</p>;
  if (draft.status === 'failed') return <Failed draft={draft} />;
  const parent = other.role === 'parent' ? main : draft;
  const child = other.role === 'parent' ? draft : main;
  return (
    <PairEditor
      ids={other.ids}
      parent={parent}
      child={child}
      first={other.role}
      agents={agents}
      boards={boards}
      guard={guard}
    />
  );
}

function PairEditor({
  ids,
  parent,
  child,
  first,
  agents,
  boards,
  guard,
}: {
  ids: PairIds;
  parent: ReadyDraft;
  child: ReadyDraft;
  first: PairRole;
  agents: Agents;
  boards: readonly BoardSummary[];
  guard: boolean | undefined;
}) {
  const state = usePair(ids, parent, child, first);
  return <Editor draft={state.active} agents={agents} boards={boards} pair={state} guard={guard} />;
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

function kickerText(draft: ReadyDraft, pair: PairView | undefined, twin: BoardSummary | undefined) {
  if (pair) {
    const fresh = !pair.drafts.parent.record.live && !pair.drafts.child.record.live;
    return t(fresh ? 'bs.editor.kicker.pair_new' : 'bs.editor.kicker.pair');
  }
  const base = draft.record.live ? t('bs.editor.kicker.edit') : t('bs.editor.kicker.new');
  return twin
    ? `${base} · ${t('bs.editor.kicker.made_with', { board: twin.definition.name })}`
    : base;
}

function Head() {
  const { draft, pair, twin } = useEditor();
  const def = draft.def;
  const later = useSettled(def);
  const lines = summary(later);
  const text = lines.map(plain).join(' ');
  const note = draft.record.draft?.agentNote;
  const setup = pair?.setup && !pair.setup.hidden;
  return (
    <header className={setup ? 'se-head withsetup' : 'se-head'}>
      <p className="kicker">
        <b>{t('bs.editor.kicker.studio')}</b> · {kickerText(draft, pair, twin)}
      </p>
      <div className="se-nameline">
        <Swap as="span" k={pair ? draft.record.id : 'one'}>
          <input
            className="se-bigname"
            value={def.name}
            size={Math.max(4, def.name.length + 1)}
            maxLength={40}
            aria-label={t('bs.editor.name.label')}
            onChange={(e) => draft.mutate((d) => setBoardName(d, e.target.value), 'board:name')}
            onBlur={() => draft.endBurst()}
          />
        </Swap>
      </div>
      {pair ? (
        <PairDek />
      ) : (
        <Swap as="div" className="dek se-dek" k={text}>
          {lines.map((s, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: the sentences of one summary, in order
            <span key={i}>
              {i ? ' ' : ''}
              {sentenceNode(s)}
            </span>
          ))}
        </Swap>
      )}
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
      <SetupPanel />
    </header>
  );
}

// On a wide screen the pair is tall: keep the selected route and the top of its card in view
// together (mock bringPair).
function bringPair(role: PairRole) {
  if (window.matchMedia('(max-width: 760px)').matches) return;
  const block = document.querySelector<HTMLElement>(`.se-rblock[data-rb="${role}"]`);
  const card = document.querySelector<HTMLElement>('.se-card');
  const bar = document.querySelector<HTMLElement>('.se-bar');
  if (!block || !card) return;
  let scroller: HTMLElement | null = block.parentElement;
  while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY))
    scroller = scroller.parentElement;
  if (!scroller) return;
  const top = (bar ? bar.getBoundingClientRect().bottom : 70) + 10;
  const br = block.getBoundingClientRect();
  const cr = card.getBoundingClientRect();
  if (br.top >= top - 2 && cr.top <= window.innerHeight * 0.78) return;
  const dy = br.top - top;
  if (Math.abs(dy) < 8) return;
  scroller.scrollBy({ top: dy, behavior: reduced() ? 'auto' : 'smooth' });
}

function flash(el: Element | null) {
  if (!el) return;
  if (el.classList.contains('se-hrow')) {
    el.classList.remove('flash');
    void (el as HTMLElement).offsetWidth;
    el.classList.add('flash');
    return;
  }
  if (reduced()) return;
  el.animate([{ boxShadow: '0 0 0 4px var(--you-wash)' }, { boxShadow: '0 0 0 0 transparent' }], {
    duration: 1400,
    easing: C.drift,
  });
}

function Editor({
  draft,
  agents,
  boards,
  twin,
  pair: state,
  guard,
}: {
  draft: ReadyDraft;
  agents: Agents;
  boards: readonly BoardSummary[];
  twin?: BoardSummary | undefined;
  pair?: PairState;
  guard: boolean | undefined;
}) {
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
    if (sel.kind === 'part') setOpenRow(sel.id);
  }, [sel]);
  const role = state?.role;
  // Switching board in place: its stop's card draws in, the pair stays in view.
  // Not on opening: the head and its checklist come first.
  const shownRole = useRef(role);
  useEffect(() => {
    if (!role || shownRole.current === role) return;
    shownRole.current = role;
    window.requestAnimationFrame(() => bringPair(role));
  }, [role]);

  const pair: PairView | undefined = useMemo(() => {
    if (!state) return undefined;
    const setup = state.setup;
    const go = (sel: Selection, target: () => Element | null) => {
      window.setTimeout(() => {
        const el = target();
        (el ?? document.querySelector('.se-card'))?.scrollIntoView({
          behavior: reduced() ? 'auto' : 'smooth',
          block: 'center',
        });
        flash(el);
      }, 90);
      void sel;
    };
    return {
      ids: state.workspace.ids,
      role: state.role,
      drafts: state.drafts,
      switchTo: state.switchTo,
      setup: setup
        ? {
            ...setup,
            go: (k: string) => {
              const row = setup.rows.find((r) => r.k === k);
              if (!row) return;
              state.switchTo(row.role, row.sel);
              const at = row.row;
              if (at === null) {
                setOpenRow(null);
                go(row.sel, () => document.querySelector('.se-card .se-who .se-blank'));
              } else {
                setOpenRow(at);
                go(row.sel, () =>
                  document.querySelector(`.se-card .se-hrow[data-row="${CSS.escape(at)}"]`),
                );
              }
            },
            goError: (index: number) => {
              const e = setup.errors[index];
              if (!e) return;
              state.switchTo(e.role);
              state.drafts[e.role].reveal(e.problem.at);
            },
          }
        : null,
    };
  }, [state]);

  const live = useMemo(
    () =>
      withDrafts(
        boards,
        state
          ? (['parent', 'child'] as const).map((r) => ({
              id: state.drafts[r].record.id,
              def: state.drafts[r].def,
              live: state.drafts[r].record.live !== null,
            }))
          : [{ id: draft.record.id, def: draft.def, live: draft.record.live !== null }],
      ),
    [boards, state, draft.record, draft.def],
  );
  const editor: EditorValue = useMemo(
    () => ({
      draft,
      agents,
      openRow,
      setOpenRow,
      dialogs,
      boards: live,
      ...(pair ? { pair } : {}),
      ...(twin ? { twin } : {}),
      guardInstalled: guard,
    }),
    [draft, agents, openRow, dialogs, live, pair, twin, guard],
  );
  const def = draft.def;
  const card = cardOf(def, sel);
  const close = () => setDialog(null);
  return (
    <EditorContext.Provider value={editor}>
      <div className={pair ? 'se paired' : 'se'} data-card={card.kind}>
        <Bar />
        <Head />
        <section className="se-canvas" aria-label={t('bs.editor.route.label', { board: def.name })}>
          {pair ? (
            <>
              <PairRoutes />
              <VPair />
            </>
          ) : (
            <>
              <Route />
              <VRoute />
            </>
          )}
          <Ends />
        </section>
        <div className="se-grid">
          <Card />
          <section className="se-pv">
            <PreviewPane draft={draft} {...(state ? { pair: state.workspace } : {})} />
          </section>
        </div>
      </div>
      <PublishDialog
        {...(state ? { pair: state.workspace, setupLeft: setupLeft(state.setup) } : {})}
        draft={draft}
        open={dialog === 'publish'}
        onClose={close}
        onPublished={() => draft.reload()}
      />
      <DiscardDialog
        {...(state ? { pair: state.workspace } : {})}
        draft={draft}
        open={dialog === 'discard'}
        onClose={close}
        onDiscarded={({ deleted }) => {
          if (deleted) window.location.hash = studioHash({ kind: 'boards' });
          else draft.reload();
        }}
      />
      <PracticeDialog
        draft={draft}
        {...(state ? { pair: state.workspace } : {})}
        open={dialog === 'practice'}
        onClose={close}
      />
    </EditorContext.Provider>
  );
}

// The two ends under the canvas, for the board on screen.
function Ends() {
  const { draft, setOpenRow, pair } = useEditor();
  const def = draft.def;
  const card = cardOf(def, draft.selection);
  return (
    <div className="se-ends">
      <button
        type="button"
        className={card.kind === 'about' ? 'se-endbtn on' : 'se-endbtn'}
        onClick={() => {
          setOpenRow(null);
          draft.select({ kind: 'about' });
        }}
      >
        <Glyph name={boardGlyph(def.icon)} />
        {pair ? t('bs.editor.ends.about_of', { board: def.name }) : t('bs.editor.ends.about')}
      </button>
      <span className="se-hint">
        {tx(pair ? 'bs.editor.ends.hint_pair' : 'bs.editor.ends.hint', { plus: <b>+</b> })}
      </span>
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
  );
}
