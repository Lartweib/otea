import { createHash, randomBytes } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { OteaError } from '../core/errors.ts';

// A phone or tablet paired over the LAN. `hint` is the end of its token's hash, enough to tell two
// devices apart without showing anything that opens the UI.
export type Device = {
  id: string;
  name: string;
  pairedAt: string;
  lastSeenAt: string | null;
  hint: string;
};

type DeviceRow = {
  id: string;
  name: string;
  token_hash: string;
  paired_at: string;
  last_seen_at: string | null;
};

export const MAX_DEVICE_NAME = 60;

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

function toDevice(row: DeviceRow): Device {
  return {
    id: row.id,
    name: row.name,
    pairedAt: row.paired_at,
    lastSeenAt: row.last_seen_at,
    hint: row.token_hash.slice(-4),
  };
}

export function deviceName(name: string): string {
  const trimmed = name.replace(/\s+/g, ' ').trim();
  if (trimmed === '' || trimmed.length > MAX_DEVICE_NAME) {
    throw new OteaError('invalid_name', `A device name has 1 to ${MAX_DEVICE_NAME} characters`);
  }
  return trimmed;
}

// Pairs a device and hands back its token, the only time it exists outside the device.
export function pairDevice(
  db: DatabaseSync,
  name: string,
  now = new Date(),
): { device: Device; token: string } {
  const token = randomBytes(32).toString('base64url');
  const id = randomBytes(4).toString('hex');
  db.prepare(
    'INSERT INTO devices (id, name, token_hash, paired_at, last_seen_at) VALUES (?, ?, ?, ?, ?)',
  ).run(id, deviceName(name), hashToken(token), now.toISOString(), now.toISOString());
  const row = db.prepare('SELECT * FROM devices WHERE id = ?').get(id) as DeviceRow;
  return { device: toDevice(row), token };
}

export function listDevices(db: DatabaseSync): Device[] {
  const rows = db.prepare('SELECT * FROM devices ORDER BY paired_at, id').all() as DeviceRow[];
  return rows.map(toDevice);
}

// The device a token belongs to; a revoked device's token matches nothing.
export function deviceByToken(db: DatabaseSync, token: string): Device | undefined {
  if (token === '') return undefined;
  const row = db.prepare('SELECT * FROM devices WHERE token_hash = ?').get(hashToken(token)) as
    | DeviceRow
    | undefined;
  return row ? toDevice(row) : undefined;
}

export function touchDevice(db: DatabaseSync, id: string, now = new Date()): void {
  db.prepare('UPDATE devices SET last_seen_at = ? WHERE id = ?').run(now.toISOString(), id);
}

export function revokeDevice(db: DatabaseSync, id: string): Device {
  const row = db.prepare('SELECT * FROM devices WHERE id = ?').get(id) as DeviceRow | undefined;
  if (!row) throw new OteaError('not_found', `No paired device ${id}`);
  db.prepare('DELETE FROM devices WHERE id = ?').run(id);
  return toDevice(row);
}
