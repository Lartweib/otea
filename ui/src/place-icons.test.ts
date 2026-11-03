import { describe, expect, it } from 'vitest';
import { collectionIcon, iconBadges, monogramOf } from './place-icons.ts';
import type { CollectionView, Item, TypeView } from './types.ts';
import { sidebarEntries } from './workspace.ts';

const type = (name: string, icon?: string) =>
  ({ name, ...(icon === undefined ? {} : { icon }) }) as TypeView;
const collection = (name: string, types: TypeView[], icon: string | null) =>
  ({ name, types, icon }) as CollectionView;

describe('monogramOf', () => {
  it('takes the initials of a name of two words', () => {
    expect(monogramOf('astra-bestiary')).toBe('AB');
    expect(monogramOf('my project')).toBe('MP');
  });

  it('takes the first two letters of a name of one word, so an O never stands alone', () => {
    expect(monogramOf('supervisor')).toBe('Su');
    expect(monogramOf('otea')).toBe('Ot');
    expect(monogramOf('x')).toBe('X');
  });
});

describe('collectionIcon', () => {
  it('draws the icon the server resolved', () => {
    expect(collectionIcon(collection('bugs', [type('bug', 'flag')], 'bug'))).toBe('bug');
  });

  it('draws nothing (the monogram) when the server resolved none', () => {
    expect(collectionIcon(collection('notes', [type('note', 'note')], null))).toBeUndefined();
  });

  it('draws nothing for a collection it does not know', () => {
    expect(collectionIcon(undefined)).toBeUndefined();
  });
});

describe('iconBadges', () => {
  it('gives a letter to the second collection with an icon, never the first', () => {
    const badges = iconBadges([
      { name: 'bugs', icon: 'bug' },
      { name: 'bugs-mobile', icon: 'bug' },
      { name: 'work', icon: 'checkbox' },
    ]);
    expect([...badges]).toEqual([['bugs-mobile', 'm']]);
  });

  it('falls back to the name’s own first letter when nothing tells them apart at one place', () => {
    const badges = iconBadges([
      { name: 'alpha', icon: 'bug' },
      { name: 'Beta', icon: 'bug' },
      { name: 'gamma', icon: undefined },
      { name: 'delta', icon: undefined },
    ]);
    expect([...badges]).toEqual([['Beta', 'b']]);
  });
});

describe('sidebarEntries', () => {
  it('lists the collections with their counts, icons and badges', () => {
    const items = [{ id: 'BUGS-1', collection: 'bugs', turn: 'human' } as Item];
    const views = [
      collection('bugs', [type('bug')], 'bug'),
      collection('bugs-mobile', [type('bug')], 'bug'),
    ];
    const lookup = (name: string) => views.find((view) => view.name === name);
    expect(sidebarEntries(['bugs', 'bugs-mobile'], items, lookup)).toEqual([
      { name: 'bugs', yours: 1, open: 1, icon: 'bug' },
      { name: 'bugs-mobile', yours: 0, open: 0, icon: 'bug', badge: 'm' },
    ]);
  });
});
