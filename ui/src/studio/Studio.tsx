import type { ReactNode } from 'react';
import { type Connection, useRemote } from '../hooks.ts';
import { t } from '../i18n/i18n.ts';
import type { Remote } from '../remote.ts';
import { type StudioPage, studioHash } from '../selection.ts';
import type { Item } from '../types.ts';
import { fetchStudioPresets, type PresetSummary } from './api.ts';
import { PresetEditor } from './PresetEditor.tsx';
import { ProblemMark } from './parts.tsx';

// Studio: where a project's ways of working are read and changed. Its own index on the left (the
// presets the project can use), the page on the right.

type StudioProps = {
  page: StudioPage;
  connection: Connection;
  version: number;
  canWrite: boolean;
  phone: boolean;
  items: readonly Item[];
  // Something Studio wrote changes what the rest of the app shows (presets, collections).
  onChanged: () => void;
  // The app's sidebar, beside Studio's own index (none on a phone, where it is the panel).
  rail: ReactNode;
  sidebar: boolean;
};

function PresetIndex({
  presets,
  selected,
}: {
  presets: Remote<PresetSummary[]>;
  selected: string | undefined;
}) {
  if (presets.status !== 'ready')
    return (
      <p className="t-small">
        {presets.status === 'loading' ? t('common.loading') : presets.message}
      </p>
    );
  return (
    <ul className="st-list">
      {presets.value.map((preset) => (
        <li key={`${preset.origin}-${preset.name}`}>
          <a
            href={studioHash({ kind: 'preset', name: preset.name })}
            aria-current={preset.name === selected ? 'page' : undefined}
          >
            <span className="st-li-name">
              {preset.problems.length > 0 ? <ProblemMark /> : null}
              {preset.name}
            </span>
            <span className="t-cap">
              {preset.version === null ? t('studio.index.invalid') : `v${preset.version}`}
              {preset.collections.length > 0 ? ` · ${preset.collections.join(', ')}` : ''}
            </span>
            {preset.origin === 'project' ? (
              <span className="t-cap st-li-origin">{t('studio.index.project')}</span>
            ) : null}
          </a>
        </li>
      ))}
    </ul>
  );
}

function Start({ presets }: { presets: Remote<PresetSummary[]> }) {
  return (
    <div className="st-start">
      <h1 className="t-display">{t('studio.title')}</h1>
      <p className="t-body st-lede">{t('studio.lede')}</p>
      <section className="st-sec">
        <div className="st-sh">
          <h2 className="t-h">{t('studio.index.presets')}</h2>
          <span className="t-cap">{t('studio.presetsNote')}</span>
        </div>
        {presets.status === 'ready' ? (
          <div className="st-cards">
            {presets.value.map((preset) => (
              <a
                key={`${preset.origin}-${preset.name}`}
                className="st-card raised"
                href={studioHash({ kind: 'preset', name: preset.name })}
              >
                <span className="st-card-h">
                  <b className="mono">{preset.name}</b>
                  <span className="t-cap">
                    {preset.version === null ? t('studio.index.invalid') : `v${preset.version}`}
                  </span>
                  <span className="t-cap st-li-origin">
                    {preset.origin === 'official'
                      ? t('studio.preset.official')
                      : t('studio.index.project')}
                  </span>
                </span>
                <span className="t-small">
                  {preset.problems.length > 0
                    ? preset.problems[0]
                    : preset.collections.length > 0
                      ? t('studio.start.usedBy', { names: preset.collections.join(', ') })
                      : t('studio.preset.unused')}
                </span>
              </a>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}

export function Studio({
  page,
  connection,
  version,
  canWrite,
  phone,
  items,
  onChanged,
  rail,
  sidebar,
}: StudioProps) {
  const presets = useRemote(fetchStudioPresets, version, connection);
  let content: ReactNode;
  if (page.kind === 'preset') {
    content = (
      <PresetEditor
        key={page.name}
        name={page.name}
        connection={connection}
        canWrite={canWrite}
        phone={phone}
        items={items}
        onSaved={onChanged}
      />
    );
  } else {
    content = <Start presets={presets} />;
  }
  return (
    <main
      className="layout studio with-rail"
      data-page={page.kind}
      data-sidebar={sidebar ? 'on' : 'off'}
    >
      {rail}
      <nav className="st-index" aria-label={t('studio.title')}>
        <a
          className="st-index-h"
          href={studioHash()}
          aria-current={page.kind === 'start' ? 'page' : undefined}
        >
          {t('studio.title')}
        </a>
        <span className="t-label">{t('studio.index.presets')}</span>
        <PresetIndex presets={presets} selected={page.kind === 'preset' ? page.name : undefined} />
      </nav>
      <div className="st-page">{content}</div>
    </main>
  );
}
