import { useSyncExternalStore } from 'react';
import type { NewFile } from '../api.ts';
import { fieldLabel, missingToCreate, startOf } from '../intake.ts';
import { firstRole, rolesFor } from '../intake-files.ts';
import { intakeTypes } from '../item-types.ts';
import { fieldWord, stateWord } from '../preset-words.ts';
import type { CollectionView, TypeView } from '../types.ts';

// The phone's quick capture (mock "Captura rápida", screen 3): a sheet from below with the title
// focused, the board it goes to as a chip, an optional note and photo, and Guardar. This file is
// its model and its open state; CaptureSheet.tsx draws it.
//
// Boards that ask for more than a title to create: the engine refuses an item without a field
// required at creation (src/core/fields.ts, invalid_fields), so the capture never sends one. It
// offers the boards that take a title alone, and those whose only other field asked at creation is
// their long text (Pedidos' "Qué necesitas", Errores' "Descripción"): the note fills it, and the
// sheet then asks for it by name. The others are listed, unpickable, saying what they ask for. A
// field required only to complete is no obstacle: the item lands in the step that completes it.

// ───────── open state: what the bottom bar's Nuevo (and today's +) calls ─────────

export type CaptureOpen = {
  // The board it was opened from: that board, when it takes a title alone.
  board?: string | undefined;
  // The button it was opened from: the sheet grows out of it as it rises.
  from?: (() => Element | null) | undefined;
};

type CaptureState = { open: boolean; seq: number; o: CaptureOpen };

let state: CaptureState = { open: false, seq: 0, o: {} };
const listeners = new Set<() => void>();

function set(next: CaptureState) {
  state = next;
  for (const fn of [...listeners]) fn();
}

// Opens the capture sheet. Each opening starts blank.
export function openCapture(o: CaptureOpen = {}): void {
  set({ open: true, seq: state.seq + 1, o });
}

export function closeCapture(): void {
  if (state.open) set({ ...state, open: false });
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const snapshot = () => state;

// The open state now, outside React.
export const captureNow = snapshot;

export function useCapture(): CaptureState {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

// ───────── the boards it can go to ─────────

export type CaptureBoard = {
  name: string;
  // The type its items take: the first that may stand alone and needs nothing but a title and,
  // at most, its note.
  type?: TypeView;
  // The note's field, by its name, when the board asks for it at creation.
  noteNeeded?: string;
  // Why it cannot take a title alone: the fields it asks for at creation…
  needs?: string[];
  // …or the board it is always part of (a Studio "se divide en" that always splits).
  partOf?: string;
};

const TITLE_ONLY = { title: 'x' };

export function captureBoards(
  collections: readonly CollectionView[],
  partOf: (collection: string) => string | undefined = () => undefined,
): CaptureBoard[] {
  return collections.map((c) => {
    const parent = partOf(c.name);
    if (parent !== undefined) return { name: c.name, partOf: parent };
    const types = intakeTypes(c, undefined);
    for (const type of types) {
      const note = takes(type);
      if (note === true) return { name: c.name, type };
      if (note !== false) return { name: c.name, type, noteNeeded: note };
    }
    const first = types[0];
    const needs = first
      ? missingToCreate(first, TITLE_ONLY).map((f) => fieldWord(first, f) ?? fieldLabel(f))
      : [];
    return { name: c.name, needs };
  });
}

// Whether a type takes a title alone (true), a title and its note (the note's name), or not (false).
function takes(type: TypeView): true | string | false {
  const missing = missingToCreate(type, TITLE_ONLY);
  if (missing.length === 0) return true;
  const note = noteField(type);
  if (note !== undefined && missing.length === 1 && missing[0] === note)
    return fieldWord(type, note) ?? fieldLabel(note);
  return false;
}

export type BoardPick = {
  board: CaptureBoard | undefined;
  // Why this board: the one it was opened from, the last one used on this device, or the first.
  why: 'here' | 'last' | 'first' | 'none';
  // The board it was opened from, when that one cannot take a title alone.
  skipped?: string;
};

export function pickBoard(
  boards: readonly CaptureBoard[],
  { here, last }: { here?: string | undefined; last?: string | undefined },
): BoardPick {
  const ok = (name: string | undefined) =>
    name === undefined ? undefined : boards.find((b) => b.name === name && b.type);
  const skipped = here !== undefined && !ok(here) && boards.some((b) => b.name === here);
  const extra = skipped ? { skipped: here } : {};
  const at = ok(here);
  if (at) return { board: at, why: 'here' };
  const remembered = ok(last);
  if (remembered) return { board: remembered, why: 'last', ...extra };
  const first = boards.find((b) => b.type);
  return first ? { board: first, why: 'first', ...extra } : { board: undefined, why: 'none' };
}

// The step a captured item lands in, in the board's words: with its note when one is written or
// the board asks for it (a note can fill what the board needs to complete it).
export function landsStep(type: TypeView, noteWritten = false): string {
  const note = noteField(type);
  const given =
    note !== undefined &&
    (noteWritten || type.fields.some((f) => f.name === note && f.required === 'create'));
  const values = given ? { ...TITLE_ONLY, [note]: 'x' } : TITLE_ONLY;
  return stateWord(type, startOf(type, values).state);
}

// Where the note goes: the long text the board asks for at creation, else the description, else
// its first long text.
export function noteField(type: TypeView): string | undefined {
  const long = type.fields.filter(
    (f) => f.name !== 'title' && (f.name === 'description' || f.module === 'markdown'),
  );
  return (
    long.find((f) => f.required === 'create') ??
    long.find((f) => f.name === 'description') ??
    long[0]
  )?.name;
}

// What Guardar sends: the title, the note where the type keeps it, the photo as evidence.
export function capturePayload(
  type: TypeView,
  { title, note, photo }: { title: string; note: string; photo: File | null },
): { fields: Record<string, string>; files: NewFile[] } {
  const fields: Record<string, string> = { title: title.trim() };
  const into = noteField(type);
  if (into && note.trim() !== '') fields[into] = note.trim();
  const files = photo ? [{ file: photo, role: firstRole(rolesFor(type)) }] : [];
  return { fields, files };
}

// ───────── the last board used, per device and project ─────────

const KEY = 'otea.capture.board';
const keyOf = (project: string | undefined) => (project ? `${KEY}:${project}` : KEY);

export function lastBoard(project: string | undefined): string | undefined {
  try {
    return localStorage.getItem(keyOf(project)) ?? undefined;
  } catch {
    return undefined;
  }
}

export function rememberBoard(project: string | undefined, board: string): void {
  try {
    localStorage.setItem(keyOf(project), board);
  } catch {
    // Storage off (a private window, blocked site data): the next capture starts on the first.
  }
}
