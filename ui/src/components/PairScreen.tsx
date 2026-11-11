import { type FormEvent, useEffect, useState } from 'react';
import { PairingRefused, pairDevice, peekPairing } from '../api.ts';
import {
  browserStore,
  dismissHint,
  hintDismissed,
  isStandalone,
  type Platform,
  platformOf,
} from '../home-screen.ts';
import { type PlainKey, t, useLanguage } from '../i18n/i18n.ts';
import { Button } from '../kit/index.ts';
import { codeFromHash, deviceNameFrom, timeLeft } from '../pairing.ts';
import type { Paired, PairingPeek } from '../types.ts';

type Phase = { step: 'ask' } | { step: 'pairing' } | { step: 'paired'; paired: Paired };

// The refusals the phone words itself; any other shows the server's message.
const REFUSALS: Readonly<Record<string, PlainKey>> = {
  invalid_code: 'pair.error.invalid_code',
  code_expired: 'pair.error.code_expired',
  too_many_attempts: 'pair.error.too_many_attempts',
  invalid_name: 'pair.error.invalid_name',
};

function refusal(error: unknown): string {
  const known = error instanceof PairingRefused ? REFUSALS[error.code] : undefined;
  if (known) return t(known);
  const message = error instanceof Error ? error.message : t('common.failed');
  return t('pair.error.other', { message });
}

function useNow(every: number): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(timer);
  }, [every]);
  return now;
}

// The two ends of the pairing, on one lane: the desk that showed the code and this phone. The lane
// draws itself in as the code is exchanged, and the phone's node turns to your colour once paired.
function PairRoute({ phase, desk }: { phase: Phase['step']; desk: string }) {
  const note =
    phase === 'paired'
      ? t('pair.pairedNow')
      : phase === 'pairing'
        ? t('pair.exchanging')
        : t('pair.notPaired');
  return (
    <div className={`pair-route ${phase}`}>
      <svg className="pair-lane" width="40" height="156" viewBox="0 0 40 156" aria-hidden="true">
        <path className="pair-lane-dash" d="M20 32 V124" />
        <path className="pair-lane-draw" d="M20 32 V124" pathLength={1} />
        <circle className="pair-lane-dot" cx="20" cy="32" r="3.5" />
      </svg>
      <div className="pair-end" style={{ top: 0 }}>
        <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
          <circle className="shape s-agent" cx="20" cy="20" r="11" />
          <path className="pair-icon" d="M14.5 17 H25.5 V23.5 H14.5 Z M12.5 25.5 H27.5" />
        </svg>
        <span>
          <span className="t-ui">{t('pair.desk')}</span>
          <span className="t-cap">{desk}</span>
        </span>
      </div>
      <div className="pair-end pair-phone" style={{ top: 116 }}>
        <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
          <circle className="pair-halo" cx="20" cy="20" r="11" />
          <circle
            className={`shape ${phase === 'paired' ? 's-you' : 's-gap'}`}
            cx="20"
            cy="20"
            r="11"
          />
          <rect className="pair-icon" x="16" y="13.5" width="8" height="13" rx="2" />
        </svg>
        <span>
          <span className="t-ui">{t('pair.phone')}</span>
          <span className="t-cap" aria-live="polite">
            {note}
          </span>
        </span>
      </div>
    </div>
  );
}

const STEPS: Readonly<Record<Platform, PlainKey[]>> = {
  ios: ['home.ios', 'home.iosAfter'],
  android: ['home.android', 'home.androidAfter'],
  other: ['home.other'],
};

// Once paired in the browser: how to put Otea on the home screen, until dismissed. Inside the
// home-screen app it never shows.
function HomeScreenHint({ platform }: { platform: Platform }) {
  const [shown, setShown] = useState(() => !hintDismissed(browserStore()));
  if (!shown) return null;
  return (
    <aside className="pair-hint raised" aria-labelledby="pair-hint-title">
      <h2 id="pair-hint-title" className="t-ui">
        {t('home.title')}
      </h2>
      <ol className="pair-hint-steps">
        {STEPS[platform].map((key) => (
          <li key={key} className="t-small">
            {t(key)}
          </li>
        ))}
      </ol>
      <div>
        <Button
          size="sm"
          onClick={() => {
            dismissHint(browserStore());
            setShown(false);
          }}
        >
          {t('home.dismiss')}
        </Button>
      </div>
    </aside>
  );
}

// What a phone on the LAN sees before it is paired (/pair): it trades the code from the QR code for
// a device token of its own, which the server keeps in an HTTP-only cookie.
export function PairScreen() {
  useLanguage();
  const now = useNow(1000);
  // The code the QR code opened the page with; without one the phone types it.
  const [scannedCode] = useState(() => codeFromHash(window.location.hash));
  const scanned = scannedCode !== '';
  // Opened from the home screen: no QR code reaches it, and on iOS it has none of Safari's cookies.
  const [standalone] = useState(() => isStandalone(window.matchMedia, navigator));
  const [platform] = useState(() => platformOf(navigator.userAgent, navigator.maxTouchPoints));
  const [code, setCode] = useState(scannedCode);
  const [name, setName] = useState(() => {
    const named = deviceNameFrom(navigator.userAgent);
    return standalone ? t('pair.appName', { system: named.split(' · ')[0] ?? named }) : named;
  });
  const [peek, setPeek] = useState<PairingPeek | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [phase, setPhase] = useState<Phase>({ step: 'ask' });

  useEffect(() => {
    if (scannedCode === '') return;
    peekPairing(scannedCode).then(setPeek, (refused: unknown) => setError(refusal(refused)));
  }, [scannedCode]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (phase.step !== 'ask') return;
    setError(undefined);
    setPhase({ step: 'pairing' });
    pairDevice(code, name).then(
      (paired) => {
        // The code is spent: keep it out of the history and the address bar.
        window.history.replaceState(null, '', '/pair');
        setPhase({ step: 'paired', paired });
      },
      (refused: unknown) => {
        setError(refusal(refused));
        setPhase({ step: 'ask' });
      },
    );
  };

  const desk = window.location.host;
  const project = phase.step === 'paired' ? phase.paired.project : peek?.project;
  return (
    <main className="pair-screen">
      <PairRoute phase={phase.step} desk={desk} />
      {phase.step === 'paired' ? (
        <section className="pair-body" aria-labelledby="pair-title">
          <h1 id="pair-title" className="t-display">
            {t('pair.done')}
          </h1>
          <p className="t-small">{t('pair.doneText', { project: phase.paired.project })}</p>
          <dl className="pair-fields">
            <dt className="t-label">{t('pair.token')}</dt>
            <dd className="mono">{t('pair.tokenKept', { hint: phase.paired.device.hint })}</dd>
            <dt className="t-label">{t('pair.reach')}</dt>
            <dd>{t('pair.reachText')}</dd>
          </dl>
          {standalone ? null : <HomeScreenHint platform={platform} />}
          <div className="pair-bar">
            <Button variant="primary" onClick={() => window.location.assign('/')}>
              {t('pair.open')}
            </Button>
          </div>
        </section>
      ) : (
        <form className="pair-body" aria-labelledby="pair-title" onSubmit={submit}>
          <h1 id="pair-title" className="t-display">
            {project
              ? t('pair.title', { project })
              : standalone
                ? t('pair.titleApp')
                : t('pair.titlePlain')}
          </h1>
          <p className="t-small">
            {scanned ? t('pair.intro') : standalone ? t('pair.introApp') : t('pair.introTyped')}
          </p>
          <dl className="pair-fields">
            <dt className="t-label">
              <label htmlFor="pair-name">{t('pair.name')}</label>
            </dt>
            <dd>
              <input
                id="pair-name"
                className="pair-input"
                value={name}
                maxLength={60}
                autoComplete="off"
                aria-label={t('pair.nameLabel')}
                onChange={(event) => setName(event.target.value)}
              />
            </dd>
            <dt className="t-label">{t('pair.deskField')}</dt>
            <dd className="mono">{desk}</dd>
            <dt className="t-label">
              <label htmlFor="pair-code">{t('pair.code')}</label>
            </dt>
            <dd>
              {scanned ? (
                <span className="mono">
                  {code}
                  {peek ? ` · ${t('pair.left', { left: timeLeft(peek.expiresAt, now) })}` : ''}
                </span>
              ) : (
                <input
                  id="pair-code"
                  className="pair-input mono"
                  value={code}
                  placeholder="XXXX-XXXX"
                  autoComplete="one-time-code"
                  autoCapitalize="characters"
                  spellCheck={false}
                  aria-label={t('pair.codeLabel')}
                  onChange={(event) => setCode(event.target.value)}
                />
              )}
            </dd>
          </dl>
          {error ? (
            <p className="pair-error action-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="pair-bar">
            <Button
              type="submit"
              variant="primary"
              disabled={phase.step === 'pairing' || code.trim() === '' || name.trim() === ''}
            >
              {phase.step === 'pairing' ? t('pair.going') : t('pair.go')}
            </Button>
          </div>
        </form>
      )}
    </main>
  );
}
