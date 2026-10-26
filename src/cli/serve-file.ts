import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

export const SERVE_FILE = 'serve.json';

const ServeInfo = z.object({ port: z.number().int(), pid: z.number().int() });

export type ServeInfo = z.infer<typeof ServeInfo>;

export function writeServeFile(dir: string, info: ServeInfo): void {
  writeFileSync(join(dir, SERVE_FILE), `${JSON.stringify(info)}\n`);
}

export function readServeFile(dir: string): ServeInfo | undefined {
  try {
    const parsed = ServeInfo.safeParse(JSON.parse(readFileSync(join(dir, SERVE_FILE), 'utf8')));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export function removeServeFile(dir: string, pid: number): void {
  if (readServeFile(dir)?.pid === pid) rmSync(join(dir, SERVE_FILE), { force: true });
}
