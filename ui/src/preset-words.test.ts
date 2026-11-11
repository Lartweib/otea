import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { ItemActions } from './components/ItemActions.tsx';
import { setLanguage } from './i18n/i18n.ts';
import {
  fieldWord,
  ItemTypeScope,
  keyTitle,
  stateWord,
  typeWord,
  valueWord,
  valueWordIn,
} from './preset-words.ts';
import type { Move, TypeView } from './types.ts';

const repoTask = {
  name: 'repo_task',
  label: 'Repo task',
  initial: 'proposed',
  states: [],
  fields: [],
  layout: { header: [], body: [], side: [], evidence: [], row: [], intake: [] },
  labels: {
    es: {
      label: 'Tarea de repo',
      states: { pr_review: 'revisión de PR' },
      fields: { branch: 'rama' },
      values: { severity: { high: 'alta' } },
    },
  },
} as unknown as TypeView;

afterEach(() => setLanguage('en'));

describe('preset words', () => {
  it('stay as the preset wrote them in English', () => {
    expect(stateWord(repoTask, 'pr_review')).toBe('pr_review');
    expect(typeWord(repoTask, 'repo_task')).toBe('Repo task');
    expect(fieldWord(repoTask, 'branch')).toBeUndefined();
  });

  it('take the preset’s Spanish labels in Spanish', () => {
    setLanguage('es');

    expect(stateWord(repoTask, 'pr_review')).toBe('revisión de PR');
    expect(typeWord(repoTask, 'repo_task')).toBe('Tarea de repo');
    expect(fieldWord(repoTask, 'branch')).toBe('rama');
  });

  it("say a field's value in the language on screen, or as written", () => {
    expect(valueWord(repoTask, 'severity', 'high')).toBe('high');
    setLanguage('es');
    expect(valueWord(repoTask, 'severity', 'high')).toBe('alta');
    expect(valueWord(repoTask, 'severity', 'low')).toBe('low');
    expect(valueWordIn([repoTask], 'severity', 'high')).toBe('alta');
  });

  it('fall back to the key for a type without labels, or while the type is unknown', () => {
    setLanguage('es');

    const { labels: _, ...unlabelled } = repoTask;
    expect(stateWord(unlabelled, 'pr_review')).toBe('pr_review');
    expect(stateWord(undefined, 'pr_review')).toBe('pr_review');
    expect(typeWord(undefined, 'repo_task')).toBe('repo_task');
  });

  it('name the moves of the item in scope in its preset’s Spanish, the key a hover away', () => {
    setLanguage('es');
    const moves = [{ to: 'pr_review', by: 'human', turn: 'human' } as Move];
    const html = renderToStaticMarkup(
      createElement(
        ItemTypeScope,
        { type: repoTask },
        createElement(ItemActions, { id: 'CHG-9', moves, turn: 'agent', agent: 'claude' }),
      ),
    );

    expect(html).toContain('revisión de PR');
    expect(html).toContain('title="pr_review"');
  });

  it('keep the key at hand as a tooltip only where a label shows', () => {
    expect(keyTitle('revisión de PR', 'pr_review')).toBe('pr_review');
    expect(keyTitle('pr_review', 'pr_review')).toBeUndefined();
  });
});
