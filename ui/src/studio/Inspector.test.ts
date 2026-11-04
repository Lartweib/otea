import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { rawOf, readDraft } from './draft.ts';
import { Inspector, type InspectorProps } from './Inspector.tsx';

const YAML = readFileSync(
  new URL('../../../presets/bug-triage/preset.yaml', import.meta.url),
  'utf8',
);

function render(part: InspectorProps['part'], change?: (next: string) => void) {
  const reading = readDraft(YAML);
  if (!reading.ok) throw new Error(reading.problems.join('; '));
  return renderToStaticMarkup(
    createElement(Inspector, {
      raw: rawOf(YAML),
      yaml: YAML,
      preset: reading.preset,
      type: 'bug',
      part,
      change,
      used: () => 3,
      onSelect: () => {},
    }),
  );
}

describe('the inspector of a field', () => {
  const severity = { type: 'bug', slot: 'body', index: 6, field: 'severity' } as const;

  it('asks in plain words, with the YAML key beside each question', () => {
    const html = render(severity, () => {});
    expect(html).toContain('<h2 class="st-insp-name">severity</h2>');
    expect(html).toContain('Drawn as</h3><code>fields.severity.module</code>');
    expect(html).toContain('Its levels</h3><code>fixed scale</code>');
    expect(html).toContain('Needed</h3><code>required: complete</code>');
    expect(html).toContain('the bug stays <b>incomplete</b> until someone sets it');
    expect(html).toContain('In Spanish</h3><code>labels.es.fields.severity</code>');
    expect(html).toContain('value="gravedad"');
    expect(html).toContain('3 saved items use it');
  });

  it('offers only the slots a field may sit in, striking evidence with its reason', () => {
    const html = render(severity, () => {});
    expect(html).toMatch(/class="st-tog on" aria-pressed="true"[^>]*>.*?body<\/button>/);
    expect(html).toContain(
      'class="st-tog struck" aria-pressed="false" title="Evidence takes files, so a field is not offered there." disabled=""',
    );
  });

  it('reads only, without rename or remove, while the preset cannot be edited', () => {
    const html = render(severity);
    expect(html).not.toContain('remove field');
    expect(html).toContain('disabled=""');
  });
});

describe('the inspector of a slot', () => {
  it('lists what the slot holds, in order, with buttons to move each part', () => {
    const html = render({ type: 'bug', slot: 'side', index: -1 }, () => {});
    expect(html).toContain('<h2 class="st-insp-name">side</h2>');
    expect(html).toContain('<code>types.bug.layout.side</code>');
    expect(html).toContain('aria-label="Take relations out of side"');
  });
});
