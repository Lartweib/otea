// Where a key was pressed: anywhere text is typed, keys belong to the field.
export type KeyTarget = 'body' | 'input' | 'textarea' | 'select' | 'editable';

// Reads where a DOM key event happened, so Esc leaves triage only when it was not typed in a field.
export function keyTargetOf(target: EventTarget | null): KeyTarget {
  if (!(target instanceof HTMLElement)) return 'body';
  if (target.isContentEditable) return 'editable';
  const tag = target.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' ? tag : 'body';
}
