import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { tempDatabase } from '../server/testing.ts';
import { migrate } from '../store/migrations.ts';
import { listDevices, pairDevice } from './devices.ts';

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
});
