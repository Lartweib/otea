import type { Catalog } from '../i18n.ts';

// Las palabras del catálogo de módulos: los módulos de campo, qué hace cada uno y dónde los usan
// los campos de los tableros.
export const catalog = {
  'catalog.title': 'Módulos de campo',
  'catalog.kicker': 'Studio',
  'catalog.kickerNote': 'las piezas con que se arma un detalle',
  'catalog.back': 'Volver a los ítems',
  'catalog.unknownHeading': 'Los nombran tableros, pero no están en esta interfaz',
  'catalog.official': 'oficial',
  'catalog.local': 'local',
  'catalog.unknown': 'desconocido',
  'catalog.localNote': 'no oficial · bajo tu responsabilidad',
  'catalog.unknownNote': 'módulo desconocido · se muestra como texto sin formato',
  'catalog.unknownSummary':
    'Lo nombra un campo de un tablero, pero esta interfaz no tiene un módulo para él.',
  'catalog.unused': 'ningún tablero lo usa',
  'catalog.fields': { one: '{count} campo', other: '{count} campos' },
  'catalog.onBoard': '{fields} en {board}',
  'catalog.onBoards': '{fields} en {count} tableros',
  'catalog.onBoardName': 'en {board}',
  'catalog.sampleItem': 'Ítem de ejemplo',
  'catalog.outOfRow': 'no aparece en la fila',
  'catalog.sample': 'Ejemplo: {label}',
  'catalog.row': 'fila',
  'catalog.detail': 'detalle',
  'catalog.edit': 'edición',
  'catalog.emptyDetail': 'vacío: el detalle no lo muestra',
  'catalog.loadingBoards': 'Cargando los tableros…',
  'catalog.noUses': 'Todavía no lo usa ningún campo de un tablero.',
  'catalog.noBoards': 'Todavía no hay tableros.',
  'catalog.fieldModule': 'módulo de campo',
  'catalog.preview': 'Vista previa',
  'catalog.previewNote':
    'Valores de ejemplo. Lo que edites aquí se queda en esta página y nunca se guarda.',
  'catalog.plainUntil':
    'Sus valores se muestran y editan como texto sin formato hasta que haya un módulo llamado {name}.',
  'catalog.usedBy': 'Lo usan',
  'catalog.intro':
    'Cada campo de un tablero se muestra con un módulo, que elige el tipo de campo que es en Studio. El módulo decide cómo se ve el valor en una fila de la lista y en el detalle del ítem, y cómo se edita. Los módulos oficiales vienen con Otea; los módulos locales de {folder} se marcarán como no oficiales y se usan bajo tu responsabilidad.',
  'catalog.boards': 'Tableros',
  'module.unknown.summary': 'Módulo desconocido: se muestra como texto sin formato.',
  'module.text.summary': 'Una sola línea de texto sin formato, como un título.',
  'module.text.short': 'corto',
  'module.text.long': 'largo',
  'module.text.empty': 'vacío',
  'module.markdown.summary':
    'Texto más largo en Markdown, mostrado de forma segura: el HTML se ve como texto.',
  'module.markdown.short': 'corto',
  'module.markdown.long': 'largo',
  'module.markdown.empty': 'vacío, para que lo complete un agente',
  'module.enum.summary': 'Un valor de una lista fija, con un valor predeterminado opcional.',
  'module.enum.atDefault': 'en su valor predeterminado',
  'module.enum.offDefault': 'fuera de su valor predeterminado',
  'module.enum.empty': 'sin valor predeterminado, vacío',
  'module.severity.summary':
    'El grado de gravedad, en una escala fija de cuatro niveles dibujada como barras de señal.',
  'module.severity.critical': 'crítico, en el tono de advertencia',
  'module.severity.medium': 'medio',
  'module.severity.empty': 'vacío',
} satisfies Partial<Catalog>;
