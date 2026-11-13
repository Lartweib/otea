import { useCallback, useEffect, useState } from 'react';
import { choosePhoneTransport, fetchPhone } from '../api.ts';
import { type MessageKey, type PlainKey, t, tx } from '../i18n/i18n.ts';
import { Button } from '../kit/index.ts';
import type { PhoneStatus, TailscaleCheck, TransportKind } from '../types.ts';
import { CopyCommand } from './CopyCommand.tsx';

// Configuración · Teléfono: how a phone reaches Otea. The transports are interchangeable: the local
// network (the default, otea serve --lan), Tailscale (set up here: Otea runs tailscale serve on this
// computer, never an installer) and the Otea relay, which is not available yet. Whichever carries
// the phone, it pairs with a code from this computer and only paired devices get in.

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

const OPTIONS: readonly { kind: TransportKind; name: PlainKey; text: PlainKey }[] = [
  { kind: 'lan', name: 'phone.transport.lan', text: 'phone.transport.lanText' },
  { kind: 'tailscale', name: 'phone.transport.tailscale', text: 'phone.transport.tailscaleText' },
  { kind: 'relay', name: 'phone.transport.relay', text: 'phone.transport.relayText' },
];

function Option({
  kind,
  name,
  text,
  checked,
  disabled,
  onChoose,
}: {
  kind: TransportKind;
  name: PlainKey;
  text: PlainKey;
  checked: boolean;
  disabled: boolean;
  onChoose: (kind: TransportKind) => void;
}) {
  const tag =
    kind === 'relay'
      ? t('phone.transport.soon')
      : kind === 'lan'
        ? t('phone.transport.default')
        : null;
  return (
    // biome-ignore lint/a11y/useSemanticElements: a card with a title and a line, not a bare radio input
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      className="ph-opt"
      data-kind={kind}
      disabled={disabled || kind === 'relay'}
      onClick={() => onChoose(kind)}
    >
      <span className="ph-opt-mark" aria-hidden="true" />
      <span className="ph-opt-name">{t(name)}</span>
      {tag ? <span className="ph-opt-tag">{tag}</span> : null}
      <span className="ph-opt-text">{t(text)}</span>
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
  if (status.reachable === null) return t('phone.status.none');
  return status.reachable ? t('phone.status.yes') : t('phone.status.no');
}

export type PhoneTransportViewProps = {
  status: PhoneStatus | null;
  // What the last Tailscale setup found, kept while the transport stays where it was.
  setup: TailscaleCheck | null;
  busy: boolean;
  canWrite: boolean;
  onChoose: (kind: TransportKind) => void;
  onPair: () => void;
};

export function PhoneTransportView({
  status,
  setup,
  busy,
  canWrite,
  onChoose,
  onPair,
}: PhoneTransportViewProps) {
  if (!canWrite) {
    return (
      <p className="pj-hint">
        {tx('phone.transport.signIn', { command: <code className="pj-code">otea open</code> })}
      </p>
    );
  }
  const transport = status?.transport ?? 'lan';
  const check = status?.tailscale ?? setup;
  const found = check && (transport === 'tailscale' || setup) ? problemOf(check) : null;
  const tailscale = transport === 'tailscale';
  const host = tailscale && status?.url ? new URL(status.url).host : null;
  // No address answers (or otea serve runs without --lan, so there is none to try).
  const lanClosed = !tailscale && status !== null && status.reachable !== true;
  return (
    <div className="ph-transport">
      <div className="ph-opts" role="radiogroup" aria-label={t('phone.transport.choose')}>
        {OPTIONS.map((option) => (
          <Option
            key={option.kind}
            {...option}
            checked={option.kind === transport}
            disabled={busy}
            onChoose={onChoose}
          />
        ))}
      </div>
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
      {lanClosed ? (
        <div className="ph-problem" role="status">
          <p>{t('phone.status.lanOff')}</p>
          <CopyCommand command="otea serve --lan" />
        </div>
      ) : null}
      {found ? <ProblemNote found={found} /> : null}
      {tailscale && found ? (
        <Button size="sm" variant="quiet" disabled={busy} onClick={() => onChoose('tailscale')}>
          {t('phone.transport.again')}
        </Button>
      ) : null}
      {tailscale ? (
        <div className="ph-steps">
          <h3>{t('phone.ts.steps')}</h3>
          <ol>
            <li>{t('phone.ts.step1')}</li>
            <li>{t('phone.ts.step2')}</li>
            <li>{t('phone.ts.step3')}</li>
          </ol>
          {host ? (
            <p className="ph-ledger">{tx('phone.ts.ledger', { host: <code>{host}</code> })}</p>
          ) : null}
        </div>
      ) : null}
      {/* Only HTTPS lets the installed app open without this computer: plain HTTP promises none. */}
      <p className="pj-hint">
        {t(tailscale ? 'phone.transport.offline' : 'phone.transport.lanOnly')}
      </p>
      <p className="pj-hint">{t('phone.transport.tokens')}</p>
      <div className="ph-acts">
        <Button size="sm" variant="primary" onClick={onPair}>
          {t('phone.transport.pair')}
        </Button>
      </div>
    </div>
  );
}

// The section's data: the status from the server, and the transport the person picks.
export function PhoneTransport({ canWrite, onPair }: { canWrite: boolean; onPair: () => void }) {
  const [status, setStatus] = useState<PhoneStatus | null>(null);
  const [setup, setSetup] = useState<TailscaleCheck | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | undefined>();

  const load = useCallback((signal: AbortSignal) => {
    fetchPhone(signal).then(setStatus, (error: unknown) => {
      if (!signal.aborted) setFailure(error instanceof Error ? error.message : '');
    });
  }, []);

  useEffect(() => {
    if (!canWrite) return undefined;
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [canWrite, load]);

  const choose = (kind: TransportKind) => {
    if (kind === 'relay' || (kind === status?.transport && kind === 'lan')) return;
    setBusy(true);
    setFailure(undefined);
    choosePhoneTransport(kind)
      .then((next) => {
        setStatus(next);
        setSetup(kind === 'tailscale' ? next.tailscale : null);
      })
      .catch((error: unknown) => setFailure(error instanceof Error ? error.message : ''))
      .finally(() => setBusy(false));
  };

  return (
    <>
      <PhoneTransportView
        status={status}
        setup={setup}
        busy={busy}
        canWrite={canWrite}
        onChoose={choose}
        onPair={onPair}
      />
      {failure ? (
        <p className="dhint" role="alert">
          {failure}
        </p>
      ) : null}
    </>
  );
}
