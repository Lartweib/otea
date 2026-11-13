// A timestamp as every text of the CLI and the MCP tools says it: "2026-11-12 10:04 UTC". One
// clock for every agent and person, wherever each runs; --json keeps the full ISO timestamp.
export function timeText(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  return `${new Date(ms).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}
