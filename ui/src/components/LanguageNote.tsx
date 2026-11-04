import { useEffect, useRef, useState } from 'react';
import {
  dismissLanguageNote,
  type FirstRunNote,
  languageNote,
  t,
  tx,
  useLanguage,
} from '../i18n/i18n.ts';
import { Button } from '../kit/Button.tsx';

// The note itself: which language Otea took from the browser, and that only the interface is
// translated. It never covers a primary: it rests on the Preferences row at the sidebar's foot,
// pointing at it, or on a phone (where Preferences sits in the panel) at the bottom of the screen.
type ViewProps = FirstRunNote & { onDismiss: () => void; anchored?: boolean };

export function LanguageNoteView({ tag, onDismiss, anchored = false }: ViewProps) {
  return (
    <aside className="language-note raised" aria-label={t('languageNote.label')}>
      <p className="language-note-heading">
        {tx('languageNote.heading', { tag: <code>{tag}</code> })}
      </p>
      <p>{t('languageNote.body')}</p>
      <div className="language-note-actions">
        <Button size="sm" onClick={onDismiss}>
          {t('languageNote.ok')}
        </Button>
        <span className="t-cap">
          {t(anchored ? 'languageNote.where' : 'languageNote.wherePanel')}
        </span>
      </div>
    </aside>
  );
}

// Once per browser, on the first run in a language other than English: Got it, a click elsewhere or
// a switch of language closes it for good. `anchored`: drawn by the Preferences row, above it.
export function LanguageNote({ anchored = false }: { anchored?: boolean }) {
  const [note, setNote] = useState(languageNote);
  const language = useLanguage();
  const shownIn = useRef(language);
  const box = useRef<HTMLDivElement>(null);
  const dismiss = () => {
    dismissLanguageNote();
    setNote(undefined);
  };
  // Choosing a language answers the note: it would only describe the one left behind.
  useEffect(() => {
    if (language === shownIn.current) return;
    dismissLanguageNote();
    setNote(undefined);
  }, [language]);
  useEffect(() => {
    if (!note) return;
    const away = (event: PointerEvent) => {
      if (box.current?.contains(event.target as Node)) return;
      dismissLanguageNote();
      setNote(undefined);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [note]);
  if (!note) return null;
  return (
    <div className="language-note-host" data-anchored={anchored || undefined} ref={box}>
      <LanguageNoteView tag={note.tag} onDismiss={dismiss} anchored={anchored} />
    </div>
  );
}
