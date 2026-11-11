import { afterEach, describe, expect, it, vi } from 'vitest';
import { t } from '../i18n/i18n.ts';
import { announce, appliedToast, claimApplied, current, dismiss, isClaimed } from './applied.ts';

afterEach(() => dismiss());

// The note left behind when a view is applied goes out as the app's toast, with Deshacer when the
// change can be taken back.
describe('the applied note', () => {
  it('is a toast with the words, and no Deshacer when nothing can be taken back', () => {
    const o = appliedToast({ text: 'Saved as bug-triage-2', at: 0 }, () => {});
    expect(o.msg).toBe('Saved as bug-triage-2');
    expect(o.undo).toBeUndefined();
  });

  it('takes the change back on Deshacer, tells the app, then says it is undone', async () => {
    const undo = vi.fn(() => Promise.resolve());
    const told = vi.fn();
    const o = appliedToast({ text: 'Applied to Errores', undo, at: 0 }, told);
    o.undo?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(undo).toHaveBeenCalledOnce();
    expect(told).toHaveBeenCalledOnce();
    expect(current()?.text).toBe('Back as it was');
  });

  it('says when taking it back failed', async () => {
    const o = appliedToast(
      { text: 'Applied', undo: () => Promise.reject(new Error('no')), at: 0 },
      () => {},
    );
    o.undo?.();
    await new Promise((r) => setTimeout(r, 0));
    expect(current()?.text).toBe(t('cz.failed'));
  });

  it('is shown by the page that claims it, and by the app’s toast otherwise', () => {
    expect(isClaimed()).toBe(false);
    const release = claimApplied();
    expect(isClaimed()).toBe(true);
    release();
    expect(isClaimed()).toBe(false);
    announce('x');
    expect(current()?.text).toBe('x');
  });
});
