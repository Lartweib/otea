import { beforeEach, describe, expect, it } from 'vitest';
import { item } from '../../derive/fixtures.ts';
import { setLanguage } from '../../i18n/i18n.ts';
import type { Move } from '../../types.ts';
import { stateSaid, trayButtons, trayGroups, trayNotice, trayStates } from './tray.ts';

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

  // P4-R2-11: «1 en Hacerlo · 2 en Hacerlo» did not say two of them wait for a review.
  it('names the review of a step apart from its doing', () => {
    const its = [
      item({ id: 'A', state: 'sdo' }),
      item({ id: 'B', state: 'sdo__review' }),
      item({ id: 'C', state: 'sdo__yours' }),
    ];
    const named = (s: string) => (s.startsWith('sdo') ? 'Hacerlo' : s);
    expect(trayStates(its, named)).toBe('1 en Hacerlo · 2 en revisión de Hacerlo');
    // «Seleccionar un solo paso» names it the same way.
    expect(stateSaid('sdo__yours', named)).toBe('Hacerlo · en revisión');
    expect(stateSaid('sdo', named)).toBe('Hacerlo');
  });
});

describe('the tray, by what each part is', () => {
  // The moves the selection shares are buttons; the closing ones gather behind one "Cerrar como"
  // button, so the row reads as the main move first and quiet ones after.
  it('keeps the closing moves apart from the others', () => {
    const g = trayGroups(trayButtons([WONT, BACK, APPROVE], word));
    expect(g.main.map((b) => [b.label, b.variant])).toEqual([
      ['Aprobar', 'primary'],
      ['Devolver…', 'quiet'],
    ]);
    expect(g.closing.map((b) => b.label)).toEqual(['wont fix']);
  });
});

describe('the tray notice', () => {
  // One plain sentence: what the selection can do together. The moves left out fold behind a
  // "por qué".
  const plan = (o: { moves?: Move[]; hidden?: string[]; loading?: boolean }) => ({
    moves: o.moves ?? [],
    hidden: o.hidden?.length ? [{ moves: o.hidden, why: '' }] : [],
    loading: o.loading ?? false,
  });

  it('says it is reading while the moves are on their way', () => {
    expect(trayNotice(plan({ loading: true }), 3)).toEqual({
      say: 'Leyendo las acciones…',
      why: false,
    });
  });

  it('says plainly when the selection shares no move, and folds the why', () => {
    expect(trayNotice(plan({ hidden: ['accepted'] }), 3)).toEqual({
      say: 'Estos 3 no comparten ninguna acción.',
      why: true,
    });
  });

  it('says only the shared moves show when some are left out', () => {
    expect(trayNotice(plan({ moves: [ACCEPT], hidden: ['fixing'] }), 2)).toEqual({
      say: 'Solo se ven las acciones que comparten los 2.',
      why: true,
    });
  });

  it('says a decision is approved by picking when that is all that is left out', () => {
    const decisions = {
      moves: [ACCEPT],
      hidden: [{ moves: ['design'], why: '', pick: true as const }],
      loading: false,
    };
    expect(trayNotice(decisions, 2)).toEqual({
      say: 'Una decisión se aprueba eligiendo su opción, en su página.',
      why: false,
    });
  });

  it('says nothing when every move shows', () => {
    expect(trayNotice(plan({ moves: [ACCEPT] }), 1)).toBeNull();
  });
});
