import { useLayoutEffect, useRef, useState } from 'react';
import { t } from '../../i18n/i18n.ts';
import { Button, useEscape } from '../../kit/index.ts';
import { Choreo, part } from '../../motion/choreo.ts';

// The notes form, drawn from «Devolver…» (SPEC §10.3, mock:3108-3141): a line leads from the
// button's centre, the surface unrolls pushing what is below down, the fields resolve. Cancel and
// Escape close it mirrored, focus back on the button.

type NotesFormProps = {
  open: boolean;
  // Who the notes go to, and the state when it is a closing move that asks a reason.
  agent: string | null;
  why: string | null;
  button: HTMLButtonElement | null;
  // Where the block below sat before the form opened, to push it down from there.
  belowTop: number | null;
  onSend: (text: string) => void;
  onCancel: () => void;
  onGone: () => void;
};

export function NotesForm({
  open,
  agent,
  why,
  button,
  belowTop,
  onSend,
  onCancel,
  onGone,
}: NotesFormProps) {
  const el = useRef<HTMLDivElement>(null);
  const ch = useRef<Choreo | null>(null);
  const [text, setText] = useState('');
  const gone = useRef(onGone);
  gone.current = onGone;

  // biome-ignore lint/correctness/useExhaustiveDependencies: runs on open and close
  useLayoutEffect(() => {
    const node = el.current;
    if (!node) return;
    if (open) {
      if (!ch.current) {
        const sheet = node.closest('.sheet-in');
        const line = node.querySelector<HTMLElement>('.nline');
        const surf = node.querySelector('.nsurf');
        const er = node.getBoundingClientRect();
        if (line) {
          const br = button?.getBoundingClientRect();
          line.style.transformOrigin = br ? `${br.left + br.width / 2 - er.left}px 0` : '0 0';
        }
        const details = sheet?.querySelector('.d-details');
        const h =
          belowTop != null && details
            ? details.getBoundingClientRect().top - belowTop
            : er.height + 22;
        const sibs = ['.d-details', '.d-main', '.d-hist']
          .map((s) => sheet?.querySelector(s))
          .filter(
            (x): x is Element =>
              !!x &&
              getComputedStyle(x).gridColumnStart !== '2' &&
              x.getBoundingClientRect().top > er.top,
          );
        ch.current = new Choreo([
          part(line, { transform: 'scaleX(0.001)' }, { transform: 'scaleX(1)' }, 420, 'ink', 0),
          part(
            surf,
            { clipPath: 'inset(0px 0px 100% 0px)' },
            { clipPath: 'inset(0px 0px 0px 0px)' },
            440,
            'settle',
            60,
          ),
          part(
            surf,
            { transform: 'translateY(-10px)' },
            { transform: 'translateY(0px)' },
            440,
            'settle',
            60,
          ),
          ...sibs.map((s) =>
            part(
              s,
              { transform: `translateY(${-h}px)` },
              { transform: 'translateY(0px)' },
              440,
              'settle',
              60,
            ),
          ),
          ...[...node.querySelectorAll('[data-i]')].flatMap((x, i) => [
            part(x, { opacity: 0 }, { opacity: 1 }, 340, 'drift', 140 + 34 * i),
            part(
              x,
              { transform: 'translateY(-4px)' },
              { transform: 'translateY(0px)' },
              380,
              'glide',
              140 + 34 * i,
            ),
            part(x, { filter: 'blur(1px)' }, { filter: 'blur(0px)' }, 260, 'drift', 140 + 34 * i),
          ]),
          part(node, { opacity: 0 }, { opacity: 1 }, 1, 'drift', 0, { ronly: true }),
        ]);
        window.setTimeout(
          () => node.querySelector('textarea')?.focus({ preventScroll: true }),
          220,
        );
      }
      void ch.current.go(1);
    } else if (ch.current) {
      const c = ch.current;
      button?.focus({ preventScroll: true });
      void c.go(0).then((latest) => {
        if (latest && c.dir === 0) {
          c.cancel();
          ch.current = null;
          gone.current();
        }
      });
    }
  }, [open]);

  useEscape(open, 'notes', onCancel);

  const who = agent ?? '';
  return (
    <div className="notes" ref={el}>
      <i className="nline" />
      <div className="nsurf">
        <div className="margin-label" data-i>
          {t('sheet.notes.title')}
          <span>
            {why
              ? t('sheet.notes.why', { state: why })
              : agent
                ? t('sheet.notes.for', { agent: who })
                : t('sheet.notes.forAny')}
          </span>
        </div>
        <div>
          <textarea
            data-i
            placeholder={t('sheet.notes.placeholder')}
            rows={3}
            aria-label={t('sheet.notes.aria', { agent: who })}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="nbtns" data-i>
            <Button variant="primary" disabled={!text.trim()} onClick={() => onSend(text.trim())}>
              {t('sheet.notes.send')}
            </Button>
            <Button variant="quiet" onClick={onCancel}>
              {t('sheet.notes.cancel')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
