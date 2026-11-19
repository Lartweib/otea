import { mergedOf } from '../app/merged.ts';
import { liveBoardOf } from '../app/next.ts';
import type { Project } from '../app/project.ts';
import { checkoutsOf } from '../app/repos.ts';
import { isClosed, landStepOf, positionOf } from '../core/board/engine.ts';
import { DONE, guardedBranch } from '../core/board/model.ts';
import { mergedInto } from './gitrepo.ts';

type ItemFacts = {
  id: string;
  collection: string;
  state: string;
  fields: Readonly<Record<string, unknown>>;
};

// An item whose branch is in its base already, merged outside Otea: its `branch`, the `base` and,
// while it stands on the board's land step, that step's name (`land`); none when it is Done and
// not marked merged, on a board without one.
export type MergedOutside = { branch: string; base: string; land?: string };

// A branch merged outside Otea (on the forge, or by hand) leaves its item waiting for a merge that
// already happened (P1-16): in the board's land step, or Done and not marked merged on a board
// without one. Says when git shows the item's branch in the base the board protects already, in
// the checkout here or the checkouts of the item's repo; undefined otherwise.
export function mergedOutside(
  project: Project,
  cwd: string,
  item: ItemFacts,
): MergedOutside | undefined {
  const board = liveBoardOf(project, item.collection);
  const part = board ? guardedBranch(board.def) : undefined;
  const base = part?.guard.base;
  if (!board || !part || !base) return undefined;
  const branch = String(item.fields[part.id] ?? '').trim();
  if (branch === '' || branch === base) return undefined;
  const position = positionOf(item.state);
  const land = landStepOf(board.def);
  const landing =
    land !== undefined &&
    !isClosed(position) &&
    position.step === land.id &&
    position.phase === 'doing';
  const unmarked =
    land === undefined &&
    isClosed(position) &&
    position.closed === DONE &&
    mergedOf(project, item.id) === undefined;
  if (!landing && !unmarked) return undefined;
  const repoPart = part.guard.repo;
  const repo = repoPart ? String(item.fields[repoPart] ?? '').trim() : '';
  const checkouts = repo === '' ? [cwd] : [cwd, ...checkoutsOf(project, repo)];
  if (!checkouts.some((at) => mergedInto(at, branch, base))) return undefined;
  return landing && land ? { branch, base, land: land.name } : { branch, base };
}

// What the CLI says of it first, and what is left to do.
export function mergedOutsideLine(
  project: Project,
  cwd: string,
  item: ItemFacts,
): string | undefined {
  const merged = mergedOutside(project, cwd, item);
  if (!merged) return undefined;
  const said = `${item.id}: its branch ${merged.branch} is in ${merged.base} already, merged outside Otea.`;
  return merged.land
    ? `${said} Nothing is left to merge: fill in what ${merged.land} asks and hand it off (otea handoff ${item.id}).`
    : `${said} Record it: otea merged ${item.id}.`;
}
