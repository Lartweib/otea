import { createContext, createElement, type ReactNode, useContext } from 'react';
import { language } from './i18n/i18n.ts';
import type { TypeView } from './types.ts';

// The words a preset wrote (its types, states and fields), in the language on screen when the
// preset labels them in it (`labels: { es: … }`), and as written otherwise. A language labels all
// of a preset or none of it, so a screen never mixes the two. The key stays what the CLI, agents
// and the history use; where a label shows, the key is its tooltip (keyTitle).

function wordsOf(type: TypeView | undefined) {
  return type?.labels?.[language()];
}

export function stateWord(type: TypeView | undefined, state: string): string {
  return wordsOf(type)?.states[state] ?? state;
}

// A state named across a collection's types (a group of the list by state): the first label for it.
export function stateWordIn(types: readonly TypeView[], state: string): string {
  return types.map((type) => wordsOf(type)?.states[state]).find(Boolean) ?? state;
}

// The type's name as people read it: its label in the language on screen, or the preset's label.
export function typeWord(type: TypeView | undefined, fallback: string): string {
  return wordsOf(type)?.label ?? type?.label ?? fallback;
}

// A field's label in the language on screen, or undefined when the preset gives none in it.
export function fieldWord(type: TypeView | undefined, field: string): string | undefined {
  return wordsOf(type)?.fields[field] ?? type?.fields.find((f) => f.name === field)?.label;
}

// A field's value in words in the language on screen, or as written.
export function valueWord(type: TypeView | undefined, field: string, value: string): string {
  return wordsOf(type)?.values?.[field]?.[value] ?? value;
}

// A value named across a collection's types: the first word for it.
export function valueWordIn(types: readonly TypeView[], field: string, value: string): string {
  return types.map((type) => wordsOf(type)?.values?.[field]?.[value]).find(Boolean) ?? value;
}

// The key as a tooltip, when what is shown is its label.
export function keyTitle(shown: string, key: string): string | undefined {
  return shown === key ? undefined : key;
}

// The type of the item a part of the screen is about, for what inside it names states (moves,
// the line under them) without being handed the type.
const ItemTypeContext = createContext<TypeView | undefined>(undefined);

export function ItemTypeScope({
  type,
  children,
}: {
  type: TypeView | undefined;
  children?: ReactNode;
}) {
  return createElement(ItemTypeContext.Provider, { value: type }, children);
}

// A value's word for the item in scope.
export function useValueWord(): (field: string, value: string) => string {
  const type = useContext(ItemTypeContext);
  return (field, value) => valueWord(type, field, value);
}

// A state's word for the item in scope.
export function useStateWord(): (state: string) => string {
  const type = useContext(ItemTypeContext);
  return (state) => stateWord(type, state);
}
