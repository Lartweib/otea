import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from './i18n/i18n.ts';
import { serverMessage } from './remote.ts';

afterEach(() => setLanguage('en'));

const refused = (code: string, message: string, details?: unknown) => ({
  error: { code, message, ...(details === undefined ? {} : { details }) },
});

const reopened = refused(
  'children_open',
  'Not approved CAMBIOS-1: 1 of its 4 Tareas de repo is not finished: TAR-6 (Implementar).',
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
      'No se aprobó CAMBIOS-1: 1 de sus 4 partes sigue sin terminar: TAR-6 (Implementar).',
    );
  });

  it('is said in the English UI’s own words too', () => {
    expect(serverMessage(reopened, 409)).toBe(
      'Not approved CAMBIOS-1: 1 of its 4 parts is not finished: TAR-6 (Implementar).',
    );
  });

  it('never says a part was reopened: it may never have finished', () => {
    setLanguage('es');
    expect(serverMessage(reopened, 409)).not.toMatch(/reabri/);
    setLanguage('en');
    expect(serverMessage(reopened, 409)).not.toMatch(/reopen/);
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
      [
        'invalid_board',
        { kind: 'draft_invalid' },
        'No se pudo leer el borrador como tablero: recarga el editor.',
      ],
    ];
    for (const [code, details, said] of cases) {
      expect(serverMessage(refused(code, 'English', details), 409)).toBe(said);
    }
  });

  it('says an agent may not relay the decision on a step it did itself, in es and en', () => {
    const own = refused('forbidden', 'English', {
      kind: 'own_step',
      item: 'CAM-3',
      step: 'Implementar',
      who: 'claude',
    });
    setLanguage('es');
    expect(serverMessage(own, 403)).toBe(
      'claude no puede transmitir la decisión sobre CAM-3: hizo Implementar en esta ronda. La decides tú.',
    );
    setLanguage('en');
    expect(serverMessage(own, 403)).toBe(
      'claude may not relay the decision on CAM-3: it did Implementar in this round. You make it.',
    );
  });

  it('words a known code without details, and shows an unknown one as it came', () => {
    setLanguage('es');
    expect(serverMessage(refused('unexpected', 'Unexpected error'), 500)).toBe(
      'Algo falló en el servidor. Vuelve a intentarlo.',
    );
    expect(serverMessage(refused('brand_new', 'Something new'), 409)).toBe('Something new');
    expect(serverMessage(refused('not_stuck', 'x', { kind: 'from_the_future' }), 409)).toBe('x');
  });

  it('words a refused note to the agent at work', () => {
    setLanguage('es');
    const notWorking = refused('invalid_transition', 'No note left on TAR-7', {
      kind: 'note',
      item: 'TAR-7',
      why: 'not_working',
    });
    expect(serverMessage(notWorking, 409)).toBe(
      'No se dejó la nota en TAR-7: ningún agente está haciendo un paso en él ahora.',
    );
  });

  it('words archiving and deleting a board, and an archived item', () => {
    setLanguage('es');
    const frozen = refused('board_archived', 'x', {
      kind: 'board_archived',
      board: 'Criaturas',
      item: 'CRI-3',
    });
    expect(serverMessage(frozen, 409)).toBe(
      'CRI-3 está en Criaturas, un tablero archivado: es solo de lectura. Restaura el tablero para trabajar en él.',
    );
    const pedidos = refused('forbidden', 'x', { kind: 'board_builtin', board: 'Pedidos' });
    expect(serverMessage(pedidos, 403)).toBe(
      'Pedidos es el tablero de pedidos del proyecto: no se archiva ni se elimina.',
    );
    const child = refused('in_use', 'x', {
      kind: 'board_split_child',
      board: 'Tareas de repo',
      parent: 'Cambios',
    });
    expect(serverMessage(child, 409)).toBe(
      'Cambios se divide en Tareas de repo: archiva, restaura o elimina Cambios y Tareas de repo va con él.',
    );
    const items = refused('in_use', 'x', { kind: 'board_has_items', board: 'Criaturas', items: 2 });
    expect(serverMessage(items, 409)).toBe(
      'Criaturas tiene 2 ítems: archívalo primero y después elimínalo.',
    );
    setLanguage('en');
    const confirm = refused('reason_required', 'x', {
      kind: 'board_delete_confirm',
      board: 'Criaturas',
      items: 1,
    });
    expect(serverMessage(confirm, 400)).toBe(
      'Deleting Criaturas deletes 1 item: type the board’s name to confirm.',
    );
  });
});
