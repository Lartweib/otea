import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../i18n/i18n.ts';
import type { Item, Turn } from '../types.ts';
import { EmptyDetail } from './EmptyDetail.tsx';

afterEach(() => setLanguage('en'));

const item = (id: string, turn: Turn): Item => ({
  id,
  collection: 'tasks',
  type: 'item',
  title: id,
  fields: {},
  presetVersion: 1,
  state: 'todo',
  turn,
  createdAt: 't',
  updatedAt: 't',
  createdBy: { kind: 'agent', name: 'a' },
  lease: null,
});

const render = (items: Item[], collection?: string, onCreate?: () => void) =>
  renderToStaticMarkup(createElement(EmptyDetail, { items, collection, onCreate }));

const text = (html: string) => html.replace(/<[^>]+>/g, '');

describe('EmptyDetail', () => {
  it('points at the list, with what waits there, and enters', () => {
    const html = render([item('A', 'human'), item('B', 'human'), item('C', 'agent')], 'tasks');

    expect(html).toContain('class="empty-arrow"');
    expect(html).toContain('data-enter=""');
    expect(text(html)).toContain('Pick an item to see its detail');
    expect(text(html)).toContain('2 waiting for you·1 with an agent');
  });

  it('says nothing waits for you, and how many are with agents', () => {
    const html = render([item('A', 'agent'), item('B', 'agent'), item('C', 'none')], 'tasks');

    expect(text(html)).toContain('Nothing waiting for you·2 with agents');
  });

  it('drops the arrow in an empty collection and offers to create there', () => {
    const html = render([], 'design', () => {});

    expect(html).not.toContain('empty-arrow');
    expect(text(html)).toContain('No items in design yet');
    expect(text(html)).toContain('New item in design');
  });

  it('offers no create action to a reader', () => {
    expect(render([], 'design')).not.toContain('<button');
  });

  it('speaks Spanish, with its plurals', () => {
    setLanguage('es');

    expect(text(render([item('A', 'human'), item('B', 'agent')]))).toContain(
      '1 te espera·1 con un agente',
    );
    expect(text(render([item('A', 'human'), item('B', 'human')]))).toContain('2 te esperan');
    expect(text(render([]))).toContain('Todavía no hay elementos');
  });
});
