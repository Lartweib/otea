import { describe, expect, it } from 'vitest';
import { closeIconNames, ICON_NAMES, iconProblem, isIconName } from './icons.ts';

describe('icon names', () => {
  it('holds every icon of the catalog once', () => {
    expect(ICON_NAMES).toHaveLength(96);
    expect(new Set(ICON_NAMES).size).toBe(ICON_NAMES.length);
    expect(ICON_NAMES.every((name) => /^[a-z]+(-[a-z]+)*$/.test(name))).toBe(true);
  });

  it('knows its names', () => {
    expect(isIconName('layers')).toBe(true);
    expect(isIconName('Layers')).toBe(false);
  });

  it.each([
    ['bgu', ['bug']],
    ['chekbox', ['checkbox']],
    ['brsh', ['brush']],
    ['git', ['git-merge', 'git-branch', 'gift']],
    ['robots', ['robot']],
    ['calender', ['calendar']],
  ])('suggests the names close to %s', (name, close) => {
    expect(closeIconNames(name)).toEqual(close);
  });

  it('suggests nothing for a name far from every icon', () => {
    expect(closeIconNames('xylophone')).toEqual([]);
  });

  it('describes an unknown icon by its path, and nothing for a known one', () => {
    expect(iconProblem('types.bug.icon', 'bug')).toBeUndefined();
    expect(iconProblem('icon', 'flg')).toBe('icon: unknown icon "flg" (did you mean flag?)');
  });
});
