import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import type { ItemNote } from '../../../../src/core/board/notes.ts';
import { AppTestProvider } from '../../app/context.tsx';
import { ago, NOW } from '../../derive/fixtures.ts';
import { setLanguage } from '../../i18n/i18n.ts';
import { testApp } from '../../shell/test-app.ts';
import type { Evidence } from '../../types.ts';
import { HandChecklist } from './BoardSections.tsx';
import { AnchorPicker, NotesSection, RoundNotesLine, Thread } from './NotesThread.tsx';

afterEach(() => setLanguage('en'));

const gif: Evidence = {
  id: 7,
  itemId: 'TAR-7',
  role: 'single',
  module: 'recording',
  kind: 'image',
  filename: 'pausa.gif',
  contentType: 'image/gif',
  size: 10,
  sha256: '',
  caption: null,
  createdAt: ago(40),
  actor: { kind: 'agent', name: 'claude-d' },
  channel: 'cli',
};

const base = {
  by: 'fede',
  step: 'sdo',
  stepName: 'Hacerlo',
  round: 2,
  to: 'claude-d',
};
const notes: ItemNote[] = [
  {
    ...base,
    note: 1,
    text: 'Que el menú se abra con Start.',
    at: ago(30),
    delivered: { done: 1, of: 3 },
    answer: {
      text: 'Entendido.',
      at: ago(29),
      by: 'claude-d',
      profile: { harness: 'claude-code', model: 'claude-opus-5-5', effort: 'high' },
    },
  },
  {
    ...base,
    note: 2,
    text: 'En el gif el foco salta.',
    at: ago(20),
    delivered: { done: 2, of: 3 },
    anchor: { evidence: 7, filename: 'pausa.gif', part: 'rec', partName: 'Grabación' },
  },
];

describe('the thread of notes', () => {
  it('draws your note on the right, the answer on the left with mark and profile', () => {
    setLanguage('es');
    const html = renderToStaticMarkup(
      <Thread notes={notes} evidence={[gif]} now={NOW} agent="claude-d" />,
    );
    expect(html).toContain('class="nt-msg you"');
    expect(html).toContain('class="nt-msg ag"');
    expect(html).toContain('(opus · high)');
    expect(html).toMatch(/Hacerlo · ronda 2 · \d\d:\d\d · llevaba 1 de 3 entregables/);
  });

  it('marks an unanswered note and leaves the agent’s side dashed', () => {
    setLanguage('es');
    const html = renderToStaticMarkup(
      <Thread notes={notes} evidence={[gif]} now={NOW} agent="claude-d" />,
    );
    expect(html).toContain('class="nt-msg you open"');
    expect(html).toContain('sin respuesta');
    expect(html).toContain('class="nt-msg wait"');
    expect(html).toContain('claude-d todavía no contestó.');
  });

  it('cites the piece a note is on with its thumbnail and part', () => {
    setLanguage('es');
    const html = renderToStaticMarkup(
      <Thread notes={notes} evidence={[gif]} now={NOW} agent="claude-d" />,
    );
    expect(html).toContain('class="nt-cite"');
    expect(html).toContain('title="Ver pausa.gif en Evidencia"');
    expect(html).toContain('<img');
    expect(html).toContain('Grabación');
  });

  it('shows the moment a note on a recording was left at, and the way back to it', () => {
    setLanguage('es');
    const clip: Evidence = { ...gif, id: 9, kind: 'video', filename: 'pausa.webm' };
    const onClip: ItemNote = {
      ...base,
      note: 3,
      text: 'Acá se traba.',
      at: ago(10),
      delivered: { done: 2, of: 3 },
      anchor: { evidence: 9, filename: 'pausa.webm', seconds: 62.4 },
    };
    const html = renderToStaticMarkup(
      <Thread notes={[onClip]} evidence={[clip]} now={NOW} agent="claude-d" />,
    );
    expect(html).toContain('en <time class="nt-at" dateTime="PT62.4S">1:02.4</time>');
    expect(html).toContain('title="Ver pausa.webm en Evidencia, en 1:02.4"');
  });

  it('counts the notes in the section’s margin', () => {
    setLanguage('es');
    const html = renderToStaticMarkup(
      <NotesSection notes={notes} evidence={[gif]} now={NOW} agent="claude-d" />,
    );
    expect(html).toContain('2 notas');
    expect(html).toContain('1 sin respuesta');
    expect(html).toContain('id="nt-thread"');
  });
});

describe('a round’s notes in Rondas', () => {
  it('leads to the thread while the round is being done', () => {
    setLanguage('es');
    const html = renderToStaticMarkup(
      <RoundNotesLine notes={notes} live evidence={[gif]} now={NOW} />,
    );
    expect(html).toContain('2 notas en el hilo');
    expect(html).toContain('1 sin respuesta');
    expect(html).not.toContain('nt-thread');
  });

  it('keeps the thread folded in the card once handed off', () => {
    setLanguage('es');
    const answered = notes.map((n) => ({
      ...n,
      answer: n.answer ?? { text: 'Solo vuelve atrás.', at: ago(10), by: 'claude-d' },
    }));
    const html = renderToStaticMarkup(
      <RoundNotesLine notes={answered} live={false} evidence={[gif]} now={NOW} />,
    );
    expect(html).toContain('2 notas mientras la hacía');
    expect(html).toContain('todas contestadas');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('nt-thread');
  });

  it('says nothing for a round without notes', () => {
    expect(renderToStaticMarkup(<RoundNotesLine notes={[]} live evidence={[]} now={NOW} />)).toBe(
      '',
    );
  });
});

describe('«Sobre qué»', () => {
  it('offers «Ninguna» first, then the round’s pieces, one picked', () => {
    setLanguage('es');
    const html = renderToStaticMarkup(
      <AnchorPicker pieces={[gif]} picked={7} onPick={() => undefined} />,
    );
    expect(html.indexOf('Ninguna')).toBeLessThan(html.indexOf('pausa.gif'));
    expect([...html.matchAll(/aria-checked="true"/g)]).toHaveLength(1);
    expect(html).toMatch(/aria-checked="true" title="pausa.gif"/);
  });
});

describe('the handoff checklist while the agent works', () => {
  it('waits for the answers to your notes after its parts', () => {
    setLanguage('es');
    const html = renderToStaticMarkup(
      <AppTestProvider value={testApp()}>
        <HandChecklist
          item={{ id: 'TAR-7', title: 'Menú', fields: {} }}
          rows={[{ ref: 'shots', name: 'Capturas', ok: true, required: true }]}
          canWrite={false}
          notes={{ unanswered: 1 }}
        />
      </AppTestProvider>,
    );
    expect(html).toContain('Que conteste tus notas');
    expect(html).toContain('1 sin respuesta');
    expect(html).toContain('class="sep"');
    expect(html).not.toContain('Rellenar');
  });
});
