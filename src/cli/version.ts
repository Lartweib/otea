import { readFileSync } from 'node:fs';

// The version of this Otea, as its package.json gives it (otea --version, the MCP server's name).
export const OTEA_VERSION: string = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
).version;
