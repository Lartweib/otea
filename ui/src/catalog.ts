import { t } from './i18n/i18n.ts';
import type { ModuleOrigin } from './modules/contract.ts';
import type { FieldView, PresetView } from './types.ts';

// A board field that shows through a module.
export type ModuleUse = { board: string; field: FieldView };

// `unknown`: named by a board's field, but this UI has no module of that name.
export type CatalogOrigin = ModuleOrigin | 'unknown';

export type CatalogEntry = { name: string; origin: CatalogOrigin; uses: ModuleUse[] };

type Registered = { readonly name: string; readonly origin: ModuleOrigin };

// The boards and their fields, as the server serves them: each board's fields come in the preset it
// was compiled to, which names the board among its collections. A preset no board was read from
// (an official one, kept for reading old collections) is no board's.
export function boardsOf(presets: readonly PresetView[]): { board: string; fields: FieldView[] }[] {
  return presets.flatMap(({ fields, collections }) =>
    collections.map((board) => ({ board, fields })),
  );
}

function usesByModule(presets: readonly PresetView[]): Map<string, ModuleUse[]> {
  const uses = new Map<string, ModuleUse[]>();
  for (const { board, fields } of boardsOf(presets)) {
    for (const field of fields) {
      uses.set(field.module, [...(uses.get(field.module) ?? []), { board, field }]);
    }
  }
  return uses;
}

// Every registered module in registry order, then every unknown module a board names, by name.
export function catalogEntries(
  registered: readonly Registered[],
  presets: readonly PresetView[],
): CatalogEntry[] {
  const uses = usesByModule(presets);
  const known = new Set(registered.map(({ name }) => name));
  const unknown = [...uses.keys()].filter((name) => !known.has(name)).sort();
  return [
    ...registered.map(({ name, origin }) => ({ name, origin, uses: uses.get(name) ?? [] })),
    ...unknown.map((name) => ({ name, origin: 'unknown' as const, uses: uses.get(name) ?? [] })),
  ];
}

export function usageSummary(uses: readonly ModuleUse[]): string {
  if (uses.length === 0) return t('catalog.unused');
  const boards = new Set(uses.map(({ board }) => board));
  const fields = t('catalog.fields', { count: uses.length });
  return boards.size === 1
    ? t('catalog.onBoard', { fields, board: [...boards][0] ?? '' })
    : t('catalog.onBoards', { fields, count: boards.size });
}
