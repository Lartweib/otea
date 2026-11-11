import { language, t } from '../i18n/i18n.ts';
import { modulesHash, type Route, studioHash } from '../selection.ts';
import type { PresetSummary, ProjectBlueprint } from '../studio/api.ts';

// What Studio holds, as the rail unfolds it under Studio while Studio (or the module catalog,
// which lives under it) is open: the project's blueprint, the presets it can use and the modules.
export type StudioTree = {
  blueprint: { name: string; version: number; boards: number } | null;
  presets: {
    name: string;
    // What it is called in the language on screen.
    label: string;
    version: number | null;
    collections: string[];
    official: boolean;
  }[];
  modules: number;
  // The row for the page in view; none on Studio's start.
  current?:
    | { kind: 'blueprint' }
    | { kind: 'preset'; name: string }
    | { kind: 'modules' }
    | undefined;
};

type TreeSource = {
  presets: readonly PresetSummary[];
  blueprint: ProjectBlueprint | null;
  modules: number;
  route: Route;
};

function currentOf(route: Route): StudioTree['current'] {
  if (route.view === 'modules') return { kind: 'modules' };
  if (route.view !== 'studio') return undefined;
  const { page } = route;
  if (page.kind === 'preset') return { kind: 'preset', name: page.name };
  if (page.kind === 'blueprint' || page.kind === 'blueprints') return { kind: 'blueprint' };
  return undefined;
}

// The tree from what Studio already loads: its presets and the project's blueprint.
export function studioTreeOf({ presets, blueprint, modules, route }: TreeSource): StudioTree {
  return {
    blueprint: blueprint
      ? { name: blueprint.name, version: blueprint.version, boards: blueprint.boards.length }
      : null,
    presets: presets.map(({ name, version, collections, origin, names }) => ({
      name,
      label: names?.[language()] ?? name,
      version,
      collections,
      official: origin === 'official',
    })),
    modules,
    current: currentOf(route),
  };
}

const here = (on: boolean) => (on ? ('page' as const) : undefined);

// Under Studio's entry: the blueprint, the presets (each with its version, the collections that
// use it, and "official" for the read-only ones) and the modules, each row leading to its page.
export function StudioTreeView({ tree }: { tree: StudioTree }) {
  const { blueprint, presets, modules, current } = tree;
  return (
    <div className="rail-tree">
      <span className="rail-tree-label">{t('studio.index.blueprint')}</span>
      <a
        className="rail-leaf"
        href={
          blueprint
            ? studioHash({ kind: 'blueprint', diagram: false })
            : studioHash({ kind: 'blueprints' })
        }
        aria-current={here(current?.kind === 'blueprint')}
      >
        <span className="rail-leaf-name">
          {blueprint ? blueprint.name : t('studio.index.noBlueprint')}
        </span>
        <span className="rail-leaf-meta">
          {blueprint
            ? `v${blueprint.version} · ${t('studio.blueprint.boardsCount', { count: blueprint.boards })}`
            : null}
        </span>
      </a>
      {presets.length > 0 ? (
        <>
          <span className="rail-tree-label">{t('studio.index.presets')}</span>
          {presets.map((preset) => (
            <a
              key={preset.name}
              className="rail-leaf"
              href={studioHash({ kind: 'preset', name: preset.name })}
              aria-current={here(current?.kind === 'preset' && current.name === preset.name)}
            >
              <span className="rail-leaf-name">{preset.label}</span>
              {preset.official ? <span className="rail-leaf-tag">{t('rail.official')}</span> : null}
              <span className="rail-leaf-meta">
                {[
                  preset.version === null ? t('studio.index.invalid') : `v${preset.version}`,
                  ...(preset.collections.length > 0 ? [preset.collections.join(', ')] : []),
                ].join(' · ')}
              </span>
            </a>
          ))}
        </>
      ) : null}
      <a
        className="rail-leaf rail-leaf-modules"
        href={modulesHash()}
        aria-current={here(current?.kind === 'modules')}
      >
        <span className="rail-leaf-name">{t('app.modules')}</span>
        <span className="rail-leaf-meta">{modules}</span>
      </a>
    </div>
  );
}
