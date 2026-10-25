import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { Project } from '../app/project.ts';
import { openDatabase } from '../store/database.ts';
import { migrate } from '../store/migrations.ts';

export function memoryProject(): Project {
  const db = openDatabase(':memory:');
  migrate(db);
  return { root: '/memory', db };
}

export function tempDatabase(): { open: () => DatabaseSync; remove: () => void } {
  const path = join(tmpdir(), `otea-server-${randomUUID()}.db`);
  return {
    open: () => openDatabase(path),
    remove: () => {
      for (const suffix of ['', '-wal', '-shm']) rmSync(`${path}${suffix}`, { force: true });
    },
  };
}
