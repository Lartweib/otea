import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../i18n/i18n.ts';
import type { QueuedCapture } from './capture-queue.ts';
import { InstallLine } from './InstallHint.tsx';
import { downWords, OfflineBar, syncedTime } from './OfflineBar.tsx';
import { QueuedCaptures } from './QueuedCaptures.tsx';

afterEach(() => setLanguage('en'));

const at = (h: number, m: number, day = 13) => new Date(2026, 10, day, h, m).getTime();

describe('the offline line', () => {
  it('says the PC does not answer, since when, and that it is read-only', () => {
    setLanguage('es');
    const html = renderToStaticMarkup(
      createElement(OfflineBar, {
        sync: { offline: true, syncedAt: at(14, 32) },
        now: at(15, 0),
        host: 'desk.tail1.ts.net',
      }),
    );

    expect(html).toContain('role="status"');
    expect(html).toContain('Tu PC no responde');
    expect(html).toContain('última sincronización 14:32');
    expect(html).toContain('solo lectura');
  });

  it('is gone while the PC answers', () => {
    const html = renderToStaticMarkup(
      createElement(OfflineBar, { sync: { offline: false, syncedAt: 1 }, now: 2, host: 'x' }),
    );
    expect(html).toBe('');
  });

  it('gives the hour alone for today, with the day otherwise', () => {
    expect(syncedTime(at(9, 5), at(23, 0), 'es')).toBe('09:05');
    expect(syncedTime(at(9, 5, 12), at(10, 0), 'en')).toMatch(/Nov 12.*09:05|12 Nov.*09:05/);
  });

  it('on this computer it is Otea that does not answer', () => {
    setLanguage('es');
    expect(downWords('localhost')).toBe('Otea no responde');
    expect(downWords('desk.tail1.ts.net')).toBe('Tu PC no responde');
    expect(downWords('localhost', true)).toBe('Tu PC no responde');
  });
});

const queued = (o: Partial<QueuedCapture> = {}): QueuedCapture => ({
  id: 'cap-1',
  at: 1,
  board: 'Pedidos',
  type: 'request',
  fields: { title: 'Revisar la niebla' },
  ...o,
});

describe('the queue in Te toca', () => {
  it('lists each capture with its board, "en cola"', () => {
    setLanguage('es');
    const html = renderToStaticMarkup(
      createElement(QueuedCaptures, { captures: [queued()], onDiscard: () => {} }),
    );

    expect(html).toContain('En cola');
    expect(html).toContain('Revisar la niebla');
    expect(html).toMatch(/Pedidos ·.*en cola/s);
    expect(html).not.toContain('Descartar');
  });

  it('keeps one the PC refused, with its words and Descartar', () => {
    setLanguage('es');
    const html = renderToStaticMarkup(
      createElement(QueuedCaptures, {
        captures: [queued({ refused: 'Board "Pedidos" not found' })],
        onDiscard: () => {},
      }),
    );

    expect(html).toContain('no se envió: Board &quot;Pedidos&quot; not found');
    expect(html).toContain('Descartar');
  });

  it('shows nothing with nothing queued', () => {
    expect(
      renderToStaticMarkup(createElement(QueuedCaptures, { captures: [], onDiscard: () => {} })),
    ).toBe('');
  });
});

describe('the install line in Preferencias', () => {
  const line = (platform: 'ios' | 'android' | 'other', prompt = false) =>
    renderToStaticMarkup(createElement(InstallLine, { platform, prompt, onPrompt: () => {} }));

  it('on iOS, says it is in Safari’s Share menu', () => {
    setLanguage('es');
    const html = line('ios');

    expect(html).toContain('Añadir a la pantalla de inicio');
    expect(html).toContain('En Safari: Compartir › Añadir a la pantalla de inicio.');
    expect(html).toContain('se abre aunque tu PC esté apagado y se actualiza sola');
  });

  it('on Android, a button when the browser offers its prompt, the menu otherwise', () => {
    expect(line('android', true)).toMatch(/<button[^>]*>.*Add to Home Screen/s);
    expect(line('android')).toContain('In the browser menu (⋮) › Add to Home screen.');
  });
});
