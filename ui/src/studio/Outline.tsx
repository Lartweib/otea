import { useState } from 'react';
import type { Preset, PresetNote } from '../../../src/core/preset.ts';
import { t } from '../i18n/i18n.ts';
import { Icon } from '../kit/index.ts';
import type { LayoutSlot } from '../types.ts';
import { type RawPreset, workflowOf } from './draft.ts';
import { shownIn } from './layout-edit.ts';

// The index: the preset's outline (its types, fields, layout, states, moves, gates, views, playbook
// and words), folded, with counts and the tray's marks. It navigates: a click opens the preview on
// that part, selected. Gates, views and the playbook, which no view draws, open as pages.

export type OutlinePick =
  | { kind: 'field'; name: string }
  | { kind: 'states' }
  | { kind: 'moves' }
  | { kind: 'page'; page: 'gates' | 'views' | 'playbook' | 'layout' };

type OutlineProps = {
  raw: RawPreset;
  preset: Preset | undefined;
  type: string;
  notes: readonly PresetNote[];
  playbooks: number;
  onPick: (pick: OutlinePick) => void;
  onHide: () => void;
  // The field the inspector is on.
  current: string | undefined;
};

// Where the index says a field shows: the detail's slots first, as the preview draws them.
const DETAIL_FIRST: readonly LayoutSlot[] = ['header', 'body', 'side', 'row', 'intake', 'phone'];

export function Outline({
  raw,
  preset,
  type,
  notes,
  playbooks,
  onPick,
  onHide,
  current,
}: OutlineProps) {
  const [open, setOpen] = useState(true);
  const shape = preset?.types.find(({ name }) => name === type);
  const fields = Object.keys(shape?.fields ?? {});
  const workflow = workflowOf(raw, type);
  const marked = (section: string) => notes.some((note) => note.path.section === section);
  const placeOf = (field: string) => {
    if (raw.fields?.[field] === undefined) return type;
    const slots = shownIn(preset, type, field);
    return DETAIL_FIRST.find((slot) => slots.includes(slot)) ?? t('studio.outline.nowhere');
  };
  const languages = Object.keys((raw as { labels?: Record<string, unknown> }).labels ?? {});
  const row = (label: string, count: string, pick: OutlinePick, mark: boolean) => (
    <li>
      <button type="button" className="st-ix-row" onClick={() => onPick(pick)}>
        <span>
          {label}
          {mark ? <Icon name="warn" /> : null}
        </span>
        <span className="st-ix-n">{count}</span>
      </button>
    </li>
  );
  return (
    <nav className="st-samples st-ix" aria-label={t('studio.outline.title')}>
      <div className="st-samples-h">
        <span>{t('studio.outline.title')}</span>
        <button type="button" className="st-ix-hide" onClick={onHide}>
          <Icon name="chevron" />
          {t('studio.outline.hide')}
        </button>
      </div>
      <ul className="st-ix-list">
        <li className="st-ix-row st-ix-static">
          <span>{t('studio.bar.type')}</span>
          <span className="st-ix-n">{Object.keys(raw.types ?? {}).join(' · ') || type}</span>
        </li>
        <li>
          <button
            type="button"
            className="st-ix-row st-ix-group"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            <span>
              {t('studio.outline.fields')}
              {marked('fields') ? <Icon name="warn" /> : null}
            </span>
            <span className="st-ix-n">{fields.length}</span>
          </button>
          {open ? (
            <ul className="st-ix-sub">
              {fields.map((field) => (
                <li key={field}>
                  <button
                    type="button"
                    className="st-ix-row"
                    aria-current={field === current ? 'true' : undefined}
                    onClick={() => onPick({ kind: 'field', name: field })}
                  >
                    <span className="st-mono">{field}</span>
                    <span className="st-ix-n">{placeOf(field)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </li>
        {row(
          t('studio.outline.layout'),
          t('studio.outline.slots', { count: 7 }),
          { kind: 'page', page: 'layout' },
          marked('layout'),
        )}
        {row(
          t('studio.outline.states'),
          String(Object.keys(workflow.states ?? {}).length),
          { kind: 'states' },
          marked('states'),
        )}
        {row(
          t('studio.outline.moves'),
          String((workflow.transitions ?? []).length),
          { kind: 'moves' },
          marked('moves'),
        )}
        {row(
          t('studio.outline.gates'),
          String(Object.keys(workflow.gates ?? {}).length),
          { kind: 'page', page: 'gates' },
          marked('gates'),
        )}
        {row(
          t('studio.outline.views'),
          raw.view?.kind ?? 'list',
          { kind: 'page', page: 'views' },
          false,
        )}
        {row(
          t('studio.outline.playbook'),
          String(playbooks),
          { kind: 'page', page: 'playbook' },
          false,
        )}
        <li className="st-ix-row st-ix-static">
          <span>{t('studio.outline.labels')}</span>
          <span className="st-ix-n">{languages.join(' · ') || '—'}</span>
        </li>
      </ul>
      <p className="st-samples-n">{t('studio.outline.note')}</p>
    </nav>
  );
}
