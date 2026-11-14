import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OteaError } from '../core/errors.ts';
import {
  choosePhoneTransport,
  lanOpen,
  phoneSettings,
  phoneStatus,
  setLanOpen,
  switchToTailscale,
} from './phone.ts';
import type { Project } from './project.ts';
import { fakeTailscale, TAILNET_HOST } from './tailscale-testing.ts';
import { memoryContext, projectOf } from './testing.ts';

describe('the phone transport setting', () => {
  let project: Project;

  beforeEach(() => {
    project = projectOf('/memory', memoryContext());
  });

  afterEach(() => project.db.close());

  it('is the local network until one is chosen', () => {
    expect(phoneSettings(project.db)).toEqual({ transport: 'lan', tailscaleHost: null });
  });

  it('keeps the Tailscale name a phone opens, and goes back to the local network', () => {
    choosePhoneTransport(project.db, {
      transport: 'tailscale',
      tailscaleHost: 'desk.tail1.ts.net',
    });
    expect(phoneSettings(project.db)).toEqual({
      transport: 'tailscale',
      tailscaleHost: 'desk.tail1.ts.net',
    });

    choosePhoneTransport(project.db, { transport: 'lan', tailscaleHost: null });
    expect(phoneSettings(project.db)).toEqual({ transport: 'lan', tailscaleHost: null });
  });

  it('keeps the local network closed until it is opened, and remembers the choice', () => {
    expect(lanOpen(project.db)).toBe(false);

    setLanOpen(project.db, true);
    expect(lanOpen(project.db)).toBe(true);
    expect(phoneSettings(project.db)).toEqual({ transport: 'lan', tailscaleHost: null });

    setLanOpen(project.db, false);
    expect(lanOpen(project.db)).toBe(false);
  });

  it('keeps the local network open whichever transport is chosen', () => {
    setLanOpen(project.db, true);
    choosePhoneTransport(project.db, { transport: 'tailscale', tailscaleHost: TAILNET_HOST });
    expect(lanOpen(project.db)).toBe(true);

    setLanOpen(project.db, false);
    expect(phoneSettings(project.db)).toEqual({
      transport: 'tailscale',
      tailscaleHost: TAILNET_HOST,
    });
  });

  it('refuses Tailscale without the name it is reached at', () => {
    expect(() =>
      choosePhoneTransport(project.db, { transport: 'tailscale', tailscaleHost: null }),
    ).toThrow(OteaError);
  });

  describe('status', () => {
    const tried: string[] = [];
    const probe = (up: boolean) => async (url: string) => {
      tried.push(url);
      return up;
    };

    beforeEach(() => {
      tried.length = 0;
    });

    it('on the local network: the first address, tried', async () => {
      const status = await phoneStatus(project.db, {
        port: 4400,
        lanUrls: ['http://192.168.1.24:4400'],
        tailscale: fakeTailscale(),
        probe: probe(true),
      });

      expect(status).toEqual({
        transport: 'lan',
        url: 'http://192.168.1.24:4400',
        reachable: true,
        tailscale: null,
      });
      expect(tried).toEqual(['http://192.168.1.24:4400']);
    });

    it('on Tailscale: its HTTPS name, tried once tailscale serve forwards it', async () => {
      const cli = fakeTailscale();
      await switchToTailscale(project.db, cli, 4400);

      const status = await phoneStatus(project.db, {
        port: 4400,
        lanUrls: [],
        tailscale: cli,
        probe: probe(false),
      });

      expect(status).toMatchObject({
        transport: 'tailscale',
        url: `https://${TAILNET_HOST}`,
        reachable: false,
        tailscale: { state: 'ready', serving: true },
      });
      expect(tried).toEqual([`https://${TAILNET_HOST}`]);
    });

    it('on Tailscale gone missing: not reachable, without trying', async () => {
      const cli = fakeTailscale();
      await switchToTailscale(project.db, cli, 4400);
      cli.installed = false;

      const status = await phoneStatus(project.db, {
        port: 4400,
        lanUrls: [],
        tailscale: cli,
        probe: probe(true),
      });

      expect(status).toMatchObject({ reachable: false, tailscale: { state: 'missing' } });
      expect(tried).toEqual([]);
    });
  });

  describe('choosing Tailscale', () => {
    it('keeps it once tailscale serve forwards the HTTPS name', async () => {
      const cli = fakeTailscale();

      const check = await switchToTailscale(project.db, cli, 4400);

      expect(check).toMatchObject({ state: 'ready', url: `https://${TAILNET_HOST}` });
      expect(phoneSettings(project.db)).toEqual({
        transport: 'tailscale',
        tailscaleHost: TAILNET_HOST,
      });
    });

    it('keeps the local network while Tailscale is not ready', async () => {
      const cli = fakeTailscale({ backend: 'NeedsLogin' });

      expect(await switchToTailscale(project.db, cli, 4400)).toMatchObject({ state: 'logged_out' });
      expect(phoneSettings(project.db).transport).toBe('lan');
    });
  });

  it('never stores the Otea relay, which is not available yet', () => {
    expect(() =>
      choosePhoneTransport(project.db, { transport: 'relay', tailscaleHost: null }),
    ).toThrow(/not available yet/);
    expect(phoneSettings(project.db).transport).toBe('lan');
  });
});
