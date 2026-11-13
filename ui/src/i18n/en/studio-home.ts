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
    'Here you can look at the boards but not change them. To edit them, run {command} in the project, on its computer: it opens Otea signed in.',
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
  'bs.home.templatesGloss':
    'boards made for one kind of work; using one copies it, and some make two joined boards',
  'bs.home.editBoard': 'Edit board',
  'bs.home.routeOf': 'The steps of {board}: {steps}',
  // Boards that work together.
  'bs.home.splitsInto': 'divides into',
  'bs.home.madeWith': 'made together with {names}',
  'bs.home.viewOf': 'View {board}',
  'bs.home.toConfigure': { one: '1 to set up', other: '{count} to set up' },
  'bs.home.joins': 'How they join',
  'bs.home.joinsGloss': 'tap a name to edit it',
  'bs.home.joinAlways': 'each {child} always belongs to its {parent}',
  'bs.home.joinMaybe': 'each {child} may also go without a {parent}',
  'bs.home.mayBlock': 'can hold back',
  'bs.home.blocksToday': 'today {blocker} holds back {blocked}',
  'bs.home.makes': { one: 'makes one board', other: 'makes {count} boards' },
  'bs.home.and': 'and',

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
  'bs.new.boards': { one: '· 1 board', other: '· {count} boards' },
  'bs.new.firstBoard': 'First board',
  'bs.new.secondBoard': 'Second board',
  'bs.new.boardOf': '{label} · each item: {item}',
  'bs.new.splitHint': 'Each {item} divides into {child}. You can change the names now or later.',
  'bs.new.linkHint': 'They link freely: an item of {second} can hold back one of {first}.',
  'bs.new.createAll': 'Create the two drafts',
  'bs.new.emptyEach': 'Give each board a name.',
  'bs.new.createdPair':
    'Drafts of {first} and {second}, joined: you edit them right here, try them and publish them together.',
  'bs.new.createdSet': 'Drafts of {first} and {second}. Nobody sees them until you publish them.',

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
