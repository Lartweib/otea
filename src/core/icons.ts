// The names of the type icons a preset may give its types (`icon: bug`). The drawings live in the
// UI (`ui/src/icons/`), keyed by these names, so the core checks a preset without carrying them.
export const ICON_NAMES = [
  // work
  'layers',
  'checkbox',
  'list',
  'stack',
  'inbox',
  'flag',
  'milestone',
  'target',
  'rocket',
  'clipboard',
  'calendar',
  'clock',
  'hourglass',
  // code
  'bug',
  'git-branch',
  'git-merge',
  'terminal',
  'code',
  'brackets',
  'database',
  'server',
  'plug',
  'cpu',
  'package',
  'gear',
  'wrench',
  'shield',
  'lock',
  'key',
  'cloud',
  // design and media
  'image',
  'film',
  'camera',
  'play',
  'music',
  'palette',
  'brush',
  'pen',
  'ruler',
  'shapes',
  'eye',
  'frame',
  'sparkle',
  // docs and talk
  'book',
  'doc',
  'note',
  'chat-bubble',
  'question',
  'lightbulb',
  'megaphone',
  'bookmark',
  'quote',
  'link',
  'mail',
  // game and creatures
  'paw',
  'feather',
  'bone',
  'egg',
  'fish',
  'bird',
  'leaf',
  'sprout',
  'tree',
  'mountain',
  'flame',
  'drop',
  'moon',
  'sun',
  'crystal',
  'sword',
  'shieldcrest',
  'potion',
  'map',
  'compass',
  'dice',
  'controller',
  'heart',
  'star',
  'skull',
  'crown',
  'ghost',
  // status and flow
  'puzzle',
  'beaker',
  'magnet',
  'bolt',
  'anchor',
  'hook',
  'trophy',
  'gift',
  'tag',
  'pin',
  'globe',
  'home',
  'user',
  'users',
  'robot',
] as const;

export type IconName = (typeof ICON_NAMES)[number];

export function isIconName(name: string): name is IconName {
  return (ICON_NAMES as readonly string[]).includes(name);
}

// Edits between two names: insertions, deletions, substitutions and swaps of two neighbours.
function distance(a: string, b: string): number {
  const rows = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  const at = (i: number, j: number) => rows[i]?.[j] ?? 0;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(at(i - 1, j) + 1, at(i, j - 1) + 1, at(i - 1, j - 1) + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, at(i - 2, j - 2) + 1);
      }
      const row = rows[i];
      if (row) row[j] = best;
    }
  }
  return at(a.length, b.length);
}

// The icon names closest to a mistyped one: those containing it (or contained in it) first, then
// those a few edits away, nearest first.
export function closeIconNames(name: string, limit = 3): IconName[] {
  const needle = name.trim().toLowerCase();
  const allowed = needle.length <= 4 ? 1 : 2;
  const contains = (icon: string) =>
    needle.length >= 3 && (icon.includes(needle) || needle.includes(icon));
  return ICON_NAMES.map((icon) => ({ icon, edits: distance(needle, icon), part: contains(icon) }))
    .filter(({ edits, part }) => part || edits <= allowed)
    .sort((a, b) => Number(b.part) - Number(a.part) || a.edits - b.edits)
    .slice(0, limit)
    .map(({ icon }) => icon);
}

export function iconProblem(at: string, name: string): string | undefined {
  if (isIconName(name)) return undefined;
  const close = closeIconNames(name);
  const hint =
    close.length > 0
      ? `did you mean ${close.join(', ')}?`
      : `none of the ${ICON_NAMES.length} icons is close; see the icon list in the preset format`;
  return `${at}: unknown icon "${name}" (${hint})`;
}
