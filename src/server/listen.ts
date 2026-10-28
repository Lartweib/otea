import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createAdaptorServer } from '@hono/node-server';
import { DEFAULT_PORT } from './hosts.ts';
import type { OteaServer } from './server.ts';

export { DEFAULT_PORT } from './hosts.ts';

const HOST = '127.0.0.1';

// Ports above 1024 that browsers (and fetch) refuse to connect to, per the Fetch spec's bad-port list.
const UNSAFE_PORTS = new Set([
  1719, 1720, 1723, 2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669,
  6679, 6697, 10080,
]);

export function isUnsafePort(port: number): boolean {
  return UNSAFE_PORTS.has(port);
}

export type Listening = { url: string; port: number; close(): Promise<void> };

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
    const bind = () => http.listen(port, HOST, onListening);
    const onListening = () => {
      const { port: bound } = http.address() as AddressInfo;
      // A random port the browser would refuse: ask the system for another one.
      if (port === 0 && isUnsafePort(bound)) {
        http.close(bind);
        return;
      }
      server.listeningOn(bound);
      resolve({ url: `http://${HOST}:${bound}`, port: bound, close: () => stop(http, server) });
    };
    bind();
  });
}
