import { describe, expect, it } from 'vitest';
import { gapsOf, merged, partFrom, partLabel, samePart, slotBoxes } from './canvas.ts';

const attrs = (values: Record<string, string>) => (name: string) => values[name] ?? null;

describe('reading a part of the preview', () => {
  it('reads the place a rendered part carries', () => {
    expect(
      partFrom(
        attrs({
          'data-type': 'bug',
          'data-slot': 'header',
          'data-index': '0',
          'data-field': 'severity',
        }),
      ),
    ).toEqual({ type: 'bug', slot: 'header', index: 0, field: 'severity' });
    expect(
      partFrom(attrs({ 'data-type': 'bug', 'data-slot': 'evidence', 'data-index': '0' })),
    ).toEqual({ type: 'bug', slot: 'evidence', index: 0 });
  });

  it('reads nothing from an element the layout does not place, or an unknown slot', () => {
    expect(partFrom(attrs({}))).toBeUndefined();
    expect(partFrom(attrs({ 'data-type': 'bug', 'data-slot': 'nowhere', 'data-index': '0' }))).toBe(
      undefined,
    );
  });

  it('names a part by its field or its module, then its slot', () => {
    expect(partLabel({ type: 'bug', slot: 'header', index: 0, field: 'severity' })).toBe(
      'severity · header',
    );
    expect(partLabel({ type: 'bug', slot: 'evidence', index: 0 }, 'screenshots')).toBe(
      'screenshots · evidence',
    );
    expect(
      samePart(
        { type: 'bug', slot: 'body', index: 1, field: 'steps' },
        { type: 'bug', slot: 'body', index: 1 },
      ),
    ).toBe(true);
  });
});

describe('the boxes the preview draws over its parts', () => {
  const rect = (top: number, left: number, height: number, width: number) => ({
    top,
    left,
    height,
    width,
  });

  it('joins the elements of one part (a label and its value) into one box', () => {
    const steps = { type: 'bug', slot: 'body', index: 1, field: 'steps' } as const;
    expect(
      merged([
        { part: steps, rect: rect(100, 20, 40, 100) },
        { part: steps, rect: rect(100, 130, 60, 200) },
      ]),
    ).toEqual([{ part: steps, rect: rect(100, 20, 60, 310) }]);
  });

  it('draws one box around every part of a slot', () => {
    const boxes = slotBoxes([
      {
        part: { type: 'bug', slot: 'body', index: 0, field: 'description' },
        rect: rect(100, 20, 40, 300),
      },
      {
        part: { type: 'bug', slot: 'body', index: 1, field: 'steps' },
        rect: rect(150, 20, 30, 320),
      },
      {
        part: { type: 'bug', slot: 'header', index: 0, field: 'severity' },
        rect: rect(40, 20, 20, 60),
      },
    ]);
    expect(boxes).toEqual([
      { slot: 'body', rect: rect(100, 20, 80, 320) },
      { slot: 'header', rect: rect(40, 20, 20, 60) },
    ]);
  });

  it('places a gap after each part of a slot that takes fields, for + field here', () => {
    const gaps = gapsOf([
      {
        part: { type: 'bug', slot: 'body', index: 0, field: 'description' },
        rect: rect(100, 20, 40, 300),
      },
      {
        part: { type: 'bug', slot: 'body', index: 1, field: 'steps' },
        rect: rect(150, 20, 30, 300),
      },
      { part: { type: 'bug', slot: 'evidence', index: 0 }, rect: rect(200, 20, 30, 300) },
    ]);
    expect(gaps).toEqual([
      { slot: 'body', index: 1, top: 145 },
      { slot: 'body', index: 2, top: 180 },
    ]);
  });
});
