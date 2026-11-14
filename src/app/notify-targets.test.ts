import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_PREFS } from '../core/notify/planner.ts';
import { pairDevice, revokeDevice } from './devices.ts';
import {
  DESKTOP,
  desktopTarget,
  dropEndpoint,
  dropSubscription,
  listTargets,
  saveDesktopPrefs,
  savePrefs,
  saveSubscription,
  targetOfDevice,
} from './notify-targets.ts';
import { memoryContext } from './testing.ts';

const push = (n = 1) => ({
  endpoint: `https://fcm.googleapis.com/fcm/send/${n}`,
  p256dh: 'BPUB',
  auth: 'AUTH',
});

describe('notify targets', () => {
  let db: DatabaseSync;
  let device: string;

  beforeEach(() => {
    db = memoryContext().db;
    device = pairDevice(db, 'Pixel').device.id;
  });

  afterEach(() => db.close());

  it('keeps a device’s subscription with the defaults and its language', () => {
    saveSubscription(db, device, push(), 'es');
    expect(targetOfDevice(db, device)).toEqual({
      id: `device:${device}`,
      device,
      push: push(),
      lang: 'es',
      prefs: DEFAULT_PREFS,
    });
    expect(listTargets(db)).toHaveLength(1);
  });

  it('keeps one subscription per device, the latest, with the prefs it had', () => {
    saveSubscription(db, device, push(1), 'es');
    savePrefs(db, device, { ...DEFAULT_PREFS, stuck: false }, 'en');
    saveSubscription(db, device, push(2), 'en');
    expect(listTargets(db)).toEqual([
      expect.objectContaining({ push: push(2), prefs: { ...DEFAULT_PREFS, stuck: false } }),
    ]);
  });

  it('gives an endpoint to one device only', () => {
    const other = pairDevice(db, 'iPhone').device.id;
    saveSubscription(db, device, push(1), 'es');
    saveSubscription(db, other, push(1), 'es');
    expect(listTargets(db).map((target) => target.device)).toEqual([other]);
  });

  it('refuses prefs for a device that is not subscribed', () => {
    expect(() => savePrefs(db, device, DEFAULT_PREFS, 'es')).toThrow(/not subscribed/);
  });

  it('forgets the subscription when the device unsubscribes or is unpaired', () => {
    saveSubscription(db, device, push(), 'es');
    dropSubscription(db, device);
    expect(listTargets(db)).toEqual([]);

    saveSubscription(db, device, push(), 'es');
    revokeDevice(db, device);
    expect(listTargets(db)).toEqual([]);
  });

  it('forgets an endpoint the push service says is gone', () => {
    saveSubscription(db, device, push(), 'es');
    dropEndpoint(db, push().endpoint);
    expect(listTargets(db)).toEqual([]);
  });

  it('keeps the desktop app’s prefs apart, with the defaults until they change', () => {
    expect(desktopTarget(db)).toEqual({
      id: DESKTOP,
      device: null,
      push: null,
      lang: 'en',
      prefs: DEFAULT_PREFS,
    });
    const quiet = { ...DEFAULT_PREFS, quiet: { from: '22:00', to: '08:00' } };
    saveDesktopPrefs(db, quiet, 'es');
    expect(desktopTarget(db)).toMatchObject({ lang: 'es', prefs: quiet });
    // The desktop app has no subscription: it is not among the targets pushed to.
    expect(listTargets(db)).toEqual([]);
  });
});
