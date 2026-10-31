// Workspace keys: f folds or unfolds the collections sidebar, j and k move the selection.

// Where a key was pressed: anywhere text is typed, keys belong to the field.
export type KeyTarget = 'body' | 'input' | 'textarea' | 'select' | 'editable';

export type KeyPress = {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  target: KeyTarget;
};

export type KeyCommand = 'toggle-sidebar' | 'next' | 'previous';

export function keyCommand(press: KeyPress): KeyCommand | undefined {
  if (press.target !== 'body') return undefined;
  if (press.ctrlKey || press.metaKey || press.altKey) return undefined;
  switch (press.key) {
    case 'f':
      return 'toggle-sidebar';
    case 'j':
      return 'next';
    case 'k':
      return 'previous';
    default:
      return undefined;
  }
}

// The item one step away in list order. It stops at both ends; with no usable selection it starts at the top.
export function stepSelection(
  order: readonly string[],
  current: string | undefined,
  step: 1 | -1,
): string | undefined {
  const index = current === undefined ? -1 : order.indexOf(current);
  if (index === -1) return order[0];
  return order[Math.min(order.length - 1, Math.max(0, index + step))];
}

// Reads where a DOM key event happened, for keyCommand.
export function keyTargetOf(target: EventTarget | null): KeyTarget {
  if (!(target instanceof HTMLElement)) return 'body';
  if (target.isContentEditable) return 'editable';
  const tag = target.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' ? tag : 'body';
}
