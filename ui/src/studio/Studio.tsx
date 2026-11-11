import type { ReactNode } from 'react';
import { fetchPresets } from '../api.ts';
import { type Connection, useRemote } from '../hooks.ts';
import { t } from '../i18n/i18n.ts';
import { Icon } from '../kit/index.ts';
import type { Remote } from '../remote.ts';
import { type StudioPage, studioHash } from '../selection.ts';
import type { Item } from '../types.ts';
import type { PresetSummary, ProjectBlueprint } from './api.ts';
import { BlueprintPage, Picker } from './BlueprintPage.tsx';
import { PresetEditor } from './PresetEditor.tsx';
import { ProblemMark } from './parts.tsx';
import type { StudioIndex } from './use-studio-index.ts';

// Studio: where a project's ways of working are read and changed. Its own index on the left (the
// project's blueprint and the presets it can use), the page on the right.

type StudioProps = {
  page: StudioPage;
  connection: Connection;
  version: number;
  canWrite: boolean;
  phone: boolean;
  items: readonly Item[];
  // Something Studio wrote changes what the rest of the app shows (presets, collections).
  onChanged: () => void;
  // Its presets and the project's blueprint, read once for Studio and the sidebar's tree.
  index: StudioIndex;
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
      <p className="st-small">
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
            <span className="st-cap">
              {preset.version === null ? t('studio.index.invalid') : `v${preset.version}`}
              {preset.collections.length > 0 ? ` · ${preset.collections.join(', ')}` : ''}
            </span>
            {preset.origin === 'project' ? (
              <span className="st-cap st-li-origin">{t('studio.index.project')}</span>
            ) : null}
          </a>
        </li>
      ))}
    </ul>
  );
}

type CatalogProps = {
  connection: Connection;
  version: number;
  canWrite: boolean;
  hasBlueprint: boolean;
  onApplied: () => void;
};

// Every blueprint the project could be built from; applying one needs a project without one.
function BlueprintCatalog({
  connection,
  version,
  canWrite,
  hasBlueprint,
  onApplied,
}: CatalogProps) {
  const presets = useRemote(fetchPresets, version, connection);
  if (presets.status !== 'ready') {
    return (
      <p className="st-small st-msg">
        {presets.status === 'loading' ? t('common.loading') : presets.message}
      </p>
    );
  }
  return (
    <Picker
      connection={connection}
      version={version}
      presets={presets.value}
      hasBlueprint={hasBlueprint}
      canWrite={canWrite}
      onApplied={onApplied}
    />
  );
}

type StartProps = {
  presets: Remote<PresetSummary[]>;
  blueprint: ProjectBlueprint | null;
  items: readonly Item[];
  // Customize writes through Studio: not on a phone, not for a viewer who cannot configure.
  canCustomize: boolean;
};

// One template: its name, where it comes from, who uses it, and the way into the builder.
function TemplateRow({
  preset,
  items,
  canCustomize,
}: {
  preset: PresetSummary;
  items: readonly Item[];
  canCustomize: boolean;
}) {
  const count = items.filter((item) => preset.collections.includes(item.collection)).length;
  return (
    <li className="st-row">
      <a className="st-row-main" href={studioHash({ kind: 'preset', name: preset.name })}>
        <b className="st-row-name">
          {preset.problems.length > 0 ? <ProblemMark /> : null}
          {preset.name}
        </b>
        <span className="st-cap">
          {preset.origin === 'official' ? t('studio.start.official') : t('studio.index.project')}
        </span>
      </a>
      <span className="st-small st-row-use">
        {preset.problems.length > 0
          ? preset.problems[0]
          : preset.collections.length > 0
            ? t('studio.start.usedByBoards', {
                names: preset.collections.join(', '),
                items: t('studio.start.itemsCount', { count }),
              })
            : t('studio.start.notUsed')}
      </span>
      {canCustomize ? (
        <a
          className="btn sm quiet st-row-go"
          href={`#/customize/preset/${encodeURIComponent(preset.name)}`}
        >
          <Icon name="sliders" />
          {t('studio.start.customize')}
        </a>
      ) : null}
    </li>
  );
}

function Start({ presets, blueprint, items, canCustomize }: StartProps) {
  return (
    <div className="st-start">
      <h1 className="st-display">{t('studio.title')}</h1>
      <p className="st-body st-lede">{t('studio.lede')}</p>
      <section className="st-sec">
        <div className="st-sh">
          <h2 className="st-h">{t('studio.start.boardTemplates')}</h2>
        </div>
        {presets.status === 'ready' ? (
          <ul className="st-rows">
            {presets.value.map((preset) => (
              <TemplateRow
                key={`${preset.origin}-${preset.name}`}
                preset={preset}
                items={items}
                canCustomize={canCustomize}
              />
            ))}
          </ul>
        ) : (
          <p className="st-small">
            {presets.status === 'loading' ? t('common.loading') : presets.message}
          </p>
        )}
      </section>
      <section className="st-sec">
        <div className="st-sh">
          <h2 className="st-h">{t('studio.start.projectTemplates')}</h2>
          <span className="st-cap">{t('studio.blueprintNote')}</span>
        </div>
        {blueprint ? (
          <a className="st-card st-raised" href={studioHash({ kind: 'blueprint', diagram: true })}>
            <span className="st-card-h">
              <b className="st-mono">{blueprint.name}</b>
              <span className="st-cap">{`v${blueprint.version} · ${t('studio.blueprint.boardsCount', { count: blueprint.boards.length })}`}</span>
              {'upToDate' in blueprint.status && !blueprint.status.upToDate ? (
                <span className="st-cap st-li-origin">{t('studio.index.changed')}</span>
              ) : null}
            </span>
            <span className="st-fs">
              {blueprint.connections.map((text) => (
                <code key={text} className="st-cap">
                  {text}
                </code>
              ))}
            </span>
          </a>
        ) : (
          <a className="st-card st-raised" href={studioHash({ kind: 'blueprints' })}>
            <b>{t('studio.index.noBlueprint')}</b>
            <span className="st-small">{t('studio.start.pick')}</span>
          </a>
        )}
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
  index,
  rail,
  sidebar,
}: StudioProps) {
  const { presets, blueprint } = index;
  const copy = blueprint.status === 'ready' ? blueprint.value.blueprint : null;
  let content: ReactNode;
  if (page.kind === 'blueprint') {
    content = (
      <BlueprintPage
        diagram={page.diagram}
        connection={connection}
        version={version}
        canWrite={canWrite}
        phone={phone}
        onChanged={onChanged}
      />
    );
  } else if (page.kind === 'blueprints') {
    content = (
      <BlueprintCatalog
        connection={connection}
        version={version}
        canWrite={canWrite && !phone}
        hasBlueprint={copy !== null}
        onApplied={onChanged}
      />
    );
  } else if (page.kind === 'preset') {
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
    content = (
      <Start presets={presets} blueprint={copy} items={items} canCustomize={canWrite && !phone} />
    );
  }
  return (
    <main
      className="layout studio with-rail"
      data-page={page.kind}
      data-sidebar={sidebar ? 'on' : 'off'}
    >
      {rail}
      {page.kind === 'start' ? null : (
        <nav className="st-index" aria-label={t('studio.title')}>
          <a className="st-index-h" href={studioHash()}>
            {t('studio.title')}
          </a>
          <span className="st-label">{t('studio.index.blueprint')}</span>
          <ul className="st-list">
            <li>
              <a
                href={
                  copy
                    ? studioHash({ kind: 'blueprint', diagram: false })
                    : studioHash({ kind: 'blueprints' })
                }
                aria-current={
                  page.kind === 'blueprint' || page.kind === 'blueprints' ? 'page' : undefined
                }
              >
                <span className="st-li-name">
                  {copy ? copy.name : t('studio.index.noBlueprint')}
                </span>
                <span className="st-cap">
                  {copy
                    ? `v${copy.version} · ${t('studio.blueprint.boardsCount', { count: copy.boards.length })}`
                    : t('studio.index.pickOne')}
                </span>
                {copy && 'upToDate' in copy.status && !copy.status.upToDate ? (
                  <span className="st-cap st-li-origin">{t('studio.index.changed')}</span>
                ) : null}
              </a>
            </li>
          </ul>
          <span className="st-label">{t('studio.index.presets')}</span>
          <PresetIndex
            presets={presets}
            selected={page.kind === 'preset' ? page.name : undefined}
          />
        </nav>
      )}
      <div className="st-page">{content}</div>
    </main>
  );
}
