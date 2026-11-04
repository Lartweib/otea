import { useState } from 'react';
import {
  EVIDENCE_MODULES,
  type LayoutEntry,
  MODULE_REGISTRY,
  type ModuleKind,
} from '../../../src/core/modules.ts';
import { type PlainKey, t } from '../i18n/i18n.ts';
import { Icon } from '../kit/index.ts';
import type { InspectorProps } from './Inspector.tsx';
import { extensionsOf, layoutPath, removeFromSlot, setEntry } from './layout-edit.ts';
import { Ask, NameForm, Seg } from './parts.tsx';

// The inspector of a module the layout places: for an evidence module, what it accepts, how it
// shows, whether it is needed, and what an agent can attach to it, with the command as it is.

const VARIANTS: Partial<Record<ModuleKind, readonly string[]>> = {
  images: ['single', 'gallery', 'compare'],
  recording: ['player', 'frames'],
};

const VARIANT_NOTE: Record<string, PlainKey> = {
  single: 'studio.inspect.variant.single',
  gallery: 'studio.inspect.variant.gallery',
  compare: 'studio.inspect.variant.compare',
  player: 'studio.inspect.variant.player',
  frames: 'studio.inspect.variant.frames',
};

const MODULE_NOTE: Partial<Record<ModuleKind, PlainKey>> = {
  relations: 'studio.inspect.relations',
  children: 'studio.inspect.children',
};

export type ModuleInspectorProps = InspectorProps & { entry: LayoutEntry };

export function ModuleInspector({
  raw,
  yaml,
  preset,
  type,
  part,
  change,
  onSelect,
  entry,
  sample,
}: ModuleInspectorProps) {
  const [renaming, setRenaming] = useState(false);
  const spec = MODULE_REGISTRY[entry.module];
  const key = `${layoutPath(raw, type).slice(-1)[0]}.${part.slot}[${part.index}]`;
  const set = change
    ? (next: LayoutEntry) => change(setEntry(yaml, preset, type, part.slot, part.index, next))
    : undefined;
  const typeLabel = (raw.types?.[type]?.label ?? type).toLowerCase();
  const remove = change
    ? () => {
        change(removeFromSlot(yaml, preset, type, part.slot, part.index));
        onSelect(undefined);
      }
    : undefined;
  if (spec.family !== 'evidence') {
    return (
      <>
        <div className="st-insp-h">
          <span className="st-insp-k">{t('studio.inspect.moduleOther')}</span>
          <span className="st-insp-k">{`${part.slot}[${part.index}]`}</span>
        </div>
        <h2 className="st-insp-name">{entry.module}</h2>
        {MODULE_NOTE[entry.module] ? (
          <p className="st-ask-n">{t(MODULE_NOTE[entry.module] as PlainKey)}</p>
        ) : null}
        <div className="st-insp-f">
          {remove ? (
            <button type="button" className="btn sm quiet" onClick={remove}>
              {t('studio.inspect.remove')}
            </button>
          ) : null}
        </div>
      </>
    );
  }
  const id = entry.id ?? entry.module;
  const offered = extensionsOf(entry.module);
  const accepts = entry.accepts ?? [];
  const variants = VARIANTS[entry.module] ?? [];
  const variant = entry.variant ?? variants[0];
  const shown = accepts.length > 0 ? accepts : offered;
  const compare = variant === 'compare';
  return (
    <>
      <div className="st-insp-h">
        <span className="st-insp-k">{t('studio.inspect.evidenceModule')}</span>
        <span className="st-insp-k">{t('studio.inspect.only', { type })}</span>
      </div>
      {renaming && change ? (
        <NameForm
          label={t('studio.inspect.renameTo', { name: id })}
          placeholder={id}
          pattern={/^[a-z][a-z0-9-]*$/}
          submit={t('studio.rename')}
          onSubmit={(name) => {
            set?.({ ...entry, id: name });
            setRenaming(false);
          }}
        />
      ) : (
        <h2 className="st-insp-name st-insp-name-n">{id}</h2>
      )}
      <p className="st-ask-n st-insp-lede">
        {t('studio.inspect.evidenceWhere', { type: typeLabel })}
      </p>
      <Ask question={t('studio.inspect.kindOfFile')} yamlKey={`${key}.module`}>
        <Seg
          mono
          label={t('studio.inspect.kindOfFile')}
          options={EVIDENCE_MODULES.map((module) => ({ value: module, label: module }))}
          value={entry.module}
          onChange={
            set &&
            ((module) => {
              const next: LayoutEntry = { module: module as ModuleKind, id };
              if (entry.required) next.required = true;
              set(next);
            })
          }
        />
      </Ask>
      <Ask
        question={t('studio.inspect.takes')}
        yamlKey="accepts"
        note={
          entry.module === 'images'
            ? t('studio.inspect.takesImages')
            : t('studio.inspect.takesOthers')
        }
      >
        <span className="st-vals">
          {offered.map((extension) => {
            const on = accepts.includes(extension);
            return (
              <button
                key={extension}
                type="button"
                className={`st-tog${on ? ' on' : ''}`}
                aria-pressed={on}
                disabled={set === undefined}
                onClick={() => {
                  const next = on
                    ? accepts.filter((each) => each !== extension)
                    : [...accepts, extension];
                  const { accepts: _drop, ...rest } = entry;
                  set?.(next.length > 0 ? { ...rest, accepts: next } : rest);
                }}
              >
                {on ? <Icon name="check" /> : null}
                {extension}
              </button>
            );
          })}
        </span>
      </Ask>
      {variants.length > 0 ? (
        <Ask
          question={t('studio.inspect.shownAs')}
          yamlKey="variant"
          note={variant && VARIANT_NOTE[variant] ? t(VARIANT_NOTE[variant] as PlainKey) : undefined}
        >
          <Seg
            mono
            label={t('studio.inspect.shownAs')}
            options={variants.map((value) => ({ value, label: value }))}
            value={variant}
            onChange={set && ((value) => set({ ...entry, variant: value }))}
          />
        </Ask>
      ) : null}
      <Ask
        question={t('studio.inspect.needed')}
        yamlKey="required"
        note={t('studio.inspect.requiredNote')}
      >
        <label className="st-switch">
          <input
            type="checkbox"
            role="switch"
            aria-checked={entry.required === true}
            checked={entry.required === true}
            disabled={set === undefined}
            onChange={(event) => {
              const { required: _drop, ...rest } = entry;
              set?.(event.target.checked ? { ...rest, required: true } : rest);
            }}
          />
          <span>{entry.required ? t('studio.inspect.yes') : t('studio.fields.notRequired')}</span>
        </label>
      </Ask>
      <div className="st-attach">
        <b>{t('studio.inspect.attach')}</b>
        <p>
          {t(compare ? 'studio.inspect.attachCompare' : 'studio.inspect.attachOne', {
            files: shown.join(', '),
          })}
        </p>
        <code>{`otea attach ${sample?.id ?? 'ID'} shot.${shown[0] ?? 'png'} --module ${id}${compare ? ' --role after' : ''}`}</code>
        <p className="st-attach-n">{t('studio.inspect.attachRefused', { type: typeLabel })}</p>
      </div>
      <div className="st-insp-f">
        {change ? (
          <>
            <button type="button" className="btn sm quiet" onClick={() => setRenaming(!renaming)}>
              {t('studio.inspect.renameId')}
            </button>
            <button type="button" className="btn sm quiet" onClick={remove}>
              {t('studio.inspect.remove')}
            </button>
          </>
        ) : null}
        {sample ? (
          <span className="st-insp-k st-insp-used">
            {t('studio.inspect.files', { count: sample.files(id), id: sample.id })}
          </span>
        ) : null}
      </div>
    </>
  );
}
