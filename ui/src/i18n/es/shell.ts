import type { Catalog } from '../i18n.ts';

// El área shell del catálogo en español.
export const shell = {
  'theme.system': 'sistema',
  'theme.light': 'claro',
  'theme.dark': 'oscuro',
  'theme.label': 'Tema: {choice}',
  'theme.switch': 'Tema: {choice}. Cambiar a {next}.',

  // The topbar's three zones: the project, the mark and the agents connected to this project
  'shell.projects': 'proyectos',
  'shell.projectsTitle': 'Proyectos',
  'shell.projectSwitch': '{project}, cambiar de proyecto',
  'shell.projectOpen': 'abierto ahora',
  'shell.newProject': 'proyecto nuevo: {command} en un repo',
  'shell.allProjectsLine': 'lo que te espera, en todos lados',
  'shell.notServed': 'sin servidor · otea serve allí lo abre',
  'shell.pathMissing': 'falta una ruta',
  'shell.settingsOf': 'configuración de {project}',
  'shell.otherProjects': { one: '{count} proyecto más', other: '{count} proyectos más' },
  'shell.elsewhere': {
    one: '{count} más te espera en {where}',
    other: '{count} más te esperan en {where}',
  },
  'shell.agentsTitle': 'Agentes',
  'shell.agents': { one: '{count} agente', other: '{count} agentes' },
  'shell.noAgents': 'sin agentes',
  'shell.offline': 'sin conexión',
  'shell.agentsIn': 'agentes en {project}',
  'shell.holding': { one: '{count} con reserva', other: '{count} con reserva' },
  'shell.idleCount': { one: '{count} inactivo', other: '{count} inactivos' },
  'shell.idle': 'inactivo · sin reserva',
  'shell.cli': 'CLI',
  'shell.noAgentsTitle': 'No hay agentes conectados.',
  'shell.howToConnect':
    'Agrega {mcp} a los servidores MCP de tu agente, o ejecuta cualquier comando de {otea} con {as}.',
  'shell.connectedRule': 'conectado: tiene un lease, o tuvo actividad en los últimos 5 min',
  'shell.openPanel': 'Abrir el panel del proyecto',

  // Preferences: what belongs to this browser
  'prefs.title': 'Preferencias',
  'prefs.scope': 'este navegador',
  'prefs.theme': 'tema',
  'prefs.system': 'Sistema',
  'prefs.light': 'Claro',
  'prefs.dark': 'Oscuro',
  'prefs.language': 'idioma',
  'prefs.auto': 'Auto · {code}',
  'prefs.english': 'English',
  'prefs.spanish': 'Español',
  'prefs.onlyInterface': 'Solo se traduce la interfaz.',
  'prefs.translated':
    '{only} El contenido de los ítems y de sus campos, y lo que escriben los agentes, quedan como se escribieron.',
  'prefs.session': 'sesión',
  'prefs.pair': 'Emparejar un teléfono…',
  'prefs.about': 'acerca de',
  'prefs.server': 'servidor',

  // La nota de la primera vez, cuando el navegador eligió un idioma que no es el inglés
  'languageNote.label': 'Idioma',
  'languageNote.heading': 'Otea está en español, como pide tu navegador ({tag}).',
  'languageNote.body':
    'Solo se traduce la interfaz. El contenido de los ítems y de sus campos, y lo que escriben los agentes, quedan tal como se escribieron.',
  'languageNote.where': 'Puedes cambiarlo cuando quieras en Preferencias, aquí abajo.',
  'languageNote.wherePanel': 'Puedes cambiarlo cuando quieras en Preferencias, al pie del panel.',
  'languageNote.ok': 'Entendido',

  // Barra de colecciones
  'rail.label': 'colecciones',
  'rail.aria': 'Colecciones',
  'rail.all': 'Todo el trabajo',
  'rail.hide': 'Ocultar colecciones',
  'rail.show': 'Mostrar colecciones',
  'rail.waiting': 'te esperan',
  'rail.project': 'proyecto',
  'rail.presets': { one: '{count} preset', other: '{count} presets' },
  'rail.official': 'oficial',

  'rail.projects': 'Todos los proyectos',
  'rail.settings': 'Configuración del proyecto',

  // El shell de la base: el riel y la barra
  'nav.toca': 'Te toca',
  'nav.atasco': 'Atasco',
  'nav.views': 'vistas',
  'nav.boards': 'tableros',
  'nav.newBoard': 'Nuevo tablero',
  'nav.newItem': 'Nuevo ítem',
  'nav.newItemIn': 'Nuevo ítem en {board}',
  'nav.prefs': 'Preferencias',
  'nav.hide': 'Ocultar el panel',
  'nav.show': 'Mostrar el panel',
  'nav.working': { one: '{count} trabajando', other: '{count} trabajando' },
  'nav.home': 'otea, Te toca',
} satisfies Partial<Catalog>;
