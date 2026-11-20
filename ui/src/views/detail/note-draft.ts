// The words of a send-back not sent yet, kept on this browser until they go: a reload lost them
// (P4-R2-9). Per item and per move, since each send-back goes to its own step. Storage that is
// refused (a private window, blocked site data) only means the draft is not kept.

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const draftKeyOf = (item: string, to: string): string => `otea.sendBack.${item}.${to}`;

// The answer to an agent's question not sent yet, per item (P6-R3-6).
export const answerDraftKeyOf = (item: string): string => `otea.answer.${item}`;

export function draftStore(): Store | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function readDraft(store: Store | undefined, key: string): string {
  try {
    return store?.getItem(key) ?? '';
  } catch {
    return '';
  }
}

export function keepDraft(store: Store | undefined, key: string, text: string): void {
  try {
    if (text.trim()) store?.setItem(key, text);
    else store?.removeItem(key);
  } catch {
    // Not kept: the box still holds it while the page is open.
  }
}

export function dropDraft(store: Store | undefined, key: string): void {
  try {
    store?.removeItem(key);
  } catch {
    // Nothing kept to drop.
  }
}
