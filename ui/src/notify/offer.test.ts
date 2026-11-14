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
  it('offers the desktop app its own notifications, on this computer', () => {
    expect(notifyOffer({ ...phone, target: 'desktop', key: null, desktopApp: true })).toBe(
      'desktop',
    );
  });

  it('offers nothing in a plain browser on this computer: the phone and the desktop app are told', () => {
    expect(notifyOffer({ ...phone, target: 'desktop', key: null })).toBeNull();
  });

  it('offers push to a phone on HTTPS', () => {
    expect(notifyOffer(phone)).toBe('push');
  });

  it('explains a phone on the local network’s plain HTTP needs HTTPS', () => {
    expect(notifyOffer({ ...phone, key: null })).toBe('needs-https');
  });

  it('explains an iPhone needs Otea on its home screen first', () => {
    expect(notifyOffer({ ...phone, platform: 'ios', hasPush: false })).toBe('needs-home-screen');
    expect(notifyOffer({ ...phone, platform: 'ios', standalone: true })).toBe('push');
  });

  it('says when this browser cannot receive them, or they were blocked', () => {
    expect(notifyOffer({ ...phone, hasPush: false })).toBe('unsupported');
    expect(notifyOffer({ ...phone, permission: 'denied' })).toBe('blocked');
  });
});
