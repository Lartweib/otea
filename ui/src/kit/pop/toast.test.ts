import { describe, expect, it } from 'vitest';
import { seenAtMount, toast, toastClass } from './toast.tsx';

describe('a toast host that mounts later', () => {
  it('starts past the toast already shown, so it never replays an old one', () => {
    toast({ msg: 'Aplicado' });
    const first = seenAtMount();
    toast({ msg: 'Movido' });
    expect(seenAtMount()).toBe(first + 1);
    expect(first).toBeGreaterThan(0);
  });
});

describe('where a toast sits', () => {
  it('at the foot by default, under the top bar when asked (the phone capture)', () => {
    expect(toastClass(undefined)).toBe('pop e-top toast');
    expect(toastClass('top')).toBe('pop e-top toast at-top');
  });
});
