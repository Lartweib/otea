import { OteaError } from './errors.ts';
import type { ItemType, Preset } from './preset.ts';

function article(word: string): string {
  return /^[aeiou]/.test(word) ? `an ${word}` : `a ${word}`;
}

function listed(words: readonly string[], last: 'and' | 'or'): string {
  if (words.length < 2) return words.join('');
  return `${words.slice(0, -1).join(', ')} ${last} ${words.at(-1)}`;
}

// A parent of a type that lists its children takes only those; a type without the list takes any.
// `parent` is the parent item's id, to name it.
export function assertTakesChild(parent: string, type: ItemType, child: string): void {
  const { children } = type;
  if (children === undefined || children.includes(child)) return;
  const takes =
    children.length === 0
      ? 'takes no children'
      : `takes ${listed(children, 'and')} as children, not ${child}`;
  throw new OteaError('parent_type', `${parent} is ${article(type.name)}, which ${takes}`);
}

// A type that may not stand alone is created under a parent, of a type that takes it.
export function assertStandsAlone(preset: Preset, type: ItemType): void {
  if (type.root !== false) return;
  const parents = preset.types
    .filter(({ children }) => children?.includes(type.name))
    .map(({ name }) => article(name));
  const named = article(type.name);
  throw new OteaError(
    'parent_required',
    `${named[0]?.toUpperCase()}${named.slice(1)} needs a parent (${listed(parents, 'or')}); create it with --parent <id>`,
  );
}
