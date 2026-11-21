import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { clickTarget, launchNotice, openFromClick, pushNotification } from './sw-push.ts';

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
        badge: '/icons/otea-badge.png',
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

  // TS-18: Android draws the status-bar badge from the image's alpha alone, so the full-colour icon
  // showed as a white square. The badge is Otea's mark, white on transparent.
  it('badges with a monochrome mark: white, its shape in the alpha alone', () => {
    const png = readFileSync(new URL('../../public/icons/otea-badge.png', import.meta.url));
    const ihdr = png.indexOf('IHDR');
    expect(png.readUInt32BE(ihdr + 4)).toBe(96);
    expect(png[ihdr + 13]).toBe(6);
    const idat = png.indexOf('IDAT');
    const pixels = inflateSync(png.subarray(idat + 4, idat + 4 + png.readUInt32BE(idat - 4)));
    const row = 96 * 4 + 1;
    let ink = 0;
    let clear = 0;
    for (let y = 0; y < 96; y++)
      for (let x = 0; x < 96; x++) {
        const at = y * row + 1 + x * 4;
        expect([pixels[at], pixels[at + 1], pixels[at + 2]]).toEqual([255, 255, 255]);
        if ((pixels[at + 3] ?? 0) > 200) ink++;
        if (pixels[at + 3] === 0) clear++;
      }
    expect(ink).toBeGreaterThan(96 * 96 * 0.15);
    expect(clear).toBeGreaterThan(96 * 96 * 0.4);
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

// TS-17: Android bundles Otea's notices; a tap on the bundle opens the app with no notificationclick,
// so the app looks at what is still in the shade: one notice about an item opens it.
describe('launchNotice', () => {
  const HOME = `${ORIGIN}/p/proj-aaaaaa/#/`;
  const item = (id: string) => ({ data: { url: `/p/proj-aaaaaa/#/i/${id}` } });
  const test = { data: { url: '/#/' } };

  it('opens the one item still in the shade, beside a test notice', () => {
    expect(launchNotice([item('PEN-1'), test], HOME)).toBe(`${ORIGIN}/p/proj-aaaaaa/#/i/PEN-1`);
    expect(launchNotice([item('PEN-1')], `${ORIGIN}/p/proj-aaaaaa/`)).toBe(
      `${ORIGIN}/p/proj-aaaaaa/#/i/PEN-1`,
    );
  });

  it('leaves Te toca, which lists them, when several items wait', () => {
    expect(launchNotice([item('PEN-1'), item('PEN-2')], HOME)).toBeUndefined();
    expect(launchNotice([test], HOME)).toBeUndefined();
    expect(launchNotice([], HOME)).toBeUndefined();
  });

  it('never moves you from a place you opened yourself, nor to another site', () => {
    expect(launchNotice([item('PEN-1')], `${ORIGIN}/p/proj-aaaaaa/#/b/Tasks`)).toBeUndefined();
    expect(
      launchNotice([{ data: { url: 'https://elsewhere.example/#/i/X-1' } }], HOME),
    ).toBeUndefined();
  });
});
