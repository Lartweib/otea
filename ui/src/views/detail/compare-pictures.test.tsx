// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { AppTestProvider } from '../../app/context.tsx';
import { setLanguage } from '../../i18n/i18n.ts';
import { testApp } from '../../shell/test-app.ts';
import { type Mounted, mount, press } from '../../test-dom.tsx';
import type { Evidence } from '../../types.ts';
import { ComparePictures } from './PhoneItem.tsx';
import type { PhoneRound } from './phone-review.ts';

// P5-R3-17: on the phone, «Comparar 1→2»'s pictures could not be tapped to enlarge. A tap opens the
// picture in the reader, the other one a step away.

const picture = (id: number, filename: string): Evidence => ({
  id,
  itemId: 'PIE-1',
  role: 'single',
  module: 'eshots',
  kind: 'image',
  filename,
  contentType: 'image/png',
  size: 40,
  sha256: '',
  caption: null,
  createdAt: '2026-01-01T00:00:00Z',
  actor: { kind: 'agent', name: 'quill' },
  channel: 'cli',
});

const round = (n: number, evidence: Evidence[]): PhoneRound => ({
  n,
  by: 'quill',
  at: '2026-01-01T00:00:00Z',
  evidence,
  tag: null,
});

let shown: Mounted | undefined;
afterEach(() => {
  shown?.unmount();
  shown = undefined;
  setLanguage('en');
});

describe('the pictures of Comparar on the phone', () => {
  it('opens a tapped picture in the reader, the other a step away', async () => {
    setLanguage('es');
    shown = mount(
      <AppTestProvider value={testApp({ phone: true })}>
        <ComparePictures
          older={round(1, [picture(1, 'hoja.png')])}
          newer={round(2, [picture(2, 'hoja.png')])}
        />
      </AppTestProvider>,
    );
    expect(document.querySelector('.p-read')).toBeNull();
    await press(shown.root.querySelector('button[aria-label="Ver hoja.png · Ronda 2"]'));
    const reader = document.querySelector('.p-read');
    expect(reader).not.toBeNull();
    expect(reader?.textContent).toContain('2 de 2');
  });
});
