// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setLanguage } from '../../i18n/i18n.ts';
import { buttonNamed, type Mounted, mount, press, typeInto } from '../../test-dom.tsx';
import { NotesForm } from './NotesForm.tsx';

// The notes form drawn from «Devolver…» or «Dejar una nota»: Send stays off until there are words
// to send, so an empty send-back never reaches the agent.

let page: Mounted | undefined;
afterEach(() => {
  page?.unmount();
  setLanguage('en');
});

const form = (onSend: (text: string) => void, optional?: string) => {
  setLanguage('es');
  page = mount(
    <NotesForm
      open
      agent="Mender"
      why={null}
      button={null}
      belowTop={null}
      onSend={onSend}
      onCancel={() => undefined}
      onGone={() => undefined}
      optional={optional}
    />,
  );
  const root = page.root;
  return {
    send: () => buttonNamed(root, 'Enviar'),
    box: () => root.querySelector('textarea'),
  };
};

describe('the notes form', () => {
  it('keeps Send off until there is text, and sends it trimmed', async () => {
    const onSend = vi.fn();
    const { send, box } = form(onSend);
    expect(send()?.disabled).toBe(true);

    await typeInto(box(), '   ');
    expect(send()?.disabled).toBe(true);

    await typeInto(box(), '  El último lobo se queda.  ');
    expect(send()?.disabled).toBe(false);
    await press(send());
    expect(onSend).toHaveBeenCalledWith('El último lobo se queda.');

    await typeInto(box(), '');
    expect(send()?.disabled).toBe(true);
  });

  it('lets a send-back go with no words when the review’s comments carry it (P4-7)', async () => {
    const onSend = vi.fn();
    const { send } = form(onSend, 'Tus comentarios van con la devolución');
    expect(send()?.disabled).toBe(false);

    await press(send());
    expect(onSend).toHaveBeenCalledWith('');
  });
});
