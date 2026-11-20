import { describe, expect, it } from 'vitest';
import { iconBadges, monogramOf } from './place-icons.ts';

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
