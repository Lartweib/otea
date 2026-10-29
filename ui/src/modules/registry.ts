import type { FieldModule } from '../types.ts';
import type { FieldModuleUi } from './contract.ts';
import { enumModule } from './enum.tsx';
import { markdown } from './markdown.tsx';
import { PlainText, TextInput, text } from './text.tsx';

// Keyed by the core module names: a module added to the preset format fails the typecheck here.
const OFFICIAL: Readonly<Record<FieldModule, FieldModuleUi>> = {
  text,
  markdown,
  enum: enumModule,
};

export const MODULES: readonly FieldModuleUi[] = Object.values(OFFICIAL);

// A module this build does not know (a newer server, a local module) shows and edits as plain text.
export const FALLBACK_MODULE: FieldModuleUi = {
  name: 'unknown',
  summary: 'Unknown module: renders as plain text.',
  origin: 'official',
  Detail: PlainText,
  Edit: TextInput,
  samples: [],
  yaml: '',
};

export function isKnownModule(name: string): name is FieldModule {
  return Object.hasOwn(OFFICIAL, name);
}

export function moduleFor(name: string): FieldModuleUi {
  return isKnownModule(name) ? OFFICIAL[name] : FALLBACK_MODULE;
}
