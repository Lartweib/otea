import { describe, expect, it } from 'vitest';
import {
  clampListWidth,
  DETAIL_MIN,
  defaultListWidth,
  dividerKeyWidth,
  forgetListWidth,
  LIST_WIDTH,
  LIST_WIDTH_KEY,
  listMax,
  readListWidth,
  readSidebar,
  SIDEBAR_KEY,
  type SplitStorage,
  writeListWidth,
  writeSidebar,
} from './split.ts';

function memory(
  initial: Record<string, string> = {},
): SplitStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
    removeItem: (key) => {
      delete data[key];
    },
  };
}

const broken: SplitStorage = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
};

describe('clampListWidth', () => {
  it('keeps the list between 340 and 783px, rounded', () => {
    expect(clampListWidth(200)).toBe(340);
    expect(clampListWidth(900)).toBe(783);
    expect(clampListWidth(520.4)).toBe(520);
  });

  it('never goes past the room the detail leaves', () => {
    expect(clampListWidth(700, 600)).toBe(600);
    // a room smaller than the minimum still keeps the list at its minimum
    expect(clampListWidth(700, 300)).toBe(340);
  });

  it('falls back to the default for a width that is not a number', () => {
    expect(clampListWidth(Number.NaN)).toBe(LIST_WIDTH.initial);
  });
});

describe('defaultListWidth', () => {
  it('takes 34% of the room, between 520 and 783', () => {
    expect(defaultListWidth(1400)).toBe(520);
    expect(defaultListWidth(1900)).toBe(646);
    expect(defaultListWidth(2560)).toBe(783);
  });

  it('falls back to 520 before the room is known', () => {
    expect(defaultListWidth(0)).toBe(520);
    expect(defaultListWidth(Number.NaN)).toBe(520);
  });
});

describe('listMax', () => {
  it('leaves the detail at least 440px', () => {
    expect(listMax(1000)).toBe(1000 - DETAIL_MIN);
    expect(listMax(2000)).toBe(783);
    expect(listMax(600)).toBe(340);
  });
});

describe('the list width in storage', () => {
  it('is unset with nothing stored, so the list takes its share', () => {
    expect(readListWidth(memory())).toBeUndefined();
    expect(readListWidth(undefined)).toBeUndefined();
  });

  it('forgets the width on reset, even where storage throws', () => {
    const storage = memory({ [LIST_WIDTH_KEY]: '600' });
    forgetListWidth(storage);
    expect(readListWidth(storage)).toBeUndefined();
    expect(() => forgetListWidth(broken)).not.toThrow();
  });

  it('reads back what was written, clamped', () => {
    const storage = memory();
    writeListWidth(storage, 610);
    expect(storage.data[LIST_WIDTH_KEY]).toBe('610');
    expect(readListWidth(storage)).toBe(610);
    expect(readListWidth(memory({ [LIST_WIDTH_KEY]: '9000' }))).toBe(783);
  });

  it('ignores garbage and storage that throws', () => {
    expect(readListWidth(memory({ [LIST_WIDTH_KEY]: 'wide' }))).toBeUndefined();
    expect(readListWidth(memory({ [LIST_WIDTH_KEY]: '' }))).toBeUndefined();
    expect(readListWidth(broken)).toBeUndefined();
    expect(() => writeListWidth(broken, 600)).not.toThrow();
  });
});

describe('the sidebar in storage', () => {
  it('is shown unless folded', () => {
    expect(readSidebar(memory())).toBe(true);
    expect(readSidebar(broken)).toBe(true);
    const storage = memory();
    writeSidebar(storage, false);
    expect(storage.data[SIDEBAR_KEY]).toBe('off');
    expect(readSidebar(storage)).toBe(false);
    writeSidebar(storage, true);
    expect(readSidebar(storage)).toBe(true);
    expect(() => writeSidebar(broken, false)).not.toThrow();
  });
});

describe('dividerKeyWidth', () => {
  it('moves 16px with the arrows, 64 with Shift', () => {
    expect(dividerKeyWidth('ArrowRight', false, 520, 783)).toBe(536);
    expect(dividerKeyWidth('ArrowLeft', true, 520, 783)).toBe(456);
  });

  it('jumps to the limits with Home and End', () => {
    expect(dividerKeyWidth('Home', false, 520, 783)).toBe(340);
    expect(dividerKeyWidth('End', false, 520, 700)).toBe(700);
  });

  it('stays inside the limits and ignores other keys', () => {
    expect(dividerKeyWidth('ArrowLeft', true, 350, 783)).toBe(340);
    expect(dividerKeyWidth('ArrowRight', true, 760, 783)).toBe(783);
    expect(dividerKeyWidth('Enter', false, 520, 783)).toBeUndefined();
  });
});
