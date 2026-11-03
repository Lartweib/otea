import { type ReactNode, useState } from 'react';
import {
  browserLanguage,
  chooseLanguageSetting,
  type LanguageChoice,
  languageChoice,
  type PlainKey,
  t,
  tx,
} from '../i18n/i18n.ts';
import { Icon, type IconName } from '../kit/index.ts';
import type { ThemeChoice } from '../theme.ts';
import { loadChoice, switchChoice } from '../theme-dom.ts';
import { Buddy } from './Buddy.tsx';

type Option<V extends string> = { value: V; label: ReactNode; lang?: string };

// A row of options, every one in sight, the chosen one pressed: a segmented pill.
function Segmented<V extends string>({
  label,
  value,
  options,
  onChoose,
}: {
  label: string;
  value: V;
  options: readonly Option<V>[];
  onChoose: (value: V, origin: HTMLElement) => void;
}) {
  return (
    <fieldset className="segmented" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          lang={option.lang}
          onClick={(event) => onChoose(option.value, event.currentTarget)}
        >
          {option.label}
        </button>
      ))}
    </fieldset>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="prefs-group">
      <span className="t-label prefs-label">{label}</span>
      <div className="prefs-body">{children}</div>
    </div>
  );
}

const THEMES: readonly [ThemeChoice, IconName, PlainKey][] = [
  ['system', 'system', 'prefs.system'],
  ['light', 'sun', 'prefs.light'],
  ['dark', 'moon', 'prefs.dark'],
];

// What belongs to this browser, not to a project: the theme and the interface's language, with the
// note that only the interface is translated.
export function PreferencesPanel() {
  const [theme, setTheme] = useState(loadChoice);
  const [lang, setLang] = useState<LanguageChoice>(languageChoice);
  return (
    <div className="prefs-groups">
      <Group label={t('prefs.theme')}>
        <Segmented
          label={t('prefs.theme')}
          value={theme}
          options={THEMES.map(([value, icon, key]) => ({
            value,
            label: (
              <>
                <Icon name={icon} />
                {t(key)}
              </>
            ),
          }))}
          onChoose={(next, origin) => {
            if (next === theme) return;
            switchChoice(theme, next, origin);
            setTheme(next);
          }}
        />
      </Group>
      <Group label={t('prefs.language')}>
        <Segmented
          label={t('prefs.language')}
          value={lang}
          options={[
            { value: 'auto', label: t('prefs.auto', { code: browserLanguage().toUpperCase() }) },
            { value: 'en', label: t('prefs.english'), lang: 'en' },
            { value: 'es', label: t('prefs.spanish'), lang: 'es' },
          ]}
          onChoose={(next) => {
            chooseLanguageSetting(next);
            setLang(next);
          }}
        />
        <p className="prefs-note">
          {tx('prefs.translated', { only: <b>{t('prefs.onlyInterface')}</b> })}
        </p>
      </Group>
    </div>
  );
}

// The panel's head on the desktop menu: you, and whose preferences these are.
export function PreferencesHead() {
  return (
    <div className="prefs-head">
      <Buddy size={20} />
      <span className="prefs-title">
        <b>{t('prefs.title')}</b>
        <span className="t-cap">{t('prefs.scope')}</span>
      </span>
    </div>
  );
}
