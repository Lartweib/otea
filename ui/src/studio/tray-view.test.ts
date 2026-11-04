import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { rawOf, readDraft } from './draft.ts';
import { Outline } from './Outline.tsx';
import { Tray } from './Tray.tsx';
import { trayRows } from './tray.ts';

const YAML = readFileSync(
  new URL('../../../presets/bug-triage/preset.yaml', import.meta.url),
  'utf8',
);

function read() {
  const reading = readDraft(YAML);
  if (!reading.ok) throw new Error(reading.problems.join('; '));
  return reading;
}

describe('the tray', () => {
  it('words each note and offers its fixes; read only, it offers only show me', () => {
    const rows = trayRows(read().notes);
    const html = renderToStaticMarkup(
      createElement(Tray, { rows, onFix: () => {}, onShow: () => {} }),
    );
    expect(html).toContain('verify is your turn, but from chat it can only go back');
    expect(html).toContain('it’s intended');
    const readOnly = renderToStaticMarkup(
      createElement(Tray, { rows, onFix: undefined, onShow: () => {} }),
    );
    expect(readOnly).toContain('show me');
    expect(readOnly).not.toContain('it’s intended');
  });
});

describe('the index', () => {
  it('lists the fields with where they show, and marks the sections the tray speaks of', () => {
    const reading = read();
    const html = renderToStaticMarkup(
      createElement(Outline, {
        raw: rawOf(YAML),
        preset: reading.preset,
        type: 'bug',
        notes: reading.notes,
        playbooks: 1,
        current: 'severity',
        onPick: () => {},
        onHide: () => {},
      }),
    );
    expect(html).toContain('<span class="mono">steps</span><span class="st-ix-n">body</span>');
    expect(html).toContain('aria-current="true"');
    expect(html).toMatch(/States<svg/);
  });
});
