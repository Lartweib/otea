import { describe, expect, it } from 'vitest';
import { boardsKey } from './data.ts';

// P5-R3-9: a board published elsewhere (another window, the phone, an agent's change) left this
// desk on the boards it first read, and an item's new field showed by its hidden key («DSI4K2MQ:
// yes»), its Documentos with no section. The boards are read again on every change of the project.
describe('when the desk reads the boards again', () => {
  it('reads them on every change of the project, not only on this window’s Studio writes', () => {
    expect(boardsKey(0, 1)).not.toBe(boardsKey(0, 2));
    expect(boardsKey(1, 1)).not.toBe(boardsKey(0, 1));
  });

  it('keeps them while nothing changed', () => {
    expect(boardsKey(2, 5)).toBe(boardsKey(2, 5));
  });
});
