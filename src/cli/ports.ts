import { DEFAULT_PORT } from '../server/hosts.ts';
import { UsageError } from './command.ts';
import { readServeFile } from './serve-file.ts';

const PORT_PATTERN = /^\d{1,5}$/;

export function portFrom(value: string | undefined): number {
  if (value === undefined) return DEFAULT_PORT;
  const port = Number(value);
  if (!PORT_PATTERN.test(value) || port > 65535) {
    throw new UsageError('--port must be an integer between 0 and 65535');
  }
  return port;
}

// The port of the otea serve running on the project, unless --port names another.
export function portToOpen(dir: string, option: string | undefined): number {
  if (option !== undefined) return portFrom(option);
  return readServeFile(dir)?.port ?? DEFAULT_PORT;
}
