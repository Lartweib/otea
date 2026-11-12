import { createElement, type ReactNode } from 'react';
import type { ItemEffects } from '../../../../src/core/board/plan.ts';
import { t, tx } from '../../i18n/i18n.ts';

// Publicar's words that are not a change of the definition: what happens to items in flight for the
// new capabilities (a wait that holds them, a branch that freezes), which boards of a joined pair
// go out, how many setup marks are left, and the joint toast. `rich` wraps names in <b> for the
// dialog; plain, they read as one sentence (tests, aria).

type Rich = { rich?: boolean };

const name = (text: string, rich: boolean): ReactNode =>
  rich ? createElement('b', null, text) : text;

function say(
  key: Parameters<typeof t>[0],
  params: Record<string, string | number>,
  bold: readonly string[],
  rich: boolean,
): ReactNode {
  if (!rich) return (t as (k: string, p: object) => string)(key, params);
  const holes = Object.fromEntries(
    Object.entries(params).map(([k, v]) => [k, bold.includes(k) ? name(String(v), true) : v]),
  );
  return (tx as (k: string, p: object) => ReactNode)(key, holes);
}

// The `waiting` and `frozen` effects, one sentence each. `parts`: the name of the board the items
// divide into ("Tareas de repo"), or null for "their parts".
export function effectLines(
  effects: Pick<ItemEffects, 'waiting' | 'frozen'>,
  parts: string | null,
  { rich = false }: Rich = {},
): ReactNode[] {
  const out: ReactNode[] = [];
  for (const held of effects.waiting) {
    const count = held.items.length;
    if (held.wait === 'parts')
      out.push(
        parts
          ? say(
              'bs.preview.publish.waitingParts',
              { count, step: held.name, parts },
              ['step', 'parts'],
              rich,
            )
          : say('bs.preview.publish.waitingItsParts', { count, step: held.name }, ['step'], rich),
      );
    else
      out.push(
        say('bs.preview.publish.waitingBlockers', { count, step: held.name }, ['step'], rich),
      );
  }
  for (const frozen of effects.frozen)
    out.push(
      say(
        'bs.preview.publish.frozen',
        { count: frozen.items.length, step: frozen.name },
        ['step'],
        rich,
      ),
    );
  return out;
}

export type PairRole = 'parent' | 'child';

// Which boards of a joined pair Publicar sends: a board never published always, a live one when
// its plan has changes; a board with no draft (null) never.
export function publishRoles(
  plans: Record<PairRole, { from: number | null; changes: number } | null>,
): PairRole[] {
  return (['parent', 'child'] as const).filter((role) => {
    const plan = plans[role];
    return plan !== null && (plan.from === null || plan.changes > 0);
  });
}

// "Quedan seis cosas sin marcar en «Qué falta configurar»…", the count in words up to thirteen.
export function setupLeftText(left: number): string {
  const word = t('bs.preview.publish.numbers').split('|')[left] ?? String(left);
  return t('bs.preview.publish.setupLeft', { count: left, n: word });
}

// `first`: the board's first step, where agents can take items once it is live.
export type Published = { name: string; from: number | null; version: number; first?: string };

// The joint toast and the words after its Deshacer, for the boards a joint publish sent.
export function pairToast(
  recs: readonly Published[],
  item: string,
  { rich = false }: Rich = {},
): { done: ReactNode; undone: ReactNode } {
  const [one, two] = recs;
  if (!one) return { done: '', undone: '' };
  const fresh = (rec: Published) => rec.from === null;
  if (!two)
    return fresh(one)
      ? {
          done: say(
            'bs.preview.publish.toast.first',
            { name: one.name, step: one.first ?? '—' },
            ['name', 'step'],
            rich,
          ),
          undone: say('bs.preview.publish.toast.undoneFirst', { name: one.name }, ['name'], rich),
        }
      : {
          done: say(
            'bs.preview.publish.toast.next',
            { name: one.name, v: one.version },
            ['name'],
            rich,
          ),
          undone: t('bs.preview.publish.toast.undone', { v: one.from ?? 0 }),
        };
  if (fresh(one) && fresh(two))
    return {
      done: say(
        'bs.preview.publish.pair.bothFirst',
        { a: one.name, b: two.name, item: item.toLocaleLowerCase(), child: two.name },
        ['a', 'b'],
        rich,
      ),
      undone: say(
        'bs.preview.publish.pair.undoneFirst',
        { a: one.name, b: two.name },
        ['a', 'b'],
        rich,
      ),
    };
  return {
    done: say(
      'bs.preview.publish.pair.both',
      { a: one.name, va: one.version, b: two.name, vb: two.version },
      ['a', 'b'],
      rich,
    ),
    undone: t('bs.preview.publish.pair.undone'),
  };
}
