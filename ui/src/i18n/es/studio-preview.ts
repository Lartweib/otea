import type { Catalog } from '../i18n.ts';

// Las palabras de la vista previa: Lo que ves (y Acomodar), Lo que lee el agente, El tablero, y los
// diálogos Probar, Publicar y Descartar.
export const studioPreview = {
  'bs.preview.see': 'Lo que ves',
  'bs.preview.agent': 'Lo que lee el agente',
  'bs.preview.board': 'El tablero',
  'bs.preview.sampleTitle': '{item} de ejemplo',
  'bs.preview.value.date': '14 nov',
  'bs.preview.value.text': 'Un texto de una línea',
  'bs.preview.value.long':
    'Un texto de ejemplo que muestra cómo se lee este campo en la página del ítem, con el tamaño de letra de siempre.',
  'bs.preview.value.files': { one: '1 archivo', other: '{count} archivos' },
} satisfies Partial<Catalog>;
