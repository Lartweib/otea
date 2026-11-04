import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AddHere } from './AddPart.tsx';
import { rawOf, readDraft } from './draft.ts';
import { Inspector } from './Inspector.tsx';

const YAML = `preset: game-bugs
preset_version: 3
fields:
  title: { module: text, required: create }
  area: { module: text }
workflow:
  initial: open
  states:
    open: { turn: human }
    done: { turn: none, closes: done }
  transitions:
    - { from: open, to: done, by: human-ui }
types:
  bug:
    label: Bug
    layout:
      evidence:
        - { module: images, id: screenshots, variant: compare, accepts: [png, jpg], required: true }
      side: [area]
`;

function render(part: { type: string; slot: 'evidence' | 'side'; index: number }) {
  const reading = readDraft(YAML);
  if (!reading.ok) throw new Error(reading.problems.join('; '));
  return renderToStaticMarkup(
    createElement(Inspector, {
      raw: rawOf(YAML),
      yaml: YAML,
      preset: reading.preset,
      type: 'bug',
      part,
      change: () => {},
      used: () => 0,
      onSelect: () => {},
      sample: { id: 'BUGS-1', files: () => 1 },
    }),
  );
}

describe('the inspector of an evidence module', () => {
  it('says what it takes, how it shows, whether it is needed and what an agent can attach', () => {
    const html = render({ type: 'bug', slot: 'evidence', index: 0 });
    expect(html).toContain('<h2 class="st-insp-name st-insp-name-n">screenshots</h2>');
    expect(html).toContain('Kind of file</h3><code>layout.evidence[0].module</code>');
    expect(html).toMatch(/class="st-tog on" aria-pressed="true"[^>]*>.*?png<\/button>/);
    expect(html).toMatch(/class="st-tog" aria-pressed="false"[^>]*>webp<\/button>/);
    expect(html).toContain('Two side by side: before and after.');
    expect(html).toContain('role="switch" aria-checked="true"');
    expect(html).toContain('otea attach BUGS-1 shot.png --module screenshots --role after');
    expect(html).toContain('1 file on BUGS-1');
  });
});

describe('+ field here', () => {
  const placed = [
    {
      part: { type: 'bug', slot: 'side', index: 0, field: 'area' } as const,
      rect: { top: 10, left: 0, width: 200, height: 20 },
    },
  ];
  const props = {
    placed,
    nameAt: () => 'area',
    taken: () => false,
    onField: () => {},
    onModule: () => {},
  };

  it('shows its gaps only in the slot pointed at or chosen', () => {
    expect(renderToStaticMarkup(createElement(AddHere, { ...props, slots: [undefined] }))).toBe('');
    const html = renderToStaticMarkup(createElement(AddHere, { ...props, slots: ['side'] }));
    expect(html).toContain('aria-label="Add a field or a module to side here"');
    expect(html).toContain('style="top:30px;left:0px;width:200px"');
  });
});
