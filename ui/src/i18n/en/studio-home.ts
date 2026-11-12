// The Studio home's words in the English catalog: your boards, the three ways to start, the
// templates, the new board and agent draft dialogs, and the published board view (home slice).
export const studioHome = {
  'bs.home.title': 'Studio',
  'bs.home.dek':
    'Here you shape your boards: the steps each item follows, who does each one, what gets handed over and what agents read.',
  'bs.home.dekEm': 'Nothing reaches an agent until you publish it.',
  'bs.home.yours': 'Your boards',
  'bs.home.none': 'No boards yet. Start one below.',
  'bs.home.loading': 'Reading your boards…',
  'bs.home.failed': 'Your boards could not be read: {reason}',
  'bs.home.templatesFailed': 'The templates could not be read: {reason}',
  'bs.home.retry': 'Try again',
  'bs.home.readOnly':
    'Only this computer’s browser changes the boards. From here you can look at them.',
  'bs.home.eachItem': 'each item: {item}',
  'bs.home.live': 'published · v{version}',
  'bs.home.changed': 'unpublished changes',
  'bs.home.draft': 'unpublished draft',
  'bs.home.waiting': 'waiting for {agent}’s draft',
  'bs.home.waitingAny': 'waiting for an agent’s draft',
  'bs.home.waitingNote': 'You will see it here as soon as it arrives. Your request is {id}.',
  'bs.home.steps': { one: '1 step', other: '{count} steps' },
  'bs.home.open': { one: '1 open', other: '{count} open' },
  'bs.home.builtin': 'comes with every project',
  'bs.home.view': 'View board',
  'bs.home.edit': 'Edit',
  'bs.home.use': 'Use',
  'bs.home.start': 'Start a new one',
  'bs.home.startGloss': 'a board is the path one kind of work follows',
  'bs.home.blank': 'Blank',
  'bs.home.blankText':
    'One step that already works: an agent does it and you review it. You refine it as you go.',
  'bs.home.blankKey': 'the shortest way',
  'bs.home.fromTemplate': 'From a template',
  'bs.home.fromTemplateText':
    'Copy a board made for one kind of work and change it as you like. It is not tied to the template.',
  'bs.home.templateCount': { one: '1 template', other: '{count} templates' },
  'bs.home.agentDraft': 'Have an agent draft it',
  'bs.home.agentDraftText':
    'Tell it what you need and it delivers a draft. You review it here before anything is published.',
  'bs.home.agentDraftKey': 'a request is created',
  'bs.home.templates': 'Templates',
  'bs.home.templatesGloss': 'boards made for one kind of work; using one copies it',
  'bs.home.editBoard': 'Edit board',
  'bs.home.routeOf': 'The steps of {board}: {steps}',

  // The new board dialog.
  'bs.new.title': 'New board',
  'bs.new.lede': 'A board is the path one kind of work follows: a row of steps that ends in Done.',
  'bs.new.name': 'Board name',
  'bs.new.namePlaceholder': 'Creatures, Bugs, Journal…',
  'bs.new.item': 'Each item is called',
  'bs.new.itemPlaceholder': 'Creature, Bug, Entry…',
  'bs.new.itemHint': 'It is the word you will see on buttons and lists: “Create · Creature”.',
  'bs.new.starts': 'Starts from',
  'bs.new.blankText':
    'One step, {step}: any agent does it and you review it. It already works, and you refine it.',
  'bs.new.create': 'Create the draft',
  'bs.new.creating': 'Creating…',
  'bs.new.empty': 'Give the board a name.',
  'bs.new.taken': 'There is already a board with that name. Pick another one.',
  'bs.new.created': 'Draft of {name}. Nobody sees it until you publish it.',

  // The agent draft dialog.
  'bs.ask.title': 'Have an agent draft it',
  'bs.ask.lede':
    'A request is created. When the agent delivers its draft, you open it here, try it and decide.',
  'bs.ask.namePlaceholder': 'Creatures',
  'bs.ask.need': 'What you need',
  'bs.ask.needPlaceholder':
    'E.g.: Open a task for each creature I make in the engine and keep showing me how it goes, so I can approve or refine it.',
  'bs.ask.who': 'Who drafts it',
  'bs.ask.send': 'Ask for the draft',
  'bs.ask.sending': 'Asking…',
  'bs.ask.sent': 'Request {id}: the draft of {name}. You will see it here as soon as it arrives.',
  'bs.ask.arrived': '{agent} delivered the draft of {name}.',
  'bs.ask.arrivedAny': 'The draft of {name} arrived.',
  'bs.ask.open': 'Open it',

  // A published board.
  'bs.board.create': 'Create · {item}',
  'bs.board.version': 'v{version}',
  'bs.board.changes': 'you have unpublished changes',
  'bs.board.nothingIn': 'Nothing in {step} now.',
  'bs.board.doneGloss': 'approved, or handed off at the end',
  'bs.board.teach':
    'No items in {board} yet. {create} starts one in {step}, where {does}. Connected agents can create them too.',
} as const;
