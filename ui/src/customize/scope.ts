import { t } from '../i18n/i18n.ts';

// What an Apply reaches. Opened from an item, it is that item's board. Opened from a template, it
// is every board that uses the template, or, with none, a save of the template itself.
export type Scope = {
  boards: string[];
  // Opened from a template, not from an item.
  template: boolean;
};

export function scopeOf(
  target: { kind: 'item'; board: string } | { kind: 'preset'; users: readonly string[] },
): Scope {
  return target.kind === 'item'
    ? { boards: [target.board], template: false }
    : { boards: [...target.users], template: true };
}

// Saving a template: no board uses it, so there is nothing to apply to.
export const saves = (scope: Scope): boolean => scope.template && scope.boards.length === 0;

export const boardsText = (scope: Scope): string => scope.boards.join(', ');

// "bug-triage" as a person reads it.
export function templateWord(name: string): string {
  const words = name.replaceAll(/[-_]/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function titleOf(scope: Scope, type: string, template: string, board: string): string {
  return scope.template
    ? t('cz.titleTemplate', { type, template: templateWord(template) })
    : t('cz.title', { type, board });
}

export function applyOf(scope: Scope): string {
  return saves(scope) ? t('cz.saveTemplate') : t('cz.apply', { board: boardsText(scope) });
}
