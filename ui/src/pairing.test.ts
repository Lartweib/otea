import { describe, expect, it } from 'vitest';
import { codeFromHash, deviceNameFrom, hostOf, qrPath, timeLeft } from './pairing.ts';

describe('pairing', () => {
  it('reads the code from the fragment the QR code opens', () => {
    expect(codeFromHash('#code=7Q4M-2K9X')).toBe('7Q4M-2K9X');
    expect(codeFromHash('')).toBe('');
    expect(codeFromHash('#other=1')).toBe('');
  });

  it.each([
    [
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36',
      'Android · Chrome',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      'iPhone · Safari',
    ],
    ['curl/8.0', 'Phone'],
  ])('names the device from its user agent', (userAgent, name) => {
    expect(deviceNameFrom(userAgent)).toBe(name);
  });

  it('counts down what is left of a code', () => {
    const now = Date.parse('2026-11-03T12:00:00Z');

    expect(timeLeft('2026-11-03T12:09:41Z', now)).toBe('9:41');
    expect(timeLeft('2026-11-03T12:00:05Z', now)).toBe('0:05');
    expect(timeLeft('2026-11-03T11:59:00Z', now)).toBe('0:00');
  });

  it('draws a square per dark module', () => {
    expect(
      qrPath([
        [true, false],
        [false, true],
      ]),
    ).toBe('M0 0h1v1h-1zM1 1h1v1h-1z');
  });

  it('shows the host without the scheme', () => {
    expect(hostOf('http://192.168.1.24:4485')).toBe('192.168.1.24:4485');
  });
});
