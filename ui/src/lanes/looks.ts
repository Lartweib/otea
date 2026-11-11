import { activeLease } from '../active-lease.ts';
import type { Item } from '../types.ts';
import type { Lane } from './geometry.ts';

// How a node looks (SPEC §4.1, mock:1377-1391). Replaces node-kind.ts for everything restyled.
export type Look = 'yours' | 'working' | 'queued' | 'waiting' | 'stuck' | 'done' | 'dropped';

export function lookOf(item: Item, now: number): Look {
  if (item.turn === 'human') return 'yours';
  if (item.turn === 'none') return item.closes === 'discarded' ? 'dropped' : 'done';
  if (activeLease(item.lease, now)) return 'working';
  if (item.expiredLease) return 'stuck';
  if ((item.children?.open ?? 0) > 0) return 'waiting';
  return 'queued';
}

const GLYPHS: Record<Look, string> = {
  yours: '<g class="lk"><circle r="5" fill="var(--you)"/></g>',
  working:
    '<g class="lk"><circle r="4.4" fill="var(--ground)" stroke="var(--ink)" stroke-width="1.25"/><circle class="orb" r="8.2" fill="none" stroke="var(--ink)" stroke-width="1.25" stroke-linecap="round" stroke-dasharray="13.9 51.5"/></g>',
  queued:
    '<g class="lk"><circle r="4.4" fill="var(--ground)" stroke="var(--ink-2)" stroke-width="1.25"/></g>',
  waiting:
    '<g class="lk"><circle r="4.4" fill="var(--ground)" stroke="var(--ink-2)" stroke-width="1.25" stroke-dasharray="2.6 2.2"/></g>',
  stuck:
    '<g class="lk"><circle r="4.4" fill="var(--ground)" stroke="var(--warn)" stroke-width="1.4"/><circle class="wd" r="1.6" fill="var(--warn)"/></g>',
  done: '<g class="lk"><circle r="5" fill="var(--closed)"/><path class="mk" d="M-2.4 .2 L-.6 2 L2.6 -1.7" fill="none" stroke="var(--ground)" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="14" stroke-dashoffset="0"/></g>',
  dropped:
    '<g class="lk"><circle r="4.4" fill="var(--ground)" stroke="var(--closed)" stroke-width="1.25"/><path class="mk" d="M-2.6 2.6 L2.6 -2.6" stroke="var(--closed)" stroke-width="1.25" stroke-linecap="round" stroke-dasharray="14" stroke-dashoffset="0"/></g>',
};

// The glyph's SVG markup (viewBox -12 -12 24 24); on a sheet its knockouts take the sheet's colour.
export function lookGlyph(look: Look, ground: 'ground' | 'sheet' = 'ground'): string {
  const glyph = GLYPHS[look];
  return ground === 'sheet' ? glyph.replaceAll('var(--ground)', 'var(--sheet)') : glyph;
}

export const laneColor = (lane: Lane): string =>
  lane === 'you' ? 'var(--you)' : lane === 'none' ? 'var(--closed)' : 'var(--lane)';

// The colour a node's light takes (the handoff's pulse): stuck red, yours blue, closed grey, else ink.
export const lookColor = (lane: Lane, look: Look): string =>
  look === 'stuck'
    ? 'var(--warn)'
    : lane === 'you'
      ? 'var(--you)'
      : lane === 'none' || look === 'done' || look === 'dropped'
        ? 'var(--closed)'
        : 'var(--ink)';
