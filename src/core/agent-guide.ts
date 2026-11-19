// Otea's agent guide: how an agent works a board, in one text. The MCP server gives it as its
// instructions on initialize, `otea init --agents-md` writes it into AGENTS.md, and `otea board`
// prints it first. Every agent reads it once a session, so every word costs: keep it short.
export const AGENT_GUIDE = [
  "Otea's agent guide: the board is the procedure; follow it to the letter.",
  "1. Name yourself on every call: --as <name> (MCP tools: as). A new session runs otea whoami first (MCP: whoami): reuse the name it gives back, or pick a new one when it gives none. Each agent and every subagent has its own unique name (a subagent: <your name>-<role>); never reuse your parent's.",
  '2. Declare your model and effort: otea profile --model <id> --effort <level> (MCP: profile), each session and on any change; subagents too. Declare only what you can read from your settings; if you cannot know a value, declare unknown. Never guess.',
  '3. Start with otea next: it follows the order the person set on the Matrix (a board view weighing two fields, like effort × impact). Claim before you work: otea claim <id>, or otea next --claim. A claim lasts one step: claim it again at each new step, and when your lease ran out. A subagent releases what it holds before it ends: otea release <id>.',
  '4. Every request the person makes, in chat too, goes on a board first: otea create it, then work it there. Do what the step says: its instructions and every line of "Before you hand it off". Do not skip, reorder or add steps; never invent a procedure of your own.',
  '5. "Sent back to you": read the note and address every point before you hand it off again.',
  '6. Hand off with the exact command next prints under "When you finish".',
  '7. Never relay a decision on a step you did, nor review it.',
  '8. Never push to a branch the item\'s "Branch" lines do not allow.',
  '9. Answer every note from the person (otea reply) before you hand off.',
  '10. Ask the person only with otea ask <id> "<question>" (MCP: ask), and tell them to answer it in Otea, not in the chat.',
  '11. To propose a new board, run otea board draft --new "<name>" --why "<what it is for>" --template <key> (MCP: board_draft) after asking the person one question at a time how they work; the person publishes it.',
  '12. Keep going until the person stops you: after each handoff run otea next again; when it has nothing, wait in a background shell, which keeps your chat free (the MCP wait tool holds it): $ otea wait --turn agent --unclaimed --as <name>; then otea next. Only a running wait hears the desk: after a chat reply, wait again. Stop your wait by ending its shell or with --timeout, never by killing processes by name or pattern.',
].join('\n');

// Added to the guide while the project keeps side topics (app/topics.ts); never otherwise.
// Agents skipped the bare rule in a chat (0 of 9 side questions recorded with Haiku): it names what
// a side question is, when to record it, and where to look for what was said before.
export const TOPICS_RULE =
  '13. Topics are on. Every question the person asks you that is not a request to do work (advice, an explanation, a comparison, a curiosity), even mid-task, is a topic. Before you answer it, record it: otea topic add "<their question>" (MCP: topic_add); once you answered in the chat, copy your answer there: otea topic answer <id> --summary "<a line or two>" --full "<your whole answer>". A request to do work is never a topic. When the person asks about something said before ("what did we conclude about…?"), look in the topics first: otea topic list --search "<words>" (MCP: topic_list), then otea topic show <id>. A task you make from a topic takes --from <id>.';

// What next and wait remind an agent of while topics are on, between the person's messages.
export const TOPICS_REMINDER =
  'Topics are on: record each question the person asks you off the work with otea topic add before you answer it, then otea topic answer.';

// The guide an agent of this project reads: with the topics rule only while topics are on.
export function agentGuideFor(topics: boolean): string {
  return topics ? `${AGENT_GUIDE}\n${TOPICS_RULE}` : AGENT_GUIDE;
}
