import { type ReactNode, useRef } from 'react';
import { useApp } from '../../app/context.tsx';
import { language, t, tx } from '../../i18n/i18n.ts';
import { Button } from '../../kit/Button.tsx';
import { Count } from '../../kit/Count.tsx';
import { Icon } from '../../kit/Icon.tsx';
import { NodeGlyph } from '../../lanes/NodeGlyph.tsx';
import { reduced } from '../../motion/reduced.ts';
import { studioHash } from '../../selection.ts';
import { RowIcon } from '../../shell/Rail.tsx';
import { boardIcon } from '../../shell/rail-model.ts';
import type { BoardSummary, TemplateView } from '../api.ts';
import { loadBoards, useBoards } from './boards-store.ts';
import {
  type BlockJoin,
  type BoardStatusView,
  blockJoins,
  type HomeJoin,
  homeRows,
  joinsMap,
  setBoards,
  statusOf,
} from './home-model.ts';
import { MiniRoute } from './MiniRoute.tsx';
import { setupLeftOf } from './setup-left.ts';
import { drafterOf, openAgentDraft, openNewBoard, useTemplates } from './studio-dialogs.ts';
import { useEntrance } from './use-entrance.ts';

// Studio's home (the mock's studioHtml): your boards with their small route and status, the three
// ways to start one, and the templates. Loading and failure say why, with Reintentar.
export type StudioHomeProps = { canWrite: boolean };

const editorOf = (id: string) => studioHash({ kind: 'board', board: id });

export function StudioHome({ canWrite }: StudioHomeProps) {
  const app = useApp();
  const boards = useBoards(app.version);
  const templates = useTemplates(language());
  const root = useRef<HTMLDivElement>(null);
  useEntrance(root);
  const tpls = templates.state.status === 'ready' ? templates.state.templates : [];
  const own = boards.status === 'ready' ? boards.boards : [];

  return (
    <div className="sh" ref={root}>
      <header className="vhead">
        <p className="kicker" data-e="in">
          <b>{app.project?.name ?? ''}</b> · {t('bs.home.title')}
        </p>
        <h1 className="display" data-e="in">
          {t('bs.home.title')}
        </h1>
        <p className="dek" data-e="in">
          {t('bs.home.dek')} <em>{t('bs.home.dekEm')}</em>
        </p>
      </header>

      <Sec title={t('bs.home.yours')} count={boards.status === 'ready' ? own.length : undefined} />
      <JoinsMap joins={joinsMap(own)} blocks={blockJoins(own, app.all)} />
      <div className="brows">
        {boards.status === 'loading' ? (
          <p className="sh-note" data-e="in">
            {t('bs.home.loading')}
          </p>
        ) : boards.status === 'failed' ? (
          <Failed
            text={t('bs.home.failed', { reason: boards.message })}
            onRetry={() => loadBoards(app.version, true)}
          />
        ) : own.length === 0 ? (
          <p className="sh-note" data-e="in">
            {t('bs.home.none')}
          </p>
        ) : (
          homeRows(own).map((row) =>
            row.kind === 'pair' ? (
              <PairRow key={row.parent.id} parent={row.parent} child={row.child} />
            ) : (
              <BoardRow key={row.board.id} board={row.board} madeWith={row.madeWith} />
            ),
          )
        )}
      </div>

      {canWrite ? (
        <>
          <Sec title={t('bs.home.start')} gloss={t('bs.home.startGloss')} spaced />
          <div className="starts">
            <Plate
              icon={<Icon name="plus" />}
              title={t('bs.home.blank')}
              text={t('bs.home.blankText')}
              note={t('bs.home.blankKey')}
              onClick={() => openNewBoard(null)}
            />
            <Plate
              icon={<Icon name="board" />}
              title={t('bs.home.fromTemplate')}
              text={t('bs.home.fromTemplateText')}
              note={t('bs.home.templateCount', { count: tpls.length })}
              onClick={() =>
                root.current
                  ?.querySelector('#sh-templates')
                  ?.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' })
              }
            />
            <Plate
              icon={<Icon name="inbox" />}
              title={t('bs.home.agentDraft')}
              text={t('bs.home.agentDraftText')}
              note={t('bs.home.agentDraftKey')}
              onClick={openAgentDraft}
            />
          </div>
        </>
      ) : (
        <p className="sh-note" data-e="in">
          {tx('bs.home.readOnly', { command: <code>otea open</code> })}
        </p>
      )}

      <Sec
        id="sh-templates"
        title={t('bs.home.templates')}
        count={templates.state.status === 'ready' ? tpls.length : undefined}
        gloss={t('bs.home.templatesGloss')}
        spaced
      />
      <div className="brows">
        {templates.state.status === 'loading' ? (
          <p className="sh-note" data-e="in">
            {t('bs.home.loading')}
          </p>
        ) : templates.state.status === 'failed' ? (
          <Failed
            text={t('bs.home.templatesFailed', { reason: templates.state.message })}
            onRetry={templates.retry}
          />
        ) : (
          tpls.map((x) => <TemplateRow key={x.key} template={x} canWrite={canWrite} />)
        )}
      </div>
    </div>
  );
}

function Sec(p: {
  id?: string;
  title: string;
  count?: number | undefined;
  gloss?: string;
  spaced?: boolean;
}) {
  return (
    <div className={p.spaced ? 'sec spaced' : 'sec'} id={p.id}>
      <h2 data-e="in">{p.title}</h2>
      {p.count === undefined ? null : <Count value={p.count} />}
      {p.gloss ? <span className="gloss">{p.gloss}</span> : null}
      <span className="rl" data-e="line" />
    </div>
  );
}

function Failed({ text, onRetry }: { text: string; onRetry: () => void }) {
  return (
    <div className="sh-failed" data-e="in" role="alert">
      <p>{text}</p>
      <Button variant="quiet" size="sm" onClick={onRetry}>
        {t('bs.home.retry')}
      </Button>
    </div>
  );
}

function Plate(p: {
  icon: ReactNode;
  title: string;
  text: string;
  note: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className="plate" data-e="surf" onClick={p.onClick}>
      <span className="pt">
        {p.icon} {p.title}
      </span>
      <span className="pd">{p.text}</span>
      <span className="pk">{p.note}</span>
    </button>
  );
}

function statusWords(s: BoardStatusView): ReactNode {
  switch (s.kind) {
    case 'waiting':
      return (
        <span className="you">
          {s.agent ? t('bs.home.waiting', { agent: s.agent }) : t('bs.home.waitingAny')}
        </span>
      );
    case 'draft':
      return <span className="you">{t('bs.home.draft')}</span>;
    case 'changed':
      return (
        <>
          <span>{t('bs.home.live', { version: s.version })}</span>
          <span className="bpart you">· {t('bs.home.changed')}</span>
        </>
      );
    default:
      return <span>{t('bs.home.live', { version: s.version })}</span>;
  }
}

// A row the whole of which opens something; its own buttons act on their own.
function rowProps(label: string, go: () => void) {
  return {
    role: 'button' as const,
    'aria-label': label,
    tabIndex: 0,
    onClick: (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest('button')) return;
      go();
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        go();
      }
    },
  };
}

const go = (hash: string) => {
  window.location.hash = hash;
};
const boardHash = (board: BoardSummary) => `#/b/${encodeURIComponent(board.collection ?? '')}`;
const isLive = (board: BoardSummary) => board.status === 'live' || board.status === 'changed';

// The small map over the list when a board divides into another: "Cambios → se divide en →
// Tareas de repo"; each name opens its editor.
function JoinsMap({ joins, blocks }: { joins: HomeJoin[]; blocks: BlockJoin[] }) {
  if (!joins.length && !blocks.length) return null;
  const node = (board: BoardSummary) => (
    <button type="button" className="jnode" onClick={() => go(editorOf(board.id))}>
      <RowIcon icon={boardIcon(board.icon)} />
      <span>{board.name}</span>
    </button>
  );
  return (
    <div className="jmap" data-e="in">
      <p className="jl">
        <span className="margin-label">{t('bs.home.joins')}</span>
        <span className="gloss">{t('bs.home.joinsGloss')}</span>
      </p>
      {joins.map((j) => (
        <div className="jrow" key={j.parent.id}>
          {node(j.parent)}
          <span className="jlink split">
            <i />
            <em>{t('bs.home.splitsInto')}</em>
            <i />
            <b />
          </span>
          {node(j.child)}
          <span className="jnote">
            {t(j.always ? 'bs.home.joinAlways' : 'bs.home.joinMaybe', {
              child: j.child.item,
              parent: j.parent.item,
            })}
          </span>
        </div>
      ))}
      {blocks.map((j) => (
        <div className="jrow" key={`${j.from.id}>${j.to.id}`}>
          {node(j.from)}
          <span className="jlink blocks">
            <i />
            <em>{t('bs.home.mayBlock')}</em>
            <i />
            <b />
          </span>
          {node(j.to)}
          <span className="jnote">
            {t('bs.home.blocksToday', { blocker: j.blocker, blocked: j.blocked })}
          </span>
        </div>
      ))}
    </div>
  );
}

// One meta line of a board: its status, steps and open items (a pair draws one per board).
function MetaParts({ board }: { board: BoardSummary }) {
  return (
    <>
      {statusWords(statusOf(board, drafterOf(board.id)))}
      <span className="bpart">
        · {t('bs.home.steps', { count: board.definition.steps.length })}
      </span>
      {isLive(board) ? (
        <span className="bpart">· {t('bs.home.open', { count: board.open })}</span>
      ) : null}
    </>
  );
}

// A joined pair is one row (WORKSPACE row 7): both routes stacked, "Cambios se divide en Tareas de
// repo", one meta line per board beside its route (W8), "N por configurar" while the editor's
// checklist is open. The row opens the workspace; "Ver …" opens each published board (hidden on a
// phone).
function PairRow({ parent, child }: { parent: BoardSummary; child: BoardSummary }) {
  const edit = () => go(editorOf(parent.id));
  const left = setupLeftOf(parent.id);
  const label = `${parent.name} ${t('bs.home.splitsInto')} ${child.name}`;
  return (
    <div className="brow pairrow" data-e="in" {...rowProps(label, edit)}>
      <div className="pairmini">
        <MiniRoute def={parent.definition} />
        <i className="pmj" aria-hidden="true" />
        <MiniRoute def={child.definition} />
      </div>
      <div>
        <div className="bname">
          <span>{parent.name}</span>
          <em className="jw">{t('bs.home.splitsInto')}</em>
          <span>{child.name}</span>
        </div>
        {[parent, child].map((b) => (
          <div className="bmeta" key={b.id}>
            <span className="bm1">{b.name}</span>
            <MetaParts board={b} />
          </div>
        ))}
        {left > 0 ? (
          <div className="bmeta">
            <span className="you">{t('bs.home.toConfigure', { count: left })}</span>
          </div>
        ) : null}
      </div>
      <div className="bacts">
        {[parent, child].map((b) =>
          isLive(b) && b.collection ? (
            <Button
              key={b.id}
              variant="text"
              size="sm"
              className="hn2"
              onClick={() => go(boardHash(b))}
            >
              {t('bs.home.viewOf', { board: b.name })}
            </Button>
          ) : null,
        )}
        <Button variant="quiet" size="sm" onClick={edit}>
          {t('bs.home.edit')}
        </Button>
      </div>
    </div>
  );
}

function BoardRow({ board, madeWith = [] }: { board: BoardSummary; madeWith?: string[] }) {
  const status = statusOf(board, drafterOf(board.id));
  if (board.status === 'waiting') {
    return (
      <div className="brow waiting" data-e="in">
        <span className="bwait">
          <NodeGlyph look="working" size={20} />
        </span>
        <div>
          <div className="bname">{board.name}</div>
          <div className="bmeta">{statusWords(status)}</div>
          <div className="bdesc">{t('bs.home.waitingNote', { id: board.requestItem ?? '—' })}</div>
        </div>
        <div className="bacts" />
      </div>
    );
  }
  const live = board.status === 'live' || board.status === 'changed';
  const steps = board.definition.steps.length;
  const edit = () => {
    window.location.hash = editorOf(board.id);
  };
  return (
    <div className="brow" data-e="in" {...rowProps(board.name, edit)}>
      <MiniRoute def={board.definition} />
      <div>
        <div className="bname">
          <span>{board.name}</span>
          <span className="tag line">{t('bs.home.eachItem', { item: board.item })}</span>
        </div>
        {/* Each «· part» wraps whole, so a line never ends on a dangling dot. */}
        <div className="bmeta">
          {statusWords(status)}
          <span className="bpart">· {t('bs.home.steps', { count: steps })}</span>
          {live ? (
            <span className="bpart">· {t('bs.home.open', { count: board.open })}</span>
          ) : null}
          {board.builtin ? <span className="bpart">· {t('bs.home.builtin')}</span> : null}
          {madeWith.length ? (
            <span className="bpart">· {t('bs.home.madeWith', { names: madeWith.join(', ') })}</span>
          ) : null}
        </div>
      </div>
      <div className="bacts">
        {live && board.collection ? (
          <Button
            variant="text"
            size="sm"
            onClick={() => {
              window.location.hash = `#/b/${encodeURIComponent(board.collection ?? '')}`;
            }}
          >
            {t('bs.home.view')}
          </Button>
        ) : null}
        <Button variant="quiet" size="sm" onClick={edit}>
          {t('bs.home.edit')}
        </Button>
      </div>
    </div>
  );
}

function TemplateRow({ template, canWrite }: { template: TemplateView; canWrite: boolean }) {
  const use = () => openNewBoard(template.key);
  const set = setBoards(template);
  if (set) {
    return (
      <div
        className={canWrite ? 'brow setrow' : 'brow setrow still'}
        data-e="in"
        {...(canWrite ? rowProps(template.name, use) : {})}
      >
        <div className="minis">
          {set.map((b) => (
            <MiniRoute key={b.name} def={b.definition} />
          ))}
        </div>
        <div>
          <div className="bname">
            <span className="bic">
              <RowIcon icon={boardIcon(template.icon)} />
            </span>
            <span>{template.name}</span>
            <span className="tag you">{t('bs.home.makes', { count: set.length })}</span>
          </div>
          <div className="bmeta">
            {set.map((b, k) => (
              <span className="bpart" key={b.name}>
                {k ? <span className="and">{t('bs.home.and')} </span> : null}
                {b.name} <i className="gl3">{t('bs.home.eachItem', { item: b.item })}</i>
              </span>
            ))}
          </div>
          <div className="bdesc">{template.description}</div>
        </div>
        <div className="bacts">
          {canWrite ? (
            <Button variant="quiet" size="sm" onClick={use}>
              {t('bs.home.use')}
            </Button>
          ) : null}
        </div>
      </div>
    );
  }
  return (
    <div
      className={canWrite ? 'brow' : 'brow still'}
      data-e="in"
      {...(canWrite ? rowProps(template.name, use) : {})}
    >
      <MiniRoute def={template.definition} />
      <div>
        <div className="bname">
          <span className="bic">
            <RowIcon icon={boardIcon(template.icon)} />
          </span>
          <span>{template.name}</span>
          <span className="tag line">
            {t('bs.home.eachItem', { item: template.definition.item })}
          </span>
        </div>
        <div className="bdesc">{template.description}</div>
      </div>
      <div className="bacts">
        {canWrite ? (
          <Button variant="quiet" size="sm" onClick={use}>
            {t('bs.home.use')}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
