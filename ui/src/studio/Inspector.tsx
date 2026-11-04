import { type ReactNode, useState } from 'react';
import { FIELD_MODULES, type Preset, SEVERITY_SCALE } from '../../../src/core/preset.ts';
import { type PlainKey, t, tx } from '../i18n/i18n.ts';
import { Icon } from '../kit/index.ts';
import type { LayoutSlot } from '../types.ts';
import type { Part } from './canvas.ts';
import { type RawField, type RawPreset, setIn, workflowOf } from './draft.ts';
import {
  fieldPath,
  layoutPath,
  moveInSlot,
  removeField,
  removeFromSlot,
  renameField,
  setShownIn,
  sharedBy,
  shownIn,
  slotChoices,
} from './layout-edit.ts';
import { NameForm, Seg } from './parts.tsx';

// The inspector beside the preview: the part that was clicked, asked about in plain words, each
// question with the YAML key it writes in small mono beside it. Only valid choices are offered; what
// the core would refuse is struck, with why.

export type InspectorProps = {
  raw: RawPreset;
  yaml: string;
  // The draft as the core last read it without problems.
  preset: Preset | undefined;
  type: string;
  part: Part;
  // Undefined while the preset cannot be edited here.
  change: ((next: string) => void) | undefined;
  // How many saved items fill a field in, by field.
  used: (field: string) => number;
  onSelect: (part: Part | undefined) => void;
};

// One question of the inspector: its words, the key it writes and a note under its control.
export function Ask({
  question,
  yamlKey,
  note,
  children,
}: {
  question: string;
  yamlKey: string;
  note?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="st-ask">
      <div className="st-ask-h">
        <h3>{question}</h3>
        <code>{yamlKey}</code>
      </div>
      {children}
      {note ? <p className="st-ask-n">{note}</p> : null}
    </section>
  );
}

const MODULE_NOTE: Record<string, PlainKey> = {
  text: 'studio.inspect.module.text',
  markdown: 'studio.inspect.module.markdown',
  enum: 'studio.inspect.module.enum',
  severity: 'studio.inspect.module.severity',
};

const SLOT_NOTE: Record<LayoutSlot, PlainKey> = {
  header: 'studio.slot.header',
  evidence: 'studio.slot.evidence',
  body: 'studio.slot.body',
  side: 'studio.slot.side',
  row: 'studio.slot.row',
  phone: 'studio.slot.phone',
  intake: 'studio.slot.intake',
};

const both = (names: readonly string[]) =>
  names.length <= 2
    ? names.join(t('studio.inspect.and'))
    : `${names.slice(0, -1).join(', ')}${t('studio.inspect.and')}${names.at(-1)}`;

type Words = { language: string; fields: Record<string, string> } | undefined;

function wordsOf(raw: RawPreset): Words {
  const labels = (raw as { labels?: Record<string, { fields?: Record<string, string> }> }).labels;
  const es = labels?.es;
  return es ? { language: 'es', fields: es.fields ?? {} } : undefined;
}

export function Inspector(props: InspectorProps) {
  return (
    <aside className="st-insp" aria-label={t('studio.inspect.title')}>
      {props.part.field !== undefined ? (
        <FieldInspector {...props} field={props.part.field} />
      ) : (
        <SlotInspector {...props} />
      )}
    </aside>
  );
}

function FieldInspector({
  raw,
  yaml,
  preset,
  type,
  part,
  change,
  used,
  onSelect,
  field,
}: InspectorProps & { field: string }) {
  const [renaming, setRenaming] = useState(false);
  const path = fieldPath(raw, type, field);
  const key = path.join('.');
  const spec: RawField =
    (path.length === 2 ? raw.fields?.[field] : raw.types?.[type]?.fields?.[field]) ?? {};
  const title = field === 'title';
  const set = change && !title ? (next: RawField) => change(setIn(yaml, path, next)) : undefined;
  const types = sharedBy(raw, field);
  const typeLabel = (raw.types?.[type]?.label ?? type).toLowerCase();
  const incomplete = workflowOf(raw, type).incomplete;
  const values = spec.module === 'severity' ? [...SEVERITY_SCALE] : (spec.values ?? []);
  const slots = shownIn(preset, type, field);
  const words = wordsOf(raw);
  const count = used(field);
  return (
    <>
      <div className="st-insp-h">
        <span className="st-insp-k">{t('studio.inspect.field')}</span>
        <span className="st-insp-k">
          {types.length > 1
            ? t('studio.inspect.sharedBy', { types: both(types) })
            : t('studio.inspect.only', { type: types[0] ?? type })}
        </span>
      </div>
      {renaming && change ? (
        <NameForm
          label={t('studio.inspect.renameTo', { name: field })}
          placeholder={field}
          hint={t('studio.snakeHint')}
          submit={t('studio.rename')}
          onSubmit={(name) => {
            change(renameField(yaml, preset, type, field, name));
            setRenaming(false);
            onSelect({ ...part, field: name });
          }}
        />
      ) : (
        <h2 className="st-insp-name">{field}</h2>
      )}
      {title ? <p className="st-ask-n">{t('studio.fields.titleLocked')}</p> : null}
      <Ask
        question={t('studio.inspect.drawnAs')}
        yamlKey={`${key}.module`}
        note={
          spec.module && MODULE_NOTE[spec.module]
            ? t(MODULE_NOTE[spec.module] as PlainKey)
            : undefined
        }
      >
        <Seg
          mono
          label={t('studio.inspect.drawnAs')}
          options={FIELD_MODULES.map((module) => ({ value: module, label: module }))}
          value={spec.module}
          onChange={
            set &&
            ((module) => {
              const next: RawField = { module };
              if (spec.required) next.required = spec.required;
              if (module === 'enum') next.values = spec.values ?? ['one', 'two'];
              set(next);
            })
          }
        />
      </Ask>
      {spec.module === 'severity' ? (
        <Ask
          question={t('studio.inspect.levels')}
          yamlKey={t('studio.inspect.fixedScale')}
          note={t('studio.inspect.levelsNote')}
        >
          <span className="st-vals">
            {values.map((value) => (
              <span key={value} className="st-val">
                {value}
              </span>
            ))}
          </span>
        </Ask>
      ) : null}
      {spec.module === 'enum' ? (
        <Ask question={t('studio.inspect.values')} yamlKey="values">
          <span className="st-vals">
            {values.map((value) => (
              <span key={value} className="st-val">
                {value}
                {set && values.length > 1 ? (
                  <button
                    type="button"
                    className="st-valx"
                    aria-label={t('studio.fields.removeValue', { value })}
                    onClick={() => {
                      const next: RawField = { ...spec, values: values.filter((v) => v !== value) };
                      if (next.default === value) delete next.default;
                      set(next);
                    }}
                  >
                    <Icon name="close" />
                  </button>
                ) : null}
              </span>
            ))}
            {set ? (
              <NameForm
                label={t('studio.fields.addValue')}
                placeholder={t('studio.fields.valueHint')}
                submit={t('studio.fields.value')}
                pattern={/^\S+$/}
                onSubmit={(value) => {
                  if (!values.includes(value)) set({ ...spec, values: [...values, value] });
                }}
              />
            ) : null}
          </span>
        </Ask>
      ) : null}
      {values.length > 0 ? (
        <Ask question={t('studio.inspect.startsAt', { type: typeLabel })} yamlKey="default">
          <Seg
            mono
            label={t('studio.inspect.startsAt', { type: typeLabel })}
            options={[
              { value: '', label: t('studio.inspect.none') },
              ...values.map((value) => ({ value, label: value })),
            ]}
            value={spec.default ?? ''}
            onChange={
              set &&
              ((value) => {
                const next = { ...spec };
                if (value === '') delete next.default;
                else next.default = value;
                set(next);
              })
            }
          />
        </Ask>
      ) : null}
      <Ask
        question={t('studio.inspect.needed')}
        yamlKey={`required: ${spec.required ?? '—'}`}
        note={
          spec.required === 'complete'
            ? tx('studio.inspect.needed.complete', {
                type: typeLabel,
                state: <b>{incomplete ?? t('studio.inspect.incomplete')}</b>,
              })
            : spec.required === 'create'
              ? t('studio.inspect.needed.create', { type: typeLabel })
              : t('studio.inspect.needed.none')
        }
      >
        <Seg
          mono
          label={t('studio.inspect.needed')}
          options={[
            { value: '', label: t('studio.fields.notRequired') },
            { value: 'complete', label: t('studio.fields.toStart') },
            { value: 'create', label: t('studio.fields.toCreate') },
          ]}
          value={spec.required ?? ''}
          onChange={
            set &&
            ((value) => {
              const next = { ...spec };
              if (value === '') delete next.required;
              else next.required = value;
              set(next);
            })
          }
        />
      </Ask>
      <Ask
        question={t('studio.inspect.shownIn')}
        yamlKey={`${layoutPath(raw, type).slice(-1)[0]}.*`}
        note={
          slots.length === 0 ? t('studio.inspect.nowhere') : t('studio.inspect.evidenceNoField')
        }
      >
        <span className="st-vals">
          {slotChoices(spec.module).map(({ slot, struck }) => {
            const on = slots.includes(slot);
            return (
              <button
                key={slot}
                type="button"
                className={`st-tog${on ? ' on' : ''}${struck ? ' struck' : ''}`}
                aria-pressed={on}
                title={struck}
                disabled={change === undefined || struck !== undefined}
                onClick={() => change?.(setShownIn(yaml, preset, type, field, slot, !on))}
              >
                {on ? <Icon name="check" /> : null}
                {slot}
              </button>
            );
          })}
        </span>
      </Ask>
      {words ? (
        <Ask
          question={t('studio.inspect.inSpanish')}
          yamlKey={`labels.${words.language}.fields.${field}`}
        >
          <input
            className="st-input"
            aria-label={t('studio.inspect.inSpanish')}
            value={words.fields[field] ?? ''}
            readOnly={change === undefined}
            spellCheck={false}
            onChange={(event) =>
              change?.(
                setIn(
                  yaml,
                  ['labels', words.language, 'fields', field],
                  event.target.value === '' ? undefined : event.target.value,
                ),
              )
            }
          />
        </Ask>
      ) : null}
      <div className="st-insp-f">
        {change && !title ? (
          <>
            <button type="button" className="btn sm quiet" onClick={() => setRenaming(!renaming)}>
              {t('studio.rename')}
            </button>
            <button
              type="button"
              className="btn sm quiet"
              onClick={() => {
                change(removeField(yaml, preset, type, field));
                onSelect(undefined);
              }}
            >
              {t('studio.fields.remove')}
            </button>
          </>
        ) : null}
        <span className="st-insp-k st-insp-used">{t('studio.inspect.used', { count })}</span>
      </div>
    </>
  );
}

function SlotInspector({ raw, yaml, preset, type, part, change, onSelect }: InspectorProps) {
  const shape = preset?.types.find(({ name }) => name === type);
  const entries = shape?.layout[part.slot] ?? [];
  const key = `${layoutPath(raw, type).join('.')}.${part.slot}`;
  const nameOf = (index: number) => {
    const entry = entries[index];
    return entry?.field ?? entry?.id ?? entry?.module ?? '';
  };
  return (
    <>
      <div className="st-insp-h">
        <span className="st-insp-k">{t('studio.inspect.slot')}</span>
        <span className="st-insp-k">{t('studio.inspect.parts', { count: entries.length })}</span>
      </div>
      <h2 className="st-insp-name">{part.slot}</h2>
      <p className="st-ask-n">{t(SLOT_NOTE[part.slot])}</p>
      <Ask question={t('studio.inspect.holds')} yamlKey={key} note={t('studio.inspect.holdsNote')}>
        <ol className="st-slot-list">
          {entries.map((entry, index) => {
            const name = nameOf(index);
            return (
              <li
                // biome-ignore lint/suspicious/noArrayIndexKey: entries are positional
                key={`${name}-${index}`}
                aria-current={index === part.index ? 'true' : undefined}
              >
                <button
                  type="button"
                  className="st-slot-name"
                  onClick={() =>
                    onSelect({
                      type,
                      slot: part.slot,
                      index,
                      ...(entry.field === undefined ? {} : { field: entry.field }),
                    })
                  }
                >
                  <span>{name}</span>
                  {entry.field === undefined ? <code>{entry.module}</code> : null}
                </button>
                {change ? (
                  <span className="st-slot-acts">
                    <button
                      type="button"
                      className="btn sm quiet icon"
                      aria-label={t('studio.inspect.up', { name })}
                      disabled={index === 0}
                      onClick={() =>
                        change(moveInSlot(yaml, preset, type, part.slot, index, index - 1))
                      }
                    >
                      <Icon name="up" />
                    </button>
                    <button
                      type="button"
                      className="btn sm quiet icon st-down"
                      aria-label={t('studio.inspect.down', { name })}
                      disabled={index === entries.length - 1}
                      onClick={() =>
                        change(moveInSlot(yaml, preset, type, part.slot, index, index + 1))
                      }
                    >
                      <Icon name="up" />
                    </button>
                    <button
                      type="button"
                      className="btn sm quiet icon"
                      aria-label={t('studio.inspect.takeOut', { name, slot: part.slot })}
                      onClick={() => change(removeFromSlot(yaml, preset, type, part.slot, index))}
                    >
                      <Icon name="close" />
                    </button>
                  </span>
                ) : null}
              </li>
            );
          })}
        </ol>
        {entries.length === 0 ? <p className="st-ask-n">{t('studio.inspect.empty')}</p> : null}
      </Ask>
    </>
  );
}
