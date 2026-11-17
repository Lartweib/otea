import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { creatures } from '../../../../src/core/board/testing.ts';
import { type Editor, EditorContext } from './context.ts';
import { AnalysisSection } from './OtherCards.tsx';

const html = (builtin: boolean) =>
  renderToStaticMarkup(
    <EditorContext.Provider
      value={{ draft: { def: creatures(), record: { builtin } } } as unknown as Editor}
    >
      <AnalysisSection />
    </EditorContext.Provider>,
  );

describe('Vistas de análisis in Sobre el tablero', () => {
  it('maps roles on a board of the person’s own', () => {
    expect(html(false)).toContain('se-roles');
  });

  it('is not offered on the built-in Pedidos board, whose items are board drafts', () => {
    expect(html(true)).toBe('');
  });
});
