import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from './i18n/i18n.ts';
import { serverMessage } from './remote.ts';

afterEach(() => setLanguage('en'));

const refused = (code: string, message: string, details?: unknown) => ({
  error: { code, message, ...(details === undefined ? {} : { details }) },
});

const reopened = refused(
  'children_open',
  'Not approved CAMBIOS-1: TAR-6 (Implementar) was reopened and is not finished.',
  {
    kind: 'approval',
    item: 'CAMBIOS-1',
    missing: [
      {
        ref: 'wait:parts',
        name: 'Tareas de repo',
        reason: 'open',
        fresh: false,
        open: [{ id: 'TAR-6', board: 'Tareas de repo', step: 'Implementar', closed: false }],
        total: 4,
      },
    ],
  },
);

describe('a refusal from the server', () => {
  it('is said in Spanish from its code and details, never as the English message', () => {
    setLanguage('es');
    expect(serverMessage(reopened, 409)).toBe(
      'No se aprobó CAMBIOS-1: TAR-6 (Implementar) se reabrió y sigue sin terminar.',
    );
  });

  it('is said in the English UI’s own words too', () => {
    expect(serverMessage(reopened, 409)).toBe(
      'Not approved CAMBIOS-1: TAR-6 (Implementar) was reopened and is not finished.',
    );
  });

  it('names what a handoff lacks, the note included, without the CLI’s flags', () => {
    setLanguage('es');
    const body = refused('missing_fields', 'Not handed off ERR-1: missing Diff and a note.', {
      kind: 'handoff',
      item: 'ERR-1',
      missing: [
        { ref: 'ecode', name: 'Diff', reason: 'missing', fresh: true },
        { ref: 'note', name: 'note', reason: 'missing', fresh: true },
      ],
    });
    expect(serverMessage(body, 422)).toBe(
      'No se entregó ERR-1: faltan Diff (nuevo en esta ronda) y una nota.',
    );
    setLanguage('en');
    expect(serverMessage(body, 422)).toBe(
      'Not handed off ERR-1: missing Diff (new this round) and a note.',
    );
  });

  it('says what holds a handoff while its parts or blockers are open', () => {
    setLanguage('es');
    const parts = refused('children_open', 'x', {
      kind: 'handoff',
      item: 'CAM-1',
      missing: [
        {
          ref: 'wait:parts',
          name: 'tareas',
          reason: 'open',
          fresh: false,
          open: [
            { id: 'T-1', board: 'Tareas', step: 'Hacer', closed: false },
            { id: 'T-2', board: 'Tareas', step: 'Hacer', closed: false },
          ],
          total: 3,
        },
      ],
    });
    expect(serverMessage(parts, 409)).toBe(
      'No se entregó CAM-1: 2 de sus 3 partes siguen sin terminar: T-1 (Hacer) y T-2 (Hacer).',
    );
    const blockers = refused('blockers_open', 'x', {
      kind: 'handoff',
      item: 'CAM-1',
      missing: [
        {
          ref: 'wait:blockers',
          name: 'blockers',
          reason: 'open',
          fresh: false,
          open: [{ id: 'ERR-4', board: 'Errores', step: 'Arreglar', closed: false }],
        },
      ],
    });
    expect(serverMessage(blockers, 409)).toBe(
      'No se entregó CAM-1: ERR-4 (Errores, Arreglar) lo frena y sigue sin terminar.',
    );
  });

  it('says why a discard, a send-back, an undo or a restart was refused', () => {
    setLanguage('es');
    const cases: [string, unknown, string][] = [
      [
        'reason_required',
        {
          kind: 'drop',
          item: 'ERR-1',
          board: 'Errores',
          why: 'motive_required',
          motives: ['Rechazado', 'Duplicado'],
        },
        'No se descartó ERR-1: elige un motivo (Rechazado o Duplicado).',
      ],
      [
        'reason_required',
        { kind: 'send_back_reason', item: 'ERR-1' },
        'No se devolvió ERR-1: di qué hay que cambiar.',
      ],
      [
        'reason_required',
        { kind: 'way_back_reason', item: 'ERR-1' },
        'ERR-1 no volvió atrás: di por qué.',
      ],
      [
        'not_undoable',
        { kind: 'undo', item: 'ERR-1', why: 'too_old' },
        'No se deshizo ERR-1: el movimiento ya es demasiado antiguo.',
      ],
      [
        'not_undoable',
        { kind: 'undo_release', item: 'ERR-1', why: 'not_yours' },
        'No se deshizo ERR-1: no lo retomaste tú.',
      ],
      [
        'not_stuck',
        { kind: 'not_stuck', item: 'ERR-1', holder: 'kiln' },
        'ERR-1 no está atascado: kiln lo tiene reservado.',
      ],
      ['item_closed', { kind: 'closed', item: 'ERR-1' }, 'ERR-1 ya terminó: no admite cambios.'],
      ['not_found', { kind: 'item_missing', item: 'ERR-9' }, 'No existe el ítem ERR-9.'],
    ];
    for (const [code, details, said] of cases) {
      expect(serverMessage(refused(code, 'English', details), 409)).toBe(said);
    }
  });

  it('words a known code without details, and shows an unknown one as it came', () => {
    setLanguage('es');
    expect(serverMessage(refused('unexpected', 'Unexpected error'), 500)).toBe(
      'Algo falló en el servidor. Vuelve a intentarlo.',
    );
    expect(serverMessage(refused('brand_new', 'Something new'), 409)).toBe('Something new');
    expect(serverMessage(refused('not_stuck', 'x', { kind: 'from_the_future' }), 409)).toBe('x');
  });
});
