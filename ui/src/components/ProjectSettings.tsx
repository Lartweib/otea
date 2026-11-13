import { type FormEvent, type ReactNode, useState } from 'react';
import {
  addProjectPath,
  fetchProjectSettings,
  forgetProjectPath,
  relinkProjectPath,
} from '../api.ts';
import { type Connection, useRemote } from '../hooks.ts';
import { t, tx } from '../i18n/i18n.ts';
import { TypeIcon } from '../icons/TypeIcon.tsx';
import { Button, Icon } from '../kit/index.ts';
import { sizeLabel } from '../projects.ts';
import type { RepoSettings, ProjectSettings as Settings } from '../types.ts';
import { CopyGlyph } from './CopyCommand.tsx';

type PathSettings = Settings['paths'][number];

function Section({ name, sub, children }: { name: string; sub?: string; children: ReactNode }) {
  return (
    <section className="pj-sec">
      <div className="pj-sec-label">
        <h2>{name}</h2>
        {sub ? <span className="margin-label">{sub}</span> : null}
      </div>
      <div className="pj-sec-body">{children}</div>
    </section>
  );
}

function Gate({ repo }: { repo: RepoSettings }) {
  if (repo.gate === 'hard') {
    return (
      <span className="pj-gate">
        <span className="pj-gate-mark" data-gate="hard">
          {t('settings.hard')}
        </span>
        <span className="t-cap">{t('settings.hookInstalled')}</span>
      </span>
    );
  }
  return (
    <span className="pj-gate">
      <span className="pj-gate-mark">{t('settings.soft')}</span>
      <span className="t-cap">{t('settings.instructionsOnly')}</span>
      <code className="pj-code">otea hook install</code>
    </span>
  );
}

function Repos({ repos }: { repos: RepoSettings[] }) {
  return (
    <div className="pj-repos">
      <div className="pj-repo pj-repo-head">
        <span>{t('settings.repoName')}</span>
        <span>{t('settings.inFolder')}</span>
        <span>{t('settings.gate')}</span>
        <span>{t('settings.items')}</span>
      </div>
      {repos.map((repo) => (
        <div key={repo.folder} className="pj-repo">
          <span className="pj-repo-name">
            <TypeIcon name="git-branch" size={14} />
            <span>{repo.name}</span>
          </span>
          <span className="t-cap">{repo.folder === '.' ? '' : `${repo.folder}/`}</span>
          <span>
            <Gate repo={repo} />
          </span>
          <span className="t-cap pj-repo-items">
            {t('settings.itemCount', { count: repo.items })}
          </span>
        </div>
      ))}
    </div>
  );
}

type Mode = 'relink' | 'forget';

type PathCardProps = {
  path: PathSettings;
  settings: Settings;
  canWrite: boolean;
  last: boolean;
  onChanged: () => void;
};

// Runs a write and keeps its error to show beside the form.
function useWrite(onDone: () => void) {
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const run = (write: () => Promise<void>) => {
    setBusy(true);
    setError(undefined);
    write().then(
      () => {
        setBusy(false);
        onDone();
      },
      (failure: unknown) => {
        setBusy(false);
        setError(failure instanceof Error ? failure.message : String(failure));
      },
    );
  };
  return { error, busy, run };
}

function PathCard({ path, settings, canWrite, last, onChanged }: PathCardProps) {
  const [mode, setMode] = useState<Mode>();
  const [to, setTo] = useState('');
  const write = useWrite(() => {
    setMode(undefined);
    onChanged();
  });
  const editable = canWrite && settings.registered;
  const icon = path.kind === 'folder' ? <FolderGlyph /> : <TypeIcon name="git-branch" size={16} />;
  const relink = (force: boolean) => (event?: FormEvent) => {
    event?.preventDefault();
    write.run(() => relinkProjectPath(path.path, to.trim(), force));
  };
  const different = write.error !== undefined && /same remote|not the repo/i.test(write.error);
  return (
    <div
      className="pj-path"
      data-missing={path.missing || undefined}
      data-open={mode ? true : undefined}
    >
      <div className="pj-path-head">
        <span className="pj-path-icon">{icon}</span>
        <span className="pj-path-name">{path.path}</span>
        {path.missing ? (
          <span className="pj-missing">
            <MissingMark />
            {t('settings.missing')}
          </span>
        ) : (
          <span className="pj-path-kind">
            {path.kind === 'folder' ? t('settings.folder') : t('settings.linkedRepo')}
          </span>
        )}
        {editable && mode === undefined ? (
          <span className="pj-path-actions">
            {path.missing ? (
              <Button size="sm" onClick={() => setMode('relink')}>
                {t('settings.relink')}
              </Button>
            ) : null}
            <Button size="sm" variant="quiet" onClick={() => setMode('forget')}>
              {t('settings.forget')}
            </Button>
          </span>
        ) : null}
      </div>
      {mode === 'relink' ? (
        <form className="pj-form" onSubmit={relink(false)}>
          <label className="t-label" htmlFor={`relink-${path.path}`}>
            {t('settings.newLocation', { path: path.path })}
          </label>
          <input
            id={`relink-${path.path}`}
            className="pj-input"
            value={to}
            placeholder={t('settings.pathPlaceholder')}
            spellCheck={false}
            onChange={(event) => setTo(event.target.value)}
          />
          {write.error ? <p className="action-error t-small">{write.error}</p> : null}
          <div className="pj-form-actions">
            <Button type="submit" variant="primary" disabled={write.busy || to.trim() === ''}>
              {t('settings.relinkDo')}
            </Button>
            {different ? (
              <Button disabled={write.busy} onClick={() => relink(true)()}>
                {t('settings.relinkForce')}
              </Button>
            ) : null}
            <Button variant="quiet" onClick={() => setMode(undefined)}>
              {t('common.cancel')}
            </Button>
            <span className="t-cap">{t('settings.relinkNote')}</span>
          </div>
        </form>
      ) : mode === 'forget' ? (
        <div className="pj-form">
          <p className="pj-forget">
            <b>{t('settings.forgetQuestion', { path: path.path })}</b>{' '}
            {t('settings.forgetText', { name: settings.name })}
            {last ? ` ${t('settings.forgetLast', { name: settings.name })}` : ''}
          </p>
          {write.error ? <p className="action-error t-small">{write.error}</p> : null}
          <div className="pj-form-actions">
            <Button
              disabled={write.busy}
              onClick={() => write.run(() => forgetProjectPath(path.path))}
            >
              {t('settings.forgetDo')}
            </Button>
            <Button variant="quiet" onClick={() => setMode(undefined)}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      ) : path.missing ? (
        <>
          <p className="pj-missing-text">{t('settings.missingText')}</p>
          <div className="pj-repo pj-repo-dim">
            <span className="pj-repo-name">
              <TypeIcon name="git-branch" size={14} />
              <span>{path.path.split(/[\\/]/).pop()}</span>
            </span>
            <span />
            <span className="t-cap">{t('settings.notChecked')}</span>
            <span />
          </div>
        </>
      ) : path.repos.length > 0 ? (
        <Repos repos={path.repos} />
      ) : (
        <p className="pj-missing-text">{t('settings.noRepos')}</p>
      )}
    </div>
  );
}

function AddPath({ settings, onChanged }: { settings: Settings; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [path, setPath] = useState('');
  const write = useWrite(() => {
    setOpen(false);
    setPath('');
    onChanged();
  });
  const command = <code className="pj-code">{`otea projects add . --to ${settings.name}`}</code>;
  if (!open) {
    return (
      <div className="pj-add">
        <Button size="sm" onClick={() => setOpen(true)}>
          <Icon name="plus" />
          {t('settings.add')}
        </Button>
        <span className="t-cap">{tx('settings.orInside', { command })}</span>
      </div>
    );
  }
  return (
    <form
      className="pj-add pj-form"
      data-open="true"
      onSubmit={(event) => {
        event.preventDefault();
        write.run(() => addProjectPath(path.trim()));
      }}
    >
      <label className="t-label" htmlFor="add-path">
        {t('settings.addLabel', { name: settings.name })}
      </label>
      <input
        id="add-path"
        className="pj-input"
        value={path}
        placeholder={t('settings.pathPlaceholder')}
        spellCheck={false}
        onChange={(event) => setPath(event.target.value)}
      />
      {write.error ? <p className="action-error t-small">{write.error}</p> : null}
      <div className="pj-form-actions">
        <Button type="submit" variant="primary" disabled={write.busy || path.trim() === ''}>
          {t('settings.addDo')}
        </Button>
        <Button variant="quiet" onClick={() => setOpen(false)}>
          {t('common.cancel')}
        </Button>
        <span className="t-cap">{tx('settings.orInside', { command })}</span>
      </div>
    </form>
  );
}

function CopyPath({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="quiet"
      className="pj-copy-path"
      onClick={() =>
        navigator.clipboard?.writeText(path).then(
          () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1400);
          },
          () => {},
        )
      }
    >
      <CopyGlyph />
      {copied ? t('settings.copied') : t('settings.copy')}
    </Button>
  );
}

function Storage({ settings }: { settings: Settings }) {
  const { database, evidence } = settings;
  return (
    <dl className="pj-storage">
      <dt>{t('settings.database')}</dt>
      <dd>
        <span className="pj-mono">{database.path}</span>
        <span className="t-cap">
          {sizeLabel(database.bytes)} · {t('settings.itemCount', { count: settings.items })}
        </span>
        <CopyPath path={database.path} />
      </dd>
      <dt>{t('settings.evidence')}</dt>
      <dd>
        <span className="pj-mono">{evidence.path}</span>
        <span className="t-cap">
          {sizeLabel(evidence.bytes)} · {t('common.files', { count: evidence.files })}
        </span>
        <CopyPath path={evidence.path} />
      </dd>
      <dt>{t('settings.repos')}</dt>
      <dd>
        <span className="t-small">
          {tx('settings.reposNote', { agents: <code className="pj-code">AGENTS.md</code> })}
        </span>
      </dd>
    </dl>
  );
}

// rail: the project's sidebar beside the page; sidebar: whether it is open.
type ProjectSettingsProps = {
  version: number;
  connection: Connection;
  canWrite: boolean;
};

// One project's settings: its name, the paths and repos that lead to it, and where its data lives.
// Nothing here touches the disk but the registry: relink and forget change which folders lead here.
export function ProjectSettings({ version, connection, canWrite }: ProjectSettingsProps) {
  const [changes, setChanges] = useState(0);
  const settings = useRemote(fetchProjectSettings, version * 1000 + changes, connection);
  const changed = () => setChanges((count) => count + 1);
  if (settings.status !== 'ready') {
    return (
      <div className="page pj-settings">
        <p
          className={
            settings.status === 'failed' ? 'pane-message action-error' : 'pane-message t-small'
          }
        >
          {settings.status === 'failed' ? settings.message : t('common.loading')}
        </p>
      </div>
    );
  }
  const value = settings.value;
  const repos = value.paths.reduce((sum, path) => sum + path.repos.length, 0);
  const pathsSub = `${t('settings.pathCount', { count: value.paths.length })} · ${t('settings.repoCount', { count: repos })}`;
  return (
    <div className="page pj-settings">
      <header className="head" data-enter="head">
        <div className="kicker">
          <b>{t('settings.kicker')}</b> &nbsp;·&nbsp; {value.name}
        </div>
        <h1 className="display">{t('settings.display')}</h1>
        <p className="dek">{t('settings.dek', { name: value.name })}</p>
      </header>
      <div className="pj-body" data-enter="fade">
        <Section name={t('settings.name')}>
          <div className="pj-name">
            <span className="pj-name-icon">
              {value.paths[0]?.kind === 'folder' ? (
                <FolderGlyph />
              ) : (
                <TypeIcon name="git-branch" size={16} />
              )}
            </span>
            <span className="pj-name-value">{value.name}</span>
          </div>
          <p className="pj-hint">
            {tx('settings.nameHint', {
              join: <code className="pj-code">--join</code>,
              to: <code className="pj-code">--to</code>,
              id: <code className="pj-code">{value.id}</code>,
            })}
          </p>
        </Section>
        <Section name={t('settings.paths')} sub={pathsSub}>
          <div className="pj-paths">
            {value.paths.map((path) => (
              <PathCard
                key={path.path}
                path={path}
                settings={value}
                canWrite={canWrite}
                last={value.paths.length === 1}
                onChanged={changed}
              />
            ))}
            {value.registered ? (
              canWrite ? (
                <AddPath settings={value} onChanged={changed} />
              ) : null
            ) : (
              <p className="pj-hint">
                {tx('settings.localOne', {
                  command: <code className="pj-code">otea migrate --to common</code>,
                })}
              </p>
            )}
          </div>
        </Section>
        <Section
          name={t('settings.storage')}
          sub={
            value.storage === 'common' ? t('settings.storageCommon') : t('settings.storageLocal')
          }
        >
          <Storage settings={value} />
        </Section>
      </div>
    </div>
  );
}

function FolderGlyph() {
  return (
    <svg className="pj-folder" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3.5 6.5 A1.5 1.5 0 0 1 5 5 H9.6 L11.6 7.2 H19 A1.5 1.5 0 0 1 20.5 8.7 V17.5 A1.5 1.5 0 0 1 19 19 H5 A1.5 1.5 0 0 1 3.5 17.5 Z" />
    </svg>
  );
}

// The incomplete node: a dashed ring, for a path Otea can't find.
function MissingMark() {
  return (
    <svg className="pj-gap" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <circle cx="5" cy="5" r="3.8" />
    </svg>
  );
}
