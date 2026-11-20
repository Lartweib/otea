import { describe, expect, it } from 'vitest';
import { PHONE_QUERY } from '../hooks.ts';
import { type BackWindow, holdBack, holdBackOnPhone, type PhoneWindow } from './back.ts';

// A history as the browser keeps it: entries, the one shown, and popstate after a traversal. With
// `later`, a traversal waits for land(), as a browser's does: it runs after the task that asked for
// it, from the entry shown then.
function browser(url = 'http://desk/#/i/TAR-1', o: { later?: boolean } = {}) {
  const entries: { state: unknown; url: string }[] = [{ state: null, url }];
  let at = 0;
  const listeners = new Set<() => void>();
  const queued: (() => void)[] = [];
  const pop = () => {
    for (const fn of [...listeners]) fn();
  };
  const land = () => {
    for (const run of queued.splice(0)) run();
  };
  const traverse = () => {
    if (at === 0) return;
    at -= 1;
    pop();
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
        if (o.later) queued.push(traverse);
        else traverse();
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
  // A link or `location.hash = …`: a new entry, and the popstate a browser fires on a fragment change.
  const navigate = (next: string) => {
    win.history.pushState(null, '', next);
    pop();
  };
  return { win, entries: () => entries.slice(0, at + 1), listeners, land, navigate };
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

  // P7-R3-12: a row of the nav sheet, or Preferencias' «Teléfono, en Configuración…», takes the
  // page elsewhere while the sheet's entry is still under it. Back from there showed the page under
  // the sheet, and the next Back did nothing at all.
  it('skips the entry a sheet left under a page it took you to, so no Back does nothing', () => {
    const { win, entries, navigate } = browser('http://desk/#/toca');
    let closed = 0;
    const release = holdBack(() => closed++, win);
    navigate('http://desk/#/b/Ideas');
    release();

    expect(closed).toBe(1);
    win.history.back();

    expect(entries()).toHaveLength(1);
    expect(win.location.href).toBe('http://desk/#/toca');
  });

  it('skips it too when the page moved on without a popstate', () => {
    const { win, entries } = browser('http://desk/#/toca');
    const release = holdBack(() => {}, win);
    win.history.pushState(null, '', 'http://desk/#/b/Ideas');
    release();

    win.history.back();

    expect(entries()).toHaveLength(1);
    expect(win.location.href).toBe('http://desk/#/toca');
  });

  it('skips the entry of a sheet closed by hand under one still open, once Back closes that one', () => {
    const { win, entries } = browser();
    const closed: string[] = [];
    const reader = holdBack(() => closed.push('reader'), win);
    holdBack(() => closed.push('note'), win);
    reader();

    win.history.back();

    expect(closed).toEqual(['note']);
    expect(entries()).toHaveLength(1);
  });

  // P7-R3-12: Preferencias opens from the nav sheet once it has gone. The Back that takes the nav
  // sheet's entry off lands later, as a browser's does; pushed before it, the pop's entry was the
  // one it took off, so the pop closed, or Back then left the page under it.
  it('opens a sheet only once the Back of the one closed before it has landed', () => {
    const { win, entries, land } = browser('http://desk/#/toca', { later: true });
    const closed: string[] = [];
    const nav = holdBack(() => closed.push('nav'), win);
    nav();
    holdBack(() => closed.push('prefs'), win);
    land();

    expect(closed).toEqual([]);
    expect(entries()).toHaveLength(2);
    win.history.back();
    land();
    expect(closed).toEqual(['prefs']);
    expect(entries()).toHaveLength(1);
  });

  it('pushes nothing for a sheet closed before the Back it waited for landed', () => {
    const { win, entries, land } = browser('http://desk/#/toca', { later: true });
    const nav = holdBack(() => {}, win);
    nav();
    const prefs = holdBack(() => {}, win);
    prefs();
    land();

    expect(entries()).toHaveLength(1);
  });
});

// P7-R3-12: on the phone a pop (Preferencias, a menu) and a dialog hold Back as a sheet does; on
// the desk Back stays the browser's.
describe('Back on a pop', () => {
  const sized = (phone: boolean) => {
    const made = browser();
    const win = Object.assign(made.win, {
      matchMedia: (query: string) => ({ matches: phone && query === PHONE_QUERY }),
    }) as PhoneWindow;
    return { ...made, win };
  };

  it('closes it on the phone, at the same address', () => {
    const { win, entries } = sized(true);
    let closed = 0;
    holdBackOnPhone(() => closed++, win);

    expect(entries()).toHaveLength(2);
    win.history.back();
    expect(closed).toBe(1);
    expect(entries()).toHaveLength(1);
  });

  it('leaves Back to the browser on the desk', () => {
    const { win, entries, listeners } = sized(false);
    const release = holdBackOnPhone(() => {}, win);

    expect(entries()).toHaveLength(1);
    expect(listeners.size).toBe(0);
    release();
    expect(entries()).toHaveLength(1);
  });
});
