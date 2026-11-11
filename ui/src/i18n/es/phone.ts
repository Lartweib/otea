import type { Catalog } from '../i18n.ts';

// El área phone del catálogo en español: la hoja de navegación, el botón Nuevo ítem y las hojas
// que suben desde abajo.
export const phone = {
  'phone.nav': 'Panel del proyecto',
  'phone.openNav': 'Abrir el panel del proyecto',
  'phone.toca': 'Te toca',
  'phone.atasco': 'Atasco',
  'phone.boards': 'tableros',
  'phone.newBoard': 'Nuevo tablero',
  'phone.prefs': 'Preferencias',
  'phone.newItem': 'Nuevo ítem',
  'phone.newItemIn': 'Nuevo ítem en {board}',
  'phone.close': 'Cerrar',
} satisfies Partial<Catalog>;
