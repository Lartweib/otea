import { OteaError } from './errors.ts';

export type Actor = { kind: 'human' | 'agent'; name: string };

export type ItemId = { prefix: string; seq: number };

const ID_PATTERN = /^([A-Z0-9]+)-([1-9][0-9]*)$/;

export function prefixFor(collectionName: string): string {
  const prefix = collectionName.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!prefix) throw new OteaError('invalid_name', `"${collectionName}" has no usable characters`);
  return prefix;
}

export function formatItemId(prefix: string, seq: number): string {
  return `${prefix}-${seq}`;
}

export function parseItemId(id: string): ItemId {
  const match = ID_PATTERN.exec(id);
  if (!match?.[1] || !match[2]) throw new OteaError('invalid_id', `"${id}" is not an item id`);
  return { prefix: match[1], seq: Number(match[2]) };
}
