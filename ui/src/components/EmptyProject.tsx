import { fetchProjectSettings } from '../api.ts';
import { useApp } from '../app/context.tsx';
import { useRemote } from '../hooks.ts';
import { t, tx } from '../i18n/i18n.ts';
import { Button } from '../kit/Button.tsx';
import { Icon } from '../kit/Icon.tsx';
import type { ProjectSettings } from '../types.ts';

// The list of a project with no items yet: its lanes run empty, and it says how items arrive.
export function EmptyProject() {
  const app = useApp();
  const settings = useRemote(fetchProjectSettings, 0, 'live');
  if (settings.status !== 'ready') return null;
  return (
    <EmptyProjectView
      settings={settings.value}
      onNew={() => app.newItem()}
      onConnect={app.openConnect}
    />
  );
}

// The person writes the first item here, or connects an agent that will; the boards go by their
// names, never by a hidden id.
export function EmptyProjectView({
  settings,
  onNew,
  onConnect,
}: {
  settings: ProjectSettings;
  onNew: () => void;
  onConnect: () => void;
}) {
  const { name, dataDir, collections, paths } = settings;
  return (
    <div className="pj-empty-project">
      <svg className="pj-empty-lanes" width="56" height="100%" aria-hidden="true">
        <line className="ln" x1="16.5" y1="0" x2="16.5" y2="100%" />
        <line className="lny" x1="40.5" y1="0" x2="40.5" y2="100%" />
      </svg>
      <div className="pj-empty-body">
        <h2 className="pj-empty-title">{t('emptyProject.title', { name })}</h2>
        <p className="pj-empty-text">{t('emptyProject.text')}</p>
        <div className="pj-empty-acts">
          <Button variant="primary" onClick={onNew}>
            {t('app.newItem')}
          </Button>
          <Button variant="quiet" onClick={onConnect}>
            <Icon name="plus" />
            {t('toca.connect')}
          </Button>
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
          <dd>{collections.map((each) => each.name).join(', ')}</dd>
        </dl>
      </div>
    </div>
  );
}
