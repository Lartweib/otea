import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { tempDatabase } from '../server/testing.ts';
import { migrate } from '../store/migrations.ts';
import { listDevices, pairDevice, repairDevice, touchDevice } from './devices.ts';

describe('listDevices', () => {
  let temp: ReturnType<typeof tempDatabase>;
  let db: ReturnType<ReturnType<typeof tempDatabase>['open']>;

  beforeEach(() => {
    temp = tempDatabase();
    db = temp.open();
    migrate(db);
  });

  afterEach(() => {
    db.close();
    temp.remove();
  });

  it('lists devices paired in the same millisecond in the order they were paired', () => {
    const now = new Date('2026-11-18T03:00:00.000Z');
    const names = Array.from({ length: 12 }, (_, index) => `Phone ${index + 1}`);
    for (const name of names) pairDevice(db, name, now);

    expect(listDevices(db).map((device) => device.name)).toEqual(names);
  });

  it('keeps how each device last reached Otea: paired on one door, seen on another', () => {
    const now = new Date('2026-11-21T03:00:00.000Z');
    const { device } = pairDevice(db, 'Pixel · Edge', now, 'lan');
    expect(device.via).toBe('lan');

    touchDevice(db, device.id, now, 'tailscale');
    expect(listDevices(db)[0]?.via).toBe('tailscale');

    expect(repairDevice(db, device.id, 'Pixel', now, 'lan').device.via).toBe('lan');
    // Paired before Otea kept it: not known until it is seen.
    expect(pairDevice(db, 'Old', now).device.via).toBeNull();
  });
});
