import { describe, expect, it } from 'vitest';
import { timeText } from './time.ts';

describe('timeText', () => {
  // A timestamp reads as its UTC day and minute, named UTC, whatever its offset; other text stays.
  it.each([
    ['2026-11-12T10:04:59.999Z', '2026-11-12 10:04 UTC'],
    ['2026-11-12T23:30:00+02:00', '2026-11-12 21:30 UTC'],
    ['soon', 'soon'],
  ])('says %s as %s', (iso, text) => {
    expect(timeText(iso)).toBe(text);
  });
});
