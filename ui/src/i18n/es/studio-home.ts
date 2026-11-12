import type { Catalog } from '../i18n.ts';

// Las palabras del inicio de Studio: tus tableros, las tres maneras de empezar, las plantillas,
// los diálogos de tablero nuevo y de esbozo por un agente, y el tablero publicado.
export const studioHome = {
  'bs.home.title': 'Studio',
  'bs.home.dek':
    'Aquí das forma a tus tableros: qué pasos sigue cada ítem, quién hace cada uno, qué se entrega y qué leen los agentes.',
  'bs.home.dekEm': 'Nada llega a un agente hasta que lo publicas.',
  'bs.home.yours': 'Tus tableros',
  'bs.home.none': 'Todavía no tienes tableros. Empieza uno aquí abajo.',
  'bs.home.loading': 'Leyendo tus tableros…',
  'bs.home.failed': 'No se pudieron leer tus tableros: {reason}',
  'bs.home.templatesFailed': 'No se pudieron leer las plantillas: {reason}',
  'bs.home.retry': 'Reintentar',
  'bs.home.readOnly':
    'Solo el navegador de este ordenador cambia los tableros. Desde aquí puedes mirarlos.',
  'bs.home.eachItem': 'cada ítem: {item}',
  'bs.home.live': 'publicado · v{version}',
  'bs.home.changed': 'cambios sin publicar',
  'bs.home.draft': 'borrador sin publicar',
  'bs.home.waiting': 'esperando el esbozo de {agent}',
  'bs.home.waitingAny': 'esperando el esbozo de un agente',
  'bs.home.waitingNote': 'Lo verás aquí en cuanto llegue. Tu pedido es {id}.',
  'bs.home.steps': { one: '1 paso', other: '{count} pasos' },
  'bs.home.open': { one: '1 abierto', other: '{count} abiertos' },
  'bs.home.builtin': 'viene con cada proyecto',
  'bs.home.view': 'Ver el tablero',
  'bs.home.edit': 'Editar',
  'bs.home.use': 'Usar',
  'bs.home.start': 'Empezar uno nuevo',
  'bs.home.startGloss': 'un tablero es el camino que sigue un tipo de trabajo',
  'bs.home.blank': 'En blanco',
  'bs.home.blankText':
    'Un paso que ya funciona: un agente lo hace y tú lo revisas. Lo vas afinando sobre la marcha.',
  'bs.home.blankKey': 'el camino más corto',
  'bs.home.fromTemplate': 'Desde una plantilla',
  'bs.home.fromTemplateText':
    'Copias un tablero hecho para un trabajo y lo cambias a tu gusto. No queda atado a la plantilla.',
  'bs.home.templateCount': { one: '1 plantilla', other: '{count} plantillas' },
  'bs.home.agentDraft': 'Que lo esboce un agente',
  'bs.home.agentDraftText':
    'Le cuentas qué necesitas y te entrega un borrador. Lo revisas aquí antes de publicar nada.',
  'bs.home.agentDraftKey': 'se crea un pedido',
  'bs.home.templates': 'Plantillas',
  'bs.home.templatesGloss': 'tableros hechos para un trabajo; al usarlas se copian',
  'bs.home.editBoard': 'Editar tablero',
  'bs.home.routeOf': 'Los pasos de {board}: {steps}',

  // El diálogo de tablero nuevo.
  'bs.new.title': 'Nuevo tablero',
  'bs.new.lede':
    'Un tablero es el camino que sigue un tipo de trabajo: una fila de pasos que termina en Hecho.',
  'bs.new.name': 'Nombre del tablero',
  'bs.new.namePlaceholder': 'Criaturas, Bugs, Diario…',
  'bs.new.item': 'Cada ítem se llama',
  'bs.new.itemPlaceholder': 'Criatura, Bug, Entrada…',
  'bs.new.itemHint': 'Es la palabra que verás en botones y listas: «Crear · Criatura».',
  'bs.new.starts': 'Empieza',
  'bs.new.blankText':
    'Un paso, {step}: cualquier agente lo hace y tú lo revisas. Ya funciona, y lo vas afinando.',
  'bs.new.create': 'Crear el borrador',
  'bs.new.creating': 'Creando…',
  'bs.new.empty': 'Ponle un nombre al tablero.',
  'bs.new.taken': 'Ya hay un tablero que se llama así. Elige otro nombre.',
  'bs.new.created': 'Borrador de {name}. Nadie lo ve hasta que lo publiques.',

  // El diálogo de esbozo por un agente.
  'bs.ask.title': 'Que lo esboce un agente',
  'bs.ask.lede':
    'Se crea un pedido. Cuando el agente entregue su borrador, lo abres aquí, lo pruebas y decides.',
  'bs.ask.namePlaceholder': 'Criaturas',
  'bs.ask.need': 'Qué necesitas',
  'bs.ask.needPlaceholder':
    'Ej.: Quiero que me abra tareas por cada criatura que creo en el motor y me vaya dando evidencia de los avances para aprobar o refinar.',
  'bs.ask.who': 'Quién lo esboza',
  'bs.ask.send': 'Pedir el borrador',
  'bs.ask.sending': 'Pidiendo…',
  'bs.ask.sent': 'Pedido {id}: el borrador de {name}. Lo verás aquí en cuanto llegue.',
  'bs.ask.arrived': '{agent} entregó el borrador de {name}.',
  'bs.ask.arrivedAny': 'Llegó el borrador de {name}.',
  'bs.ask.open': 'Abrirlo',

  // Un tablero publicado.
  'bs.board.create': 'Crear · {item}',
  'bs.board.version': 'v{version}',
  'bs.board.changes': 'tienes cambios sin publicar',
  'bs.board.nothingIn': 'Nada en {step} ahora.',
  'bs.board.doneGloss': 'aprobados o entregados al final',
  'bs.board.teach':
    'Todavía no hay ítems en {board}. Con {create} empieza uno en {step}, donde {does}. Los agentes conectados también pueden crearlos.',
} satisfies Partial<Catalog>;
