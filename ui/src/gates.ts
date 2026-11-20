import type { TypeView } from './types.ts';

// What `otea check` lets through for an item now, one row per gated action of its type: whether its
// state allows the action, and the states that do. The UI reads gates; it never runs them.
export type GateRow = { action: string; allowed: boolean; states: string[] };

// verdicts: the server's, when it sent them (the detail); otherwise read from the state, as the
// server derives them.
export function gateRows(
  type: TypeView | undefined,
  state: string,
  verdicts?: Readonly<Record<string, boolean>>,
): GateRow[] {
  return Object.entries(type?.gates ?? {}).map(([action, states]) => ({
    action,
    allowed: verdicts?.[action] ?? states.includes(state),
    states,
  }));
}

// A pull request as the forge links it: a URL opens it; a bare number (#482) is shown as written.
export function externalUrl(value: string): string | undefined {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}
