// The handoff's style, a preference of this browser: Plegar (the row folds into a line of light,
// travels as a pulse and unfolds) or Deslizar (the row lifts on a plate and slides).

export type HandoffStyle = 'plegar' | 'deslizar';

const KEY = 'otea.handoff';

export function handoffStyle(): HandoffStyle {
  try {
    return localStorage.getItem(KEY) === 'deslizar' ? 'deslizar' : 'plegar';
  } catch {
    return 'plegar';
  }
}

export function setHandoffStyle(s: HandoffStyle): void {
  try {
    localStorage.setItem(KEY, s);
  } catch {
    // kept for this page only
  }
}
