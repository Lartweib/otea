import { describe, expect, it } from 'vitest';
import { focusBackAfterPress, focusTarget, menuStep, noteTrigger, tabStep } from './focus.ts';

describe('moving through a menu by keys', () => {
  it('goes down and up, wrapping, and to the ends', () => {
    expect(menuStep('ArrowDown', 0, 3)).toBe(1);
    expect(menuStep('ArrowDown', 2, 3)).toBe(0);
    expect(menuStep('ArrowUp', 0, 3)).toBe(2);
    expect(menuStep('Home', 2, 3)).toBe(0);
    expect(menuStep('End', 0, 3)).toBe(2);
  });

  it('starts at the first from nowhere, and leaves other keys alone', () => {
    expect(menuStep('ArrowDown', -1, 3)).toBe(0);
    expect(menuStep('ArrowUp', -1, 3)).toBe(2);
    expect(menuStep('a', 0, 3)).toBeNull();
    expect(menuStep('ArrowDown', 0, 0)).toBeNull();
  });
});

describe('keeping Tab inside a dialog', () => {
  it('wraps from the last to the first, and back with Shift', () => {
    expect(tabStep(false, 2, 3)).toBe(0);
    expect(tabStep(true, 0, 3)).toBe(2);
    expect(tabStep(true, -1, 3)).toBe(2);
  });

  it('lets the browser move within', () => {
    expect(tabStep(false, 0, 3)).toBeNull();
    expect(tabStep(true, 1, 3)).toBeNull();
  });
});

describe('handing focus back when something closes', () => {
  const el = (isConnected: boolean) => ({ isConnected, focus: () => undefined });

  it('goes back to what had focus when it opened', () => {
    const saved = el(true);
    noteTrigger(el(true));
    expect(focusTarget(saved)).toBe(saved);
  });

  it('goes to the trigger of the last pop when what had focus is gone', () => {
    const trigger = el(true);
    noteTrigger(trigger);
    expect(focusTarget(el(false))).toBe(trigger);
    expect(focusTarget(null)).toBe(trigger);
  });

  it('goes nowhere when both are gone', () => {
    noteTrigger(el(false));
    expect(focusTarget(el(false))).toBeNull();
  });
});

describe('a press outside that closes a pop', () => {
  // A page whose press ends: it runs the pointerup listeners with focus wherever the press left it.
  const page = () => {
    const body = { isConnected: true, focus: () => undefined };
    let up: (() => void) | undefined;
    const doc = {
      body,
      activeElement: body as unknown,
      addEventListener: (_: string, run: () => void) => {
        up = run;
      },
      removeEventListener: () => {
        up = undefined;
      },
    };
    return { doc, body, release: () => up?.() };
  };

  it('gives focus back to the trigger once the press dropped it to the page', () => {
    const { doc, release } = page();
    let focused = 0;
    const trigger = {
      isConnected: true,
      focus: () => {
        focused += 1;
      },
    };

    focusBackAfterPress(doc, trigger);
    release();

    expect(focused).toBe(1);
    release();
    expect(focused).toBe(1);
  });

  it('leaves focus on what the press landed on when that takes it', () => {
    const { doc, release } = page();
    let focused = 0;
    const trigger = {
      isConnected: true,
      focus: () => {
        focused += 1;
      },
    };
    doc.activeElement = { isConnected: true, focus: () => undefined };

    focusBackAfterPress(doc, trigger);
    release();

    expect(focused).toBe(0);
  });
});
