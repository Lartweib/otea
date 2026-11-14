import { describe, expect, it } from 'vitest';
import type { Notice } from './planner.ts';
import { itemUrl, noticeText } from './text.ts';

const review: Notice = { kind: 'turn', item: 'TASKS-7', title: 'Ship the login' };

describe('noticeText', () => {
  it('names the item and opens it', () => {
    expect(noticeText(review, 'es')).toEqual({
      title: 'Te toca',
      body: 'TASKS-7 · Ship the login',
      tag: 'otea-item-TASKS-7',
      url: '/#/i/TASKS-7',
      item: 'TASKS-7',
    });
    expect(noticeText(review, 'en').title).toBe('Your turn');
  });

  it.each([
    [{ kind: 'turn', asks: true, by: 'claude' }, 'claude te pregunta', 'claude asks you'],
    [{ kind: 'replied', by: 'claude' }, 'claude contestó tu nota', 'claude answered your note'],
    [{ kind: 'stuck', by: 'codex' }, 'Se atascó · codex no responde', 'Stuck · codex went quiet'],
  ] as const)('says %j in Spanish and English', (what, es, en) => {
    const notice = { ...review, ...what } as Notice;
    expect(noticeText(notice, 'es').title).toBe(es);
    expect(noticeText(notice, 'en').title).toBe(en);
  });

  it('counts a burst and opens Te toca', () => {
    const group: Notice = {
      kind: 'group',
      count: 3,
      of: 'turn',
      items: [
        { item: 'A-1', title: 'One', kind: 'turn' },
        { item: 'A-2', title: 'Two', kind: 'turn' },
        { item: 'A-3', title: 'Three', kind: 'turn' },
      ],
    };
    expect(noticeText(group, 'es')).toEqual({
      title: '3 cosas te tocan',
      body: 'One · Two · Three',
      tag: 'otea-group',
      url: '/#/',
      item: null,
    });
    expect(noticeText({ ...group, of: 'mixed' }, 'en').title).toBe('3 things wait for you');
    expect(noticeText({ ...group, of: 'stuck' }, 'es').title).toBe('3 cosas se atascaron');
    expect(noticeText({ ...group, of: 'replied' }, 'en').title).toBe('3 notes answered');
  });

  it('keeps a long title short', () => {
    const long = noticeText({ ...review, title: 'x'.repeat(300) }, 'en');
    expect(long.body.length).toBeLessThanOrEqual(100);
    expect(long.body.endsWith('…')).toBe(true);
  });

  it('encodes the item in the link', () => {
    expect(itemUrl('A B/1')).toBe('/#/i/A%20B%2F1');
  });
});
