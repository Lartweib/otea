import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../../i18n/i18n.ts';
import { dropBranchNote } from './BoardSections.tsx';

afterEach(() => setLanguage('en'));

describe('discarding an item with a branch', () => {
  it('says the branch stays where it is, for the person to delete', () => {
    setLanguage('es');
    expect(dropBranchNote('feat/login')).toBe(
      'Su rama feat/login sigue en el repositorio: Otea no la borra. Bórrala tú si no la quieres.',
    );
    expect(dropBranchNote(undefined)).toBeNull();
    setLanguage('en');
    expect(dropBranchNote('feat/login')).toBe(
      'Its branch feat/login stays in the repo: Otea does not delete it. Delete it yourself if you do not want it.',
    );
  });
});
