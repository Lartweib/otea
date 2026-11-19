import { afterEach, describe, expect, it } from 'vitest';
import { sequenceIds } from '../../../../src/core/board/ids.ts';
import type { ItemEffects } from '../../../../src/core/board/plan.ts';
import { instantiate, requireTemplate } from '../../../../src/core/board/templates.ts';
import { setLanguage } from '../../i18n/i18n.ts';
import type { GateKind, ProjectSettings } from '../../types.ts';
import {
  effectLines,
  hookOffer,
  hookResultText,
  pairToast,
  publishRoles,
  setupLeftText,
} from './publish.ts';

afterEach(() => setLanguage('en'));

// A project whose one folder holds these repos, each with its gate.
const settingsWith = (repos: Array<[string, GateKind]>): ProjectSettings => ({
  id: 'p1',
  name: 'regadera-bot',
  storage: 'common',
  root: '/r',
  dataDir: '/d',
  registered: true,
  database: { path: '/d/otea.db', bytes: 1 },
  evidence: { path: '/d/evidence', bytes: 0, files: 0 },
  items: 0,
  collections: [],
  paths: [
    {
      path: '/r',
      kind: 'folder',
      missing: false,
      repos: repos.map(([name, gate]) => ({ name, folder: name, gate, items: 0 })),
    },
  ],
});

// A board that protects a branch promises a push refused before the review (P2S-R3-1): git asks
// Otea only where its pre-push hook is, so Publicar offers to write it in the repos without one.
describe('hookOffer', () => {
  const mainline = instantiate(requireTemplate('mainline'), 'es', {}, sequenceIds());

  it('offers the hook in the repos that lack it, on a board that protects a branch', () => {
    const settings = settingsWith([
      ['regadera-bot', 'soft'],
      ['api', 'hard'],
    ]);
    expect(hookOffer(mainline, settings)).toEqual(['regadera-bot']);
  });

  it('offers nothing once every repo has it, or on a board that protects no branch', () => {
    expect(hookOffer(mainline, settingsWith([['regadera-bot', 'hard']]))).toEqual([]);
    const todos = instantiate(requireTemplate('todos'), 'es', {}, sequenceIds());
    expect(hookOffer(todos, settingsWith([['regadera-bot', 'soft']]))).toEqual([]);
  });

  it('offers nothing while the settings are not read', () => {
    expect(hookOffer(mainline, null)).toEqual([]);
  });
});

describe('hookResultText', () => {
  it('says where the hook went, and why a repo kept its own', () => {
    setLanguage('es');
    expect(
      hookResultText({
        installed: [{ repo: 'regadera-bot', path: '/r/.git/hooks/pre-push' }],
        refused: [],
      }),
    ).toBe(
      'Hook de git de Otea instalado en regadera-bot: git ya rechaza un push antes de tu aprobación.',
    );
    expect(
      hookResultText({ installed: [], refused: [{ repo: 'api', message: 'api has its own' }] }),
    ).toBe(
      'api ya tiene un hook pre-push propio y Otea no lo toca: en api, otea hook install --git imprime las líneas que hay que agregarle.',
    );
  });

  it('says nothing when there was nothing to write', () => {
    expect(hookResultText({ installed: [], refused: [] })).toBe('');
  });
});

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
