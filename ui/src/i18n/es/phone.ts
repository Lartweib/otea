import type { Catalog } from '../i18n.ts';

// El área phone del catálogo en español: la barra de abajo, el panel, las páginas que quedan para
// el ordenador y las hojas que suben desde abajo.
export const phone = {
  'phone.tabs': 'Navegación',
  'phone.nav': 'Panel',
  'phone.toca': 'Te toca',
  'phone.new': 'Nuevo',
  'phone.boards': 'tableros · solo lectura',
  'phone.prefs': 'Preferencias',
  'phone.desk': 'Studio y Configuración están en el ordenador.',
  'phone.newItem': 'Nuevo ítem',
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
  'phone.deskOnly.studio': 'Studio está en el ordenador.',
  'phone.deskOnly.settings': 'Configuración está en el ordenador.',
  'phone.deskOnly.modules': 'El catálogo de módulos está en el ordenador.',
  'phone.deskOnly.text': 'En el teléfono revisas, apuntas y lees los tableros.',
  'phone.steps': 'Paso',
  'phone.allSteps': 'Todos',
  'phone.readOnly':
    'En el teléfono los tableros se leen. Pasos, campos y vistas se editan en el ordenador.',
} satisfies Partial<Catalog>;
