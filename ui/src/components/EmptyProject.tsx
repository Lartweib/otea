import { fetchProjectSettings } from '../api.ts';
import { useApp } from '../app/context.tsx';
import { openNewBoard } from '../board-studio/home/studio-dialogs.ts';
import { useRemote } from '../hooks.ts';
import { t, tx } from '../i18n/i18n.ts';
import { Button } from '../kit/Button.tsx';
import { Icon } from '../kit/Icon.tsx';
import type { ProjectSettings } from '../types.ts';
import { PromptBlock, useAgentPrompt } from './AgentPrompt.tsx';

// The list of a project with no items yet: its lanes run empty, and it says how items arrive.
export function EmptyProject() {
  const app = useApp();
  const settings = useRemote(fetchProjectSettings, 0, 'live');
  const boards = app.collections.map(({ name }) => name);
  const prompt = useAgentPrompt('start', app.version);
  if (settings.status !== 'ready') return null;
  return (
    <EmptyProjectView
      settings={settings.value}
      boards={boards}
      prompt={prompt.status === 'ready' ? prompt.value.prompt : null}
      onNew={() => app.newItem()}
      onConnect={app.openConnect}
      onPickBoards={() => openNewBoard(null)}
    />
  );
}

// The person writes the first item here, or connects an agent that will. A project with no board
// yet starts from the agent prompt, first thing on the page: pasted into an agent's chat, it sets
// the project up, interviews the person and drafts its boards; picking the boards oneself comes
// second. The boards go by their names, never by a hidden id.
export function EmptyProjectView({
  settings,
  boards,
  prompt,
  onNew,
  onConnect,
  onPickBoards,
}: {
  settings: ProjectSettings;
  boards: readonly string[];
  prompt: string | null;
  onNew: () => void;
  onConnect: () => void;
  onPickBoards: () => void;
}) {
  const { name, dataDir, paths } = settings;
  const none = boards.length === 0;
  return (
    <div className="pj-empty-project">
      <svg className="pj-empty-lanes" width="56" height="100%" aria-hidden="true">
        <line className="ln" x1="16.5" y1="0" x2="16.5" y2="100%" />
        <line className="lny" x1="40.5" y1="0" x2="40.5" y2="100%" />
      </svg>
      <div className="pj-empty-body">
        <h2 className="pj-empty-title">{t('emptyProject.title', { name })}</h2>
        <p className="pj-empty-text">{t(none ? 'emptyProject.noBoards' : 'emptyProject.text')}</p>
        {none && prompt ? (
          <div className="pj-empty-prompt">
            <PromptBlock prompt={prompt} primary />
          </div>
        ) : null}
        <div className="pj-empty-acts">
          {none ? (
            <>
              <span className="pj-empty-or">{t('emptyProject.orPick')}</span>
              <Button variant={prompt ? 'quiet' : 'primary'} onClick={onPickBoards}>
                {t('emptyProject.pickBoards')}
              </Button>
            </>
          ) : (
            <>
              <Button variant="primary" onClick={onNew}>
                {t('app.newItem')}
              </Button>
              <Button variant="quiet" onClick={onConnect}>
                <Icon name="plus" />
                {t('toca.connect')}
              </Button>
            </>
          )}
        </div>
        <p className="pj-empty-agents">
          {tx('emptyProject.agents', { command: <code>otea board</code> })}
        </p>
        <dl className="pj-facts">
          <dt>{t('emptyProject.path')}</dt>
          <dd>
            {paths.map((path) => path.path).join(' · ')} ·{' '}
            {t('settings.repoCount', {
              count: paths.reduce((sum, path) => sum + path.repos.length, 0),
            })}
          </dd>
          <dt>{t('emptyProject.store')}</dt>
          <dd>{dataDir}</dd>
          <dt>{t('emptyProject.boards')}</dt>
          <dd>{none ? t('emptyProject.noBoardsYet') : boards.join(', ')}</dd>
        </dl>
      </div>
    </div>
  );
}
