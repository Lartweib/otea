import { useEffect, useRef, useState } from 'react';
import { t } from '../../i18n/i18n.ts';
import { MenuLabel, MenuNote } from '../../kit/pop/Menu.tsx';
import { Swap } from '../../kit/Swap.tsx';
import { studioHash } from '../../selection.ts';
import { problemText } from '../words.ts';
import { useEditor } from './context.ts';
import { Glyph } from './glyphs.tsx';
import { EdPop, useAnchor } from './menus.tsx';
import { PairTabs } from './Pair.tsx';

// The editor's bar (mock renderBar): where you are, whether agents see this yet, whether it saved,
// Deshacer and Rehacer, the problems, and Descartar, Probar and Publicar.

// Whether the draft differs from the live version, and the version agents work with.
export function liveState(draft: ReturnType<typeof useEditor>['draft']) {
  const live = draft.record.live;
  const dirty = !live || JSON.stringify(live.definition) !== JSON.stringify(draft.def);
  return { live, dirty };
}

function Chip() {
  const { draft } = useEditor();
  const { live, dirty } = liveState(draft);
  const text = !live
    ? t('bs.editor.chip.draft')
    : dirty
      ? t('bs.editor.chip.changed', { v: live.version })
      : t('bs.editor.chip.live', { v: live.version });
  return (
    <span className={live && !dirty ? 'se-dchip live' : 'se-dchip'}>
      <i />
      <Swap k={text}>{text}</Swap>
    </span>
  );
}

function SaveState() {
  const { draft } = useEditor();
  const save = draft.save;
  if (save.kind === 'failed' && save.code === 'board_conflict')
    return (
      <span className="se-save failed" role="alert">
        <Glyph name="warn" />
        <span>{t('bs.editor.save.conflict')}</span>
        <button type="button" className="btn text sm" onClick={draft.reload}>
          {t('bs.editor.reload')}
        </button>
      </span>
    );
  if (save.kind === 'failed')
    return (
      <span className="se-save failed" role="alert">
        <Glyph name="warn" />
        <span>{t('bs.editor.save.failed', { reason: save.message })}</span>
        <button type="button" className="btn text sm" onClick={draft.retrySave}>
          {t('bs.editor.retry')}
        </button>
      </span>
    );
  return (
    <span className="se-save" aria-live="polite">
      {save.kind === 'saving' ? t('bs.editor.save.saving') : ''}
    </span>
  );
}

function Problems() {
  const { draft } = useEditor();
  const pop = useAnchor();
  const errors = draft.problems.filter((p) => p.level === 'error');
  const warnings = draft.problems.filter((p) => p.level === 'warning');
  if (!draft.problems.length) return null;
  const words = [
    errors.length ? t('bs.editor.problems', { count: errors.length }) : '',
    warnings.length ? t('bs.editor.warnings', { count: warnings.length }) : '',
  ].filter(Boolean);
  return (
    <>
      <button
        type="button"
        className={errors.length ? 'se-probs err' : 'se-probs'}
        aria-haspopup="menu"
        aria-expanded={pop.open}
        onClick={(e) => pop.toggle(e.currentTarget)}
      >
        <Glyph name="warn" />
        {words.join(' · ')}
      </button>
      <EdPop
        open={pop.open}
        anchor={pop.anchor}
        alignRight
        onClose={pop.close}
        label={t('bs.editor.problems.label')}
        className="se-problist"
      >
        <MenuLabel>{t('bs.editor.problems.label')}</MenuLabel>
        {[...errors, ...warnings].map((p) => (
          <div
            key={p.code + JSON.stringify(p.params) + JSON.stringify(p.at)}
            className="se-prob"
            data-i=""
          >
            <i className={p.level === 'error' ? 'err' : undefined} />
            <span>{problemText(p)}</span>
            <button
              type="button"
              className="btn quiet sm"
              onClick={() => {
                pop.close();
                draft.reveal(p.at);
              }}
            >
              {t('bs.editor.problems.go')}
            </button>
          </div>
        ))}
        <MenuNote>{t('bs.editor.problems.note')}</MenuNote>
      </EdPop>
    </>
  );
}

export function Bar() {
  const { draft, dialogs, pair, twin } = useEditor();
  const { live, dirty } = liveState(draft);
  const bar = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    let scroller: HTMLElement | null = bar.current?.parentElement ?? null;
    while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY))
      scroller = scroller.parentElement;
    if (!scroller) return;
    const el = scroller;
    const on = () => setScrolled(el.scrollTop > 8);
    on();
    el.addEventListener('scroll', on, { passive: true });
    return () => el.removeEventListener('scroll', on);
  }, []);
  return (
    <div
      className={scrolled ? 'se-bar scrolled' : 'se-bar'}
      ref={bar}
      role="toolbar"
      aria-label={t('bs.editor.bar.label')}
    >
      <span className="se-crumb">
        <a href={studioHash({ kind: 'boards' })}>{t('bs.editor.kicker.studio')}</a>
        <span>/</span>
        {pair ? null : <span className="se-crumb-n">{draft.def.name}</span>}
      </span>
      {pair ? <PairTabs /> : <Chip />}
      {twin ? (
        <a
          className="btn quiet sm se-twin"
          href={studioHash({ kind: 'board', board: twin.id })}
          title={t('bs.editor.twin.title')}
        >
          <Glyph name="board" />
          {t('bs.editor.twin.open', { board: twin.definition.name })}
        </a>
      ) : null}
      <SaveState />
      <span className="se-sp" />
      <Problems />
      <span className="se-tools">
        <button
          type="button"
          className="ghost-btn"
          disabled={!draft.canUndo}
          aria-label={t('bs.editor.undo')}
          title={t('bs.editor.undo')}
          onClick={draft.undo}
        >
          <Glyph name="undo" />
        </button>
        <button
          type="button"
          className="ghost-btn"
          disabled={!draft.canRedo}
          aria-label={t('bs.editor.redo')}
          title={t('bs.editor.redo')}
          onClick={draft.redo}
        >
          <Glyph name="redo" />
        </button>
        <span className="se-vr" />
        {!live || dirty ? (
          <button type="button" className="btn text sm" onClick={dialogs.discard}>
            {t('bs.editor.discard')}
          </button>
        ) : null}
        <button type="button" className="btn quiet sm" onClick={dialogs.practice}>
          <Glyph name="play" />
          {t('bs.editor.practice')}
        </button>
        <button
          type="button"
          className="btn primary sm"
          disabled={!dirty}
          title={dirty ? undefined : t('bs.editor.publish_none')}
          onClick={dialogs.publish}
        >
          {t('bs.editor.publish')}
        </button>
      </span>
    </div>
  );
}
