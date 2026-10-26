import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { Project } from '../app/project.ts';
import { memoryContext } from '../app/testing.ts';
import { openDatabase } from '../store/database.ts';
import type { OteaServer } from './server.ts';

export function memoryProject(): Project {
  return { root: '/memory', ...memoryContext() };
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

export const LOCAL_HOST = '127.0.0.1:4400';

export function request(server: OteaServer, path: string, host = LOCAL_HOST): Promise<Response> {
  return Promise.resolve(server.app.request(path, { headers: { host } }));
}

export const TOKEN = 'test-token-0123456789abcdefghijklmnopqrstuv';

export const SESSION_COOKIE = `otea_session=${TOKEN}`;
