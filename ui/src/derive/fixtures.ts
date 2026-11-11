import { readFileSync } from 'node:fs';
import { parsePreset } from '../../../src/core/preset.ts';
import { typeViews } from '../../../src/core/views.ts';
import type { FeedEvent } from '../activity.ts';
import type { Item, TypeView } from '../types.ts';

// Test fixtures for the derived facts: items, events and the official presets' types.

export const NOW = Date.parse('2026-11-11T12:00:00Z');
export const MIN = 60_000;

export const ago = (minutes: number): string => new Date(NOW - minutes * MIN).toISOString();
export const inMinutes = (minutes: number): string => new Date(NOW + minutes * MIN).toISOString();

export function officialType(preset: string): TypeView {
  const yaml = readFileSync(
    new URL(`../../../presets/${preset}/preset.yaml`, import.meta.url),
    'utf8',
  );
  const [type] = typeViews(parsePreset(yaml).types);
  if (!type) throw new Error(`no type in ${preset}`);
  return type as unknown as TypeView;
}

export function item(o: Partial<Item> & { id: string }): Item {
  return {
    collection: 'Errores',
    type: 'item',
    title: o.id,
    fields: {},
    presetVersion: 1,
    state: 'verify',
    turn: 'human',
    createdAt: ago(600),
    updatedAt: ago(30),
    createdBy: { kind: 'agent', name: 'scout' },
    lease: null,
    ...o,
  };
}

let seq = 0;
export function moved(
  itemId: string,
  to: string,
  actor: FeedEvent['actor'],
  o: { reason?: string; minutes?: number; from?: string; via?: string } = {},
): FeedEvent {
  seq += 1;
  const data: Record<string, unknown> = { from: o.from ?? 'fixing', to };
  if (o.reason !== undefined) data.reason = o.reason;
  if (o.via !== undefined) data.via = o.via;
  return { id: seq, itemId, type: 'transitioned', actor, at: ago(o.minutes ?? 10), data };
}

export const agent = (name: string): FeedEvent['actor'] => ({ kind: 'agent', name });
export const you: FeedEvent['actor'] = { kind: 'human', name: 'you' };
