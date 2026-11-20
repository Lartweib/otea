import { describe, expect, it } from 'vitest';
import { type NotifyPlace, notifyOffer } from './offer.ts';

const phone: NotifyPlace = {
  target: 'device',
  key: 'BKEY',
  desktopApp: false,
  hasPush: true,
  platform: 'android',
  standalone: false,
  permission: 'default',
};

describe('notifyOffer', () => {
  it.each<[string, Partial<NotifyPlace>, ReturnType<typeof notifyOffer>]>([
    [
      'offers the desktop app its own notifications, on this computer',
      { target: 'desktop', key: null, desktopApp: true },
      'desktop',
    ],
    [
      'offers nothing in a plain browser on this computer: the phone and the desktop app are told',
      { target: 'desktop', key: null },
      null,
    ],
    ['offers push to a phone on HTTPS', {}, 'push'],
    [
      'explains a phone on the local network’s plain HTTP needs HTTPS',
      { key: null },
      'needs-https',
    ],
    [
      'explains an iPhone needs Otea on its home screen first',
      { platform: 'ios', hasPush: false },
      'needs-home-screen',
    ],
    [
      'offers push to an iPhone with Otea on its home screen',
      { platform: 'ios', standalone: true },
      'push',
    ],
    ['says when this browser cannot receive them', { hasPush: false }, 'unsupported'],
    ['says when they were blocked', { permission: 'denied' }, 'blocked'],
  ])('%s', (_, over, offer) => {
    expect(notifyOffer({ ...phone, ...over })).toBe(offer);
  });
});
