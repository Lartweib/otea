import { type ReactNode, useEffect, useRef } from 'react';
import type { PresetNote } from '../../../src/core/preset.ts';
import { t } from '../i18n/i18n.ts';
import { Icon, useEscape } from '../kit/index.ts';
import type { Fix, TrayRow } from './tray.ts';
import { Unroll } from './Unroll.tsx';

// The not on screen tray, opened from the header: what the preview cannot show, each with a fix of
// one click or a show me that opens the place. Save still works either way.

// A note in words: what it is, and why it matters.
function titleOf(note: PresetNote): string {
  const { field = '', state = '', gate = '', type = '' } = note.path;
  switch (note.code) {
    case 'field_unplaced':
      return t('studio.tray.unplaced', { field, type });
    case 'state_stuck_in_chat':
      return t('studio.tray.stuck', { state });
    case 'gate_unchecked':
      return t('studio.tray.gate', { gate });
    case 'field_single_type':
      return t('studio.tray.single', { field, type });
    default:
      return t('studio.tray.deprecated');
  }
}

function whyOf(note: PresetNote): string {
  const { gate = '', type = '' } = note.path;
  switch (note.code) {
    case 'field_unplaced':
      return t('studio.tray.unplacedWhy', { type });
    case 'state_stuck_in_chat':
      return t('studio.tray.stuckWhy');
    case 'gate_unchecked':
      return t('studio.tray.gateWhy', { gate });
    case 'field_single_type':
      return t('studio.tray.singleWhy');
    default:
      return note.message;
  }
}

function fixLabel(fix: Fix, note: PresetNote): string {
  switch (fix.kind) {
    case 'place':
      return t('studio.tray.place', { slot: fix.slot });
    case 'show':
      return t('studio.tray.show');
    case 'intended':
      return t('studio.tray.intended');
    case 'playbook':
      return t('studio.tray.addToPlaybook');
    case 'remove-gate':
      return t('studio.tray.removeGate');
    case 'share':
      return t('studio.tray.share', { type: note.path.type ?? '' });
  }
}

type TrayProps = {
  rows: readonly TrayRow[];
  // Undefined while the preset cannot be edited here: only show me.
  onFix: ((row: TrayRow, fix: Fix) => void) | undefined;
  onShow: (note: PresetNote) => void;
};

export function Tray({ rows, onFix, onShow }: TrayProps) {
  return (
    <div className="st-tray2">
      <div className="st-tray2-h" data-i="">
        <span>{t('studio.tray.title', { count: rows.length })}</span>
        <span>{t('studio.tray.still')}</span>
      </div>
      {rows.length === 0 ? <p className="st-ask-n">{t('studio.tray.none')}</p> : null}
      <ul>
        {rows.map((row) => (
          <li key={`${row.note.code}-${row.note.message}`} data-level={row.note.level} data-i="">
            <span className="st-tray2-i" aria-hidden="true">
              {row.note.level === 'warning' ? <Icon name="warn" /> : <i />}
            </span>
            <div>
              <b>{titleOf(row.note)}</b>
              <p>{whyOf(row.note)}</p>
              <span className="st-tray2-a">
                {row.fixes.map((fix) => {
                  const show = fix.kind === 'show';
                  if (!show && !onFix) return null;
                  return (
                    <button
                      key={fix.kind}
                      type="button"
                      className={show || fix.kind === 'intended' ? 'btn sm quiet' : 'btn sm'}
                      onClick={() => (show ? onShow(row.note) : onFix?.(row, fix))}
                    >
                      {show ? <Icon name="eye" /> : null}
                      {fixLabel(fix, row.note)}
                    </button>
                  );
                })}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

type TrayAtProps = {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  // The button's words: how many notes are not on screen.
  label: string;
  children: ReactNode;
};

// The not on screen button and its tray, which unrolls under it and closes on Escape or a press
// outside, the same gesture mirrored.
export function TrayAt({ open, onToggle, onClose, label, children }: TrayAtProps) {
  const button = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLSpanElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEscape(open, 'pop', () => {
    close.current();
    button.current?.focus({ preventScroll: true });
  });
  useEffect(() => {
    if (!open) return;
    const down = (event: PointerEvent) => {
      if (!(event.target instanceof Node && box.current?.contains(event.target))) close.current();
    };
    document.addEventListener('pointerdown', down, true);
    return () => document.removeEventListener('pointerdown', down, true);
  }, [open]);
  return (
    <span className="st-offscreen-at" ref={box}>
      <button
        ref={button}
        type="button"
        className="st-offscreen"
        aria-expanded={open}
        onClick={onToggle}
      >
        <Icon name="warn" />
        {label}
        <Icon name="chevron" />
      </button>
      <Unroll open={open} label={label} from={button.current} className="st-trayu">
        {children}
      </Unroll>
    </span>
  );
}
