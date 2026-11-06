import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../i18n/i18n.ts';
import { ApplyDialog } from './ApplyDialog.tsx';
import { BoxMenu } from './BoxMenu.tsx';
import { shouldDismiss } from './dismiss.ts';
import { FieldMenu, type FieldMenuProps } from './FieldMenu.tsx';
import { LeftPanel } from './LeftPanel.tsx';
import { NewField } from './NewField.tsx';
import { addOption, removeOption } from './options.ts';
import { applyOf, leaveOf, saves, scopeOf, titleOf } from './scope.ts';

afterEach(() => setLanguage('en'));
const noop = () => {};

const menu = (over: Partial<FieldMenuProps> = {}) =>
  renderToStaticMarkup(
    createElement(FieldMenu, {
      name: 'Platform',
      onName: noop,
      onClose: noop,
      onUp: noop,
      onDown: noop,
      onHide: noop,
      kind: 'choice',
      options: ['gameplay', 'audio'],
      need: 'create',
      inForm: true,
      inRow: false,
      canDelete: true,
      usedBy: 3,
      ...over,
    }),
  );

describe('options', () => {
  it('adds trimmed, ignores empty and repeated, and removes', () => {
    expect(addOption(['a'], '  b ')).toEqual(['a', 'b']);
    expect(addOption(['a'], '   ')).toEqual(['a']);
    expect(addOption(['Audio'], 'audio')).toEqual(['Audio']);
    expect(removeOption(['a', 'b'], 'a')).toEqual(['b']);
  });
});

describe('dismiss', () => {
  const inside = (t: unknown) => t === 'in';
  it('closes on Esc and on a press outside only', () => {
    expect(shouldDismiss({ type: 'keydown', key: 'Escape', target: 'in' }, inside)).toBe(true);
    expect(shouldDismiss({ type: 'keydown', key: 'a', target: 'in' }, inside)).toBe(false);
    expect(shouldDismiss({ type: 'pointerdown', target: 'out' }, inside)).toBe(true);
    expect(shouldDismiss({ type: 'pointerdown', target: 'in' }, inside)).toBe(false);
  });
});

describe('FieldMenu', () => {
  it('shows the options as removable chips with an add input for Choice', () => {
    const html = menu();
    expect(html).toContain('Remove gameplay');
    expect(html).toContain('Add an option');
    expect(menu({ kind: 'short' })).not.toContain('Add an option');
  });
  it('uses real checkboxes for Also in', () => {
    const html = menu();
    expect(html).toMatch(/<input type="checkbox" checked=""[^>]*\/>/);
    expect(html.match(/type="checkbox"/g)).toHaveLength(2);
    expect(html).toContain('New item form');
    expect(html).toContain('List row');
  });
  it('says what Needed does and warns when a type change may not fit', () => {
    expect(menu()).toContain('Nobody can file an item without it');
    expect(menu({ typeMayNotFit: true })).toContain('may not fit a Choice');
    expect(menu()).not.toContain('may not fit');
  });
  it('asks before deleting, with the count of items', () => {
    const asking = menu();
    expect(asking).toContain('3 items use it');
    expect(asking).not.toContain('Keep it');
    const confirming = menu({ confirmingDelete: true });
    expect(confirming).toContain('Delete this field from the template?');
    expect(confirming).toContain('3 items keep their value');
    expect(confirming).toContain('Keep it');
    expect(menu({ confirmingDelete: true, usedBy: 0 })).toContain('No item has a value in it.');
  });
  it('is shorter for a block', () => {
    const html = menu({ variant: 'block', says: 'Screenshots' });
    expect(html).toContain('Screenshots');
    expect(html).not.toContain('Needed');
  });
});

describe('LeftPanel', () => {
  const base = { onGrab: noop, onNewField: noop };
  const render = (props: object) =>
    renderToStaticMarkup(createElement(LeftPanel, { ...base, hidden: [], ...props }));
  it('says everything is in the view, and what dropping does', () => {
    expect(render({})).toContain('Everything is in the view. Drop a field here to hide it.');
    expect(render({ dropToHide: true })).toContain(
      'Let go to hide it. The field stays, its values too.',
    );
  });
  it('lists draggable rows and used blocks with a check', () => {
    const html = render({
      hidden: [{ id: 'a', name: 'Build', typeLabel: 'Short text' }],
      boxes: true,
      onNewBox: noop,
      blocks: [
        { id: 'img', name: 'Images', says: 'Screenshots', kind: 'files' },
        { id: 'rel', name: 'Related', says: 'x', kind: 'link', usedIn: 'Structure' },
      ],
    });
    expect(html).toContain('Build');
    expect(html).toContain('New box');
    expect(html).toContain('Files and links');
    expect(html).toContain('Already in Structure');
  });
});

describe('NewField, BoxMenu, ApplyDialog', () => {
  it('NewField adds to a place and allows spaces', () => {
    const html = renderToStaticMarkup(
      createElement(NewField, {
        name: 'Steps to repro',
        onName: noop,
        kind: 'long',
        onKind: noop,
        place: 'Brief',
        onSubmit: noop,
        onCancel: noop,
      }),
    );
    expect(html).toContain('Add to Brief');
    expect(html).toContain('Cancel');
    expect(html).toContain('Windows 11, gamepad');
  });
  it('BoxMenu offers the layout moves and the removal consequence', () => {
    const html = renderToStaticMarkup(
      createElement(BoxMenu, {
        name: 'Facts',
        onName: noop,
        onClose: noop,
        onUp: noop,
        onDown: noop,
        beside: false,
        canBeside: true,
        onBeside: noop,
        canRemove: true,
        onRemove: noop,
      }),
    );
    for (const s of [
      'Move up',
      'Move down',
      'Beside the previous box',
      'Full width',
      'Nothing is deleted',
    ])
      expect(html).toContain(s);
  });
  it('ApplyDialog lists changes, reach, the first-time line and the collapsed file', () => {
    const props = {
      target: 'bugs',
      changes: [
        { kind: 'move' as const, text: 'Build moved to Brief' },
        { kind: 'hidden' as const, text: 'Notes hidden' },
      ],
      itemCount: 4,
      first: true,
      yaml: 'a: 1',
      showFile: false,
      onToggleFile: noop,
      onApply: noop,
      onKeepEditing: noop,
    };
    const html = renderToStaticMarkup(createElement(ApplyDialog, props));
    expect(html).toContain('Every item in bugs');
    expect(html).toContain('4 items');
    expect(html).toContain('bugs gets its own copy');
    expect(html).toContain('Keep editing');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('a: 1');
    expect(
      renderToStaticMarkup(createElement(ApplyDialog, { ...props, showFile: true })),
    ).toContain('a: 1');
  });
  it('ApplyDialog saves a template nobody uses, and says an official one is copied', () => {
    const html = renderToStaticMarkup(
      createElement(ApplyDialog, {
        target: '',
        changes: [],
        itemCount: 0,
        first: true,
        save: true,
        yaml: '',
        showFile: false,
        onToggleFile: noop,
        onApply: noop,
        onKeepEditing: noop,
      }),
    );
    expect(html).toContain('Save template');
    expect(html).toContain('You get a copy of it to edit');
    expect(html).not.toContain('Every item in');
    expect(html).not.toContain('Apply to');
  });
});

describe('what an Apply reaches', () => {
  it('names every board of a template, and saves it when none uses it', () => {
    const used = scopeOf({ kind: 'preset', users: ['bugs', 'crashes'] });
    expect(applyOf(used)).toBe('Apply to bugs, crashes');
    expect(titleOf(used, 'Bug', 'bug-triage', 'bugs')).toBe(
      'Customizing Bug view · Bug triage template',
    );
    const unused = scopeOf({ kind: 'preset', users: [] });
    expect(saves(unused)).toBe(true);
    expect(applyOf(unused)).toBe('Save template');
    const item = scopeOf({ kind: 'item', board: 'bugs' });
    expect(applyOf(item)).toBe('Apply to bugs');
    expect(titleOf(item, 'Bug', 'bug-triage', 'bugs')).toBe('Customizing Bug view · bugs board');
  });
});

describe('the way out on a phone', () => {
  it('goes back to the item it was opened from, or to the board for a template', () => {
    expect(leaveOf({ kind: 'item', id: 'BUGS-7' })).toEqual({
      hash: '#BUGS-7',
      label: 'Back to BUGS-7',
    });
    expect(leaveOf({ kind: 'preset', name: 'bug-triage' })).toEqual({
      hash: '#/',
      label: 'Back to the board',
    });
  });

  it('says it in Spanish', () => {
    setLanguage('es');
    expect(leaveOf({ kind: 'item', id: 'BUGS-7' }).label).toBe('Volver a BUGS-7');
    expect(leaveOf({ kind: 'preset', name: 'x' }).label).toBe('Volver al tablero');
  });
});
