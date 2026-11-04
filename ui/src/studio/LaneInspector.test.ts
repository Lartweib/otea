import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { rawOf } from './draft.ts';
import { LaneInspector } from './LaneInspector.tsx';
import { type LaneChoice, LanesEdit } from './LanesEdit.tsx';

const YAML = readFileSync(
  new URL('../../../presets/bug-triage/preset.yaml', import.meta.url),
  'utf8',
);

const inspect = (choice: LaneChoice, change?: (next: string) => void) =>
  renderToStaticMarkup(
    createElement(LaneInspector, {
      raw: rawOf(YAML),
      yaml: YAML,
      type: 'bug',
      choice,
      change,
      onChoose: () => {},
      sitting: () => 1,
    }),
  );

describe('the lanes', () => {
  it('draws every state and every move label as a button', () => {
    const html = renderToStaticMarkup(
      createElement(LanesEdit, {
        raw: rawOf(YAML),
        type: 'bug',
        incomplete: 'incomplete',
        width: 600,
        choice: { kind: 'move', index: 7 },
        onChoose: () => {},
        editable: true,
      }),
    );
    expect(html).toContain('<span>verify</span>');
    expect(html).toContain(
      'aria-pressed="true" aria-label="Move verify to fixed, by you, in Otea only"',
    );
    expect(html).toContain('discarded · you, in Otea only · reason');
    expect(html).toContain('state</button>');
  });
});

describe('the inspector of a move', () => {
  it('strikes the agent on a move into a state that closes as done, and says why', () => {
    const html = inspect({ kind: 'move', index: 7 }, () => {});
    expect(html).toContain('verify → fixed');
    expect(html).toMatch(
      /class="struck" title="An agent never closes an item as done; the core refuses it." disabled="">agent</,
    );
    expect(html).toContain('Why agent is off');
    expect(html).toContain('Waits for</h3><code>states.fixed.requires</code>');
    expect(html).toContain('value="arreglado"');
  });
});

describe('the inspector of a state', () => {
  it('asks whose turn it is, how it closes, what it waits for and lists its ways out', () => {
    const html = inspect({ kind: 'state', name: 'verify' }, () => {});
    expect(html).toContain('Whose turn</h3><code>turn</code>');
    expect(html).toContain('It shows in Waiting for you.');
    expect(html).toContain('Entering verify waits for nothing.');
    expect(html).toContain('fixed · you, in Otea only');
    expect(html).toContain('1 saved item sits in verify');
  });
});
