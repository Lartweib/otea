import type { MotionPref } from '../motion/reduced.ts';

// The note under Movimiento (mock:3420): what the system chose while it follows the system, else
// what the choice does.
export type MotionNote = 'system-full' | 'system-reduced' | 'full' | 'reduced';

export function motionNote(pref: MotionPref, systemReduced: boolean): MotionNote {
  if (pref === 'system') return systemReduced ? 'system-reduced' : 'system-full';
  return pref;
}
