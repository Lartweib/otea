import { afterEach, describe, expect, it } from 'vitest';
import type { ItemEffects } from '../../../../src/core/board/plan.ts';
import { setLanguage } from '../../i18n/i18n.ts';
import { effectLines, pairToast, publishRoles, setupLeftText } from './publish.ts';

afterEach(() => setLanguage('en'));

const none: ItemEffects = { moves: [], needs: [], reopened: [], waiting: [], frozen: [] };

describe('effectLines', () => {
  it('words items held by unfinished parts or blockers, and branches frozen in review', () => {
    setLanguage('es');
    const effects: ItemEffects = {
      ...none,
      waiting: [
        { step: 'sexec', name: 'Ejecutar', wait: 'parts', items: ['CAM-1', 'CAM-2', 'CAM-3'] },
        { step: 'sfix', name: 'Arreglar', wait: 'blockers', items: ['ERR-1'] },
      ],
      frozen: [{ step: 'simpl', name: 'Implementar', items: ['TAR-4'] }],
    };
    expect(effectLines(effects, 'Tareas de repo')).toEqual([
      '3 ítems en Ejecutar tienen Tareas de repo sin terminar: no podrán entregarse hasta que terminen.',
      '1 ítem en Arreglar tiene algo sin terminar que lo frena: no podrá entregarse hasta que termine.',
      '1 ítem en Revisión de Implementar: desde ahora su rama queda congelada.',
    ]);
  });

  it('says "their parts" when the parts board is not known, in English too', () => {
    const effects: ItemEffects = {
      ...none,
      waiting: [{ step: 'sexec', name: 'Run', wait: 'parts', items: ['CAM-1'] }],
      frozen: [{ step: 'simpl', name: 'Build', items: ['A-1', 'A-2'] }],
    };
    expect(effectLines(effects, null)).toEqual([
      '1 item in Run has its parts unfinished: it cannot be handed off until they finish.',
      '2 items in the review of Build: from now on their branch is frozen.',
    ]);
  });
});

describe('publishRoles', () => {
  it('publishes the boards that have changes: a new board always, a live one when its plan changes', () => {
    const plan = (from: number | null, changes: number) => ({ from, changes: changes });
    expect(publishRoles({ parent: plan(null, 0), child: plan(null, 0) })).toEqual([
      'parent',
      'child',
    ]);
    expect(publishRoles({ parent: plan(2, 0), child: plan(1, 3) })).toEqual(['child']);
    expect(publishRoles({ parent: null, child: plan(1, 1) })).toEqual(['child']);
    expect(publishRoles({ parent: plan(2, 0), child: null })).toEqual([]);
  });
});

describe('setupLeftText', () => {
  it('counts what is left unmarked in «Qué falta configurar», in words', () => {
    setLanguage('es');
    expect(setupLeftText(6)).toBe(
      'Quedan seis cosas sin marcar en «Qué falta configurar». Puedes publicar igual: se quedan como están.',
    );
    expect(setupLeftText(1)).toBe(
      'Queda una cosa sin marcar en «Qué falta configurar». Puedes publicar igual: se queda como está.',
    );
  });
});

describe('pairToast', () => {
  it('says both went live, or each new version, then how undo leaves them', () => {
    setLanguage('es');
    const born = [
      { name: 'Cambios', from: null, version: 1 },
      { name: 'Tareas de repo', from: null, version: 1 },
    ];
    expect(pairToast(born, 'cambio')).toEqual({
      done: 'Cambios y Tareas de repo ya están en marcha. Cada cambio se divide en Tareas de repo.',
      undone: 'Cambios y Tareas de repo vuelven a ser borradores.',
    });
    const next = [
      { name: 'Cambios', from: 2, version: 3 },
      { name: 'Tareas de repo', from: 1, version: 2 },
    ];
    expect(
      pairToast([{ name: 'Tareas de repo', from: null, version: 1, first: 'Hacer' }], 'cambio'),
    ).toEqual({
      done: 'Tareas de repo ya está en marcha (v1). Los agentes pueden tomar ítems en Hacer.',
      undone: 'Tareas de repo vuelve a ser un borrador.',
    });
    expect(pairToast(next, 'cambio')).toEqual({
      done: 'Publicados: Cambios v3 y Tareas de repo v2. Los agentes los reciben en su próxima llamada.',
      undone: 'Vuelven las versiones de antes; tus cambios siguen en los borradores.',
    });
  });
});
