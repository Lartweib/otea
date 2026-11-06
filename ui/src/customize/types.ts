export type FieldKind = 'short' | 'long' | 'choice' | 'level';
export const FIELD_KINDS: readonly FieldKind[] = ['short', 'long', 'choice', 'level'];

export type Need = 'no' | 'complete' | 'create';
export const NEEDS: readonly Need[] = ['no', 'complete', 'create'];

export type ChangeKind = 'move' | 'new' | 'hidden' | 'gone' | 'other';
