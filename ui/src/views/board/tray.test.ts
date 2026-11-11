import { beforeEach, describe, expect, it } from 'vitest';
import { item } from '../../derive/fixtures.ts';
import { setLanguage } from '../../i18n/i18n.ts';
import type { Move } from '../../types.ts';
import { trayButtons, trayStates } from './tray.ts';

const move = (to: string, extra: Partial<Move> = {}): Move => ({
  to,
  by: 'human',
  reasonRequired: false,
  turn: 'agent',
  ...extra,
});
const APPROVE = move('fixed', { by: 'human-ui', turn: 'none', closes: 'done' });
const BACK = move('fixing', { reasonRequired: true });
const WONT = move('wont_fix', { reasonRequired: true, turn: 'none', closes: 'discarded' });
const ACCEPT = move('accepted');

const word = (s: string) => s.replace('_', ' ');

beforeEach(() => setLanguage('es'));

describe('the tray buttons', () => {
  it('names the moves as the detail does: Aprobar, Devolver…, then cerrar como and the closing states', () => {
    const b = trayButtons([WONT, BACK, APPROVE], word);
    expect(b.map((x) => [x.label, x.variant, x.closeAs])).toEqual([
      ['Aprobar', 'primary', false],
      ['Devolver…', 'quiet', false],
      ['wont fix', 'text', true],
    ]);
    expect(b.find((x) => x.move.to === 'fixing')?.reason).toBe(true);
  });

  it('names a send back by its state when there are several, and any other move "Mover a"', () => {
    const b = trayButtons([ACCEPT, BACK, move('needs_info', { reasonRequired: true })], word);
    expect(b.map((x) => x.label)).toEqual([
      'Aprobar',
      'Devolver a fixing…',
      'Devolver a needs info…',
    ]);
    const plain = trayButtons([APPROVE, move('verify', { by: 'human' }), WONT], word);
    expect(plain.map((x) => x.label)).toEqual(['Aprobar', 'Mover a verify', 'wont fix']);
  });
});

describe('the tray count line', () => {
  it('says how many are in each state, in the order they were ticked', () => {
    const its = [
      item({ id: 'A', state: 'verify' }),
      item({ id: 'B', state: 'reported' }),
      item({ id: 'C', state: 'verify' }),
    ];
    expect(trayStates(its, word)).toBe('2 en verify · 1 en reported');
  });
});
