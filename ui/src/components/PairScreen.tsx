import { type FormEvent, useEffect, useState } from 'react';
import { PairingRefused, pairDevice, peekPairing } from '../api.ts';
import { browserStore, isStandalone } from '../home-screen.ts';
import { type PlainKey, t, useLanguage } from '../i18n/i18n.ts';
import { Button } from '../kit/index.ts';
import { codeFromHash, deviceNameFrom, pairedHome, reachesAnywhere, timeLeft } from '../pairing.ts';
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
function PairRoute({
  phase,
  desk,
  already,
}: {
  phase: Phase['step'];
  desk: string;
  already: boolean;
}) {
  const note =
    phase === 'paired'
      ? t('pair.pairedNow')
      : phase === 'pairing'
        ? t('pair.exchanging')
        : already
          ? t('pair.alreadyPaired')
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

  // The home-screen app left on this screen, once paired again from the browser (the two share
  // the key on Android): it goes to the app as soon as the key works, and each time it comes back
  // to the front (TS-12).
  useEffect(() => {
    if (!standalone || scanned) return undefined;
    const tryIn = () => {
      fetch('/api/session', { headers: { accept: 'application/json' } })
        .then((response) => {
          if (response.ok) window.location.replace(pairedHome(browserStore()));
        })
        .catch(() => undefined);
    };
    tryIn();
    const front = () => {
      if (document.visibilityState === 'visible') tryIn();
    };
    document.addEventListener('visibilitychange', front);
    return () => document.removeEventListener('visibilitychange', front);
  }, [standalone, scanned]);

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
  const computer = phase.step === 'paired' ? phase.paired.computer : peek?.computer;
  const anywhere = reachesAnywhere(window.location.hostname, window.isSecureContext);
  const already = peek?.paired === true;
  return (
    <main className="pair-screen">
      <PairRoute phase={phase.step} desk={desk} already={already} />
      {phase.step === 'paired' ? (
        <section className="pair-body" aria-labelledby="pair-title">
          <h1 id="pair-title" className="t-display">
            {t('pair.done')}
          </h1>
          <p className="t-small">
            {t(anywhere ? 'pair.doneTextAnywhere' : 'pair.doneText', {
              computer: phase.paired.computer,
            })}
          </p>
          <dl className="pair-fields">
            <dt className="t-label">{t('pair.token')}</dt>
            <dd className="mono">{t('pair.tokenKept', { hint: phase.paired.device.hint })}</dd>
            <dt className="t-label">{t('pair.reach')}</dt>
            <dd>{t(anywhere ? 'pair.reachAnywhere' : 'pair.reachText')}</dd>
          </dl>
          {/* Installing is offered once, by the app's own banner, with Chrome's prompt where it
              fires (TS-9). */}
          <div className="pair-bar">
            <Button
              variant="primary"
              onClick={() => window.location.assign(pairedHome(browserStore()))}
            >
              {t('pair.open')}
            </Button>
          </div>
        </section>
      ) : (
        <form className="pair-body" aria-labelledby="pair-title" onSubmit={submit}>
          <h1 id="pair-title" className="t-display">
            {computer
              ? t('pair.title', { computer })
              : standalone
                ? t('pair.titleApp')
                : t('pair.titlePlain')}
          </h1>
          <p className="t-small">
            {already
              ? t('pair.introAgain')
              : scanned
                ? t('pair.intro')
                : standalone
                  ? t('pair.introApp')
                  : t('pair.introTyped')}
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
