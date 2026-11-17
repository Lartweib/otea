// What a Claude Code Stop hook reads to keep a side topic's answer as the agent wrote it in the
// chat (app/topics.ts): the event names the session and its transcript, a JSONL file of the
// conversation; the answer is the text the agent wrote after the person's last message.

export type StopEvent = { session: string; transcript: string };

export function readStopEvent(text: string): StopEvent | undefined {
  try {
    const event = JSON.parse(text) as { session_id?: unknown; transcript_path?: unknown };
    if (typeof event.session_id !== 'string' || typeof event.transcript_path !== 'string')
      return undefined;
    return { session: event.session_id, transcript: event.transcript_path };
  } catch {
    return undefined;
  }
}

type Entry = { type?: unknown; timestamp?: unknown; message?: { content?: unknown } };
type Block = { type?: unknown; text?: unknown };

const blocks = (entry: Entry): Block[] => {
  const content = entry.message?.content;
  if (typeof content === 'string') return [{ type: 'text', text: content }];
  return Array.isArray(content) ? (content as Block[]) : [];
};

// A message the person typed, not the result of a tool the agent ran.
const isPersonMessage = (entry: Entry) =>
  entry.type === 'user' && blocks(entry).some((block) => block.type === 'text');

export type Exchange = { since: string; text: string };

// The agent's text after the person's last message, and when that message came; none when the
// agent wrote no text since.
export function lastExchange(jsonl: string): Exchange | undefined {
  const entries: Entry[] = [];
  for (const raw of jsonl.split(/\r?\n/)) {
    if (raw.trim() === '') continue;
    try {
      entries.push(JSON.parse(raw) as Entry);
    } catch {}
  }
  const asked = entries.findLastIndex(isPersonMessage);
  if (asked < 0) return undefined;
  const since = entries[asked]?.timestamp;
  if (typeof since !== 'string') return undefined;
  const texts = entries
    .slice(asked + 1)
    .filter((entry) => entry.type === 'assistant')
    .flatMap((entry) => blocks(entry))
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => (block.text as string).trim())
    .filter(Boolean);
  if (texts.length === 0) return undefined;
  return { since, text: texts.join('\n\n') };
}
