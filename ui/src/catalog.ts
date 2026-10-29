import type { ModuleOrigin } from './modules/contract.ts';
import type { FieldView, PresetOrigin, PresetView } from './types.ts';

// A preset field that uses a module.
export type ModuleUse = {
  preset: string;
  version: number;
  origin: PresetOrigin;
  field: FieldView;
  collections: string[];
};

// `unknown`: named by a loaded preset, but this UI has no module of that name.
export type CatalogOrigin = ModuleOrigin | 'unknown';

export type CatalogEntry = { name: string; origin: CatalogOrigin; uses: ModuleUse[] };

type Registered = { readonly name: string; readonly origin: ModuleOrigin };

function usesByModule(presets: readonly PresetView[]): Map<string, ModuleUse[]> {
  const uses = new Map<string, ModuleUse[]>();
  for (const { name, version, origin, fields, collections } of presets) {
    for (const field of fields) {
      const use = { preset: name, version, origin, field, collections };
      uses.set(field.module, [...(uses.get(field.module) ?? []), use]);
    }
  }
  return uses;
}

// Every registered module in registry order, then every unknown module a preset names, by name.
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
  if (uses.length === 0) return 'not used by any loaded preset';
  const presets = new Set(uses.map(({ preset }) => preset));
  const fields = `${uses.length} ${uses.length === 1 ? 'field' : 'fields'}`;
  return presets.size === 1
    ? `${fields} in ${[...presets][0]}`
    : `${fields} in ${presets.size} presets`;
}
