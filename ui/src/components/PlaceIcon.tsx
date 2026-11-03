import type { CSSProperties } from 'react';
import { iconDrawing, TypeIcon } from '../icons/TypeIcon.tsx';
import { monogramOf } from '../place-icons.ts';

// A project's monogram on a neutral tile, sized like the icon it stands in for.
export function Monogram({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <span
      className="monogram"
      style={{ '--mono': `${size}px` } as CSSProperties}
      aria-hidden="true"
    >
      {monogramOf(name)}
    </span>
  );
}

type PlaceIconProps = {
  // The icon's name in the catalog; none (or one this build does not know) draws the monogram.
  icon: string | undefined;
  name: string;
  size?: number;
  // The letter that tells this collection from an earlier one with the same icon.
  badge?: string | undefined;
};

// The icon of a project or a collection, never a gap: the named icon, else the place's monogram.
export function PlaceIcon({ icon, name, size = 16, badge }: PlaceIconProps) {
  return (
    <span className="place-icon">
      {iconDrawing(icon) ? (
        <TypeIcon name={icon} size={size} />
      ) : (
        <Monogram name={name} size={size + 1} />
      )}
      {badge ? (
        <span className="place-badge" aria-hidden="true">
          {badge}
        </span>
      ) : null}
    </span>
  );
}
