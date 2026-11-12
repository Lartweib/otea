import { useState } from 'react';
import type { FieldModule, ModuleKind } from '../../../src/core/modules.ts';
import { type PlainKey, t } from '../i18n/i18n.ts';
import { Icon } from '../kit/index.ts';
import type { LayoutSlot } from '../types.ts';
import { gapsOf, type Placed } from './canvas.ts';
import { slotOffer } from './layout-edit.ts';
import { Unroll } from './Unroll.tsx';

// + field here: between the parts of a slot, where a new field or module goes. Its picker names the
// field and offers only what the slot takes; the rest is struck, with where it may go.

const WHAT: Record<FieldModule | ModuleKind, PlainKey> = {
  text: 'studio.add.text',
  markdown: 'studio.add.markdown',
  enum: 'studio.add.enum',
  severity: 'studio.add.severity',
  relations: 'studio.add.relations',
  children: 'studio.add.children',
  images: 'studio.add.images',
  recording: 'studio.add.recording',
  diff: 'studio.add.diff',
  log: 'studio.add.log',
  diagram: 'studio.add.diagram',
  files: 'studio.add.log',
  rounds: 'studio.add.rounds',
  options: 'studio.add.options',
  questions: 'studio.add.rounds',
  score: 'studio.add.rounds',
};

const NAME = /^[a-z][a-z0-9_]*$/;

export type Gap = { slot: LayoutSlot; index: number };

type AddHereProps = {
  placed: readonly Placed[];
  // The slots whose gaps show: the one pointed at and the chosen part's.
  slots: ReadonlyArray<LayoutSlot | undefined>;
  // The name of what sits before the gap, for the picker's heading.
  nameAt: (slot: LayoutSlot, index: number) => string | undefined;
  taken: (name: string) => boolean;
  onField: (gap: Gap, name: string, module: FieldModule) => void;
  onModule: (gap: Gap, module: ModuleKind) => void;
};

export function AddHere({ placed, slots, nameAt, taken, onField, onModule }: AddHereProps) {
  const [open, setOpen] = useState<Gap>();
  const boxes = new Map<LayoutSlot, { left: number; width: number }>();
  for (const { part, rect } of placed) {
    const box = boxes.get(part.slot);
    const right = Math.max(rect.left + rect.width, box ? box.left + box.width : 0);
    const left = Math.min(rect.left, box?.left ?? rect.left);
    boxes.set(part.slot, { left, width: right - left });
  }
  return (
    <>
      {gapsOf(placed)
        .filter((gap) => slots.includes(gap.slot) || open?.slot === gap.slot)
        .map((gap) => {
          const box = boxes.get(gap.slot);
          const on = open?.slot === gap.slot && open.index === gap.index;
          return (
            <div
              key={`${gap.slot}-${gap.index}`}
              className="st-gap"
              style={{
                top: `${gap.top}px`,
                left: `${box?.left ?? 0}px`,
                width: `${box?.width ?? 0}px`,
              }}
            >
              <button
                type="button"
                className="st-gap-btn"
                aria-expanded={on}
                aria-label={t('studio.add.hereIn', { slot: gap.slot })}
                onClick={() => setOpen(on ? undefined : { slot: gap.slot, index: gap.index })}
              >
                <Icon name="plus" />
                {t('studio.add.here')}
              </button>
              <Unroll
                open={on}
                label={t('studio.add.title', { slot: gap.slot })}
                className="st-addpick"
              >
                <Picker
                  gap={gap}
                  after={nameAt(gap.slot, gap.index - 1)}
                  taken={taken}
                  onField={(name, module) => {
                    onField(gap, name, module);
                    setOpen(undefined);
                  }}
                  onModule={(module) => {
                    onModule(gap, module);
                    setOpen(undefined);
                  }}
                />
              </Unroll>
            </div>
          );
        })}
    </>
  );
}

type PickerProps = {
  gap: Gap;
  after: string | undefined;
  taken: (name: string) => boolean;
  onField: (name: string, module: FieldModule) => void;
  onModule: (module: ModuleKind) => void;
};

function Picker({ gap, after, taken, onField, onModule }: PickerProps) {
  const [name, setName] = useState('');
  const offer = slotOffer(gap.slot);
  const valid = NAME.test(name) && !taken(name);
  const hint =
    name === ''
      ? undefined
      : taken(name)
        ? t('studio.add.taken', { name })
        : NAME.test(name)
          ? undefined
          : t('studio.snakeHint');
  return (
    <div className="st-addpick-in">
      <div className="st-pick-h" data-i="">
        <span>{t('studio.add.title', { slot: gap.slot })}</span>
        <span>{after ? t('studio.add.after', { name: after }) : t('studio.add.first')}</span>
      </div>
      {offer.fields.length > 0 ? (
        <>
          <label className="st-pick-name" data-i="">
            <input
              value={name}
              placeholder={t('studio.add.namePlaceholder')}
              aria-label={t('studio.add.name')}
              aria-invalid={hint !== undefined}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setName(event.target.value.trim())}
            />
            <span>{t('studio.add.name')}</span>
          </label>
          {hint ? <p className="st-pick-hint">{hint}</p> : null}
          <ul className="st-pick-list">
            {offer.fields.map((module) => (
              <li key={module} data-i="">
                <button
                  type="button"
                  disabled={!valid}
                  title={valid ? undefined : t('studio.add.nameFirst')}
                  onClick={() => onField(name, module)}
                >
                  <b>{module}</b>
                  <span>{t(WHAT[module])}</span>
                </button>
              </li>
            ))}
          </ul>
          <span className="st-pick-k">{t('studio.add.orModule')}</span>
        </>
      ) : null}
      <ul className="st-pick-list">
        {offer.modules.map(({ module, struck }) => (
          <li key={module} data-i="">
            <button
              type="button"
              className={struck ? 'struck' : undefined}
              disabled={struck !== undefined}
              title={struck}
              onClick={() => onModule(module)}
            >
              <b>{module}</b>
              <span>{t(WHAT[module])}</span>
              {struck ? <em>{t('studio.add.notHereShort')}</em> : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
