import { isEvidence, LEVELS, type Part, partOf, TITLE } from '../../../../src/core/board/model.ts';
import { t } from '../../i18n/i18n.ts';
import { NodeGlyph } from '../../lanes/NodeGlyph.tsx';
import { Route } from '../../views/detail/Route.tsx';
import type { ReadyDraft } from '../use-board-draft.ts';
import { definitionRoute } from './route.ts';
import { boardPrefix, sampleTitle } from './samples.ts';

// Lo que ves for the stops that are not steps: the creation form (Crear · Item) and Hecho.

function FormInput({ part }: { part: Part }) {
  if (part.kind === 'long')
    return <textarea rows={2} placeholder={part.hint} tabIndex={-1} readOnly />;
  if (part.kind === 'choice' || part.kind === 'multi' || part.kind === 'level') {
    const names =
      part.kind === 'level'
        ? LEVELS.map((level) => t(`bs.level.${level}` as 'bs.level.low'))
        : part.options.map(({ name }) => name);
    return (
      <div className="bsp-chips">
        {names.map((name) => (
          <span key={name} className="chipb">
            {name}
          </span>
        ))}
      </div>
    );
  }
  if (part.kind === 'check')
    return (
      <div className="bsp-val">
        <div className="bsp-ckl">
          {part.options.map((option) => (
            <span key={option.id}>
              <i />
              {option.name}
            </span>
          ))}
        </div>
      </div>
    );
  if (isEvidence(part)) return <span className="bsp-file">{t('bs.preview.form.drop')}</span>;
  return <input className="bsp-tx" placeholder={part.hint} tabIndex={-1} readOnly />;
}

export function FormPreview({ draft }: { draft: ReadyDraft }) {
  const { def } = draft;
  const first = def.steps[0];
  const rows = [{ ref: TITLE, required: true }, ...def.form];
  return (
    <article className="bsp-ip">
      <p className="kicker">{t('bs.preview.form.kicker')}</p>
      <h3 className="headline bsp-headline">{t('bs.preview.form.title', { item: def.item })}</h3>
      <div className="bsp-nform">
        {rows.map(({ ref, required }) => {
          const part = partOf(def, ref);
          if (!part) return null;
          return (
            <button
              type="button"
              key={ref}
              className="bsp-ffield"
              title={t('bs.preview.why')}
              onClick={() => draft.reveal({ kind: 'form' })}
            >
              <span className="flab">
                {required ? part.name : t('bs.preview.form.optional', { name: part.name })}
              </span>
              <span className="fin">
                <FormInput part={part} />
              </span>
            </button>
          );
        })}
      </div>
      <div className="actions bsp-actions">
        <button
          type="button"
          className="btn primary"
          onClick={() => draft.reveal(first ? { kind: 'step', id: first.id } : { kind: 'form' })}
        >
          {t('bs.preview.form.create')}
        </button>
        <span className="bsp-tag">
          {t('bs.preview.form.entersAt', { step: first?.name ?? '—' })}
        </span>
      </div>
    </article>
  );
}

export function DonePreview({ draft }: { draft: ReadyDraft }) {
  const { def } = draft;
  const reviewed = def.steps.find((step) => step.reviewer === 'you');
  const route = definitionRoute(def, 'done', reviewed ? [{ from: reviewed.id }] : [], {
    done: t('bs.done'),
    dip: (n) => t('bs.preview.dip', { n }),
  });
  return (
    <article className="bsp-ip">
      <div className="crumb bsp-crumb">
        <NodeGlyph look="done" size={14} />
        <span className="id">{boardPrefix(def)}-9</span>
        <span aria-hidden="true">·</span>
        <span>{def.item}</span>
        <span className="turn other">{t('bs.done')}</span>
      </div>
      <h3 className="headline bsp-headline">{sampleTitle(def, 1)}</h3>
      <p className="standfirst bsp-stand">{t('bs.preview.done.stand')}</p>
      {def.steps.length > 0 ? (
        <div className="bsp-route">
          <Route
            id="preview:done"
            steps={route.steps}
            words={route.words}
            ci={route.ci}
            lane={route.lane}
            look="done"
            dips={route.dips}
            phone
          />
        </div>
      ) : null}
      <div className="actions bsp-actions">
        <button type="button" className="btn quiet" onClick={() => draft.reveal({ kind: 'done' })}>
          {t('bs.preview.done.reopen')}
        </button>
      </div>
    </article>
  );
}
