import { describe, expect, it } from 'vitest';
import { ICON_NAMES } from '../../../src/core/icons.ts';
import { ICON_GROUPS, TYPE_ICONS } from './catalog.ts';
import { iconDrawing } from './TypeIcon.tsx';

describe('type icon catalog', () => {
  it('draws every icon name the core accepts, and nothing else', () => {
    expect(Object.keys(TYPE_ICONS).sort()).toEqual([...ICON_NAMES].sort());
  });

  it('files each icon in a known group, with path data only', () => {
    const groups = ICON_GROUPS.map(({ id }) => id) as string[];
    for (const { group, d, fill } of Object.values(TYPE_ICONS)) {
      expect(groups).toContain(group);
      expect(d).toMatch(/^M[\d .,\-MLHVCSQTAZmlhvcsqtaz]+$/);
      if (fill !== undefined) expect(fill).toMatch(/^M/);
    }
  });

  it('finds a drawing by name, and none for an unknown or missing name', () => {
    expect(iconDrawing('bug')).toBe(TYPE_ICONS.bug);
    expect(iconDrawing('toString')).toBeUndefined();
    expect(iconDrawing('unicorn')).toBeUndefined();
    expect(iconDrawing(undefined)).toBeUndefined();
  });
});
