import type { MotionPref } from '../motion/reduced.ts';

// The note under Movimiento (mock:3420): what the system chose while it follows the system, else
// what the choice does.
export type MotionNote = 'system-full' | 'system-reduced' | 'full' | 'reduced';

export function motionNote(pref: MotionPref, systemReduced: boolean): MotionNote {
  if (pref === 'system') return systemReduced ? 'system-reduced' : 'system-full';
  return pref;
}

// Whose preferences these are, under the title: this browser while Otea runs in a tab, the phone
// or the computer once it runs as the installed app, where no browser is in sight.
export type PrefsScope = 'prefs.scope' | 'prefs.scopePhone' | 'prefs.scopeComputer';

export function prefsScope({
  phone,
  standalone,
}: {
  phone: boolean;
  standalone: boolean;
}): PrefsScope {
  if (!standalone) return 'prefs.scope';
  return phone ? 'prefs.scopePhone' : 'prefs.scopeComputer';
}
