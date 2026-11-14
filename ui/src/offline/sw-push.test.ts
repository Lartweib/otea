import { describe, expect, it } from 'vitest';
import { clickTarget, openFromClick, pushNotification } from './sw-push.ts';

const ORIGIN = 'https://desk.tail1234.ts.net';

describe('pushNotification', () => {
  it('shows what the PC sent, tagged by item, with the way back to it', () => {
    expect(
      pushNotification({
        title: 'Te toca',
        body: 'TASKS-7 · Ship the login',
        tag: 'otea-item-TASKS-7',
        url: '/#/i/TASKS-7',
        item: 'TASKS-7',
      }),
    ).toEqual({
      title: 'Te toca',
      options: {
        body: 'TASKS-7 · Ship the login',
        tag: 'otea-item-TASKS-7',
        icon: '/icons/otea-192.png',
        badge: '/icons/otea-192.png',
        data: { url: '/#/i/TASKS-7' },
      },
    });
  });

  it('still shows something for a push it cannot read: a browser requires one', () => {
    expect(pushNotification(undefined)).toMatchObject({
      title: 'Otea',
      options: { body: '', data: { url: '/#/' } },
    });
    expect(pushNotification({ title: 7 })).toMatchObject({ title: 'Otea' });
  });
});

describe('clickTarget', () => {
  it('opens the item in the app', () => {
    expect(clickTarget({ url: '/#/i/TASKS-7' }, ORIGIN)).toBe(`${ORIGIN}/#/i/TASKS-7`);
  });

  it('never leaves the app', () => {
    expect(clickTarget({ url: 'https://evil.example/#/i/X' }, ORIGIN)).toBe(`${ORIGIN}/#/`);
    expect(clickTarget({ url: '//evil.example/x' }, ORIGIN)).toBe(`${ORIGIN}/#/`);
    expect(clickTarget(undefined, ORIGIN)).toBe(`${ORIGIN}/#/`);
  });
});

type FakeClient = {
  url: string;
  focused: boolean;
  visibilityState: string;
  messages: unknown[];
  postMessage(message: unknown): void;
  focus(): Promise<FakeClient>;
};

function client(url: string, o: Partial<FakeClient> = {}): FakeClient {
  const made: FakeClient = {
    url,
    focused: false,
    visibilityState: 'hidden',
    messages: [],
    postMessage: (message) => made.messages.push(message),
    focus: async () => {
      made.focused = true;
      return made;
    },
    ...o,
  };
  return made;
}

describe('openFromClick', () => {
  const target = `${ORIGIN}/#/i/TASKS-7`;

  it('brings the app forward on the item when it is open', async () => {
    const open = client(`${ORIGIN}/#/`);
    const opened: string[] = [];
    await openFromClick(target, {
      matchAll: async () => [open],
      openWindow: async (url) => {
        opened.push(url);
        return null;
      },
    });
    expect(open.messages).toEqual([{ type: 'open', url: target }]);
    expect(open.focused).toBe(true);
    expect(opened).toEqual([]);
  });

  it('prefers the window in sight', async () => {
    const back = client(`${ORIGIN}/#/`);
    const front = client(`${ORIGIN}/#/b/Tasks`, { visibilityState: 'visible' });
    await openFromClick(target, {
      matchAll: async () => [back, front],
      openWindow: async () => null,
    });
    expect(front.messages).toHaveLength(1);
    expect(back.messages).toEqual([]);
  });

  it('opens the app on the item when it is closed', async () => {
    const opened: string[] = [];
    await openFromClick(target, {
      matchAll: async () => [client('https://elsewhere.example/')],
      openWindow: async (url) => {
        opened.push(url);
        return null;
      },
    });
    expect(opened).toEqual([target]);
  });
});
