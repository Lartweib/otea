import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { workspace } from '../app/workspace.ts';
import { ago, item } from '../derive/fixtures.ts';
import { setLanguage } from '../i18n/i18n.ts';
import type { CollectionView } from '../types.ts';
import { Rail } from './Rail.tsx';
import { renderIn, testApp } from './test-app.ts';

afterEach(() => {
  setLanguage('en');
  workspace.set({ folded: false });
});

const board = (name: string, icon: string | null = null) =>
  ({ name, icon, types: [] }) as unknown as CollectionView;

const all = [
  item({ id: 'E1', collection: 'Errores', turn: 'human' }),
  item({ id: 'E2', collection: 'Errores', turn: 'agent' }),
  item({
    id: 'E3',
    collection: 'Errores',
    turn: 'agent',
    expiredLease: { holder: 'Kiln', expiresAt: ago(10) },
  }),
  item({ id: 'C1', collection: 'Criaturas', turn: 'agent' }),
];

const rail = (o: Parameters<typeof testApp>[0] = {}) => {
  setLanguage('es');
  return renderIn(
    testApp({ all, collections: [board('Errores', 'bug'), board('Criaturas', 'paw')], ...o }),
    createElement(Rail),
  );
};

describe('the rail', () => {
  it('heads with the fold, the views label and a new item', () => {
    const html = rail();
    expect(html).toMatch(/class="ibtn"[^>]*aria-expanded="true"[^>]*aria-label="Ocultar el panel"/);
    expect(html).toContain('<span class="lbl">vistas</span>');
    expect(html).toContain('aria-label="Nuevo ítem"');
  });

  it('counts Te toca in your blue and Atasco in warn, each with its folded badge', () => {
    const html = rail();
    expect(html).toMatch(
      /Te toca<\/span><span class="pair"><span class="n you"><span class="nv" data-v="2">/,
    );
    expect(html).toMatch(
      /Atasco<\/span><span class="pair"><span class="n warn"><span class="nv" data-v="1">/,
    );
    expect(html).toContain('<i class="badge has">2</i>');
    expect(html).toContain('<i class="badge warn has">1</i>');
  });

  it('lists each board with its icon, yours over open, and a + for a new item in it', () => {
    const html = rail();
    expect(html).toContain('<div class="rail-label">tableros</div>');
    expect(html).toMatch(
      /Errores<\/span><span class="pair"><span class="n you"><span class="nv" data-v="1">1<\/span><\/span> \/ <span class="n"><span class="nv" data-v="3">3/,
    );
    expect(html).toContain('aria-label="Nuevo ítem en Errores"');
    expect(html).toContain('Nuevo tablero');
  });

  it('marks the row in view and slides one pill under it', () => {
    const html = rail({ route: { view: 'board', board: 'Criaturas' } });
    expect(html).toMatch(/class="nrow on"[^>]*aria-current="page"[^>]*data-k="board:Criaturas"/);
    expect(html.match(/class="rsel"/g)).toHaveLength(1);
  });

  it('keeps the project’s Studio and, for whoever may configure it, its settings', () => {
    const html = rail();
    expect(html).toContain('<div class="rail-label">proyecto</div>');
    expect(html).toContain('Studio');
    expect(html).toContain('Configuración');
    const reader = rail({
      session: { canWrite: false, canConfigure: false, canManageDevices: false },
    });
    expect(reader).not.toContain('Configuración');
    expect(reader).not.toContain('Nuevo tablero');
    expect(reader).not.toContain('aria-label="Nuevo ítem"');
  });

  it('ends with Preferencias and you', () => {
    const html = rail();
    expect(html).toMatch(
      /<div class="rail-foot"><button type="button" class="prefs-btn"[^>]*aria-expanded="false"/,
    );
    expect(html).toContain('class="buddy"');
    expect(html).toContain('<span class="lb">Preferencias</span>');
  });

  it('says it opens again once folded', () => {
    workspace.set({ folded: true });
    expect(rail()).toMatch(/aria-expanded="false"[^>]*aria-label="Mostrar el panel"/);
  });
});
