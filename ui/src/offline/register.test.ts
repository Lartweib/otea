import { describe, expect, it, vi } from 'vitest';
import { moveTo, whenInFront } from './register.ts';

const HERE = 'https://desk.tail1.ts.net/p/alpha-aaaaaa/#/';

describe('moveTo', () => {
  it("moves within this project's page by its hash", () => {
    expect(moveTo('/p/alpha-aaaaaa/#/i/PED-1', HERE)).toEqual({ hash: '#/i/PED-1' });
  });

  it("loads another project's page for a notice about it", () => {
    expect(moveTo('/p/beta-bbbbbb/#/i/PED-1', HERE)).toEqual({
      page: 'https://desk.tail1.ts.net/p/beta-bbbbbb/#/i/PED-1',
    });
  });

  it('never leaves for another site', () => {
    expect(moveTo('https://evil.example/#/', HERE)).toBeUndefined();
  });
});

// TS-17: with the app open on Te toca, a tap on Android's bundle of notices pulls the shade away
// and back: the page stays visible, and only its window's focus comes and goes.
describe('whenInFront', () => {
  const setup = () => {
    const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
    const win = new EventTarget();
    const look = vi.fn();
    whenInFront(look, doc, win);
    return { doc, win, look };
  };

  it('looks as the app opens and as it comes back to the front', () => {
    const { doc, look } = setup();
    expect(look).toHaveBeenCalledTimes(1);
    doc.visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(look).toHaveBeenCalledTimes(1);
    doc.visibilityState = 'visible';
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(look).toHaveBeenCalledTimes(2);
  });

  it('looks again as the window gets the focus back while it stays in front', () => {
    const { win, look } = setup();
    win.dispatchEvent(new Event('focus'));
    expect(look).toHaveBeenCalledTimes(1);
    win.dispatchEvent(new Event('blur'));
    win.dispatchEvent(new Event('focus'));
    expect(look).toHaveBeenCalledTimes(2);
  });
});
