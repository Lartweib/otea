// The common area of the English catalog.
export const common = {
  // Shared
  'common.loading': 'Loading…',
  'common.cancel': 'Cancel',
  'common.confirm': 'Confirm',
  'common.close': 'Close',
  'common.failed': 'Failed',
  'common.noFields': 'No fields.',
  'common.items': 'Items',
  'common.more': '{count} more',
  'common.files': { one: '{count} file', other: '{count} files' },
  'common.dragToResize': 'Drag to resize · double-click resets',
  'common.reasonFor': 'Reason for moving to {state}',
  'common.moveTo': 'Move to {state}',
  'common.closeAs': 'close as',

  // Errors the UI words itself (the server's own messages are shown as they come)
  'error.unreachable': "Can't reach Otea. Is `otea serve` running?",
  'error.signIn': 'This browser is not signed in. Run `otea open` to act from it.',
  'error.requestFailed': 'Request failed with {status}',
  'error.getFailed': 'GET {path} failed with {status}',

  // Top bar
  'app.brand': 'otea, all items',
  'app.modules': 'Modules',
  'app.studio': 'Studio',
  'app.newItem': 'New item',
  'app.notFound': 'Item {id} not found.',
  'app.noModule': 'No module named {name}.',
  'connection.connecting': 'Connecting…',
  'connection.live': 'Live',
  'connection.reconnecting': 'Reconnecting…',

  // Whose turn
  'turn.you': 'you',
  'turn.yours': 'your turn',
  'turn.agent': '{agent}’s turn',
  'turn.anAgent': 'an agent’s turn',
  'turn.agentGeneric': 'agent’s turn',
  'turn.closed': 'closed',
  'node.you': 'Your turn',
  'node.working': 'Agent working',
  'node.queued': 'Agent queued',
  'node.incomplete': 'Agent: incomplete',
  'node.done': 'Done',
  'node.discarded': 'Discarded',
  'actor.human': 'human',
  'actor.agent': 'agent',

  // Time
  'time.minutes': '{count}m',
  'time.hours': '{count}h',
  'time.days': '{count}d',
  'age.now': 'now',
  'age.yesterday': 'yesterday',
  'ago.now': 'just now',
  'ago.time': '{time} ago',
  'lease.left': '{time} left',
  'lease.expired': 'expired',
  'lease.heldBy': 'held by {holder}',
  'lease.heldUntil': 'held by {holder} until {time}',
  'lease.heldExpired': 'held by {holder}, its lease expired at {time}',
  'severity.bars': 'Severity {level} of 4',
  'severity.named': 'Severity {value}, {level} of 4',

  // Moves
  'move.aria': 'Actions',
  'move.none': 'No moves from this state.',
  'move.more': { one: '{count} more', other: '{count} more' },
  'move.moreTitle': 'More moves',
  'move.waits': {
    one: 'waits for {count} open child',
    other: 'waits for {count} open children',
  },
  'move.waitsBlockers': {
    one: 'waits for {count} open blocker',
    other: 'waits for {count} open blockers',
  },
  'move.andBlockers': {
    one: 'and {count} open blocker',
    other: 'and {count} open blockers',
  },
  'move.closesAs': 'closes the item as {as}',
  'move.closes': 'closes the item',
  'move.leaves': 'it leaves Waiting for you',
  'move.comes': 'it comes to Waiting for you',
  'move.asksReason': 'asks a reason first',

  // When, as a row says it (derive/when.ts): the lease left, or how long it has been where it is
  'when.left': '{time} left',
  'when.hoursMinutes': '{hours} h {minutes}',
  'when.hours': '{hours} h',
  'when.minutes': '{minutes} min',
  'when.expired': 'expired',
  'when.now': 'now',
  'when.yesterday': 'yesterday',
  'when.days': { one: '{count} day', other: '{count} days' },
  // The lanes' names over a list
  'lanes.agents': 'ag',
  'lanes.you': 'you',
  // Marks and toasts (kit)
  'mark.you': 'you',
  'toast.undo': 'Undo',
} as const;
