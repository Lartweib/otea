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
