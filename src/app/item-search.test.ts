import { beforeEach, describe, expect, it } from 'vitest';
import type { Actor } from '../core/item.ts';
import { appendEvent } from '../store/queries.ts';
import type { Context } from './context.ts';
import { ITEM_HITS_AT_MOST, itemHitsText, searchItems } from './item-search.ts';
import { memoryContext } from './testing.ts';

// P3C-R2-8: a decision made in an item's thread was invisible to a topic search, so the agent said
// it was only in the commit. A search looks in the items' threads too.

const fede: Actor = { kind: 'human', name: 'fede' };
const quill: Actor = { kind: 'agent', name: 'quill' };

let ctx: Context;
let clock: number;
const at = () => {
  clock += 1000;
  return new Date(clock).toISOString();
};

function seedItem(id: string, title: string, fields: Record<string, unknown> = {}): void {
  ctx.db.exec(
    `INSERT OR IGNORE INTO collections (name, prefix, next_seq) VALUES ('Cambios', 'CAM', 1)`,
  );
  const when = at();
  ctx.db
    .prepare(
      `INSERT INTO items (id, collection, seq, title, fields, state, created_at, updated_at,
        created_by_kind, created_by_name)
       VALUES (?, 'Cambios', ?, ?, ?, 'open', ?, ?, 'agent', 'quill')`,
    )
    .run(id, Number(id.split('-')[1]), title, JSON.stringify(fields), when, when);
}

function said(item: string, type: string, actor: Actor, data: Record<string, unknown>): void {
  appendEvent(ctx.db, { itemId: item, type, actor, at: at(), data });
}

beforeEach(() => {
  ctx = memoryContext();
  clock = Date.parse('2026-11-17T10:00:00.000Z');
});

describe('searching the items', () => {
  it("finds a word in an item's thread: notes, their answers, questions and handoff notes", () => {
    seedItem('CAM-1', 'Listado de pedidos');
    said('CAM-1', 'note_left', fede, { note: 1, text: '¿Paginamos con offset?' });
    said('CAM-1', 'note_answered', quill, { note: 1, text: 'Mejor con cursor: no salta filas.' });
    seedItem('CAM-2', 'Otra cosa');
    said('CAM-2', 'question_asked', quill, { question: 1, text: '¿Qué licencia usamos?' });
    said('CAM-2', 'question_answered', fede, { question: 1, text: 'MIT.' });
    seedItem('CAM-3', 'Y otra');
    said('CAM-3', 'transitioned', quill, { from: 'a', to: 'b', note: 'Cambié el logo a SVG.' });

    const hits = (search: string) => searchItems(ctx, search);
    expect(hits('cursor paginación')).toEqual([
      {
        id: 'CAM-1',
        title: 'Listado de pedidos',
        said: 'Mejor con cursor: no salta filas.',
        by: 'quill',
        at: expect.any(String),
        kind: 'reply',
        person: false,
      },
    ]);
    expect(hits('mit').map(({ id, said: text }) => `${id} ${text}`)).toEqual(['CAM-2 MIT.']);
    expect(hits('logo').map(({ id }) => id)).toEqual(['CAM-3']);
    expect(hits('kubernetes')).toEqual([]);
    expect(hits('  ')).toEqual([]);
  });

  it('finds an item by its title and fields too, and ranks the one with the most words first', () => {
    seedItem('CAM-1', 'Paginación del listado');
    seedItem('CAM-2', 'Exportar', { want: 'Paginación con cursor en el export' });

    expect(
      searchItems(ctx, 'paginación cursor').map(({ id, said: text }) => `${id} ${text}`),
    ).toEqual(['CAM-2 Paginación con cursor en el export', 'CAM-1 Paginación del listado']);
  });

  // P3C-R3-13: «Diego BILL-104 commit main» showed CAM-2's handoff note, which held every word, and
  // never the person's answer that decided it («Dejá el commit de Diego…»): a fresh agent said the
  // commit got into main «probably by accident».
  describe('what an item found says, and who said it', () => {
    const human: Actor = { kind: 'human', name: 'human' };
    const decided = () => {
      seedItem('CAM-2', 'BILL-104 cobrar dos veces');
      said('CAM-2', 'question_asked', quill, {
        question: 1,
        text: 'Diego subió un commit a la rama: ¿lo quitamos?',
      });
      said('CAM-2', 'question_answered', human, {
        question: 1,
        text: 'Dejá el commit de Diego, lo necesita soporte.',
        via: 'quill',
        source: 'conversation',
      });
      said('CAM-2', 'transitioned', quill, {
        from: 'a',
        to: 'b',
        note: 'Qué cambié: BILL-104, y el commit de Diego sigue para main.',
      });
    };

    it("names the entry that matched best and its kind, and the person's own words beside it", () => {
      decided();

      const [hit] = searchItems(ctx, 'Diego BILL-104 commit main');
      expect(hit).toMatchObject({
        id: 'CAM-2',
        said: 'Qué cambié: BILL-104, y el commit de Diego sigue para main.',
        by: 'quill',
        kind: 'handoff',
        person: false,
        theirs: {
          said: 'Dejá el commit de Diego, lo necesita soporte.',
          kind: 'answer',
          person: true,
          via: 'quill',
        },
      });
      expect(itemHitsText(hit ? [hit] : [])).toBe(
        [
          "In the items' threads (otea show <id>):",
          'CAM-2  BILL-104 cobrar dos veces',
          "    quill's handoff note: Qué cambié: BILL-104, y el commit de Diego sigue para main.",
          "    the person's answer (noted from the chat by quill): Dejá el commit de Diego, lo necesita soporte.",
        ].join('\n'),
      );
    });

    it("gives the person's words first when they hold as many words searched", () => {
      decided();

      const [hit] = searchItems(ctx, 'commit Diego');
      expect(hit).toMatchObject({ kind: 'answer', person: true, via: 'quill' });
      expect(hit?.theirs).toBeUndefined();
    });
  });

  it(`gives ${ITEM_HITS_AT_MOST} items at most, and cuts a long text short`, () => {
    for (const n of [1, 2, 3, 4, 5, 6]) seedItem(`CAM-${n}`, `Cursor ${n}`);
    seedItem('CAM-7', 'Largo');
    said('CAM-7', 'note_left', fede, { note: 1, text: `cursor ${'palabra '.repeat(60)}` });

    const hits = searchItems(ctx, 'cursor');
    expect(hits).toHaveLength(ITEM_HITS_AT_MOST);
    expect(hits[0]).toMatchObject({ id: 'CAM-7' });
    expect(hits[0]?.said.length).toBeLessThanOrEqual(200);
    expect(hits[0]?.said.endsWith('…')).toBe(true);
  });
});
