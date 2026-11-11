import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { motionPref, reduced, setMotionPref } from './reduced.ts';

let stored: Record<string, string>;
let systemReduces: boolean;
let dataset: Record<string, string>;

beforeEach(() => {
  stored = {};
  systemReduces = false;
  dataset = {};
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => stored[k] ?? null,
    setItem: (k: string, v: string) => {
      stored[k] = v;
    },
    removeItem: (k: string) => {
      delete stored[k];
    },
  });
  vi.stubGlobal('window', {
    matchMedia: () => ({
      matches: systemReduces,
      addEventListener() {},
      removeEventListener() {},
    }),
  });
  vi.stubGlobal('document', { documentElement: { dataset } });
});
afterEach(() => vi.unstubAllGlobals());

describe('the Motion preference', () => {
  it('follows the system by default', () => {
    expect(motionPref()).toBe('system');
    expect(reduced()).toBe(false);
    systemReduces = true;
    expect(reduced()).toBe(true);
  });

  it('reads what this browser chose', () => {
    stored['otea.motion'] = 'reduced';
    expect(motionPref()).toBe('reduced');
    expect(reduced()).toBe(true);
    stored['otea.motion'] = 'full';
    systemReduces = true;
    expect(reduced()).toBe(false);
  });

  it('ignores a value it does not know', () => {
    stored['otea.motion'] = 'sometimes';
    expect(motionPref()).toBe('system');
  });

  it('writes the choice and marks the root, and unmarks it for the system', () => {
    setMotionPref('reduced');
    expect(stored['otea.motion']).toBe('reduced');
    expect(dataset.motion).toBe('reduced');
    setMotionPref('full');
    expect(dataset.motion).toBe('full');
    setMotionPref('system');
    expect(stored['otea.motion']).toBe('system');
    expect(dataset.motion).toBeUndefined();
  });

  it('survives a browser that keeps nothing', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    expect(motionPref()).toBe('system');
    expect(() => setMotionPref('full')).not.toThrow();
  });
});
