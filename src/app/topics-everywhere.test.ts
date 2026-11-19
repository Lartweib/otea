import { describe, expect, it } from 'vitest';
import type { Actor } from '../core/item.ts';
import { memoryContext } from './testing.ts';
import { addTopic, answerTopic } from './topics.ts';
import { topicsEverywhere, topicsEverywhereText } from './topics-everywhere.ts';

// P6-R2-4: a side question about geo-api asked in ventas-etl was not found the next day from
// geo-api: topics were read one project at a time. With every project in scope, the topics of all
// of them are read, each with its project.

const kiln: Actor = { kind: 'agent', name: 'kiln' };

function projects() {
  const geo = memoryContext();
  const ventas = memoryContext();
  const broken = { id: 'broken-cccccc', name: 'broken' };
  addTopic(geo, { question: '¿Usamos PostGIS?', actor: kiln });
  addTopic(ventas, { question: '¿Cómo pagina geo-api sus respuestas?', actor: kiln });
  answerTopic(ventas, { id: 'TEM-1', summary: 'Con cursor, desde la v2.', actor: kiln });
  addTopic(ventas, { question: 'Otra cosa', actor: kiln });
  return [
    { id: 'ventas-bbbbbb', name: 'ventas-etl', project: ventas },
    broken,
    { id: 'geo-aaaaaa', name: 'geo-api', project: geo },
  ];
}

describe('topics in every project', () => {
  it('lists the topics of every project, this one first, each with its project, in its own order', () => {
    const found = topicsEverywhere(projects(), 'geo-aaaaaa', {});

    expect(found.topics.map(({ project, id }) => `${project.name} ${id}`)).toEqual([
      'geo-api TEM-1',
      'ventas-etl TEM-2',
      'ventas-etl TEM-1',
    ]);
    expect(found.items).toEqual([]);
  });

  it('searches the topics and items of every project', () => {
    const found = topicsEverywhere(projects(), 'geo-aaaaaa', { search: 'paginación geo-api' });

    expect(found.topics.map(({ project, id }) => `${project.name} ${id}`)).toEqual([
      'ventas-etl TEM-1',
    ]);
    expect(topicsEverywhereText(found, 'paginación geo-api')).toBe(
      [
        'ventas-etl  TEM-1  answered  ¿Cómo pagina geo-api sus respuestas?',
        '    Con cursor, desde la v2.',
        '',
        'Read one with otea topic show <id> --project <project>.',
      ].join('\n'),
    );
  });

  it('says when no project has a topic that mentions the words', () => {
    const found = topicsEverywhere(projects(), 'geo-aaaaaa', { search: 'kubernetes' });
    expect(topicsEverywhereText(found, 'kubernetes')).toBe(
      'No topic in any project mentions "kubernetes".',
    );
  });
});
