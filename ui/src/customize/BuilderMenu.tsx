import { useEffect, useRef, useState } from 'react';
import { t } from '../i18n/i18n.ts';
import { Button } from '../kit/index.ts';
import type { Box } from '../studio/canvas.ts';
import {
  type Doc,
  deleteField,
  homeOf,
  KIND_WORD,
  type Kind,
  move,
  type Need,
  patchThing,
  refusal,
  setAlso,
  type Thing,
  type Zone,
  zoneWord,
} from './model.ts';

const KINDS: Kind[] = ['short', 'long', 'choice', 'level'];
const NEEDS: Need[] = ['no', 'complete', 'create'];
const PLACES: Zone[] = ['header', 'body', 'side'];

// The menu beside a field: everything about it in one place. Closes on Esc, a click outside and X.
export function BuilderMenu({
  thing,
  was,
  doc,
  anchor,
  used,
  onClose,
  onChange,
}: {
  thing: Thing;
  was: Thing | undefined;
  doc: Doc;
  anchor: Box | undefined;
  used: number;
  onClose: () => void;
  onChange: (doc: Doc) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [deleting, setDeleting] = useState(false);
  useEffect(() => {
    ref.current?.querySelector('input')?.focus();
    const key = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    const down = (event: PointerEvent) => {
      const target = event.target;
      if (ref.current && target instanceof Node && !ref.current.contains(target)) {
        if (!(target instanceof Element && target.closest('.cz-grip'))) onClose();
      }
    };
    window.addEventListener('keydown', key);
    window.addEventListener('pointerdown', down);
    return () => {
      window.removeEventListener('keydown', key);
      window.removeEventListener('pointerdown', down);
    };
  }, [onClose]);
  const home = homeOf(doc, thing.id);
  const list = home ? doc.zones[home] : [];
  const at = list.indexOf(thing.id);
  const go = (zone: Zone | 'panel', index: number) => {
    const result = move(doc, thing.id, { zone, index });
    if (!result.refused) onChange(result.doc);
  };
  const editable = thing.kind !== 'files' && thing.kind !== 'link';
  const top = anchor ? Math.max(0, anchor.top - 8) : 0;
  const left = anchor ? anchor.left + anchor.width + 20 : 0;
  return (
    <div className="cz-menu" ref={ref} role="dialog" aria-label={thing.name} style={{ top, left }}>
      <button type="button" className="cz-x" aria-label={t('cz.close')} onClick={onClose}>
        ×
      </button>
      {editable ? (
        <>
          <label>
            <span>{t('cz.name')}</span>
            <input
              value={thing.name}
              onChange={(e) => onChange(patchThing(doc, thing.id, { name: e.target.value }))}
            />
          </label>
          <label>
            <span>{t('cz.type')}</span>
            <select
              value={thing.kind}
              onChange={(e) =>
                onChange(patchThing(doc, thing.id, { kind: e.target.value as Kind }))
              }
            >
              {KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {KIND_WORD[kind]}
                </option>
              ))}
            </select>
          </label>
          {was && was.kind !== thing.kind && used > 0 ? (
            <p className="cz-warn">{t('cz.typeWarn')}</p>
          ) : null}
          {thing.kind === 'choice' ? (
            <label>
              <span>Options</span>
              <textarea
                rows={3}
                value={(thing.options ?? []).join('\n')}
                onChange={(e) =>
                  onChange(
                    patchThing(doc, thing.id, {
                      options: e.target.value
                        .split('\n')
                        .map((line) => line.trim())
                        .filter(Boolean),
                    }),
                  )
                }
              />
            </label>
          ) : null}
          <label>
            <span>{t('cz.needed')}</span>
            <select
              value={thing.need}
              onChange={(e) =>
                onChange(patchThing(doc, thing.id, { need: e.target.value as Need }))
              }
            >
              {NEEDS.map((need) => (
                <option key={need} value={need}>
                  {t(`cz.need.${need}`)}
                </option>
              ))}
            </select>
          </label>
          <fieldset>
            <legend>{t('cz.alsoIn')}</legend>
            {(['intake', 'row'] as const).map((zone) => {
              const refused = refusal(thing.kind, zone);
              return (
                <label key={zone} className="cz-check" title={refused}>
                  <input
                    type="checkbox"
                    checked={doc.zones[zone].includes(thing.id)}
                    disabled={refused !== undefined}
                    onChange={(e) => onChange(setAlso(doc, thing.id, zone, e.target.checked))}
                  />
                  {zoneWord(zone)}
                </label>
              );
            })}
          </fieldset>
        </>
      ) : null}
      <div className="cz-moveto">
        <label>
          <span>{t('cz.moveTo')}</span>
          <select value={home ?? ''} onChange={(e) => go(e.target.value as Zone, 0)}>
            {PLACES.map((zone) => (
              <option key={zone} value={zone} disabled={refusal(thing.kind, zone) !== undefined}>
                {zoneWord(zone)}
              </option>
            ))}
          </select>
        </label>
        <Button size="sm" disabled={!home || at <= 0} onClick={() => home && go(home, at - 1)}>
          {t('cz.up')}
        </Button>
        <Button
          size="sm"
          disabled={!home || at >= list.length - 1}
          onClick={() => home && go(home, at + 1)}
        >
          {t('cz.down')}
        </Button>
      </div>
      <div className="cz-danger">
        <Button size="sm" onClick={() => go('panel', 0)}>
          {t('cz.hide')}
        </Button>
        {editable ? (
          deleting ? (
            <>
              <p className="cz-warn">{t('cz.deleteNote', { name: thing.name, type: 'type' })}</p>
              <Button
                size="sm"
                onClick={() => {
                  onChange(deleteField(doc, thing.id));
                  onClose();
                }}
              >
                {t('cz.delete')}
              </Button>
            </>
          ) : (
            <Button size="sm" variant="quiet" onClick={() => setDeleting(true)}>
              {t('cz.delete')}
            </Button>
          )
        ) : null}
      </div>
    </div>
  );
}
