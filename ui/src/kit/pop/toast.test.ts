import { describe, expect, it } from 'vitest';
import { seenAtMount, toast } from './toast.tsx';

describe('a toast host that mounts later', () => {
  it('starts past the toast already shown, so it never replays an old one', () => {
    toast({ msg: 'Aplicado' });
    const first = seenAtMount();
    toast({ msg: 'Movido' });
    expect(seenAtMount()).toBe(first + 1);
    expect(first).toBeGreaterThan(0);
  });
});
