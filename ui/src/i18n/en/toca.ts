// The toca area of the English catalog.
export const toca = {
  // Te toca and Atasco
  'toca.title': 'Your turn',
  'toca.atasco': 'Stuck',
  'toca.sec.atasco': 'Stuck',
  'toca.sec.preguntas': 'Questions for you',
  'toca.sec.revisiones': 'Reviews',
  'toca.sec.propios': 'Your own steps',
  'toca.sec.encamino': 'On the way',
  'toca.sec.cerrados': 'Closed',
  'toca.gloss.encamino': 'they come back to you when done',
  'toca.gloss.cerrados': 'done and discarded',
  'toca.empty.atasco': 'Nothing stuck.',
  'toca.empty.preguntas': 'No questions.',
  'toca.empty.revisiones': 'Nothing to review.',
  'toca.empty.propios': 'No step of yours.',
  'toca.empty.encamino': 'Nothing on the way.',
  'toca.empty.cerrados': 'Nothing closed yet.',
  'toca.triage': 'Triage',

  // The dek
  'toca.numbers': 'zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen',
  'toca.dek.waiting': {
    one: '{n} thing has been waiting for you {since}.',
    other: '{n} things are waiting for you; the oldest {since}.',
  },
  'toca.dek.none': 'Nothing is waiting for you.',
  'toca.dek.handed': 'The agents handed over {n} today.',
  'toca.dek.handedNone': 'The agents handed nothing over today.',
  'toca.since.now': 'for a moment',
  'toca.since.minutes': 'for {minutes} min',
  'toca.since.hours': 'for {hours} h',
  'toca.since.yesterday': 'since yesterday',
  'toca.since.days': { one: 'for {count} day', other: 'for {count} days' },
  'toca.dekStuck.lead': { one: '{n} thing went quiet: ', other: '{n} things went quiet: ' },
  'toca.dekStuck.agent': '{agent} has given no sign for {time}',
  'toca.dekStuck.none': 'Nothing stuck: the agents keep checking in.',

  // A row's call to act and its small line
  'toca.act.atasco': 'Restart or reassign',
  'toca.act.preguntas': 'Answer',
  'toca.act.revisiones': 'Review',
  'toca.act.propios': 'Your step',
  'toca.act.encamino': 'Comes back for your review',
  'toca.act.done': 'Done',
  'toca.act.dropped': 'Discarded',
  'toca.sub.holds': 'held by {agent}',
  'toca.sub.asks': '{agent} asks',
  'toca.sub.hands': 'handed over by {agent}',
  'toca.sub.yourTurn': 'your turn',
  'toca.sub.then': 'then {agent} takes it',
  'toca.sub.thenAgent': 'then an agent takes it',
  'toca.sub.thenClose': 'then it closes',
  'toca.sub.does': '{agent} is on it',
  'toca.sub.waitsFor': 'waiting for {agent}',
  'toca.sub.waitsAgent': 'waiting for an agent',
  'toca.sub.waitsKids': 'waiting for its children',
  'toca.sub.didIt': 'done by {agent}',
  'toca.sub.closedBy': 'closed by {agent}',
  'toca.sub.closedByYou': 'closed by you',
  'toca.quiet': '{agent} quiet · {time}',
  'toca.replied': '{agent} answered',
  'toca.round': 'round {n}',

  // No agent connected
  'toca.noAgents.title': 'No agent connected',
  'toca.noAgents.waiting': {
    one: 'One item is on an agent’s turn, waiting for someone to take it. Connect one from its terminal and it starts there.',
    other:
      '{count} items are on an agent’s turn, waiting for someone to take them. Connect one from its terminal and it starts with the oldest.',
  },
  'toca.noAgents.nothing':
    'Nothing waits for an agent right now. Connect one from its terminal and it takes what reaches its turn.',
  'toca.noAgents.command': 'otea connect --as <name>',

  // An agent's activity line (in its sheet)
  'toca.agent.trace': 'The last two hours of {agent}',
  'toca.axis.from': '−2 h',
  'toca.axis.mid': '−1 h',
  'toca.axis.now': 'now',
  'toca.connect': 'Connect an agent',
  'toca.colophon':
    'Today they handed over {handed}, you approved {approved} and sent back {sent} with notes.',
} as const;
