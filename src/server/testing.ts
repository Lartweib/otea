import type { Project } from '../app/project.ts';
import { openDatabase } from '../store/database.ts';
import { migrate } from '../store/migrations.ts';

export function memoryProject(): Project {
  const db = openDatabase(':memory:');
  migrate(db);
  return { root: '/memory', db };
}
