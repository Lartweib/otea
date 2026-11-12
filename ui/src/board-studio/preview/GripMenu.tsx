import { useRef, useState } from 'react';
import { t } from '../../i18n/i18n.ts';
import { MenuItem, MenuLabel } from '../../kit/pop/Menu.tsx';
import { Pop } from '../../kit/pop/Pop.tsx';
import { PLACES, type Place } from './arrange.ts';

// A tile's handle in Acomodar: «Llevar a…» each zone, and «Quitar la columna de la lista» when it
// shows in the list row. The keyboard's and the phone's way to move a tile.

export const placeName = (place: Place): string =>
  t(`bs.preview.zone.${place}` as 'bs.preview.zone.top');

export function GripMenu({
  name,
  current,
  inRow,
  onPick,
}: {
  name: string;
  current: Place;
  inRow: boolean;
  onPick: (to: Place | 'unrow') => void;
}) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={button}
        type="button"
        className="bsp-grip"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('bs.preview.grip', { name })}
        title={t('bs.preview.gripTip')}
        onClick={() => setOpen(!open)}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <g fill="currentColor">
            <circle cx="6" cy="4" r="1.1" />
            <circle cx="10" cy="4" r="1.1" />
            <circle cx="6" cy="8" r="1.1" />
            <circle cx="10" cy="8" r="1.1" />
            <circle cx="6" cy="12" r="1.1" />
            <circle cx="10" cy="12" r="1.1" />
          </g>
        </svg>
      </button>
      <Pop
        open={open}
        anchor={button.current}
        place="below-right"
        label={t('bs.preview.moveTo')}
        onClose={() => setOpen(false)}
      >
        <MenuLabel>{t('bs.preview.moveTo')}</MenuLabel>
        {PLACES.map((place) => (
          <MenuItem
            key={place}
            on={place === current || (place === 'row' && inRow)}
            small={t(`bs.preview.zone.${place}.gloss` as 'bs.preview.zone.top.gloss')}
            onPick={() => onPick(place)}
          >
            {placeName(place)}
          </MenuItem>
        ))}
        {inRow ? <MenuItem onPick={() => onPick('unrow')}>{t('bs.preview.unrow')}</MenuItem> : null}
      </Pop>
    </>
  );
}
