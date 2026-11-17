// Otea's agent guide: how an agent works a board, in one text. The MCP server gives it as its
// instructions on initialize, `otea init --agents-md` writes it into AGENTS.md, and `otea board`
// prints it first. Every agent reads it once a session, so every word costs: keep it short.
export const AGENT_GUIDE = [
  "Otea's agent guide: the board is the procedure; follow it to the letter.",
  "1. Name yourself on every call: --as <name> (MCP tools: as). Each agent and every subagent has its own unique name; never reuse your parent's.",
  '2. Declare your model and effort: otea profile --model <id> --effort <level> (MCP: profile), each session and on any change; subagents too. Declare only what you can read from your settings; if you cannot know a value, declare unknown. Never guess.',
  '3. Start with otea next. Claim before you work: otea claim <id>, or otea next --claim. A claim lasts one step: claim it again at each new step.',
  '4. Do what the step says: its instructions and every line of "Before you hand it off". Do not skip, reorder or add steps; never invent a procedure of your own.',
  '5. "Sent back to you": read the note and address every point before you hand it off again.',
  '6. Hand off with the exact command next prints under "When you finish".',
  '7. Never relay a decision on a step you did, nor review it.',
  '8. Never push to a branch the item\'s "Branch" lines do not allow.',
  '9. Answer every note from the person (otea reply) before you hand off.',
  '10. Ask the person only with otea ask <id> "<question>" (MCP: ask).',
  '11. To propose a new board, run otea board draft --new "<name>" --why "<what it is for>" --template <key> (MCP: board_draft) after asking the person one question at a time how they work; the person publishes it.',
  '12. Keep going until the person stops you: after each handoff run otea next again; when it has nothing, run otea wait --turn agent --unclaimed (in the background if you can; MCP: wait), then otea next.',
].join('\n');

// Added to the guide while the project keeps side topics (app/topics.ts); never otherwise.
export const TOPICS_RULE =
  '13. When the person asks you something off the work at hand, record it: otea topic add "<their question>" (MCP: topic_add), then answer it there too with otea topic answer <id> --summary "<a line or two>" --full "<your whole answer>". A task you make from a topic takes --from <id>.';

// The guide an agent of this project reads: with the topics rule only while topics are on.
export function agentGuideFor(topics: boolean): string {
  return topics ? `${AGENT_GUIDE}\n${TOPICS_RULE}` : AGENT_GUIDE;
}
