import type { ReactNode } from 'react';
import { guardedBranch, stepById } from '../../../../src/core/board/model.ts';
import { listOf, t, tx } from '../../i18n/i18n.ts';
import { problemText, targetName } from '../words.ts';
import { useEditor } from './context.ts';
import { Glyph } from './glyphs.tsx';
import type { SetupRow, SetupWhat } from './setup.ts';
import { whoWord } from './who.ts';

// «Qué falta configurar» (mock 78-pair.js setupHtml, setupStrips): the checklist beside the
// summary, grouped by board, errors first; and, on the card, «Por configurar» next to the setting
// with its «Así está bien».

// What a row asks, and what it is now.
function rowWords(
  row: SetupRow,
  def: ReturnType<typeof useEditor>['draft']['def'],
): { title: ReactNode; value: string } {
  if (row.what === 'doer') {
    const step = stepById(def, row.ref);
    return {
      title: tx('bs.editor.setup.doer', { step: <b>{step?.name ?? '…'}</b> }),
      value: step ? whoWord(step.doer) : '…',
    };
  }
  if (row.what === 'push') {
    const branch = guardedBranch(def);
    const steps = branch?.guard.push ?? [];
    return {
      title: tx('bs.editor.setup.push', { branch: <b>{branch?.name ?? '…'}</b> }),
      value: steps.length
        ? t('bs.editor.setup.push_in', { steps: listOf(steps.map((id) => targetName(def, id))) })
        : t('bs.editor.setup.push_none'),
    };
  }
  return {
    title: t('bs.editor.setup.repo'),
    value: t('bs.editor.setup.repo_field', { field: def.parts[row.ref]?.name ?? '…' }),
  };
}

export function SetupPanel() {
  const { pair } = useEditor();
  const setup = pair?.setup;
  if (!pair || !setup || setup.hidden) return null;
  const { rows, errors } = setup;
  const ok = rows.filter((r) => r.done).length;
  if (ok === rows.length && !errors.length)
    return (
      <div className="se-setup done" id="se-setup">
        <p className="se-sud">
          <Glyph name="check" />
          <span>{tx('bs.editor.setup.done', { practice: <b>{t('bs.editor.practice')}</b> })}</span>
        </p>
        <button type="button" className="btn text sm" onClick={setup.hide}>
          {t('bs.editor.setup.hide')}
        </button>
      </div>
    );
  return (
    <div className="se-setup" id="se-setup">
      <div className="se-suh">
        <span className="margin-label">{t('bs.editor.setup.title')}</span>
        <span className="se-sun">{t('bs.editor.setup.count', { ok, n: rows.length })}</span>
      </div>
      <ul className="se-sul">
        {errors.map((e, i) => (
          <li
            key={`e${e.role}${e.problem.code}${JSON.stringify(e.problem.params)}`}
            className="err"
          >
            <span className="se-sbx" aria-hidden="true" />
            <button
              type="button"
              className="se-sug"
              title={t('bs.editor.setup.go')}
              onClick={() => setup.goError(i)}
            >
              <span className="se-st">
                {pair.drafts[e.role].def.name}: {problemText(e.problem)}
              </span>
            </button>
          </li>
        ))}
        {(['parent', 'child'] as const).map((role) => {
          const mine = rows.filter((r) => r.role === role);
          if (!mine.length) return null;
          const def = pair.drafts[role].def;
          return [
            <li key={`h${role}`} className="se-sgh">
              <span className="margin-label">{def.name}</span>
            </li>,
            ...mine.map((r) => {
              const w = rowWords(r, def);
              return (
                <li key={r.k} className={r.done ? 'ok' : undefined}>
                  {/* biome-ignore lint/a11y/useSemanticElements: a tick drawn as the mock draws it */}
                  <button
                    type="button"
                    className="se-sbx"
                    role="checkbox"
                    aria-checked={r.done}
                    aria-label={r.done ? t('bs.editor.setup.ticked') : t('bs.editor.setup.tick')}
                    onClick={() => setup.ok(r.k)}
                  >
                    {r.done ? <Glyph name="check" /> : null}
                  </button>
                  <button
                    type="button"
                    className="se-sug"
                    title={t('bs.editor.setup.go')}
                    onClick={() => setup.go(r.k)}
                  >
                    <span className="se-st">{w.title}</span>
                    <span className="se-sv">{w.value}</span>
                  </button>
                </li>
              );
            }),
          ];
        })}
      </ul>
    </div>
  );
}

// «Por configurar: Quién hace Implementar: ahora, cualquier agente. Así está bien», next to the
// setting it is about, on the board on screen.
export function SetupStrip({ what, ref_ }: { what: SetupWhat; ref_: string }) {
  const { pair, draft } = useEditor();
  const setup = pair?.setup;
  if (!pair || !setup || setup.hidden) return null;
  const row = setup.rows.find(
    (r) => r.role === pair.role && r.what === what && r.ref === ref_ && !r.done,
  );
  if (!row) return null;
  const w = rowWords(row, draft.def);
  return (
    <p className="se-sustrip">
      <span className="margin-label">{t('bs.editor.setup.strip')}</span>
      <span className="se-st">{tx('bs.editor.setup.now', { what: w.title, value: w.value })}</span>
      <button type="button" className="btn text sm" onClick={() => setup.ok(row.k)}>
        {t('bs.editor.setup.fine')}
      </button>
    </p>
  );
}
