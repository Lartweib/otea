// A note sent from a box the person typed it in: the box is cleared only once the note went, so a
// refused or failed send never takes what was typed with it. True when it went.
export async function sendThenClear(
  send: () => Promise<boolean>,
  clear: () => void,
): Promise<boolean> {
  const went = await send().catch(() => false);
  if (went) clear();
  return went;
}

// A move made while a note is still in its box: the note goes first, then the move; a note that
// did not go holds the move, so what was typed is never dropped on the way (P7-3).
export async function keepDraftThen(
  draft: string,
  send: (text: string) => Promise<boolean>,
  move: () => void,
): Promise<boolean> {
  const text = draft.trim();
  if (text !== '' && !(await send(text).catch(() => false))) return false;
  move();
  return true;
}
