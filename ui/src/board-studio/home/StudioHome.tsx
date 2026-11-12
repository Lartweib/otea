import { type ReactNode, useRef } from 'react';
import { useApp } from '../../app/context.tsx';
import { language, t } from '../../i18n/i18n.ts';
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
import { type BoardStatusView, statusOf } from './home-model.ts';
import { MiniRoute } from './MiniRoute.tsx';
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
          own.map((b) => <BoardRow key={b.id} board={b} />)
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
          {t('bs.home.readOnly')}
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

function BoardRow({ board }: { board: BoardSummary }) {
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
