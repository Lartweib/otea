import { type CSSProperties, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  dismissLanguageNote,
  type FirstRunNote,
  languageNote,
  t,
  tx,
  useLanguage,
} from '../i18n/i18n.ts';
import { Button } from '../kit/Button.tsx';
import { Choreo, part } from '../motion/choreo.ts';

// The note itself: which language Otea took from the browser, and that only the interface is
// translated. It never covers a primary: it rests on the Preferences button at the rail's foot,
// pointing at it, or on a phone (where Preferences sits in the nav sheet) at the bottom of the
// screen.
type ViewProps = FirstRunNote & { onDismiss: () => void; anchored?: boolean };

export function LanguageNoteView({ tag, onDismiss, anchored = false }: ViewProps) {
  return (
    <aside className="language-note" aria-label={t('languageNote.label')}>
      <i className="ln-line" aria-hidden="true" />
      <p className="language-note-heading">
        {tx('languageNote.heading', { tag: <code>{tag}</code> })}
      </p>
      <p>{t('languageNote.body')}</p>
      <div className="language-note-actions">
        <Button variant="primary" size="sm" onClick={onDismiss}>
          {t('languageNote.ok')}
        </Button>
        <span className="ln-where">
          {t(anchored ? 'languageNote.where' : 'languageNote.wherePanel')}
        </span>
      </div>
    </aside>
  );
}

// Where the Preferences button is on screen, if it shows (a phone hides the rail).
function prefsButton(): HTMLElement | null {
  const btn = document.querySelector<HTMLElement>('.rail-foot .prefs-btn');
  return btn && btn.getClientRects().length > 0 ? btn : null;
}

// Once per browser, on the first run in a language other than English: Got it, a press elsewhere
// or a switch of language closes it for good. It rises from the Preferences button like a pop (the
// line leads, the surface follows, the words resolve) and leaves as the same gesture mirrored.
export function LanguageNote() {
  const [note, setNote] = useState(languageNote);
  const [leaving, setLeaving] = useState(false);
  const [at, setAt] = useState<CSSProperties | null>(null);
  const language = useLanguage();
  const shownIn = useRef(language);
  const box = useRef<HTMLDivElement>(null);
  const choreo = useRef<Choreo | null>(null);
  const dismiss = () => {
    dismissLanguageNote();
    setLeaving(true);
  };

  // Choosing a language answers the note: it would only describe the one left behind.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only a change of language answers it
  useEffect(() => {
    if (language === shownIn.current || !note) return;
    dismiss();
  }, [language]);

  useEffect(() => {
    if (!note || leaving) return;
    const away = (event: PointerEvent) => {
      if (box.current?.contains(event.target as Node)) return;
      dismissLanguageNote();
      setLeaving(true);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [note, leaving]);

  // Placed over the Preferences button, its tail on you; else at the bottom of the screen.
  useLayoutEffect(() => {
    if (!note) return;
    const place = () => {
      const btn = prefsButton();
      if (!btn) return setAt(null);
      const r = btn.getBoundingClientRect();
      setAt({ left: `${r.left}px`, bottom: `${window.innerHeight - r.top + 12}px` });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [note]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: runs as it shows and as it leaves
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    if (!choreo.current) {
      const aside = el.querySelector(':scope > .language-note');
      const line = el.querySelector('.ln-line');
      const words = [...el.querySelectorAll('.language-note > p, .language-note-actions')];
      choreo.current = new Choreo([
        part(line, { transform: 'scaleX(0.001)' }, { transform: 'scaleX(1)' }, 280, 'glide', 0),
        part(
          aside,
          { clipPath: 'inset(100% -40px 0px -40px)' },
          { clipPath: 'inset(-40px -40px 0px -40px)' },
          440,
          'settle',
          50,
        ),
        ...words.flatMap((x, i) => {
          const d = 80 + 34 * Math.min(i, 5);
          return [
            part(x, { opacity: 0 }, { opacity: 1 }, 340, 'drift', d),
            part(
              x,
              { transform: 'translateY(4px)' },
              { transform: 'translateY(0px)' },
              380,
              'glide',
              d,
            ),
          ];
        }),
        part(el, { opacity: 0 }, { opacity: 1 }, 1, 'drift', 0, { ronly: true }),
      ]);
    }
    const ch = choreo.current;
    if (!leaving) ch.go(1);
    else {
      ch.go(0).then((latest) => {
        if (latest) setNote(undefined);
      });
    }
  }, [leaving, note]);

  if (!note) return null;
  const anchored = at !== null;
  return (
    <div
      className="language-note-host"
      data-anchored={anchored || undefined}
      style={at ?? undefined}
      ref={box}
    >
      <LanguageNoteView tag={note.tag} onDismiss={dismiss} anchored={anchored} />
    </div>
  );
}
