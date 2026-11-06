import { t } from '../i18n/i18n.ts';

// What the builder's canvas can draw: the board's real items, then examples that come with the
// preset (their ids can repeat a real one's, so an example's key says so).
export type Option = { key: string; kind: 'real' | 'example'; id: string; title: string };
type Named = { id: string; title: string };

export function optionsOf(real: readonly Named[], examples: readonly Named[]): Option[] {
  return [
    ...real.map(({ id, title }) => ({ key: id, kind: 'real' as const, id, title })),
    ...examples.map(({ id, title }) => ({
      key: `example:${id}`,
      kind: 'example' as const,
      id,
      title,
    })),
  ];
}

// The one asked for if it is there; otherwise an example (a template has no item of its own), then
// whatever there is.
export function pick(options: readonly Option[], wanted: string | undefined): Option | undefined {
  return (
    options.find(({ key }) => key === wanted) ??
    options.find(({ kind }) => kind === 'example') ??
    options[0]
  );
}

export const wordOf = ({ kind, id, title }: Option): string =>
  kind === 'real' ? id : t('cz.example', { name: title });

const LIST = 8;

// The rows a list shows of a board: the item being looked at first, and a few more.
export function rowsOf<T extends { id: string }>(
  items: readonly T[],
  first: string | undefined,
): T[] {
  const at = items.find(({ id }) => id === first);
  return (at ? [at, ...items.filter((each) => each !== at)] : [...items]).slice(0, LIST);
}
