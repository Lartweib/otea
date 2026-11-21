// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Live, useLive } from './hooks.ts';
import { mount } from './test-dom.tsx';

// The installed app on the phone, opened or brought back with the PC out of reach (Tailscale off on
// the phone, Otea closed): it reads again as it comes to the front, so the offline line shows what is
// true now, and Reintentar opens the stream and reads everything again at once.

class FakeSource {
  static all: FakeSource[] = [];
  static CLOSED = 2;
  readyState = 0;
  closed = false;
  listeners = new Map<string, () => void>();
  url: string;
  constructor(url: string) {
    this.url = url;
    FakeSource.all.push(this);
  }
  addEventListener(type: string, fn: () => void) {
    this.listeners.set(type, fn);
  }
  close() {
    this.closed = true;
    this.readyState = 2;
  }
}

let seen: Live;
function Probe() {
  seen = useLive();
  return null;
}

beforeEach(() => {
  FakeSource.all = [];
  vi.stubGlobal('EventSource', FakeSource);
});
afterEach(() => vi.unstubAllGlobals());

const setVisible = (state: 'visible' | 'hidden') => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: state });
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
};

describe('the live stream, as the app comes back', () => {
  it('reads again when the app comes to the front', () => {
    const page = mount(createElement(Probe));
    const before = seen.version;

    setVisible('hidden');
    expect(seen.version).toBe(before);
    setVisible('visible');
    expect(seen.version).toBe(before + 1);
    page.unmount();
  });

  it('Reintentar opens the stream again and reads everything again', () => {
    const page = mount(createElement(Probe));
    const first = FakeSource.all[0];
    const before = seen.version;

    act(() => seen.retry());

    expect(first?.closed).toBe(true);
    expect(FakeSource.all).toHaveLength(2);
    expect(seen.version).toBe(before + 1);
    page.unmount();
  });
});
