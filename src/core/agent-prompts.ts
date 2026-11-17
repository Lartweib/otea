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

// The project as an agent joining it needs to know it.
export type JoinFacts = { boards: readonly JoinBoard[]; listening: readonly string[] };

const CONNECT = 'otea connect --as <name> --model <model> --effort <effort>';
const CONNECT_ES = 'otea connect --as <nombre> --model <modelo> --effort <esfuerzo>';
const DRAFT =
  'otea board draft --new "<name>" --why "<what it is for, in my words>" --template <key>';
const DRAFT_ES =
  'otea board draft --new "<nombre>" --why "<para qué es, con mis palabras>" --template <clave>';
const LOOP = 'otea wait --turn agent --unclaimed';

const WORDS = {
  en: {
    start: [
      'Set up Otea in this project and design with me how we will work. Otea is where I hand you work and review what you hand back. Go one step at a time and tell me what you did after each one.',
      `1. Set up: in the repository root, run \`otea init\` if the project is not set up yet (no template). Pick a short name of your own and connect: \`${CONNECT}\`, with unknown for any value you cannot read from your settings (never guess). Read the guide: \`otea board\`.`,
      '2. Read the project before asking me anything: the README, how the code is laid out, the git history (how often it changes, in what bursts), CLAUDE.md or AGENTS.md, and its CI.',
      '3. Ask me, one question at a time, only what you still need: what kind of work happens here, what you do and what I do, what I need to see to approve something (a diff, screenshots, a video, test results, a document), how many review rounds are usual, and what must never happen without me.',
      `4. Design the board or boards. Start from the closest template (\`otea init --help\` lists them) and adapt it: \`${DRAFT}\`; \`otea board draft <Pedido>\` prints it as JSON. Edit it, with the evidence each review needs, and hand it in with \`otea board draft <Pedido> --file board.json\` until it reports nothing wrong. You never publish it.`,
      '5. Tell me where to review it (Studio, from the link the draft prints), that I publish it, and to try it with a first item; offer to adjust it with a new draft if something does not fit.',
      `Then keep working until I stop you: run \`otea next\`, do the step, hand it off and run \`otea next\` again; when there is nothing, run \`${LOOP}\` (in the background if you can) and then \`otea next\`. Answer my notes with \`otea reply\`.`,
    ],
    design: [
      'Design one more board for this project with me. You never publish it: I do, in Studio.',
      '1. Read the project and its boards first: the README, the code, the git history and `otea board`.',
      '2. Ask me, one question at a time, what the board is for: who does each step, what I need to see to approve (a diff, screenshots, a video, test results, a document) and how many review rounds are usual.',
      `3. Start from the closest template (\`otea init --help\` lists them): \`${DRAFT}\`; \`otea board draft <Pedido>\` prints it as JSON. Adapt it and hand it in with \`otea board draft <Pedido> --file board.json\` until it reports nothing wrong.`,
      '4. Tell me where to review it (the Studio link the draft prints), to try it with a first item, and that you will adjust it with a new draft if something does not fit.',
    ],
    join: {
      intro:
        'Join the work on this project as one more agent, alongside the others. Do not design or change boards.',
      connect: (taken: string) =>
        `1. Connect with a name of your own${taken}: \`${CONNECT}\`, with unknown for any value you cannot read from your settings.`,
      taken: (names: string) => `, not one already working here (${names})`,
      read: '2. Read the guide and the boards: `otea board`. Where agents work:',
      board: (name: string, steps: string, waiting: number) =>
        `- ${name}: ${steps}${waiting > 0 ? ` (${waiting} waiting for an agent now)` : ''}`,
      none: '- no board has agent steps yet; wait for one with the loop below.',
      loop: `3. Work the queue until I stop you: \`otea next --claim\`, do the step, hand it off and run \`otea next\` again; when there is nothing, run \`${LOOP}\` (in the background if you can) and then \`otea next\`. Never take an item another agent holds. Answer my notes with \`otea reply\`.`,
    },
  },
  es: {
    start: [
      'Configura Otea en este proyecto y diseña conmigo cómo vamos a trabajar. Otea es donde te paso trabajo y reviso lo que me devuelves. Ve paso a paso y dime qué hiciste después de cada uno.',
      `1. Configuración: en la raíz del repositorio, ejecuta \`otea init\` si el proyecto aún no está configurado (sin plantilla). Elige un nombre corto propio y conéctate: \`${CONNECT_ES}\`, con unknown en lo que no puedas leer de tu configuración (nunca adivines). Lee la guía: \`otea board\`.`,
      '2. Lee el proyecto antes de preguntarme nada: el README, cómo está organizado el código, el historial de git (cada cuánto cambia y en qué rachas), CLAUDE.md o AGENTS.md, y su CI.',
      '3. Pregúntame, de a una pregunta, solo lo que te falte: qué clase de trabajo se hace aquí, qué haces tú y qué hago yo, qué necesito ver para aprobar algo (un diff, capturas, un vídeo, resultados de pruebas, un documento), cuántas rondas de revisión son normales y qué no debe pasar nunca sin mí.',
      `4. Diseña el tablero o los tableros. Parte de la plantilla más cercana (\`otea init --help\` las lista) y adáptala: \`${DRAFT_ES}\`; \`otea board draft <Pedido>\` lo imprime en JSON. Edítalo, con la evidencia que pide cada revisión, y entrégalo con \`otea board draft <Pedido> --file board.json\` hasta que no marque nada mal. Nunca lo publicas tú.`,
      '5. Dime dónde revisarlo (Studio, desde el enlace que imprime el borrador), que lo publico yo, y que lo pruebe con un primer ítem; ofréceme ajustarlo con un borrador nuevo si algo no encaja.',
      `Después sigue trabajando hasta que te detenga: ejecuta \`otea next\`, haz el paso, entrégalo y vuelve a ejecutar \`otea next\`; cuando no haya nada, ejecuta \`${LOOP}\` (en segundo plano si puedes) y luego \`otea next\`. Contesta mis notas con \`otea reply\`.`,
    ],
    design: [
      'Diseña conmigo un tablero más para este proyecto. Nunca lo publicas tú: lo publico yo, en Studio.',
      '1. Primero lee el proyecto y sus tableros: el README, el código, el historial de git y `otea board`.',
      '2. Pregúntame, de a una pregunta, para qué es el tablero: quién hace cada paso, qué necesito ver para aprobar (un diff, capturas, un vídeo, resultados de pruebas, un documento) y cuántas rondas de revisión son normales.',
      `3. Parte de la plantilla más cercana (\`otea init --help\` las lista): \`${DRAFT_ES}\`; \`otea board draft <Pedido>\` lo imprime en JSON. Adáptalo y entrégalo con \`otea board draft <Pedido> --file board.json\` hasta que no marque nada mal.`,
      '4. Dime dónde revisarlo (el enlace a Studio que imprime el borrador), que lo pruebe con un primer ítem, y que lo ajustarás con un borrador nuevo si algo no encaja.',
    ],
    join: {
      intro:
        'Súmate al trabajo de este proyecto como un agente más, junto a los otros. No diseñes ni cambies tableros.',
      connect: (taken: string) =>
        `1. Conéctate con un nombre propio${taken}: \`${CONNECT_ES}\`, con unknown en lo que no puedas leer de tu configuración.`,
      taken: (names: string) => `, que no sea uno de los que ya trabajan aquí (${names})`,
      read: '2. Lee la guía y los tableros: `otea board`. Donde trabajan los agentes:',
      board: (name: string, steps: string, waiting: number) =>
        `- ${name}: ${steps}${waiting > 0 ? ` (${waiting} ${waiting === 1 ? 'espera' : 'esperan'} a un agente ahora)` : ''}`,
      none: '- ningún tablero tiene pasos de agente todavía; espera con el bucle de abajo.',
      loop: `3. Trabaja la cola hasta que te detenga: \`otea next --claim\`, haz el paso, entrégalo y vuelve a ejecutar \`otea next\`; cuando no haya nada, ejecuta \`${LOOP}\` (en segundo plano si puedes) y luego \`otea next\`. Nunca tomes un ítem que tiene otro agente. Contesta mis notas con \`otea reply\`.`,
    },
  },
} as const;

export function startPrompt(lang: Lang): string {
  return WORDS[lang].start.join('\n');
}

export function designPrompt(lang: Lang): string {
  return WORDS[lang].design.join('\n');
}

export function joinPrompt(lang: Lang, facts: JoinFacts): string {
  const words = WORDS[lang].join;
  const listening = [...new Set(facts.listening)];
  const taken = listening.length > 0 ? words.taken(listening.join(', ')) : '';
  const boards = facts.boards.filter(({ agentSteps }) => agentSteps.length > 0);
  return [
    words.intro,
    words.connect(taken),
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
  if (kind === 'start') return startPrompt(lang);
  if (kind === 'design') return designPrompt(lang);
  return joinPrompt(lang, facts);
}
