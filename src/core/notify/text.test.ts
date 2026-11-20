import { describe, expect, it } from 'vitest';
import type { Notice } from './planner.ts';
import { noticeText } from './text.ts';

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
    [{ kind: 'ask', by: 'claude' }, 'claude te pregunta', 'claude asks you'],
    [{ kind: 'aside', by: 'kiln' }, 'kiln lo dejó para después', 'kiln set it aside for later'],
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
    expect(noticeText({ ...group, of: 'ask' }, 'es').title).toBe('3 preguntas te esperan');
    expect(noticeText({ ...group, of: 'aside' }, 'en').title).toBe('3 things set aside');
  });

  it('names the project a burst comes from, and keeps one burst per project on screen', () => {
    const web = { id: 'tienda-web-x1', name: 'tienda-web' };
    const group: Notice = {
      kind: 'group',
      count: 3,
      of: 'mixed',
      items: [
        { item: 'A-1', title: 'One', kind: 'turn' },
        { item: 'A-2', title: 'Two', kind: 'stuck' },
        { item: 'A-3', title: 'Three', kind: 'ask' },
      ],
    };
    expect(noticeText(group, 'es', web)).toMatchObject({
      title: '3 cosas te esperan en tienda-web',
      tag: 'otea-group-tienda-web-x1',
    });
    expect(noticeText(group, 'en', web).title).toBe('3 things wait for you in tienda-web');
    expect(noticeText({ ...group, of: 'turn' }, 'es', { id: 'api-z9', name: 'api' }).title).toBe(
      '3 cosas te tocan en api',
    );
  });

  it('keeps a long title short', () => {
    const long = noticeText({ ...review, title: 'x'.repeat(300) }, 'en');
    expect(long.body.length).toBeLessThanOrEqual(100);
    expect(long.body.endsWith('…')).toBe(true);
  });
});
