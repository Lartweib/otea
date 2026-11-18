// "Abrir carpeta" and "Crear proyecto" in the picker, once the person chose a folder: which project
// to open, made first when there is none, asking in the app's own words whenever the CLI would make
// it somewhere else than the folder chosen (the repository's root) or refuse (a project above
// already covers the folder).
import { resolve } from 'node:path';

// Whether the folder is in a project (`root`: that project's root, when the CLI names it); when it
// is not, `root` is where `otea init` would make one.
export type Probe = { kind: 'project'; root?: string } | { kind: 'none'; root: string };

export type Question =
  // No project yet: create one at `root` (the folder itself, or its repository's root)?
  | { kind: 'create'; dir: string; root: string }
  // The project at `covering` already covers `root`: open it, or create a separate one at `root`?
  | { kind: 'covered'; root: string; covering: string };

export type Answer = 'create' | 'open' | 'cancel';

export type PickPort = {
  probe(dir: string): Promise<Probe>;
  // `otea init` in the folder; `here` makes a separate project inside one that covers it.
  init(dir: string, here: boolean): Promise<void>;
  ask(question: Question): Promise<Answer>;
};

export type Picked = { kind: 'open'; dir: string } | { kind: 'cancel' };

type Covered = { root: string; covering: string };

// Windows paths ignore case, and the dialog and the CLI may differ in it (a drive letter, say).
const keyOf = (path: string) => {
  const full = resolve(path);
  return process.platform === 'win32' ? full.toLowerCase() : full;
};
export const samePath = (a: string, b: string) => keyOf(a) === keyOf(b);

function coveredOf(error: unknown): Covered | undefined {
  const { code, details } = error as {
    code?: unknown;
    details?: Partial<Covered> & { kind?: string };
  };
  if (code !== 'already_exists' || details?.kind !== 'covered') return undefined;
  const { root, covering } = details;
  return typeof root === 'string' && typeof covering === 'string' ? { root, covering } : undefined;
}

export async function pickProject(port: PickPort, dir: string, create: boolean): Promise<Picked> {
  const probe = await port.probe(dir);
  if (probe.kind === 'none') {
    // Opening a folder asks before making a project; creating one asks only when it lands elsewhere.
    if (!create || !samePath(probe.root, dir)) {
      const answer = await port.ask({ kind: 'create', dir, root: probe.root });
      if (answer !== 'create') return { kind: 'cancel' };
    }
    await port.init(dir, false);
    return { kind: 'open', dir: probe.root };
  }
  if (!create) return { kind: 'open', dir };
  // A folder inside a project made elsewhere (a plain folder of a repository whose project is at
  // its root): init would reuse that project and the app would open it without a word, so ask.
  if (probe.root !== undefined && !samePath(probe.root, dir)) {
    const answer = await port.ask({ kind: 'covered', root: dir, covering: probe.root });
    if (answer === 'open') return { kind: 'open', dir: probe.root };
    if (answer !== 'create') return { kind: 'cancel' };
    await port.init(dir, true);
    return { kind: 'open', dir };
  }
  try {
    await port.init(dir, false);
    return { kind: 'open', dir };
  } catch (error) {
    const covered = coveredOf(error);
    if (!covered) throw error;
    const answer = await port.ask({ kind: 'covered', ...covered });
    if (answer === 'open') return { kind: 'open', dir: covered.covering };
    if (answer !== 'create') return { kind: 'cancel' };
    await port.init(dir, true);
    return { kind: 'open', dir: covered.root };
  }
}
