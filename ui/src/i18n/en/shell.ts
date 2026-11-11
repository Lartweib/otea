// The shell area of the English catalog.
export const shell = {
  'theme.system': 'system',
  'theme.light': 'light',
  'theme.dark': 'dark',
  'theme.label': 'Theme: {choice}',
  'theme.switch': 'Theme: {choice}. Switch to {next}.',

  // The topbar's three zones: the project, the mark and the agents connected to this project
  'shell.projects': 'projects',
  'shell.projectsTitle': 'Projects',
  'shell.projectSwitch': '{project}, switch project',
  'shell.projectOpen': 'open now',
  'shell.newProject': 'new project: {command} in a repo',
  'shell.allProjectsLine': 'what waits for you, everywhere',
  'shell.notServed': 'not served · otea serve there opens it',
  'shell.pathMissing': 'a path is missing',
  'shell.settingsOf': '{project} settings',
  'shell.otherProjects': { one: '{count} other project', other: '{count} other projects' },
  'shell.elsewhere': {
    one: '{count} more waiting in {where}',
    other: '{count} more waiting in {where}',
  },
  'shell.agentsTitle': 'Agents',
  'shell.agents': { one: '{count} agent', other: '{count} agents' },
  'shell.noAgents': 'no agents',
  'shell.offline': 'offline',
  'shell.agentsIn': 'agents in {project}',
  'shell.holding': { one: '{count} holding', other: '{count} holding' },
  'shell.idleCount': { one: '{count} idle', other: '{count} idle' },
  'shell.idle': 'idle · no lease',
  'shell.cli': 'CLI',
  'shell.noAgentsTitle': 'No agents connected.',
  'shell.howToConnect':
    'Add {mcp} to your agent’s MCP servers, or run any {otea} command with {as}.',
  'shell.connectedRule': 'connected: holds a lease, or was active in the last 5 min',
  'shell.openPanel': 'Open the project’s panel',

  // Preferences: what belongs to this browser
  'prefs.title': 'Preferences',
  'prefs.scope': 'this browser',
  'prefs.theme': 'theme',
  'prefs.system': 'System',
  'prefs.light': 'Light',
  'prefs.dark': 'Dark',
  'prefs.language': 'language',
  'prefs.auto': 'Auto · {code}',
  'prefs.english': 'English',
  'prefs.spanish': 'Español',
  'prefs.onlyInterface': 'Only the interface is translated.',
  'prefs.translated': '{only} Item content, their fields and what agents write stay as written.',
  'prefs.session': 'session',
  'prefs.pair': 'Pair a phone…',
  'prefs.about': 'about',
  'prefs.server': 'server',

  // The note of the first run, when the browser picked a language other than English
  'languageNote.label': 'Language',
  'languageNote.heading': 'Otea is in English, as your browser asks ({tag}).',
  'languageNote.body':
    'Only the interface is translated. Item content, their fields and what agents write stay exactly as written.',
  'languageNote.where': 'Change it any time in Preferences, below.',
  'languageNote.wherePanel': 'Change it any time in Preferences, at the foot of the panel.',
  'languageNote.ok': 'Got it',

  // Collections sidebar
  'rail.label': 'collections',
  'rail.aria': 'Collections',
  'rail.all': 'All work',
  'rail.hide': 'Hide collections',
  'rail.show': 'Show collections',
  'rail.waiting': 'waiting for you',
  'rail.project': 'project',
  'rail.presets': { one: '{count} preset', other: '{count} presets' },
  'rail.official': 'official',

  // Every project on this machine: the inbox at #/projects, and the rail's way there
  'rail.projects': 'All projects',
  'rail.settings': 'Project settings',

  // The stub shell: rail and topbar words
  'nav.toca': 'Your turn',
  'nav.atasco': 'Stuck',
  'nav.views': 'views',
  'nav.boards': 'boards',
  'nav.newBoard': 'New board',
  'nav.newItem': 'New item',
  'nav.newItemIn': 'New item in {board}',
  'nav.prefs': 'Preferences',
  'nav.hide': 'Hide the panel',
  'nav.show': 'Show the panel',
  'nav.working': { one: '{count} working', other: '{count} working' },
  'nav.home': 'otea, Your turn',
} as const;
