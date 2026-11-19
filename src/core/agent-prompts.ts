// What the person pastes into an agent's chat to start it on a project, in the language of the
// screen it is copied from. Three moments: a new project (the whole first contact: set up,
// connect, read the project, interview the person, draft its boards and say how to try them), one
// more board on a project that has boards, and one more agent joining the work already there,
// written from the project as it is now (its boards, their agent steps, what waits, who listens).
// Pure and browser-safe: the server, the CLI and the UI build the same words.
import type { Lang } from './board/template-words.ts';

export const PROMPT_KINDS = ['start', 'join', 'design'] as const;

export type PromptKind = (typeof PROMPT_KINDS)[number];

export function isPromptKind(kind: string): kind is PromptKind {
  return (PROMPT_KINDS as readonly string[]).includes(kind);
}

// A board as the join prompt names it: its agent steps and how many items wait for an agent.
export type JoinBoard = { name: string; agentSteps: readonly string[]; waiting: number };

// The project as an agent joining it needs to know it: `working`, the agents listening now or
// holding an item. `first`: no agent works there now, so the one joining has nobody to join.
// `repo`: the project's folder is a git repository (false for a plain folder, such as a page a
// non-developer keeps): the prompts then speak of no repository, history, CI or worktree.
export type JoinFacts = {
  boards: readonly JoinBoard[];
  working: readonly string[];
  first?: boolean;
  repo?: boolean;
};

// Every agent connects: it refreshes AGENTS.md and is told which MCP server to add to its own
// harness. Nothing it writes names it, so another agent's connect never takes anything from it.
const CONNECT = 'otea connect --as <name> --model <model> --effort <effort>';
const CONNECT_ES = 'otea connect --as <nombre> --model <modelo> --effort <esfuerzo>';
// A restart a harness needs to load the server comes first, before the interview: a new session
// would not know what was said (p3-company run 2), unless it reopens the same conversation.
const CONNECTS =
  "it writes AGENTS.md and prints the MCP server to add to your own harness's config: add it yourself if you have not. If your harness must restart or reload to load it, or I must approve it, ask me now, before step 2, and tell me to reopen this same conversation with your harness's resume option, if it has one, so you keep what we said; Otea keeps every item and board draft either way. Until it loads, the otea command does the same";
const CONNECTS_ES =
  'escribe AGENTS.md e imprime el servidor MCP que tienes que agregar a la configuración de tu propio harness: agrégalo tú si no lo tienes. Si tu harness tiene que reiniciarse o recargarse para cargarlo, o tengo que aprobarlo, pídemelo ahora, antes del paso 2, y dime que reabra esta misma conversación con la opción de reanudar de tu harness, si la tiene, para que conserves lo que hablamos; Otea guarda todos los ítems y borradores de tableros de todos modos. Hasta que cargue, el comando otea hace lo mismo';
const DRAFT =
  'otea board draft --new "<name>" --why "<what it is for, in my words>" --template <key>';
const NAME = (example: string) => `lowercase letters, digits and dashes, such as ${example}`;
const NAME_ES = (example: string) => `letras minúsculas, dígitos y guiones, como ${example}`;

// The example name a prompt gives: claude-b, or the next letter nobody works under, so an agent
// that takes it as given does not take a name in use.
function exampleName(taken: readonly string[] = []): string {
  for (let code = 98; code <= 122; code++) {
    const name = `claude-${String.fromCharCode(code)}`;
    if (!taken.includes(name)) return name;
  }
  return 'claude-new';
}
const DRAFT_ES =
  'otea board draft --new "<nombre>" --why "<para qué es, con mis palabras>" --template <clave>';
const LOOP = 'otea wait --turn agent --unclaimed';
// The desk is the person's to open (P4-R3-9): one an agent starts in its shell closes with it.
const DESK =
  'Never start the desk (otea serve) yourself: I run it in a terminal of my own or open the Otea desktop app, since one you start closes with your session. If I ask you to start it anyway, run otea serve --no-open.';
const DESK_ES =
  'Nunca abras tú el escritorio (otea serve): lo abro yo en una terminal mía o con la app de escritorio de Otea, porque el que abres tú se cierra con tu sesión. Si igual te pido que lo abras, ejecuta otea serve --no-open.';
// Topics are off until the person turns them on (P4-R3-10): the interview offers them.
const TOPICS =
  'Ask me too whether you should keep a record of the side questions I ask you off the work (Topics); if I say yes, turn it on: `otea topic on`.';
const TOPICS_ES =
  'Pregúntame también si quiero que lleves registro de las preguntas sueltas que te hago fuera del trabajo (Temas); si digo que sí, actívalo: `otea topic on`.';
const PROFILE = 'otea profile --as <name> --model <model> --effort <effort> --harness <harness>';
const PROFILE_ES =
  'otea profile --as <nombre> --model <modelo> --effort <esfuerzo> --harness <harness>';

const WORDS = {
  en: {
    start: (repo: boolean) => [
      'Set up Otea in this project and design with me how we will work. Otea is where I hand you work and review what you hand back. Go one step at a time and tell me what you did after each one.',
      `1. Set up: ${repo ? 'in the repository root' : 'in this folder'}, run \`otea init\` if the project is not set up yet (no template). Pick a short name of your own (${NAME(exampleName())}) and connect: \`${CONNECT}\`, with unknown for any value this session does not tell you (never guess, and never open config files outside the project to find it); ${CONNECTS}. Then put your name on every otea command (\`--as <name>\`; MCP tools: as). Declare it for this session too: \`${PROFILE}\`. Read the guide: \`otea board\`. ${DESK}`,
      repo
        ? '2. Read the project before asking me anything: the README, how the code is laid out, the git history (how often it changes, in what bursts), CLAUDE.md or AGENTS.md, and its CI.'
        : '2. Read the project before asking me anything: what is in this folder, any README or notes, and CLAUDE.md or AGENTS.md.',
      `3. Ask me, one question at a time and in plain words, only what you still need: what kind of work happens here, what you do and what I do, what I need to see to approve something (${repo ? 'a diff, screenshots, a video, test results, a document' : 'screenshots, the page or file itself, a document'}), how many review rounds are usual, and what must never happen without me${repo ? ' (for code: whether anything may reach the remote before I see it)' : ''}. ${TOPICS}`,
      `4. Design the board or boards. Start from the closest template (\`otea board draft --help\` lists them, sets too) and adapt it: \`${DRAFT}\`; \`otea board draft <request id>\` (the id it printed) prints it as JSON. Edit it, with the evidence each review needs, and hand it in with \`otea board draft <request id> --file board.json\` until it reports nothing wrong. You never publish it.`,
      '5. Tell me where to review it (Studio, from the link the draft prints), that I publish it, and to try it with a first item; offer to adjust it with a new draft if something does not fit.',
      `Then keep working until I stop you: run \`otea next\`, do the step, hand it off and run \`otea next\` again; when there is nothing, run \`${LOOP}\` (in the background if you can) and then \`otea next\`. Answer my notes with \`otea reply\`.`,
    ],
    design: [
      'Design one more board for this project with me. You never publish it: I do, in Studio.',
      '1. Read the project and its boards first: what is in it, its history and `otea board`. Put your agent name on every otea command (`--as <name>`; MCP tools: as).',
      '2. Ask me, one question at a time, what the board is for: who does each step, what I need to see to approve (a diff, screenshots, a video, test results, a document) and how many review rounds are usual.',
      `3. Start from the closest template (\`otea board draft --help\` lists them, sets too): \`${DRAFT}\`; \`otea board draft <request id>\` (the id it printed) prints it as JSON. Adapt it and hand it in with \`otea board draft <request id> --file board.json\` until it reports nothing wrong.`,
      '4. Tell me where to review it (the Studio link the draft prints), to try it with a first item, and that you will adjust it with a new draft if something does not fit.',
    ],
    join: {
      intro:
        'Join the work on this project as one more agent, alongside the others. Do not design or change boards.',
      firstIntro:
        'Start working on this project as its agent: its boards are ready. Do not design or change boards.',
      connect: (taken: string, example: string) =>
        `1. Run \`otea whoami --harness <harness>\` (the tool you run in): it gives back the name you worked under here before. Without one, pick a name of your own (${NAME(example)})${taken}. Then connect: \`${CONNECT}\`, with unknown for any value this session does not tell you (never guess, and never open config files outside the project to find it); ${CONNECTS}. Then put your name on every command (\`--as <name>\`; MCP tools: as). Declare it for this session too: \`${PROFILE}\`.`,
      worktree:
        'Other agents work in this same checkout: do your work on your own branch in your own git worktree (`git worktree add`), never in files another agent is changing.',
      firstWorktree:
        'More agents may join this same checkout: do your work on your own branch in your own git worktree (`git worktree add`), never in files another agent is changing.',
      folder:
        'Other agents work in this same folder: never change files another agent is changing.',
      taken: (names: string) => `, not one already working here (${names})`,
      read: '2. Read the guide and the boards: `otea board`. Where agents work:',
      board: (name: string, steps: string, waiting: number) =>
        `- ${name}: ${steps}${waiting > 0 ? ` (${waiting} waiting for an agent now)` : ''}`,
      none: '- no board has agent steps yet; wait for one with the loop below.',
      loop: `3. Work the queue until I stop you: \`otea next --claim\`, do the step, hand it off and run \`otea next\` again; when there is nothing, run \`${LOOP}\` (in the background if you can) and then \`otea next\`. Never take an item another agent holds. Answer my notes with \`otea reply\`.`,
    },
  },
  es: {
    start: (repo: boolean) => [
      'Configura Otea en este proyecto y diseña conmigo cómo vamos a trabajar. Otea es donde te paso trabajo y reviso lo que me devuelves. Ve paso a paso y dime qué hiciste después de cada uno.',
      `1. Configuración: ${repo ? 'en la raíz del repositorio' : 'en esta carpeta'}, ejecuta \`otea init\` si el proyecto aún no está configurado (sin plantilla). Elige un nombre corto propio (${NAME_ES(exampleName())}) y conéctate: \`${CONNECT_ES}\`, con unknown en lo que esta sesión no te diga (nunca adivines ni abras archivos de configuración fuera del proyecto para buscarlo); ${CONNECTS_ES}. Luego pon tu nombre en cada comando de otea (\`--as <nombre>\`; herramientas MCP: as). Decláralo también para esta sesión: \`${PROFILE_ES}\`. Lee la guía: \`otea board\`. ${DESK_ES}`,
      repo
        ? '2. Lee el proyecto antes de preguntarme nada: el README, cómo está organizado el código, el historial de git (cada cuánto cambia y en qué rachas), CLAUDE.md o AGENTS.md, y su CI.'
        : '2. Lee el proyecto antes de preguntarme nada: qué hay en esta carpeta, el README o las notas que tenga, y CLAUDE.md o AGENTS.md.',
      `3. Pregúntame, una pregunta a la vez y con palabras simples, solo lo que te falte: qué clase de trabajo se hace aquí, qué haces tú y qué hago yo, qué necesito ver para aprobar algo (${repo ? 'un diff, capturas, un vídeo, resultados de pruebas, un documento' : 'capturas, la página o el archivo mismo, un documento'}), cuántas rondas de revisión son normales y qué no debe pasar nunca sin mí${repo ? ' (en el código: si algo puede llegar al remoto antes de que yo lo vea)' : ''}. ${TOPICS_ES}`,
      `4. Diseña el tablero o los tableros. Parte de la plantilla más cercana (\`otea board draft --help\` las lista, también los conjuntos) y adáptala: \`${DRAFT_ES}\`; \`otea board draft <id del Pedido>\` (el id que imprimió) lo imprime en JSON. Edítalo, con la evidencia que pide cada revisión, y entrégalo con \`otea board draft <id del Pedido> --file board.json\` hasta que no marque nada mal. Nunca lo publicas tú.`,
      '5. Dime dónde revisarlo (Studio, desde el enlace que imprime el borrador), que lo publico yo, y que lo pruebe con un primer ítem; ofréceme ajustarlo con un borrador nuevo si algo no encaja.',
      `Después sigue trabajando hasta que te detenga: ejecuta \`otea next\`, haz el paso, entrégalo y vuelve a ejecutar \`otea next\`; cuando no haya nada, ejecuta \`${LOOP}\` (en segundo plano si puedes) y luego \`otea next\`. Contesta mis notas con \`otea reply\`.`,
    ],
    design: [
      'Diseña conmigo un tablero más para este proyecto. Nunca lo publicas tú: lo publico yo, en Studio.',
      '1. Primero lee el proyecto y sus tableros: qué hay en él, su historial y `otea board`. Pon tu nombre de agente en cada comando de otea (`--as <nombre>`; herramientas MCP: as).',
      '2. Pregúntame, una pregunta a la vez, para qué es el tablero: quién hace cada paso, qué necesito ver para aprobar (un diff, capturas, un vídeo, resultados de pruebas, un documento) y cuántas rondas de revisión son normales.',
      `3. Parte de la plantilla más cercana (\`otea board draft --help\` las lista, también los conjuntos): \`${DRAFT_ES}\`; \`otea board draft <id del Pedido>\` (el id que imprimió) lo imprime en JSON. Adáptalo y entrégalo con \`otea board draft <id del Pedido> --file board.json\` hasta que no marque nada mal.`,
      '4. Dime dónde revisarlo (el enlace a Studio que imprime el borrador), que lo pruebe con un primer ítem, y que lo ajustarás con un borrador nuevo si algo no encaja.',
    ],
    join: {
      intro:
        'Súmate al trabajo de este proyecto como un agente más, junto a los otros. No diseñes ni cambies tableros.',
      firstIntro:
        'Empieza a trabajar en este proyecto como su agente: sus tableros están listos. No diseñes ni cambies tableros.',
      connect: (taken: string, example: string) =>
        `1. Ejecuta \`otea whoami --harness <harness>\` (la herramienta en la que trabajas): te devuelve el nombre con el que ya trabajaste aquí. Si no te da ninguno, elige un nombre propio (${NAME_ES(example)})${taken}. Luego conéctate: \`${CONNECT_ES}\`, con unknown en lo que esta sesión no te diga (nunca adivines ni abras archivos de configuración fuera del proyecto para buscarlo); ${CONNECTS_ES}. Luego pon tu nombre en cada comando (\`--as <nombre>\`; herramientas MCP: as). Decláralo también para esta sesión: \`${PROFILE_ES}\`.`,
      worktree:
        'Otros agentes trabajan en esta misma copia del repositorio: haz tu trabajo en tu propia rama y en tu propio worktree de git (`git worktree add`), nunca en archivos que otro agente está cambiando.',
      firstWorktree:
        'Pueden sumarse más agentes a esta misma copia del repositorio: haz tu trabajo en tu propia rama y en tu propio worktree de git (`git worktree add`), nunca en archivos que otro agente está cambiando.',
      folder:
        'Otros agentes trabajan en esta misma carpeta: nunca cambies archivos que otro agente está cambiando.',
      taken: (names: string) => `, que no sea uno de los que ya trabajan aquí (${names})`,
      read: '2. Lee la guía y los tableros: `otea board`. Donde trabajan los agentes:',
      board: (name: string, steps: string, waiting: number) =>
        `- ${name}: ${steps}${waiting > 0 ? ` (${waiting} ${waiting === 1 ? 'espera' : 'esperan'} a un agente ahora)` : ''}`,
      none: '- ningún tablero tiene pasos de agente todavía; espera con el bucle de abajo.',
      loop: `3. Trabaja la cola hasta que te detenga: \`otea next --claim\`, haz el paso, entrégalo y vuelve a ejecutar \`otea next\`; cuando no haya nada, ejecuta \`${LOOP}\` (en segundo plano si puedes) y luego \`otea next\`. Nunca tomes un ítem que tiene otro agente. Contesta mis notas con \`otea reply\`.`,
    },
  },
} as const;

// `repo`: whether the project is a git repository (the default); a plain folder hears no git words.
export function startPrompt(lang: Lang, repo = true): string {
  return WORDS[lang].start(repo).join('\n');
}

export function designPrompt(lang: Lang): string {
  return WORDS[lang].design.join('\n');
}

export function joinPrompt(lang: Lang, facts: JoinFacts): string {
  const words = WORDS[lang].join;
  const working = [...new Set(facts.working)];
  const taken = working.length > 0 ? words.taken(working.join(', ')) : '';
  const boards = facts.boards.filter(({ agentSteps }) => agentSteps.length > 0);
  // Nobody to join: nobody works there now (or no agent was ever seen).
  const first = facts.first === true || working.length === 0;
  const repo = facts.repo !== false;
  // The first prompt is pasted into a second chat too, before the first agent shows: it asks for
  // a worktree as well, so two sessions never share one checkout.
  const apart = repo ? (first ? words.firstWorktree : words.worktree) : first ? '' : words.folder;
  return [
    [first ? words.firstIntro : words.intro, apart].filter(Boolean).join(' '),
    words.connect(taken, exampleName(working)),
    words.read,
    ...(boards.length > 0
      ? boards.map(({ name, agentSteps, waiting }) =>
          words.board(name, agentSteps.join(', '), waiting),
        )
      : [words.none]),
    words.loop,
  ].join('\n');
}

// The prompt for a moment, `join` built from the project's facts.
export function agentPrompt(kind: PromptKind, lang: Lang, facts: JoinFacts): string {
  if (kind === 'start') return startPrompt(lang, facts.repo !== false);
  if (kind === 'design') return designPrompt(lang);
  return joinPrompt(lang, facts);
}
