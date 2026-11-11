import { type ReactNode, useState } from 'react';
import { useApp } from '../app/context.tsx';
import {
  browserLanguage,
  chooseLanguageSetting,
  type LanguageChoice,
  languageChoice,
  t,
  tx,
} from '../i18n/i18n.ts';
import { Icon } from '../kit/Icon.tsx';
import { Buddy, Chevron } from '../kit/Marks.tsx';
import { anchorAbove } from '../kit/pop/anchors.ts';
import { Pop } from '../kit/pop/Pop.tsx';
import { Seg } from '../kit/Seg.tsx';
import { Swap } from '../kit/Swap.tsx';
import { type MotionPref, motionPref, setMotionPref } from '../motion/reduced.ts';
import type { ThemeChoice } from '../theme.ts';
import { loadChoice, switchChoice } from '../theme-dom.ts';
import { motionNote } from './prefs-model.ts';
import { shellUi, useShellUi } from './shell-ui.ts';
import { useMedia } from './use-media.ts';

// Preferences (SPEC §7.3, mock:778-794, 3395-3421): what belongs to this browser. A Pop on the
// bottom edge, 420 wide, rising from the button at the rail's foot (its line leads from the
// button's centre), left aligned with the rail; on a phone the same pop pinned 12 px from the
// sides and the bottom. Theme (the feathered circle), motion (with its note that swaps in place),
// language (only the interface is translated), the session (pairing a phone, where this browser
// may) and the server. The handoff is not a choice: it always folds (Plegar).

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="pgroup" data-i="">
      <span className="gl">{label}</span>
      <div className="gb">{children}</div>
    </div>
  );
}

const REDUCE = '(prefers-reduced-motion: reduce)';

function MotionNoteText({ pref, systemReduced }: { pref: MotionPref; systemReduced: boolean }) {
  const note = motionNote(pref, systemReduced);
  if (note === 'system-full' || note === 'system-reduced') {
    return tx('prefs.motionNoteSystem', {
      state: <b>{t(note === 'system-full' ? 'prefs.nowFull' : 'prefs.nowReduced')}</b>,
    });
  }
  return note === 'full'
    ? tx('prefs.fullNote', { label: <b>{t('prefs.fullLabel')}</b> })
    : tx('prefs.reducedNote', { label: <b>{t('prefs.reducedLabel')}</b> });
}

type PrefsBodyProps = {
  // The server this browser talks to (its host and port).
  server: string;
  // Leads to the pairing dialog; the panel closes on the way.
  onPair: () => void;
};

export function PrefsBody({ server, onPair }: PrefsBodyProps) {
  const app = useApp();
  const systemReduced = useMedia(REDUCE);
  const [theme, setTheme] = useState<ThemeChoice>(loadChoice);
  const [motion, setMotion] = useState<MotionPref>(motionPref);
  const [lang, setLang] = useState<LanguageChoice>(languageChoice);
  return (
    <>
      <div className="phead" data-i="">
        <Buddy size={20} />
        <span>
          <b>{t('prefs.title')}</b>
          <small>{t('prefs.scope')}</small>
        </span>
      </div>
      <Group label={t('prefs.theme')}>
        <Seg<ThemeChoice>
          well
          label={t('prefs.theme')}
          value={theme}
          options={[
            { value: 'system', label: t('prefs.system'), icon: <Icon name="sys" /> },
            { value: 'light', label: t('prefs.light'), icon: <Icon name="sun" /> },
            { value: 'dark', label: t('prefs.dark'), icon: <Icon name="moon" /> },
          ]}
          onChange={(next, button) => {
            if (next !== theme && switchChoice(theme, next, button)) setTheme(next);
          }}
        />
      </Group>
      <Group label={t('prefs.motion')}>
        <Seg<MotionPref>
          well
          label={t('prefs.motion')}
          value={motion}
          options={[
            { value: 'system', label: t('prefs.system') },
            { value: 'full', label: t('prefs.motionFull') },
            { value: 'reduced', label: t('prefs.motionReduced') },
          ]}
          onChange={(next) => {
            setMotionPref(next);
            setMotion(next);
          }}
        />
        <Swap
          k={motionNote(motion, systemReduced)}
          as="p"
          className="gnote"
          dy={3}
          outT={220}
          inT={300}
        >
          <MotionNoteText pref={motion} systemReduced={systemReduced} />
        </Swap>
      </Group>
      <Group label={t('prefs.language')}>
        <Seg<LanguageChoice>
          well
          label={t('prefs.language')}
          value={lang}
          options={[
            { value: 'auto', label: t('prefs.auto', { code: browserLanguage().toUpperCase() }) },
            { value: 'en', label: <span lang="en">{t('prefs.english')}</span> },
            { value: 'es', label: <span lang="es">{t('prefs.spanish')}</span> },
          ]}
          onChange={(next) => {
            if (next === lang) return;
            setLang(next);
            chooseLanguageSetting(next);
          }}
        />
        <p className="gnote">
          {tx('prefs.translated', { only: <b>{t('prefs.onlyInterface')}</b> })}
        </p>
      </Group>
      {app.session.canManageDevices ? (
        <Group label={t('prefs.session')}>
          <button type="button" className="plink" onClick={onPair}>
            <Icon name="link" />
            {t('prefs.pair')}
          </button>
        </Group>
      ) : null}
      <Group label={t('prefs.about')}>
        <dl className="about">
          <dt>{t('prefs.server')}</dt>
          <dd>{server}</dd>
        </dl>
      </Group>
    </>
  );
}

// The button at the rail's foot (mock:1436, 192-197): you, "Preferencias", an up-chevron that turns
// while it is open; you in your blue then. The pop it opens lives in #layer, so the phone's nav
// sheet can open it too (shellUi.prefs).
export function PrefsButton() {
  const app = useApp();
  const ui = useShellUi();
  const [btn, setBtn] = useState<HTMLButtonElement | null>(null);
  const phone = app.phone;
  const close = () => shellUi.set({ prefs: false });
  const place = (el: HTMLElement) => {
    if (phone || !btn) {
      Object.assign(el.style, {
        left: '12px',
        right: '12px',
        top: 'auto',
        bottom: '12px',
        width: 'auto',
      });
      return;
    }
    const rail = btn.closest('.rail')?.getBoundingClientRect();
    anchorAbove(btn, rail?.left)(el);
  };
  return (
    <>
      <button
        ref={setBtn}
        type="button"
        className="prefs-btn"
        aria-expanded={ui.prefs}
        aria-haspopup="dialog"
        data-tip={t('nav.prefs')}
        onClick={() => shellUi.set({ prefs: !ui.prefs })}
      >
        <Buddy />
        <span className="lb">{t('nav.prefs')}</span>
        <Chevron up />
      </button>
      <Pop
        open={ui.prefs}
        anchor={phone ? null : btn}
        edge="bottom"
        place={place}
        role="dialog"
        label={t('prefs.title')}
        className="prefs"
        onClose={close}
      >
        <PrefsBody
          server={typeof window === 'undefined' ? '' : window.location.host}
          onPair={() => {
            close();
            app.go({ view: 'lan' });
          }}
        />
      </Pop>
    </>
  );
}
