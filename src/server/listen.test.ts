import { createServer as createNetServer, type Server } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Project } from '../app/project.ts';
import { DEFAULT_PORT, type Listening, listen } from './listen.ts';
import { createServer } from './server.ts';
import { memoryProject } from './testing.ts';

function occupyPort(): Promise<{ port: number; server: Server }> {
  const server = createNetServer();
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({ port: typeof address === 'object' && address ? address.port : 0, server });
    });
  });
}

describe('listen', () => {
  let project: Project;
  let listening: Listening | undefined;

  beforeEach(() => {
    project = memoryProject();
  });

  afterEach(async () => {
    await listening?.close();
    listening = undefined;
    project.db.close();
  });

  it('defaults to port 4400', () => {
    expect(DEFAULT_PORT).toBe(4400);
  });

  it('serves on 127.0.0.1 only', async () => {
    listening = await listen(createServer(project), 0);

    expect(listening.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect((await fetch(`${listening.url}/api/items`)).status).toBe(200);
  });

  it('fails with a clear error when the port is busy', async () => {
    const busy = await occupyPort();

    await expect(listen(createServer(project), busy.port)).rejects.toThrow(
      `Port ${busy.port} is already in use`,
    );
    busy.server.close();
  });

  it('ends open streams and stops listening on close', async () => {
    listening = await listen(createServer(project), 0);
    const { url } = listening;
    const response = await fetch(`${url}/api/stream`);
    const reader = response.body?.getReader();

    await listening.close();
    listening = undefined;

    let done = false;
    while (!done) done = (await reader?.read())?.done ?? true;
    await expect(fetch(`${url}/api/items`)).rejects.toThrow();
  });
});
