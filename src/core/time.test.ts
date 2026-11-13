import { describe, expect, it } from 'vitest';
import { timeText } from './time.ts';

describe('timeText', () => {
  it('says a timestamp as its UTC day and minute, named UTC', () => {
    expect(timeText('2026-11-12T10:04:59.999Z')).toBe('2026-11-12 10:04 UTC');
  });

  it('reads a timestamp with an offset in UTC', () => {
    expect(timeText('2026-11-12T23:30:00+02:00')).toBe('2026-11-12 21:30 UTC');
  });

  it('leaves text that is no timestamp as it is', () => {
    expect(timeText('soon')).toBe('soon');
  });
});
