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
  // Captura rápida (mock, pantalla 3)
  'phone.capture.board': 'Tablero: {board}. Cambiarlo',
  'phone.capture.here': 'este tablero',
  'phone.capture.last': 'el último que usaste',
  'phone.capture.skipped': '{board} pide más para crear',
  'phone.capture.pick': 'Adónde va',
  'phone.capture.titleField': 'Título',
  'phone.capture.titlePh': 'Qué hay que hacer',
  'phone.capture.note': 'Nota (opcional)',
  'phone.capture.photo': 'Añadir foto',
  'phone.capture.photoAgain': 'Hacer otra foto',
  'phone.capture.removePhoto': 'Quitar la foto',
  'phone.capture.tooLarge': 'Pasa de {mb} MB: no se subirá',
  'phone.capture.lands': 'llega a {board} › {step}',
  'phone.capture.save': 'Guardar',
  'phone.capture.saved': 'Guardado en {board} · {id}',
  'phone.capture.needs': 'pide {fields} para crear · en el ordenador',
  'phone.capture.partOf': 'siempre es parte de {board} · en el ordenador',
  'phone.capture.none': 'Ningún tablero acepta solo un título. Créalo en el ordenador.',
} satisfies Partial<Catalog>;
