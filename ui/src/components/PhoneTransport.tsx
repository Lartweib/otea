import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
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
      return problem(
        'phone.ts.failed',
        t('phone.ts.failed', { message: check.message.trim().replace(/\.$/, '') }),
      );
  }
}

export type Reach = 'local' | 'lan' | 'tailscale';

// Which option is in use now, from the server's status.
export function reachOf(status: PhoneStatus | null): Reach | null {
  if (!status) return null;
  if (status.transport === 'tailscale') return 'tailscale';
  return status.lanOpen ? 'lan' : 'local';
}

// What the section shows, from one place, so the cards, the status, the guide and the lines under
// them never disagree: the option in use (the server's), the one chosen (the person's pick, else
// the one in use) and whether the chosen one is still being set up (Tailscale before it serves).
export type Shown = { active: Reach | null; chosen: Reach | null; pending: boolean };

export function shownOf(status: PhoneStatus | null, picked: Reach | null): Shown {
  const active = reachOf(status);
  const chosen = picked ?? active;
  return { active, chosen, pending: chosen !== null && active !== null && chosen !== active };
}

// What a change is doing while it runs: switching options, running the command, reading again.
export type Doing = 'switch' | 'serve' | 'check';

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

const nameOf = (kind: Reach): PlainKey =>
  REACHES.find((reach) => reach.kind === kind)?.name ?? 'phone.reach.local';

// The card's tag: in use; chosen but still to set up; or in use only until the chosen one is.
function tagOf(kind: Reach, shown: Shown): PlainKey | null {
  if (kind === shown.chosen)
    return shown.pending ? 'phone.transport.toSetUp' : 'phone.transport.inUse';
  if (kind === shown.active) return 'phone.transport.inUseForNow';
  return null;
}

function Option({
  kind,
  words,
  shown,
  disabled,
  onPick,
}: {
  kind: Reach;
  words: ReachWords;
  shown: Shown;
  disabled: boolean;
  onPick: (kind: Reach) => void;
}) {
  const row = (label: PlainKey, text: PlainKey) => (
    <span className="ph-opt-row">
      <span className="ph-opt-label">{t(label)}</span>
      <span>{t(text)}</span>
    </span>
  );
  const tag = tagOf(kind, shown);
  const chosen = kind === shown.chosen;
  return (
    // biome-ignore lint/a11y/useSemanticElements: a card with a title and lines, not a bare radio input
    <button
      type="button"
      role="radio"
      aria-checked={chosen}
      aria-disabled={disabled || undefined}
      data-kind={kind}
      data-pending={(chosen && shown.pending) || undefined}
      className="ph-opt"
      onClick={() => {
        if (!disabled) onPick(kind);
      }}
    >
      <span className="ph-opt-mark" aria-hidden="true" />
      <span className="ph-opt-head">
        <span className="ph-opt-name">{t(words.name)}</span>
        {tag ? (
          <span className="ph-opt-tag" data-tag={tag}>
            {t(tag)}
          </span>
        ) : null}
      </span>
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

// `settling`: just served, Tailscale may still be fetching its certificate (seconds): a fresh "no
// answer" is not one yet (TS-8).
function reachLabel(status: PhoneStatus, settling = false): string {
  if (status.reachable === null) return t('phone.status.none');
  if (settling && !status.reachable) return t('phone.status.loading');
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
  partial = false,
  title,
  children,
}: {
  step: GuideStep;
  n: number;
  done: boolean;
  // Halfway: the phone paired, notifications still off.
  partial?: boolean;
  title: string;
  children: ReactNode;
}) {
  const state = done ? 'phone.guide.done' : partial ? 'phone.guide.partial' : 'phone.guide.pending';
  return (
    <li
      className="ph-step"
      data-step={step}
      data-done={done}
      data-partial={(partial && !done) || undefined}
    >
      <span className="ph-step-mark" aria-hidden="true">
        {done ? '✓' : n}
      </span>
      <div className="ph-step-body">
        <h4>
          {title}
          <span className="ph-step-state">{t(state)}</span>
        </h4>
        {children}
      </div>
    </li>
  );
}

const STEP_COUNT = 6;

export type GuideProps = {
  guide: TailscaleGuide;
  inUse: boolean;
  // What stays in use until Tailscale serves, while it is being set up.
  meanwhile: Reach | null;
  // What the last Run this command answered, when it did not leave Otea served.
  ran: TailscaleCheck | null;
  // Check again finished reading.
  checked: boolean;
  confirming: boolean;
  busy: Doing | null;
  failure?: string | undefined;
  onCheck: () => void;
  onAskServe: () => void;
  onConfirmServe: () => void;
  onCancelServe: () => void;
  onPair: () => void;
};

export function TailscaleSteps({
  guide,
  inUse,
  meanwhile,
  ran,
  checked,
  confirming,
  busy,
  failure,
  onCheck,
  onAskServe,
  onConfirmServe,
  onCancelServe,
  onPair,
}: GuideProps) {
  const { done, check } = guide;
  const url = guide.host ? `https://${guide.host}` : t('phone.guide.someHost');
  // Tailscale itself answered with an error: it stops every step, so it goes above them.
  const stuck = check.state === 'failed' ? problemOf(check) : null;
  const signInProblem = done.pc && check.state === 'logged_out' ? problemOf(check) : null;
  const serveProblem = check.state === 'taken' ? problemOf(check) : null;
  const ranProblem = ran && !(ran.state === 'ready' && ran.serving) ? problemOf(ran) : null;
  // Only once every step before it holds and the HTTPS name forwards nowhere yet.
  const canServe = check.state === 'ready' && !check.serving && done.pc && done.https;
  const doneCount = Object.values(done).filter(Boolean).length;
  const paired = !done.pair && guide.pairing === 'paired';
  // Every step done: the guide folds into a short Listo, and opens again on demand.
  const [open, setOpen] = useState(false);
  const allDone = doneCount === STEP_COUNT;

  // The question takes the focus (its safe answer first); canceled, the focus goes back to the
  // button that asked it.
  const cancelRef = useRef<HTMLButtonElement>(null);
  const runRef = useRef<HTMLButtonElement>(null);
  const refocus = useRef(false);
  useEffect(() => {
    if (confirming) cancelRef.current?.focus();
    else if (refocus.current) {
      refocus.current = false;
      runRef.current?.focus();
    }
  }, [confirming]);
  const cancel = () => {
    refocus.current = true;
    onCancelServe();
  };

  if (allDone && !open) {
    return (
      <section className="ph-guide ph-ready" aria-labelledby="ph-guide-title">
        <h3 id="ph-guide-title">
          <span className="ph-ready-mark" aria-hidden="true">
            ✓
          </span>
          {t('phone.ready.title')}
        </h3>
        <p>{t('phone.ready.text')}</p>
        <div className="ph-acts">
          <Button size="sm" variant="quiet" aria-expanded={false} onClick={() => setOpen(true)}>
            {t('phone.ready.show')}
          </Button>
          {inUse ? (
            <Button size="sm" variant="quiet" disabled={busy !== null} onClick={onPair}>
              {t('phone.transport.pair')}
            </Button>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section className="ph-guide" aria-labelledby="ph-guide-title">
      <h3 id="ph-guide-title">{t('phone.guide.title')}</h3>
      {allDone ? (
        <div className="ph-acts">
          <Button size="sm" variant="quiet" aria-expanded onClick={() => setOpen(false)}>
            {t('phone.ready.hide')}
          </Button>
        </div>
      ) : null}
      <p className="pj-hint">{t('phone.guide.lead')}</p>
      {meanwhile ? (
        <p className="ph-meanwhile">
          {t('phone.guide.meanwhile', { option: t(nameOf(meanwhile)) })}
        </p>
      ) : null}
      {stuck ? <ProblemNote found={stuck} /> : null}
      <ol className="ph-steps-list">
        <Step step="phone" n={1} done={done.phone} title={t('phone.guide.phone')}>
          {done.phone ? (
            <p>{t('phone.guide.phoneSeen')}</p>
          ) : (
            <>
              <p>{t('phone.guide.phoneText')}</p>
              <p className="pj-hint">{t('phone.guide.phoneUnseen')}</p>
              <div className="ph-stores">
                <StoreCode store={guide.stores.android} label={t('phone.guide.android')} />
                <StoreCode store={guide.stores.ios} label={t('phone.guide.ios')} />
              </div>
            </>
          )}
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
          {done.signIn ? (
            <p>{t('phone.guide.signInDone')}</p>
          ) : (
            <>
              <p>{t('phone.guide.signInText')}</p>
              {guide.signedIn ? <p className="pj-hint">{t('phone.guide.signedIn')}</p> : null}
              {signInProblem ? <ProblemNote found={signInProblem} /> : null}
            </>
          )}
        </Step>
        <Step step="https" n={4} done={done.https} title={t('phone.guide.https')}>
          {done.https ? (
            <p>{t('phone.guide.httpsDone')}</p>
          ) : (
            <>
              <p>{t('phone.guide.httpsText')}</p>
              <a
                className="ph-link"
                href={guide.settings}
                target="_blank"
                rel="noreferrer noopener"
              >
                {t('phone.guide.dnsPage')}
              </a>
            </>
          )}
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
          {done.serve ? null : <CopyCommand command={guide.command} />}
          {/* Ejecutar este comando sits right under the command it runs, before the undo (TS-15). */}
          {canServe && !confirming ? (
            <div className="ph-acts">
              <Button
                ref={runRef}
                size="sm"
                variant="primary"
                disabled={busy !== null}
                onClick={onAskServe}
              >
                {busy === 'serve' ? t('phone.transport.running') : t('phone.guide.run')}
              </Button>
              <span className="pj-hint">{t('phone.guide.runHint')}</span>
            </div>
          ) : null}
          {canServe && confirming ? (
            <div
              className="ph-confirm"
              role="alertdialog"
              aria-labelledby="ph-confirm-q"
              aria-describedby="ph-confirm-text"
              onKeyDown={(event) => {
                if (event.key === 'Escape') cancel();
              }}
            >
              <p className="ph-confirm-q" id="ph-confirm-q">
                {t('phone.guide.confirm')}
              </p>
              <code className="ph-confirm-cmd">{guide.command}</code>
              <p className="pj-hint" id="ph-confirm-text">
                {t('phone.guide.confirmText')}
              </p>
              <div className="ph-acts">
                <Button
                  size="sm"
                  variant="primary"
                  disabled={busy !== null}
                  onClick={onConfirmServe}
                >
                  {t('phone.guide.yes')}
                </Button>
                <Button
                  ref={cancelRef}
                  size="sm"
                  variant="quiet"
                  disabled={busy !== null}
                  onClick={cancel}
                >
                  {t('phone.guide.no')}
                </Button>
              </div>
            </div>
          ) : null}
          {serveProblem ? null : (
            <>
              <p className="pj-hint">{t('phone.guide.undo')}</p>
              <CopyCommand command={guide.undo} small />
            </>
          )}
          {serveProblem ? <ProblemNote found={serveProblem} /> : null}
          {ranProblem && !done.serve ? <ProblemNote found={ranProblem} /> : null}
        </Step>
        <Step step="pair" n={6} done={done.pair} partial={paired} title={t('phone.guide.pair')}>
          <p>
            {done.pair
              ? t('phone.guide.pairDone')
              : paired
                ? t('phone.guide.pairPartial')
                : t('phone.guide.pairText', { url })}
          </p>
          {inUse && done.serve ? (
            <div className="ph-acts">
              <Button size="sm" variant="primary" disabled={busy !== null} onClick={onPair}>
                {t('phone.transport.pair')}
              </Button>
            </div>
          ) : null}
        </Step>
      </ol>
      <div className="ph-acts ph-check">
        <Button size="sm" variant="quiet" disabled={busy !== null} onClick={onCheck}>
          {busy === 'check' ? t('phone.guide.checking') : t('phone.transport.again')}
        </Button>
        <span className="pj-hint" role="status">
          {checked && busy !== 'check'
            ? t('phone.guide.checked', { done: doneCount, total: STEP_COUNT })
            : ''}
        </span>
      </div>
      {failure ? (
        <p className="dhint" role="alert">
          {failure}
        </p>
      ) : null}
    </section>
  );
}

export type PhoneTransportViewProps = {
  status: PhoneStatus | null;
  // The guided steps to Tailscale, once read.
  guide: TailscaleGuide | null;
  // The option the person opened, when it is not the one in use (Tailscale, before it is ready).
  picked: Reach | null;
  ran?: TailscaleCheck | null;
  // Just served, and nothing answered yet: the status is being read again (TS-8).
  settling?: boolean;
  checked?: boolean;
  confirming: boolean;
  busy: Doing | null;
  failure?: string | undefined;
  canWrite: boolean;
  onPick: (kind: Reach) => void;
  onPair: () => void;
  onCheck: () => void;
  onCloseLan?: (() => void) | undefined;
  onAskServe: () => void;
  onConfirmServe: () => void;
  onCancelServe: () => void;
};

// A change running: switching options, or the confirmed command (Check again only reads).
const busyLabel = (busy: Doing): string =>
  busy === 'serve' ? t('phone.transport.running') : t('phone.transport.changing');

// What carries the phone now, read from the server: nothing (Otea stays on this computer), the
// local network or Tailscale, with the address a phone opens and whether Otea answers there.
function StatusRows({
  status,
  active,
  busy,
  phoneOnline,
  settling,
  onCloseLan,
}: {
  status: PhoneStatus | null;
  active: Reach | null;
  busy: Doing | null;
  settling: boolean;
  // From the Tailscale guide: false only when Tailscale says the phone is offline now.
  phoneOnline: boolean | null;
  onCloseLan?: (() => void) | undefined;
}) {
  const transport = (() => {
    if (busy && busy !== 'check') return busyLabel(busy);
    if (!status || !active) return t('phone.status.loading');
    if (active === 'local') return t('phone.transport.none');
    return t(active === 'tailscale' ? 'phone.transport.tailscale' : 'phone.transport.lan');
  })();
  const away = status !== null && active !== null && active !== 'local';
  return (
    <dl className="pj-storage ph-status" aria-busy={busy !== null}>
      <dt>{t('phone.status.transport')}</dt>
      <dd>{transport}</dd>
      {away ? (
        <>
          <dt>{t('phone.status.url')}</dt>
          <dd>
            <span className="pj-mono">{status.url ?? '—'}</span>
          </dd>
          <dt>{t('phone.status.reachable')}</dt>
          <dd>
            <span
              className="ph-reach"
              data-ok={settling && !status.reachable ? undefined : (status.reachable ?? undefined)}
            >
              <span className="ph-dot" aria-hidden="true" />
              {reachLabel(status, settling)}
            </span>
          </dd>
        </>
      ) : null}
      {active === 'tailscale' && phoneOnline === false ? (
        <>
          <dt>{t('phone.status.phone')}</dt>
          <dd>
            <span className="ph-reach" data-ok={false}>
              <span className="ph-dot" aria-hidden="true" />
              {t('phone.status.phoneOffline')}
            </span>
          </dd>
        </>
      ) : null}
      {active === 'tailscale' && status?.lanOpen ? (
        <>
          <dt>{t('phone.status.lan')}</dt>
          <dd className="ph-lan-also">
            <span>{t('phone.transport.lanAlso')}</span>
            <Button size="sm" variant="quiet" disabled={busy !== null} onClick={onCloseLan}>
              {t('phone.lan.close')}
            </Button>
          </dd>
        </>
      ) : null}
    </dl>
  );
}

export function PhoneTransportView({
  status,
  guide,
  picked,
  ran = null,
  checked = false,
  settling = false,
  confirming,
  busy,
  failure,
  canWrite,
  onPick,
  onPair,
  onCheck,
  onCloseLan,
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
  const shown = shownOf(status, picked);
  const { active, chosen, pending } = shown;
  const guideOpen = chosen === 'tailscale' && guide !== null;
  // Served once, then stopped: Tailscale still carries the phone, but nothing answers there.
  const lost =
    active === 'tailscale' && status?.tailscale?.state === 'ready' && !status.tailscale.serving
      ? problemOf(status.tailscale)
      : null;
  return (
    <div className="ph-transport">
      <div className="ph-opts" role="radiogroup" aria-label={t('phone.reach.choose')}>
        {REACHES.map(({ kind, ...words }) => (
          <Option
            key={kind}
            kind={kind}
            words={words}
            shown={shown}
            disabled={busy !== null || status === null}
            onPick={onPick}
          />
        ))}
      </div>
      {chosen === 'local' && !pending && status?.firewallPrompt ? (
        <p className="pj-hint">{t('phone.lan.firewall')}</p>
      ) : null}
      <StatusRows
        status={status}
        active={active}
        busy={busy}
        phoneOnline={guide?.phoneOnline ?? null}
        settling={settling}
        onCloseLan={onCloseLan}
      />
      {/* The everyday case: set up once, then Tailscale left off on the phone. */}
      {active === 'tailscale' ? (
        <p className="ph-away" role="note">
          {t('phone.transport.away')}
        </p>
      ) : null}
      {lost ? <ProblemNote found={lost} /> : null}
      {failure && !guideOpen ? (
        <p className="dhint" role="alert">
          {failure}
        </p>
      ) : null}
      {guideOpen ? (
        <TailscaleSteps
          guide={guide}
          inUse={active === 'tailscale'}
          meanwhile={pending ? active : null}
          ran={ran}
          checked={checked}
          confirming={confirming}
          busy={busy}
          failure={failure}
          onCheck={onCheck}
          onAskServe={onAskServe}
          onConfirmServe={onConfirmServe}
          onCancelServe={onCancelServe}
          onPair={onPair}
        />
      ) : null}
      {/* Only HTTPS lets the installed app open without this computer: plain HTTP promises none. */}
      {active === 'tailscale' ? <p className="pj-hint">{t('phone.transport.offline')}</p> : null}
      {active === 'lan' && !pending ? (
        <p className="pj-hint">{t('phone.transport.lanOnly')}</p>
      ) : null}
      {chosen !== null && chosen !== 'local' ? (
        <p className="pj-hint">{t('phone.transport.tokens')}</p>
      ) : null}
      {active === 'lan' && !pending ? (
        <div className="ph-acts">
          <Button size="sm" variant="primary" disabled={busy !== null} onClick={onPair}>
            {t('phone.transport.pair')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : '');

const served = (check: TailscaleCheck | null | undefined) =>
  check?.state === 'ready' && check.serving;

// Tailscale serves Otea and nothing answered there yet: right after serving, the first HTTPS
// request waits for the certificate, so the status is read again a few times (TS-8).
export function settlesAgain(status: PhoneStatus): boolean {
  return status.transport === 'tailscale' && status.reachable === false && served(status.tailscale);
}

const SETTLE_TRIES = 6;
const SETTLE_EVERY_MS = 3000;

// The section's data: the status from the server, the guide while Tailscale is open, and what the
// person picks. A pick opens or closes the local network (Otea's own setting); Tailscale opens its
// steps and changes nothing until the person confirms the command they show, or until the steps
// show Otea already served there: then Tailscale carries the phone at once.
export function PhoneTransport({ canWrite, onPair }: { canWrite: boolean; onPair: () => void }) {
  const [status, setStatus] = useState<PhoneStatus | null>(null);
  const [guide, setGuide] = useState<TailscaleGuide | null>(null);
  const [picked, setPicked] = useState<Reach | null>(null);
  const [ran, setRan] = useState<TailscaleCheck | null>(null);
  const [checked, setChecked] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<Doing | null>(null);
  const [failure, setFailure] = useState<string | undefined>();
  // Reads left after serving, while nothing answers yet (TS-8).
  const [settling, setSettling] = useState(0);
  useEffect(() => {
    if (settling <= 0) return undefined;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetchPhone(controller.signal).then(
        (next) => {
          setStatus(next);
          setSettling(settlesAgain(next) ? settling - 1 : 0);
        },
        () => setSettling(0),
      );
    }, SETTLE_EVERY_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [settling]);

  const load = useCallback((signal: AbortSignal) => {
    fetchPhone(signal).then(setStatus, (error: unknown) => {
      if (!signal.aborted) setFailure(messageOf(error));
    });
  }, []);

  const readGuide = useCallback((signal: AbortSignal = new AbortController().signal) => {
    return fetchTailscaleGuide(signal).then(setGuide, (error: unknown) => {
      if (!signal.aborted) setFailure(messageOf(error));
    });
  }, []);

  useEffect(() => {
    if (!canWrite) return undefined;
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [canWrite, load]);

  const { chosen, active } = shownOf(status, picked);
  useEffect(() => {
    if (!canWrite || chosen !== 'tailscale') return undefined;
    const controller = new AbortController();
    readGuide(controller.signal);
    return () => controller.abort();
  }, [canWrite, chosen, readGuide]);

  // One change at a time; the status comes back with it.
  const act = (
    doing: Doing,
    change: () => Promise<PhoneStatus>,
    then?: (next: PhoneStatus) => void,
  ) => {
    setBusy(doing);
    setFailure(undefined);
    setChecked(false);
    change()
      .then((next) => {
        setStatus(next);
        then?.(next);
      })
      .catch((error: unknown) => setFailure(messageOf(error)))
      .finally(() => setBusy(null));
  };

  // Tailscale picked, and its steps show Otea already served there: it carries the phone now.
  const adopt =
    guide?.done.serve === true &&
    chosen === 'tailscale' &&
    active !== null &&
    active !== 'tailscale';
  const adopting = useRef(false);
  useEffect(() => {
    if (!adopt || busy !== null || adopting.current) return;
    adopting.current = true;
    act('switch', () => choosePhoneTransport('tailscale'));
  });
  useEffect(() => {
    if (!adopt) adopting.current = false;
  }, [adopt]);
  // Once the pick is what the server says is in use, the server's word is what counts again.
  useEffect(() => {
    if (picked !== null && picked === active) setPicked(null);
  }, [picked, active]);

  const pick = (kind: Reach) => {
    setConfirming(false);
    setRan(null);
    setChecked(false);
    if (kind === 'tailscale') {
      setPicked('tailscale');
      return;
    }
    setPicked(null);
    if (kind === reachOf(status)) return;
    const change = kind === 'lan' ? openLan : closeLan;
    act(
      'switch',
      status?.transport === 'tailscale'
        ? () => choosePhoneTransport('lan').then(() => change())
        : change,
    );
  };

  const check = () => {
    setBusy('check');
    setFailure(undefined);
    setChecked(false);
    const signal = new AbortController().signal;
    Promise.all([fetchPhone(signal), fetchTailscaleGuide(signal)])
      .then(([nextStatus, nextGuide]) => {
        setStatus(nextStatus);
        setGuide(nextGuide);
        setChecked(true);
      })
      .catch((error: unknown) => setFailure(messageOf(error)))
      .finally(() => setBusy(null));
  };

  return (
    <PhoneTransportView
      status={status}
      guide={guide}
      picked={picked}
      ran={ran}
      checked={checked}
      settling={settling > 0}
      confirming={confirming}
      busy={busy}
      failure={failure}
      canWrite={canWrite}
      onPick={pick}
      onPair={onPair}
      onCheck={check}
      onCloseLan={() => act('switch', closeLan)}
      onAskServe={() => setConfirming(true)}
      onCancelServe={() => setConfirming(false)}
      onConfirmServe={() => {
        if (!guide) return;
        const { command } = guide;
        setConfirming(false);
        act(
          'serve',
          () => serveOverTailscale(command),
          (next) => {
            setRan(served(next.tailscale) ? null : next.tailscale);
            setSettling(settlesAgain(next) ? SETTLE_TRIES : 0);
            void readGuide();
          },
        );
      }}
    />
  );
}
