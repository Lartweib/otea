import { type ReactNode, useCallback, useEffect, useState } from 'react';
import {
  choosePhoneTransport,
  closeLan,
  fetchPhone,
  fetchTailscaleGuide,
  openLan,
  serveOverTailscale,
} from '../api.ts';
import { type MessageKey, type PlainKey, t, tx } from '../i18n/i18n.ts';
import { Button } from '../kit/index.ts';
import { qrPath } from '../pairing.ts';
import type {
  GuideStep,
  PhoneStatus,
  StoreLink,
  TailscaleCheck,
  TailscaleGuide,
} from '../types.ts';
import { CopyCommand } from './CopyCommand.tsx';

// Configuración · Teléfono: how you reach Otea, three options side by side, each with what it
// needs, what it gives and what you lose: only on this computer (the local network closed), from
// the phone at home (the local network open, plain HTTP) and from anywhere with Tailscale (HTTPS,
// with notifications). The one in use is read from the server. Tailscale leads into guided steps,
// each read on this computer; Otea never changes Tailscale by itself, and runs the one command it
// shows only once the person confirms it. Whichever carries the phone, it pairs with a code from
// this computer and only paired devices get in.

// What stops Tailscale, as the person reads it: the words, the command to run, the page to open.
export type Problem = {
  key: MessageKey;
  text: string;
  commands: string[];
  link: { href: string; label: string } | null;
};

const problem = (
  key: MessageKey,
  text: string,
  commands: string[] = [],
  link: Problem['link'] = null,
): Problem => ({ key, text, commands, link });

export function problemOf(check: TailscaleCheck): Problem | null {
  switch (check.state) {
    case 'ready':
      return check.serving ? null : problem('phone.ts.notServing', t('phone.ts.notServing'));
    case 'missing':
      return problem('phone.ts.missing', t('phone.ts.missing'), check.install.commands, {
        href: check.install.link,
        label: t('phone.ts.download'),
      });
    case 'logged_out':
      return problem(
        'phone.ts.loggedOut',
        t('phone.ts.loggedOut'),
        ['tailscale up'],
        check.authUrl ? { href: check.authUrl, label: t('phone.ts.logIn') } : null,
      );
    case 'no_magic_dns':
      return problem('phone.ts.noMagicDns', t('phone.ts.noMagicDns'), [], {
        href: check.settings,
        label: t('phone.ts.dnsSettings'),
      });
    case 'no_https':
      return problem('phone.ts.noHttps', t('phone.ts.noHttps'), [], {
        href: check.settings,
        label: t('phone.ts.dnsSettings'),
      });
    case 'taken':
      return problem(
        'phone.ts.taken',
        t('phone.ts.taken', { url: `https://${check.host}`, target: check.target }),
        ['tailscale serve --https=443 off'],
      );
    case 'failed':
      return problem('phone.ts.failed', t('phone.ts.failed', { message: check.message }));
  }
}

export type Reach = 'local' | 'lan' | 'tailscale';

// Which option is in use now, from the server's status.
export function reachOf(status: PhoneStatus | null): Reach | null {
  if (!status) return null;
  if (status.transport === 'tailscale') return 'tailscale';
  return status.lanOpen ? 'lan' : 'local';
}

type ReachWords = {
  name: PlainKey;
  what: PlainKey;
  needs: PlainKey;
  gives: PlainKey;
  loses: PlainKey;
};

const REACHES: readonly ({ kind: Reach } & ReachWords)[] = [
  {
    kind: 'local',
    name: 'phone.reach.local',
    what: 'phone.reach.localWhat',
    needs: 'phone.reach.localNeeds',
    gives: 'phone.reach.localGives',
    loses: 'phone.reach.localLoses',
  },
  {
    kind: 'lan',
    name: 'phone.reach.lan',
    what: 'phone.reach.lanWhat',
    needs: 'phone.reach.lanNeeds',
    gives: 'phone.reach.lanGives',
    loses: 'phone.reach.lanLoses',
  },
  {
    kind: 'tailscale',
    name: 'phone.reach.tailscale',
    what: 'phone.reach.tailscaleWhat',
    needs: 'phone.reach.tailscaleNeeds',
    gives: 'phone.reach.tailscaleGives',
    loses: 'phone.reach.tailscaleLoses',
  },
];

function Option({
  kind,
  words,
  inUse,
  shown,
  disabled,
  onPick,
}: {
  kind: Reach;
  words: ReachWords;
  inUse: boolean;
  shown: boolean;
  disabled: boolean;
  onPick: (kind: Reach) => void;
}) {
  const row = (label: PlainKey, text: PlainKey) => (
    <span className="ph-opt-row">
      <span className="ph-opt-label">{t(label)}</span>
      <span>{t(text)}</span>
    </span>
  );
  return (
    // biome-ignore lint/a11y/useSemanticElements: a card with a title and lines, not a bare radio input
    <button
      type="button"
      role="radio"
      aria-checked={inUse}
      data-kind={kind}
      data-shown={shown || undefined}
      className="ph-opt"
      disabled={disabled}
      onClick={() => onPick(kind)}
    >
      <span className="ph-opt-mark" aria-hidden="true" />
      <span className="ph-opt-name">{t(words.name)}</span>
      {inUse ? <span className="ph-opt-tag">{t('phone.transport.inUse')}</span> : null}
      <span className="ph-opt-text">{t(words.what)}</span>
      {row('phone.reach.needs', words.needs)}
      {row('phone.reach.gives', words.gives)}
      {row('phone.reach.loses', words.loses)}
    </button>
  );
}

function ProblemNote({ found }: { found: Problem }) {
  return (
    <div className="ph-problem" role="status">
      <p>{found.text}</p>
      {found.commands.map((command) => (
        <CopyCommand key={command} command={command} />
      ))}
      {found.link ? (
        <a className="ph-link" href={found.link.href} target="_blank" rel="noreferrer noopener">
          {found.link.label}
        </a>
      ) : null}
    </div>
  );
}

function reachLabel(status: PhoneStatus | null): string {
  if (!status) return t('phone.status.loading');
  if (status.transport === 'lan' && !status.lanOpen) return t('phone.status.closed');
  if (status.reachable === null) return t('phone.status.none');
  return status.reachable ? t('phone.status.yes') : t('phone.status.no');
}

function StoreCode({ store, label }: { store: StoreLink; label: string }) {
  const { size, cells } = store.qr;
  return (
    <a className="ph-store" href={store.url} target="_blank" rel="noreferrer noopener">
      <svg
        className="qr ph-store-qr"
        viewBox={`-1 -1 ${size + 2} ${size + 2}`}
        role="img"
        aria-label={label}
        shapeRendering="crispEdges"
      >
        <path d={qrPath(cells)} className="qr-ink" />
      </svg>
      <span>{label}</span>
    </a>
  );
}

function Step({
  step,
  n,
  done,
  title,
  children,
}: {
  step: GuideStep;
  n: number;
  done: boolean;
  title: string;
  children: ReactNode;
}) {
  return (
    <li className="ph-step" data-step={step} data-done={done}>
      <span className="ph-step-mark" aria-hidden="true">
        {done ? '✓' : n}
      </span>
      <div className="ph-step-body">
        <h4>
          {title}
          <span className="ph-step-state">
            {done ? t('phone.guide.done') : t('phone.guide.pending')}
          </span>
        </h4>
        {children}
      </div>
    </li>
  );
}

export type GuideProps = {
  guide: TailscaleGuide;
  inUse: boolean;
  confirming: boolean;
  busy: boolean;
  onCheck: () => void;
  onUseTailscale: () => void;
  onAskServe: () => void;
  onConfirmServe: () => void;
  onCancelServe: () => void;
  onPair: () => void;
};

export function TailscaleSteps({
  guide,
  inUse,
  confirming,
  busy,
  onCheck,
  onUseTailscale,
  onAskServe,
  onConfirmServe,
  onCancelServe,
  onPair,
}: GuideProps) {
  const { done, check } = guide;
  const url = `https://${guide.host ?? '<machine>.<tailnet>.ts.net'}`;
  const signInProblem = done.pc && check.state === 'logged_out' ? problemOf(check) : null;
  const serveProblem =
    check.state === 'taken' || check.state === 'failed' ? problemOf(check) : null;
  // Only once every step before it holds and the HTTPS name forwards nowhere yet.
  const canServe = check.state === 'ready' && !check.serving && done.pc && done.https;
  return (
    <section className="ph-guide" aria-label={t('phone.guide.title')}>
      <h3>{t('phone.guide.title')}</h3>
      <p className="pj-hint">{t('phone.guide.lead')}</p>
      <ol className="ph-steps-list">
        <Step step="phone" n={1} done={done.phone} title={t('phone.guide.phone')}>
          <p>{done.phone ? t('phone.guide.phoneSeen') : t('phone.guide.phoneText')}</p>
          <div className="ph-stores">
            <StoreCode store={guide.stores.android} label={t('phone.guide.android')} />
            <StoreCode store={guide.stores.ios} label={t('phone.guide.ios')} />
          </div>
        </Step>
        <Step step="pc" n={2} done={done.pc} title={t('phone.guide.pc')}>
          {done.pc ? null : (
            <>
              <p>{t('phone.guide.pcText')}</p>
              {guide.install.commands.map((command) => (
                <CopyCommand key={command} command={command} />
              ))}
              <a
                className="ph-link"
                href={guide.install.link}
                target="_blank"
                rel="noreferrer noopener"
              >
                {t('phone.ts.download')}
              </a>
            </>
          )}
        </Step>
        <Step step="signIn" n={3} done={done.signIn} title={t('phone.guide.signIn')}>
          <p>{t('phone.guide.signInText')}</p>
          {guide.signedIn && !done.signIn ? (
            <p className="pj-hint">{t('phone.guide.signedIn')}</p>
          ) : null}
          {signInProblem ? <ProblemNote found={signInProblem} /> : null}
        </Step>
        <Step step="https" n={4} done={done.https} title={t('phone.guide.https')}>
          <p>{t('phone.guide.httpsText')}</p>
          <a className="ph-link" href={guide.settings} target="_blank" rel="noreferrer noopener">
            {t('phone.guide.dnsPage')}
          </a>
          {guide.host ? (
            <p className="ph-ledger">
              {tx('phone.ts.ledger', { host: <code>{guide.host}</code> })}
            </p>
          ) : null}
        </Step>
        <Step step="serve" n={5} done={done.serve} title={t('phone.guide.serve')}>
          <p>
            {done.serve ? t('phone.guide.served', { url }) : t('phone.guide.serveText', { url })}
          </p>
          <CopyCommand command={guide.command} />
          <p className="pj-hint">{t('phone.guide.undo')}</p>
          <CopyCommand command={guide.undo} small />
          {serveProblem ? <ProblemNote found={serveProblem} /> : null}
          {canServe && !confirming ? (
            <div className="ph-acts">
              <Button size="sm" variant="primary" disabled={busy} onClick={onAskServe}>
                {t('phone.guide.run')}
              </Button>
              <span className="pj-hint">{t('phone.guide.runHint')}</span>
            </div>
          ) : null}
          {canServe && confirming ? (
            <div className="ph-confirm" role="alertdialog" aria-label={t('phone.guide.confirm')}>
              <p className="ph-confirm-q">{t('phone.guide.confirm')}</p>
              <code className="ph-confirm-cmd">{guide.command}</code>
              <p className="pj-hint">{t('phone.guide.confirmText')}</p>
              <div className="ph-acts">
                <Button size="sm" variant="primary" disabled={busy} onClick={onConfirmServe}>
                  {t('phone.guide.yes')}
                </Button>
                <Button size="sm" variant="quiet" disabled={busy} onClick={onCancelServe}>
                  {t('phone.guide.no')}
                </Button>
              </div>
            </div>
          ) : null}
          {done.serve && !inUse ? (
            <div className="ph-acts">
              <Button size="sm" variant="primary" disabled={busy} onClick={onUseTailscale}>
                {t('phone.guide.use')}
              </Button>
            </div>
          ) : null}
        </Step>
        <Step step="pair" n={6} done={done.pair} title={t('phone.guide.pair')}>
          <p>{done.pair ? t('phone.guide.pairDone') : t('phone.guide.pairText', { url })}</p>
          {inUse ? (
            <div className="ph-acts">
              <Button size="sm" variant="primary" disabled={busy} onClick={onPair}>
                {t('phone.transport.pair')}
              </Button>
            </div>
          ) : null}
        </Step>
      </ol>
      <Button size="sm" variant="quiet" disabled={busy} onClick={onCheck}>
        {t('phone.transport.again')}
      </Button>
    </section>
  );
}

export type PhoneTransportViewProps = {
  status: PhoneStatus | null;
  // The guided steps to Tailscale, once read.
  guide: TailscaleGuide | null;
  // The option the person opened, when it is not the one in use (Tailscale, before it is ready).
  picked: Reach | null;
  confirming: boolean;
  busy: boolean;
  canWrite: boolean;
  onPick: (kind: Reach) => void;
  onPair: () => void;
  onCheck: () => void;
  onUseTailscale: () => void;
  onAskServe: () => void;
  onConfirmServe: () => void;
  onCancelServe: () => void;
};

export function PhoneTransportView({
  status,
  guide,
  picked,
  confirming,
  busy,
  canWrite,
  onPick,
  onPair,
  onCheck,
  onUseTailscale,
  onAskServe,
  onConfirmServe,
  onCancelServe,
}: PhoneTransportViewProps) {
  if (!canWrite) {
    return (
      <p className="pj-hint">
        {tx('phone.transport.signIn', { command: <code className="pj-code">otea open</code> })}
      </p>
    );
  }
  const active = reachOf(status);
  const shown = picked ?? active;
  const tailscale = status?.transport === 'tailscale';
  return (
    <div className="ph-transport">
      <div className="ph-opts" role="radiogroup" aria-label={t('phone.reach.choose')}>
        {REACHES.map(({ kind, ...words }) => (
          <Option
            key={kind}
            kind={kind}
            words={words}
            inUse={kind === active}
            shown={kind === shown}
            disabled={busy || status === null}
            onPick={onPick}
          />
        ))}
      </div>
      {active === 'local' && status?.firewallPrompt ? (
        <p className="pj-hint">{t('phone.lan.firewall')}</p>
      ) : null}
      <dl className="pj-storage ph-status" aria-busy={busy}>
        <dt>{t('phone.status.transport')}</dt>
        <dd>
          {busy
            ? t('phone.transport.settingUp')
            : t(tailscale ? 'phone.transport.tailscale' : 'phone.transport.lan')}
        </dd>
        <dt>{t('phone.status.url')}</dt>
        <dd>
          <span className="pj-mono">{status?.url ?? '—'}</span>
        </dd>
        <dt>{t('phone.status.reachable')}</dt>
        <dd>
          <span className="ph-reach" data-ok={status?.reachable ?? undefined}>
            <span className="ph-dot" aria-hidden="true" />
            {reachLabel(status)}
          </span>
        </dd>
      </dl>
      {shown === 'tailscale' && guide ? (
        <TailscaleSteps
          guide={guide}
          inUse={tailscale}
          confirming={confirming}
          busy={busy}
          onCheck={onCheck}
          onUseTailscale={onUseTailscale}
          onAskServe={onAskServe}
          onConfirmServe={onConfirmServe}
          onCancelServe={onCancelServe}
          onPair={onPair}
        />
      ) : null}
      {/* Only HTTPS lets the installed app open without this computer: plain HTTP promises none. */}
      <p className="pj-hint">
        {t(tailscale ? 'phone.transport.offline' : 'phone.transport.lanOnly')}
      </p>
      <p className="pj-hint">{t('phone.transport.tokens')}</p>
      {active === 'lan' || (active === 'tailscale' && shown !== 'tailscale') ? (
        <div className="ph-acts">
          <Button size="sm" variant="primary" disabled={busy} onClick={onPair}>
            {t('phone.transport.pair')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : '');

// The section's data: the status from the server, the guide while Tailscale is open, and what the
// person picks. A pick opens or closes the local network (Otea's own setting); Tailscale opens its
// steps and changes nothing until the person confirms the command they show.
export function PhoneTransport({ canWrite, onPair }: { canWrite: boolean; onPair: () => void }) {
  const [status, setStatus] = useState<PhoneStatus | null>(null);
  const [guide, setGuide] = useState<TailscaleGuide | null>(null);
  const [picked, setPicked] = useState<Reach | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | undefined>();

  const load = useCallback((signal: AbortSignal) => {
    fetchPhone(signal).then(setStatus, (error: unknown) => {
      if (!signal.aborted) setFailure(messageOf(error));
    });
  }, []);

  const readGuide = useCallback((signal: AbortSignal = new AbortController().signal) => {
    fetchTailscaleGuide(signal).then(setGuide, (error: unknown) => {
      if (!signal.aborted) setFailure(messageOf(error));
    });
  }, []);

  useEffect(() => {
    if (!canWrite) return undefined;
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [canWrite, load]);

  const shown = picked ?? reachOf(status);
  useEffect(() => {
    if (!canWrite || shown !== 'tailscale') return undefined;
    const controller = new AbortController();
    readGuide(controller.signal);
    return () => controller.abort();
  }, [canWrite, shown, readGuide]);

  // One change at a time; the status comes back with it.
  const act = (change: () => Promise<PhoneStatus>, then?: () => void) => {
    setBusy(true);
    setFailure(undefined);
    change()
      .then((next) => {
        setStatus(next);
        then?.();
      })
      .catch((error: unknown) => setFailure(messageOf(error)))
      .finally(() => setBusy(false));
  };

  const pick = (kind: Reach) => {
    setConfirming(false);
    if (kind === 'tailscale') {
      setPicked('tailscale');
      return;
    }
    setPicked(null);
    if (kind === reachOf(status)) return;
    const change = kind === 'lan' ? openLan : closeLan;
    act(
      status?.transport === 'tailscale'
        ? () => choosePhoneTransport('lan').then(() => change())
        : change,
    );
  };

  return (
    <>
      <PhoneTransportView
        status={status}
        guide={guide}
        picked={picked}
        confirming={confirming}
        busy={busy}
        canWrite={canWrite}
        onPick={pick}
        onPair={onPair}
        onCheck={() => readGuide()}
        onUseTailscale={() =>
          act(
            () => choosePhoneTransport('tailscale'),
            () => readGuide(),
          )
        }
        onAskServe={() => setConfirming(true)}
        onCancelServe={() => setConfirming(false)}
        onConfirmServe={() => {
          if (!guide) return;
          const { command } = guide;
          setConfirming(false);
          act(
            () => serveOverTailscale(command),
            () => readGuide(),
          );
        }}
      />
      {failure ? (
        <p className="dhint" role="alert">
          {failure}
        </p>
      ) : null}
    </>
  );
}
