import type { Catalog } from '../i18n.ts';

// El área common del catálogo en español.
export const common = {
  // Común
  'common.loading': 'Cargando…',
  'common.cancel': 'Cancelar',
  'common.confirm': 'Confirmar',
  'common.close': 'Cerrar',
  'common.failed': 'Falló',
  'common.noFields': 'Sin campos.',
  'common.items': 'Ítems',
  'common.more': '{count} más',
  'common.files': { one: '{count} archivo', other: '{count} archivos' },
  'common.dragToResize': 'Arrastra para cambiar el tamaño · doble clic lo restablece',
  'common.reasonFor': 'Motivo para mover a {state}',
  'common.moveTo': 'Mover a {state}',
  'common.closeAs': 'cerrar como',

  // Errores
  'error.unreachable': 'No se puede conectar con Otea. ¿Está en marcha `otea serve`?',
  'error.signIn':
    'Este navegador no tiene sesión iniciada. Ejecuta `otea open` para actuar desde él.',
  'error.requestFailed': 'La solicitud falló con {status}',
  'error.getFailed': 'GET {path} falló con {status}',

  // Barra superior
  'app.brand': 'otea, todos los ítems',
  'app.modules': 'Módulos',
  'app.studio': 'Studio',
  'app.newItem': 'Nuevo ítem',
  'app.notFound': 'No se encontró el ítem {id}.',
  'app.noModule': 'No hay ningún módulo llamado {name}.',
  'connection.connecting': 'Conectando…',
  'connection.live': 'En vivo',
  'connection.reconnecting': 'Reconectando…',

  // De quién es el turno
  'turn.you': 'tú',
  'turn.yours': 'tu turno',
  'turn.agent': 'turno de {agent}',
  'turn.anAgent': 'turno de un agente',
  'turn.agentGeneric': 'turno del agente',
  'turn.closed': 'cerrado',
  'node.you': 'Tu turno',
  'node.working': 'Agente trabajando',
  'node.queued': 'En cola para un agente',
  'node.incomplete': 'Agente: incompleto',
  'node.done': 'Hecho',
  'node.discarded': 'Descartado',
  'actor.human': 'humano',
  'actor.agent': 'agente',

  // Tiempo
  'time.minutes': '{count} min',
  'time.hours': '{count} h',
  'time.days': '{count} d',
  'age.now': 'ahora',
  'age.yesterday': 'ayer',
  'ago.now': 'ahora mismo',
  'ago.time': 'hace {time}',
  'lease.left': 'quedan {time}',
  'lease.expired': 'vencida',
  'lease.heldBy': 'en manos de {holder}',
  'lease.heldUntil': 'en manos de {holder} hasta {time}',
  'lease.heldExpired': 'en manos de {holder}; su reserva venció ({time})',
  'severity.bars': 'Gravedad {level} de 4',
  'severity.named': 'Gravedad {value}, {level} de 4',

  // Acciones
  'move.aria': 'Acciones',
  'move.none': 'No hay acciones desde este estado.',
  'move.more': { one: '{count} más', other: '{count} más' },
  'move.moreTitle': 'Más acciones',
  'move.waits': {
    one: 'espera a {count} hijo abierto',
    other: 'espera a {count} hijos abiertos',
  },
  'move.waitsBlockers': {
    one: 'espera a {count} bloqueante abierto',
    other: 'espera a {count} bloqueantes abiertos',
  },
  'move.andBlockers': {
    one: 'y {count} bloqueante abierto',
    other: 'y {count} bloqueantes abiertos',
  },
  'move.closesAs': 'cierra el ítem como {as}',
  'move.closes': 'cierra el ítem',
  'move.leaves': 'sale de Te esperan',
  'move.comes': 'pasa a Te esperan',
  'move.asksReason': 'pide un motivo antes',
} satisfies Partial<Catalog>;
