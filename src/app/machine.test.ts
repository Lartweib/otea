import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { listDevices, pairDevice } from './devices.ts';
import { forgetLocalProject, localProjects, openMachine, rememberLocalProject } from './machine.ts';
import { lanOpen, setLanOpen } from './phone.ts';

const home = () => mkdtempSync(join(tmpdir(), 'otea-machine-'));

describe('the machine store', () => {
  it('lives in the Otea home and keeps devices and the phone settings for every project', () => {
    const dir = home();
    const env = { OTEA_HOME: dir };
    const first = openMachine(env);
    pairDevice(first, 'Pixel');
    setLanOpen(first, true);
    first.close();

    expect(existsSync(join(dir, 'machine.db'))).toBe(true);
    const again = openMachine(env);
    expect(listDevices(again).map((device) => device.name)).toEqual(['Pixel']);
    expect(lanOpen(again)).toBe(true);
    again.close();
  });

  it('remembers the local projects the server serves, once each', () => {
    const db = openMachine({ OTEA_HOME: home() });
    rememberLocalProject(db, { id: 'web-aaaaaa', root: 'D:/web' });
    rememberLocalProject(db, { id: 'web-aaaaaa', root: 'D:/web-moved' });
    rememberLocalProject(db, { id: 'api-bbbbbb', root: 'D:/api' });

    expect(localProjects(db)).toEqual([
      { id: 'web-aaaaaa', root: 'D:/web-moved' },
      { id: 'api-bbbbbb', root: 'D:/api' },
    ]);
    forgetLocalProject(db, 'web-aaaaaa');
    expect(localProjects(db)).toEqual([{ id: 'api-bbbbbb', root: 'D:/api' }]);
    db.close();
  });
});
