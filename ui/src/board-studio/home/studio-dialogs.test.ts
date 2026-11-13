import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import {
  closeStudioDialog,
  openAgentDraft,
  openNewBoard,
  type StudioDialog,
  useStudioDialog,
} from './studio-dialogs.ts';

afterEach(() => closeStudioDialog());

// The dialog open now, as a component reads it.
let seen: StudioDialog = null;
function Probe() {
  seen = useStudioDialog();
  return null;
}
function shown(): StudioDialog {
  renderToStaticMarkup(createElement(Probe));
  return seen;
}

describe("Studio's creation dialogs", () => {
  it('goes from Nuevo tablero to Que lo esboce un agente keeping the name typed', () => {
    openNewBoard();
    expect(shown()).toMatchObject({ kind: 'new' });

    openAgentDraft('Lanzamientos');

    expect(shown()).toMatchObject({ kind: 'agent', name: 'Lanzamientos' });
  });

  it('opens Que lo esboce un agente empty from Studio', () => {
    openAgentDraft();

    expect(shown()).toMatchObject({ kind: 'agent', name: '' });
  });
});
