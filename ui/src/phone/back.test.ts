import { describe, expect, it } from 'vitest';
import { type BackWindow, holdBack } from './back.ts';

// A history as the browser keeps it: entries, the one shown, and popstate after a traversal.
function browser(url = 'http://desk/#/i/TAR-1') {
  const entries: { state: unknown; url: string }[] = [{ state: null, url }];
  let at = 0;
  const listeners = new Set<() => void>();
  const pop = () => {
    for (const fn of [...listeners]) fn();
  };
  const win = {
    history: {
      get state() {
        return entries[at]?.state ?? null;
      },
      get length() {
        return at + 1;
      },
      pushState(state: unknown, _title: string, next?: string) {
        entries.splice(at + 1);
        entries.push({ state: structuredClone(state), url: next ?? entries[at]?.url ?? url });
        at += 1;
      },
      back() {
        if (at === 0) return;
        at -= 1;
        pop();
      },
    },
    location: {
      get href() {
        return entries[at]?.url ?? url;
      },
    },
    addEventListener: (_type: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_type: string, fn: () => void) => listeners.delete(fn),
  } as unknown as BackWindow;
  return { win, entries: () => entries.slice(0, at + 1), listeners };
}

describe('Back on a sheet (DR3-12)', () => {
  it('closes the sheet instead of leaving the page, at the same address', () => {
    const { win, entries } = browser();
    let closed = 0;
    holdBack(() => closed++, win);

    expect(entries()).toHaveLength(2);
    expect(entries()[1]?.url).toBe('http://desk/#/i/TAR-1');
    win.history.back();

    expect(closed).toBe(1);
    expect(entries()).toHaveLength(1);
  });

  it('takes its entry off when the sheet is closed another way, so the next Back leaves', () => {
    const { win, entries, listeners } = browser();
    let closed = 0;
    const release = holdBack(() => closed++, win);

    release();

    expect(entries()).toHaveLength(1);
    expect(closed).toBe(0);
    expect(listeners.size).toBe(0);
  });

  it('closes only the sheet on top of another', () => {
    const { win } = browser();
    const closed: string[] = [];
    holdBack(() => closed.push('reader'), win);
    holdBack(() => closed.push('note'), win);

    win.history.back();
    expect(closed).toEqual(['note']);
    win.history.back();
    expect(closed).toEqual(['note', 'reader']);
  });

  it('leaves the sheet under it open when the one on top is closed by hand', () => {
    const { win, entries } = browser();
    const closed: string[] = [];
    holdBack(() => closed.push('reader'), win);
    const note = holdBack(() => closed.push('note'), win);

    note();

    expect(closed).toEqual([]);
    expect(entries()).toHaveLength(2);
  });

  it('does not go back when the page moved on while the sheet was open', () => {
    const { win, entries } = browser();
    const release = holdBack(() => {}, win);
    win.history.pushState(null, '', 'http://desk/#/toca');

    release();

    expect(entries()).toHaveLength(3);
  });
});
