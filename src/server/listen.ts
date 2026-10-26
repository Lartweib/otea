import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createAdaptorServer } from '@hono/node-server';
import { DEFAULT_PORT } from './hosts.ts';
import type { OteaServer } from './server.ts';

export { DEFAULT_PORT } from './hosts.ts';

const HOST = '127.0.0.1';

export type Listening = { url: string; close(): Promise<void> };

export class PortInUseError extends Error {
  constructor(port: number) {
    super(`Port ${port} is already in use; stop the other process or pass --port <n>`);
    this.name = 'PortInUseError';
  }
}

function stop(http: Server, server: OteaServer): Promise<void> {
  server.close();
  return new Promise((resolve) => {
    http.close(() => resolve());
    http.closeAllConnections();
  });
}

export function listen(server: OteaServer, port = DEFAULT_PORT): Promise<Listening> {
  const http = createAdaptorServer({ fetch: server.app.fetch }) as Server;
  return new Promise((resolve, reject) => {
    http.once('error', (error: NodeJS.ErrnoException) => {
      server.close();
      reject(error.code === 'EADDRINUSE' ? new PortInUseError(port) : error);
    });
    http.listen(port, HOST, () => {
      const { port: bound } = http.address() as AddressInfo;
      server.listeningOn(bound);
      resolve({ url: `http://${HOST}:${bound}`, close: () => stop(http, server) });
    });
  });
}
