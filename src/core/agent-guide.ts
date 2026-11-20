// Otea's agent guide: how an agent works a board, in one text. The MCP server gives it as its
// instructions on initialize, `otea init --agents-md` writes it into AGENTS.md, and `otea board`
// prints it first. Every agent reads it once a session, so every word costs: keep it short.
export const AGENT_GUIDE = [
  "Otea's agent guide: the board is the procedure; follow it to the letter.",
  "1. Name yourself on every call: --as <name> (MCP tools: as). A new session runs otea whoami first (MCP: whoami): reuse the name it gives back, or pick a new one when it gives none. Each agent and every subagent has its own unique name (a subagent: <your name>-<role>); never reuse your parent's.",
  '2. Declare your model and effort: otea profile --model <id> --effort <level> (MCP: profile), each session and on any change; subagents too. Declare what this session tells you (your instructions, or what the person says); never open config files outside the project for it. Otherwise declare unknown. Never guess.',
  '3. Start with otea next: it follows the order the person set on the Matrix (a board view weighing two fields, like effort × impact). Claim before you work: otea claim <id>, or otea next --claim. A claim lasts one step, and your otea calls keep it: claim it again at each new step, and when your lease ran out; on a long step with no call (a rebase, a test run), run otea heartbeat <id> every 10 minutes. A subagent releases what it holds before it ends: otea release <id>.',
  '4. Every request the person makes, in chat too, goes on a board first: otea create it, then work it there. A new board or a change to one goes through rule 11, never otea create. Do what the step says: its instructions and every line of "Before you hand it off". Do not skip, reorder or add steps; never invent a procedure of your own.',
  '5. "Sent back to you": read the note and address every point before you hand it off again.',
  '6. Hand off with the exact command next prints under "When you finish".',
  '7. Never relay a decision on a step you did, nor review it.',
  '8. Never push to a branch the item\'s "Branch" lines do not allow.',
  '9. Answer every note from the person (otea reply) before you hand off.',
  '10. Ask the person only with otea ask <id> "<question>" (MCP: ask); an answer they give in the chat goes on it: otea answer <id> "<their words>".',
  '11. To propose a new board, run otea board draft --new "<name>" --why "<what it is for>" --template <key> (MCP: board_draft) after asking the person one question at a time how they work; to change a published board (a field, a step), --change <board> instead of --new; the person publishes it.',
  '12. Keep going until the person stops you: after each handoff run otea next again; when it has nothing, wait in a background shell, which keeps your chat free (the MCP wait tool holds it): $ otea wait --turn agent --unclaimed --as <name>; then otea next. Only a running wait hears the desk: after a chat reply, wait again. Stop your wait by ending its shell or with --timeout, never by killing processes by name or pattern. When the person says to leave an item for later: otea release <id> --later sets it aside for every agent; then keep waiting. Never write a polling loop of your own: otea wait is how you wait.',
].join('\n');

// Added to the guide while the project keeps side topics (app/topics.ts); never otherwise.
// Agents skipped the bare rule in a chat (0 of 9 side questions recorded with Haiku): it names what
// a side question is, when to record it, and where to look for what was said before. A recall
// question, a check-in and a follow-up each became a new topic (P4-R2-6, P8-R2-12, P4-R2-5): it
// names what is not a topic, and where a follow-up goes.
export const TOPICS_RULE =
  '13. Topics are on. Every question the person asks you that is not a request to do work (advice, an explanation, a comparison, a curiosity), even mid-task, is a topic. Before you answer it, record it: otea topic add "<their question>" (MCP: topic_add); once you answered in the chat, save your answer there: otea topic answer <id> --summary "<a line or two>" --full "<your answer as you gave it>". Not a topic: a request to do work, small talk or a check-in ("are you there?"), or a question about something said before ("what did we conclude about…?"); for that one, look in the topics first: otea topic list --search "<words>" (MCP: topic_list), then otea topic show <id>; if nothing turns up, search every project with --all-projects. A follow-up to a topic goes on it: otea topic add --to <id> "<their question>". A task you make from a topic takes --from <id>.';

// What next and wait remind an agent of while topics are on, between the person's messages.
export const TOPICS_REMINDER =
  'Topics are on: record each question the person asks you off the work with otea topic add before you answer it (a follow-up: --to <id>), then otea topic answer.';

// The guide an agent of this project reads: with the topics rule only while topics are on.
export function agentGuideFor(topics: boolean): string {
  return topics ? `${AGENT_GUIDE}\n${TOPICS_RULE}` : AGENT_GUIDE;
}
