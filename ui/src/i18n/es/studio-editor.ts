import type { Catalog } from '../i18n.ts';

// Las palabras del editor de tableros: el nombre y la frase que lo resume, la ruta, las tarjetas de
// pasos, el formulario, Hecho, las instrucciones del tablero y lo de cualquier momento, y la barra.
export const studioEditor = {
  'bs.editor.loading': 'Abriendo el tablero…',
  'bs.editor.failed': 'El tablero no se abrió: {reason}',
  'bs.editor.retry': 'Reintentar',
} satisfies Partial<Catalog>;
