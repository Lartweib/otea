import { describe, expect, it } from 'vitest';
import { isAllowedHost } from './hosts.ts';

describe('isAllowedHost', () => {
  it.each(['127.0.0.1:4400', 'localhost:4400'])('accepts %s on its port', (host) => {
    expect(isAllowedHost(host, 4400)).toBe(true);
  });

  it.each([
    'evil.example:4400',
    '127.0.0.1:4401',
    'localhost',
    '127.0.0.1',
    '0.0.0.0:4400',
    '[::1]:4400',
    '',
    undefined,
  ])('rejects %j', (host) => {
    expect(isAllowedHost(host, 4400)).toBe(false);
  });
});
