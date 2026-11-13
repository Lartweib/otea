import { boardCounts } from '../derive/toca.ts';
import { iconDrawing } from '../icons/TypeIcon.tsx';
import { IC, type MockIconName } from '../kit/Icon.tsx';
import { iconBadges } from '../place-icons.ts';
import type { Route } from '../selection.ts';
import type { CollectionView, Item } from '../types.ts';

// What the rail lists (SPEC §7.2, mock:1420-1458), worked out from the data alone.

export type RailKey =
  | 'toca'
  | 'atasco'
  | `board:${string}`
  | 'studio'
  | 'settings'
  | 'performance'
  | null;

// The row the selection pill sits on: the view in sight, if the rail lists it.
export function railKey(route: Route): RailKey {
  switch (route.view) {
    case 'toca':
    case 'lan':
      return 'toca';
    case 'atasco':
      return 'atasco';
    case 'board':
      return `board:${route.board}`;
    case 'studio':
    case 'modules':
      return 'studio';
    case 'settings':
      return 'settings';
    case 'performance':
      return 'performance';
    default:
      return null;
  }
}

export type BoardIcon = { kind: 'mock'; name: MockIconName } | { kind: 'type'; name: string };

export type BoardEntry = {
  name: string;
  icon: BoardIcon;
  // The letter that tells it from an earlier board with the same icon (folded, the icons are all
  // that is left).
  letter?: string;
  yours: number;
  open: number;
};

// The mock's own drawing when it has one (bug, paw, book…), else the type catalog's, else a board.
export function boardIcon(icon: string | null | undefined): BoardIcon {
  if (icon && Object.hasOwn(IC, icon)) return { kind: 'mock', name: icon as MockIconName };
  if (icon && iconDrawing(icon)) return { kind: 'type', name: icon };
  return { kind: 'mock', name: 'board' };
}

export function boardEntries(
  collections: readonly CollectionView[],
  items: readonly Item[],
): BoardEntry[] {
  const letters = iconBadges(collections.map((c) => ({ name: c.name, icon: c.icon ?? undefined })));
  return collections.map((c) => {
    const letter = letters.get(c.name);
    return {
      name: c.name,
      icon: boardIcon(c.icon),
      ...(letter ? { letter } : {}),
      ...boardCounts(items, c.name),
    };
  });
}

// The rail clips to its 44 px icon strip when it folds (228 − 184), and opens whole (mock:160-161).
export function foldClip(folded: boolean): string {
  return folded ? 'inset(-8px 184px -8px -8px)' : 'inset(-8px -8px -8px -8px)';
}
