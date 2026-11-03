import type { Context } from './context.ts';
import { listItems, workflowOf } from './items.ts';

// How one item stands on a gated action: whether its state allows it, and which states do.
export type GateVerdict = { id: string; state: string; allowed: boolean; allowedIn: string[] };

// `items` holds a verdict for every item checked; empty, nothing gated the action (`note` says
// why), which allows it. The action is allowed only when every item checked allows it.
export type GateCheck = { gate: string; allowed: boolean; items: GateVerdict[]; note?: string };

// Checks the items whose fields hold every value given and whose workflow gates the action. The
// open ones are checked when there are any; otherwise the closed ones, since a closed state can
// allow an action too (merging what was approved).
export function checkGate(ctx: Context, gate: string, fields: Record<string, string>): GateCheck {
  const gated = listItems(ctx, { fields }).flatMap((item) => {
    const allowedIn = workflowOf(ctx, item).gates?.[gate];
    return allowedIn ? [{ item, allowedIn }] : [];
  });
  const open = gated.filter(({ item }) => item.turn !== 'none');
  const items = (open.length > 0 ? open : gated).map(({ item, allowedIn }) => ({
    id: item.id,
    state: item.state,
    allowed: allowedIn.includes(item.state),
    allowedIn,
  }));
  const check: GateCheck = { gate, allowed: items.every(({ allowed }) => allowed), items };
  if (items.length === 0) check.note = `no item with a ${gate} gate matches`;
  return check;
}
