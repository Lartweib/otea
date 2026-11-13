import { fetchProjectSettings } from '../api.ts';
import { useRemote } from '../hooks.ts';
import { t, tx } from '../i18n/i18n.ts';
import { CopyCommand } from './CopyCommand.tsx';

// The list of a project with no items yet: its lanes run empty, and it says how items arrive.
export function EmptyProject() {
  const settings = useRemote(fetchProjectSettings, 0, 'live');
  if (settings.status !== 'ready') return null;
  const { name, dataDir, collections, paths } = settings.value;
  const first = collections[0]?.name ?? 'tasks';
  return (
    <div className="pj-empty-project">
      <svg className="pj-empty-lanes" width="56" height="100%" aria-hidden="true">
        <line className="ln" x1="16.5" y1="0" x2="16.5" y2="100%" />
        <line className="lny" x1="40.5" y1="0" x2="40.5" y2="100%" />
      </svg>
      <div className="pj-empty-body">
        <h2 className="pj-empty-title">{t('emptyProject.title', { name })}</h2>
        <p className="pj-empty-text">{t('emptyProject.text')}</p>
        <CopyCommand
          command={`otea create --collection ${first} --title "${t('emptyProject.example')}"`}
        />
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
          <dt>{t('emptyProject.collections')}</dt>
          <dd>{collections.map((each) => `${each.name} (${each.preset})`).join(', ')}</dd>
        </dl>
      </div>
    </div>
  );
}
