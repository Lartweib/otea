import { useLayoutEffect, useRef } from 'react';
import { mentionSegments } from '../../../../src/core/board/mentions.ts';
import { isEvidenceKind, type PartKind } from '../../../../src/core/board/model.ts';
import { t } from '../../i18n/i18n.ts';
import { MenuItem, MenuLabel, MenuNote } from '../../kit/pop/Menu.tsx';
import { useEditor } from './context.ts';
import { editableText, type InstructionAt, mentionChoices, setInstruction } from './edits.ts';
import { EdPop, useAnchor } from './menus.tsx';

// An instruction with @mentions (mock instrField, mentionMenu): a textarea over a copy of its text
// in which each mention is marked, so mentions show highlighted as you type. What is stored is the
// token (`@[id]`), so a mention follows a rename; «@ mencionar» inserts one where the caret is.

type Props = {
  at: InstructionAt;
  stored: string;
  label: string;
  small: string;
  placeholder: string;
  rows?: number;
};

const burstOf = (at: InstructionAt) =>
  'board' in at ? `board:${at.board}` : `${at.step}:${at.key}`;

function kindWord(kind: string): string {
  if (kind === 'step') return t('bs.editor.instr.mention_step');
  return isEvidenceKind(kind as PartKind)
    ? t('bs.editor.instr.mention_evidence')
    : t('bs.editor.instr.mention_field');
}

export function MentionArea({ at, stored, label, small, placeholder, rows = 2 }: Props) {
  const { draft } = useEditor();
  const def = draft.def;
  const area = useRef<HTMLTextAreaElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const caret = useRef<[number, number] | null>(null);
  const menu = useAnchor();
  const text = editableText(def, stored);
  const segments = mentionSegments(def, stored);

  // The box grows with its text, so the marks behind it never need to scroll.
  // biome-ignore lint/correctness/useExhaustiveDependencies: on every change of the text
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  const change = (value: string) => draft.mutate((d) => setInstruction(d, at, value), burstOf(at));

  const insert = (name: string) => {
    const el = area.current;
    const [s, e] = caret.current ?? [text.length, text.length];
    const before = text.slice(0, s);
    const piece = `${before && !/\s$/.test(before) ? ' ' : ''}@${name} `;
    const next = before + piece + text.slice(e);
    draft.endBurst();
    draft.mutate((d) => setInstruction(d, at, next));
    window.requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.selectionStart = el.selectionEnd = s + piece.length;
    });
  };

  return (
    <div className="se-instr-f">
      <div className="se-il">
        <span className="se-il-t">{label}</span>
        <small>{small}</small>
        <button
          ref={button}
          type="button"
          className="se-mention"
          aria-haspopup="menu"
          aria-expanded={menu.open}
          onMouseDown={() => {
            const el = area.current;
            if (el && document.activeElement === el)
              caret.current = [el.selectionStart, el.selectionEnd];
          }}
          onClick={(e) => {
            if (!caret.current) caret.current = [text.length, text.length];
            menu.toggle(e.currentTarget);
          }}
        >
          {t('bs.editor.instr.mention')}
        </button>
      </div>
      <div className="se-marea">
        <div className="se-mback" aria-hidden="true">
          {segments.map((s, i) =>
            'text' in s ? (
              // biome-ignore lint/suspicious/noArrayIndexKey: segments follow the text in order
              <span key={i}>{s.text}</span>
            ) : (
              // biome-ignore lint/suspicious/noArrayIndexKey: segments follow the text in order
              <mark key={i} className={s.name === null ? 'gone' : undefined}>
                @{s.name ?? '…'}
              </mark>
            ),
          )}
          {'​'}
        </div>
        <textarea
          ref={area}
          className="se-ta"
          rows={rows}
          value={text}
          placeholder={placeholder}
          aria-label={label}
          spellCheck
          onChange={(e) => {
            const el = e.target;
            const value = el.value;
            const at = el.selectionStart;
            change(value);
            // Typing @ (at the start or after a space) opens the list; the @ is what the pick
            // replaces, so it never stays doubled.
            const typed =
              value.length === text.length + 1 &&
              value[at - 1] === '@' &&
              (at === 1 || /\s/.test(value[at - 2] ?? ''));
            if (typed && !menu.open && button.current) {
              caret.current = [at - 1, at];
              menu.toggle(button.current);
            }
          }}
          onBlur={(e) => {
            caret.current = [e.target.selectionStart, e.target.selectionEnd];
            draft.endBurst();
          }}
          onSelect={(e) => {
            caret.current = [e.currentTarget.selectionStart, e.currentTarget.selectionEnd];
          }}
        />
      </div>
      <EdPop
        open={menu.open}
        anchor={menu.anchor}
        alignRight
        estimate={320}
        onClose={menu.close}
        label={t('bs.editor.instr.mention_label')}
      >
        <MenuLabel>{t('bs.editor.instr.mention_label')}</MenuLabel>
        {mentionChoices(def).map((m) => (
          <MenuItem key={m.ref} small={kindWord(m.kind)} onPick={() => insert(m.name)}>
            @{m.name}
          </MenuItem>
        ))}
        <MenuNote>{t('bs.editor.instr.mention_note')}</MenuNote>
      </EdPop>
    </div>
  );
}
