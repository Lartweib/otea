import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { evidenceFile } from '../app/evidence.ts';
import { getItem } from '../app/items.ts';
import { liveBoardOf } from '../app/next.ts';
import type { Project } from '../app/project.ts';
import { approvedTipOf } from '../app/tips.ts';
import { isClosed, positionOf } from '../core/board/engine.ts';
import { guardedBranch } from '../core/board/model.ts';
import { selectEvidence } from '../store/queries.ts';

// The attached diff of an item in review against the tip its handoff recorded (P1-R3-1): a «Rama»
// that named another branch, or a diff made in another checkout, showed side by side with no
// warning, and approving keeps the tip, not the diff. `tip` is the commit handed off, `files` the
// paths the diff changes to something that tip does not hold.
export type DiffOffTip = { branch: string; tip: string; files: string[] };

// Git runs off the request's thread, as for the drift.
function git(cwd: string, ...args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      args,
      { cwd, encoding: 'utf8', timeout: 20_000, windowsHide: true },
      (error, stdout) => (error ? reject(error) : resolve(String(stdout).trim())),
    );
  });
}

async function blobAt(cwd: string, commit: string, path: string): Promise<string | undefined> {
  try {
    return (await git(cwd, 'rev-parse', '--verify', '--quiet', `${commit}:${path}`)) || undefined;
  } catch {
    return undefined;
  }
}

// What each file of a git diff becomes, by the blob its index line names (all zeros: deleted).
// A file whose path git had to quote, or with no index line (a rename alone, a diff made by hand),
// says nothing and is left out.
export function diffBlobs(diff: string): { path: string; blob: string }[] {
  const out: { path: string; blob: string }[] = [];
  for (const section of diff.split(/^(?=diff --git )/m)) {
    const head = /^diff --git a\/(\S+) b\/(\S+)\s*$/m.exec(section);
    const index = /^index [0-9a-f]+\.\.([0-9a-f]+)(?: \d+)?\s*$/m.exec(section);
    if (!head?.[2] || !index?.[1]) continue;
    out.push({ path: head[2], blob: index[1] });
  }
  return out;
}

// The latest diff attached to an item in review, against the tip its handoff recorded; null while
// it is not in review, no tip was recorded, it has no diff git can read, or the diff matches.
export async function diffOffTip(project: Project, id: string): Promise<DiffOffTip | null> {
  const item = getItem(project, id);
  const board = liveBoardOf(project, item.collection);
  const guard = board ? guardedBranch(board.def) : undefined;
  const position = positionOf(item.state);
  if (!guard || isClosed(position) || position.phase === 'doing') return null;
  const branch = String(item.fields[guard.id] ?? '').trim();
  if (branch === '' || branch === guard.guard.base) return null;
  const tip = approvedTipOf(project, item.id, branch);
  if (!tip || tip.unchanged) return null;
  const diff = selectEvidence(project.db, item.id)
    .filter(({ kind }) => kind === 'diff')
    .at(-1);
  if (!diff) return null;
  let text: string;
  try {
    text = await readFile(evidenceFile(project.dataDir, diff.sha256), 'utf8');
  } catch {
    return null;
  }
  const blobs = diffBlobs(text);
  if (blobs.length === 0) return null;
  const cwd = project.root;
  try {
    await git(cwd, 'rev-parse', '--verify', '--quiet', `${tip.commit}^{commit}`);
  } catch {
    return null;
  }
  const files: string[] = [];
  for (const { path, blob } of blobs) {
    const there = await blobAt(cwd, tip.commit, path);
    const deleted = /^0+$/.test(blob);
    if (deleted ? there !== undefined : !there?.startsWith(blob)) files.push(path);
  }
  return files.length === 0 ? null : { branch, tip: tip.commit.slice(0, 7), files };
}
