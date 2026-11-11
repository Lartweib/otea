import { t } from '../i18n/i18n.ts';
import { Count, Icon } from '../kit/index.ts';
import type { Remote } from '../remote.ts';
import { customizeHash, studioHash } from '../selection.ts';
import type { Item, PresetView } from '../types.ts';
import type { PresetSummary, ProjectBlueprint } from './api.ts';
import { ProblemMark } from './parts.tsx';
import { routeSteps } from './route.ts';
import { TemplateRoute } from './TemplateRoute.tsx';

// Studio's first page, in the grammar of every view: the kicker with the project, the display and
// a dek, then its sections headed as the lists head theirs. Each board template is a row with its
// way of working drawn on the lanes laid flat; the project's blueprint sits under them.

type StartProps = {
  project: string | undefined;
  presets: Remote<PresetSummary[]>;
  // The presets as the app reads them (their types and workflows), for the routes.
  views: readonly PresetView[];
  blueprint: ProjectBlueprint | null;
  items: readonly Item[];
  // Customize writes through Studio: not on a phone, not for a viewer who cannot configure.
  canCustomize: boolean;
};

function SecHead({ title, count, gloss }: { title: string; count?: number; gloss?: string }) {
  return (
    <div className="sec st-sec-h" data-leaf="">
      <h2>{title}</h2>
      {count === undefined ? null : <Count value={count} />}
      {gloss ? <span className="gloss">{gloss}</span> : null}
      <i className="rl" />
    </div>
  );
}

function TemplateRow({
  preset,
  view,
  items,
  canCustomize,
}: {
  preset: PresetSummary;
  view: PresetView | undefined;
  items: readonly Item[];
  canCustomize: boolean;
}) {
  const count = items.filter((item) => preset.collections.includes(item.collection)).length;
  const type = view?.types[0];
  return (
    <li className="st-trow" data-leaf="">
      <a className="st-trow-main" href={studioHash({ kind: 'preset', name: preset.name })}>
        <span className="st-trow-t">
          {preset.problems.length > 0 ? <ProblemMark /> : null}
          {preset.name}
        </span>
        <span className="st-trow-m">
          <span className="id">
            {preset.version === null ? t('studio.index.invalid') : `v${preset.version}`}
          </span>
          <span className="sep">·</span>
          <span className={preset.problems.length > 0 ? 'st-trow-use warn' : 'st-trow-use'}>
            {preset.problems.length > 0
              ? preset.problems[0]
              : preset.collections.length > 0
                ? t('studio.start.usedByBoards', {
                    names: preset.collections.join(', '),
                    items: t('studio.start.itemsCount', { count }),
                  })
                : t('studio.start.notUsed')}
          </span>
          <span className="sep">·</span>
          <span className="st-trow-o">
            {preset.origin === 'official' ? t('studio.start.official') : t('studio.index.project')}
          </span>
        </span>
      </a>
      <span className="st-trow-route">
        {type ? <TemplateRoute steps={routeSteps(type)} /> : null}
      </span>
      {canCustomize ? (
        <a
          className="btn quiet sm st-trow-go"
          href={customizeHash({ kind: 'preset', name: preset.name })}
        >
          <Icon name="sliders" />
          {t('studio.start.customize')}
        </a>
      ) : (
        <span />
      )}
    </li>
  );
}

export function Start({ project, presets, views, blueprint, items, canCustomize }: StartProps) {
  return (
    <div className="st-start">
      <header className="st-shead" data-enter="head">
        <p className="kicker">
          <b>{project ?? t('studio.title')}</b> · {t('studio.start.kicker')}
        </p>
        <h1 className="display">{t('studio.title')}</h1>
        <p className="dek">{t('studio.lede')}</p>
      </header>
      <section className="st-tpls">
        <SecHead
          title={t('studio.start.boardTemplates')}
          {...(presets.status === 'ready' ? { count: presets.value.length } : {})}
          gloss={t('studio.start.boardGloss')}
        />
        {presets.status === 'ready' ? (
          <ul className="st-trows">
            {presets.value.map((preset) => (
              <TemplateRow
                key={`${preset.origin}-${preset.name}`}
                preset={preset}
                view={views.find(({ name }) => name === preset.name)}
                items={items}
                canCustomize={canCustomize}
              />
            ))}
          </ul>
        ) : (
          <p className="empty">
            {presets.status === 'loading' ? t('common.loading') : presets.message}
          </p>
        )}
      </section>
      <section className="st-tpls">
        <SecHead title={t('studio.start.projectTemplates')} gloss={t('studio.blueprintNote')} />
        {blueprint ? (
          <a className="st-bprow" href={studioHash({ kind: 'blueprint', diagram: true })}>
            <span className="st-trow-t">{blueprint.name}</span>
            <span className="st-trow-m">
              <span className="id">{`v${blueprint.version}`}</span>
              <span className="sep">·</span>
              <span>{t('studio.blueprint.boardsCount', { count: blueprint.boards.length })}</span>
              {'upToDate' in blueprint.status && !blueprint.status.upToDate ? (
                <>
                  <span className="sep">·</span>
                  <span className="warn">{t('studio.index.changed')}</span>
                </>
              ) : null}
            </span>
            <span className="st-bprow-links">
              {blueprint.connections.map((text) => (
                <code key={text}>{text}</code>
              ))}
            </span>
          </a>
        ) : (
          <div className="empty-big st-nobp">
            <p>{t('studio.start.noBlueprint')}</p>
            <div className="acts2">
              <a className="btn quiet" href={studioHash({ kind: 'blueprints' })}>
                {t('studio.start.pickBlueprint')}
              </a>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
