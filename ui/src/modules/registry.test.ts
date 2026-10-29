import { createElement, type FunctionComponent } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FIELD_MODULES } from '../../../src/core/preset.ts';
import type { FieldView } from '../types.ts';
import type { EditProps, ShowProps } from './contract.ts';
import { FALLBACK_MODULE, isKnownModule, MODULES, moduleFor } from './registry.ts';

const render = <P extends object>(component: FunctionComponent<P>, props: P) =>
  renderToStaticMarkup(createElement(component, props));

const edit = (field: FieldView, value = ''): string =>
  render<EditProps>(moduleFor(field.module).Edit, {
    id: 'f',
    field,
    value,
    disabled: false,
    required: false,
    onChange: () => {},
  });

const detail = (field: FieldView, value: string): string =>
  render<ShowProps>(moduleFor(field.module).Detail, { field, value });

const row = (field: FieldView, value: string): string => {
  const Row = moduleFor(field.module).Row;
  return Row ? render<ShowProps>(Row, { field, value }) : '';
};

const priority: FieldView = {
  name: 'priority',
  module: 'enum',
  values: ['low', 'medium', 'high'],
  default: 'medium',
};

describe('module registry', () => {
  it('registers exactly the official modules of the preset format, in order', () => {
    expect(MODULES.map(({ name }) => name)).toEqual([...FIELD_MODULES]);
    expect(MODULES.every(({ origin }) => origin === 'official')).toBe(true);
  });

  it('describes every module with a summary, samples and a preset.yaml snippet', () => {
    for (const module of MODULES) {
      expect(module.summary).not.toBe('');
      expect(module.samples.length).toBeGreaterThan(1);
      expect(module.samples.every(({ field }) => field.module === module.name)).toBe(true);
      expect(module.yaml).toContain(`module: ${module.name}`);
    }
  });

  it('falls back to plain text for a module it does not know', () => {
    expect(isKnownModule('rating')).toBe(false);
    expect(moduleFor('rating')).toBe(FALLBACK_MODULE);
    expect(detail({ name: 'score', module: 'rating' }, '<b>4</b>')).toBe(
      '<span class="body">&lt;b&gt;4&lt;/b&gt;</span>',
    );
    expect(edit({ name: 'score', module: 'rating' })).toContain('<input type="text"');
  });

  it('renders every sample of every module in the row, the detail and the edit control', () => {
    for (const module of MODULES) {
      for (const { field, value } of module.samples) {
        expect(() => [row(field, value), detail(field, value), edit(field, value)]).not.toThrow();
      }
    }
  });

  it.each([
    ['text', '<input type="text"'],
    ['markdown', '<textarea'],
    ['enum', '<select'],
  ] as const)('edits a %s field with %s', (module, tag) => {
    const field: FieldView =
      module === 'enum' ? priority : { name: 'x', module, required: 'create' };

    expect(edit(field)).toContain(tag);
  });

  it('offers a blank enum choice only when the field has no default', () => {
    const { default: _, ...noDefault } = priority;

    expect(edit(priority, 'medium')).not.toContain('<option value="">');
    expect(edit(noDefault)).toContain('<option value="" selected="">—</option>');
  });

  it('shows text as plain text and markdown rendered, both safely', () => {
    expect(detail({ name: 'title', module: 'text' }, '*a* <i>')).toBe(
      '<span class="body">*a* &lt;i&gt;</span>',
    );
    expect(detail({ name: 'description', module: 'markdown' }, '*a* <i>')).toBe(
      '<div class="md"><p><em>a</em> &lt;i&gt;</p></div>',
    );
  });

  it('shows an enum value as a pill in the detail', () => {
    expect(detail(priority, 'high')).toBe('<span class="pill">high</span>');
  });

  it('marks an enum in the row only when it departs from its default', () => {
    expect(row(priority, 'high')).toBe(
      '<span class="pill sm"><span class="visually-hidden">priority: </span>high</span>',
    );
    expect(row(priority, 'medium')).toBe('');
    expect(row(priority, '')).toBe('');
  });

  it('keeps text and markdown out of the row', () => {
    expect(moduleFor('text').Row).toBeUndefined();
    expect(moduleFor('markdown').Row).toBeUndefined();
  });
});
