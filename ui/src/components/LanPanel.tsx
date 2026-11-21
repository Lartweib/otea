import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchLan,
  freshPairingCode,
  newPairingCode,
  openLan,
  postDeviceTestPush,
  revokeDevice,
} from '../api.ts';
import { useApp } from '../app/context.tsx';
import { agoLabel, momentLabel } from '../format.ts';
import { t, tx } from '../i18n/i18n.ts';
import { Button, Swap } from '../kit/index.ts';
import { notifySummary } from '../notify/summary.ts';
import { testPushWords } from '../notify/test-push.ts';
import {
  addressHint,
  addressLabel,
  dotSegments,
  hostnameOf,
  hostOf,
  ipFallback,
  isLocalName,
  qrPath,
  timeLeft,
} from '../pairing.ts';
import type { Remote } from '../remote.ts';
import type { Route } from '../selection.ts';
import type { Device, LanView } from '../types.ts';

// Emparejar un teléfono (#/lan, SPEC §10.4, mock:3529-3536): a dialog over Te toca with the real
// pairing code as a QR (132 px), where it points on the chosen transport (the local network or
// Tailscale's HTTPS name), and the paired devices, each with Revocar. A closed local network opens
// here too (Abrir a la red local); Tailscale is set up in Configuración · Teléfono.

const REFRESH_MS = 3000;

function QrCode({ view, now }: { view: LanView | undefined; now: number }) {
  const code = view?.code && Date.parse(view.code.expiresAt) > now ? view.code : null;
  if (!code) {
    return (
      <span className="qr off" role="img" aria-label={t('lan.noCode')}>
        <span>{view ? (view.enabled ? t('lan.qrExpired') : t('lan.qrOff')) : ''}</span>
      </span>
    );
  }
  const size = code.qr.size;
  return (
    <svg
      className="qr"
      viewBox={`-1 -1 ${size + 2} ${size + 2}`}
      role="img"
      aria-label={t('lan.qrLabel')}
      shapeRendering="crispEdges"
    >
      <path d={qrPath(code.qr.cells)} className="qr-ink" />
    </svg>
  );
}

export function DeviceRow({
  device,
  now,
  revoked,
  onRevoke,
  onTest,
  testing = false,
  tested,
}: {
  device: Device;
  now: number;
  revoked: boolean;
  onRevoke: () => void;
  // A test push to this device, and what its push service answered.
  onTest: () => void;
  testing?: boolean;
  tested?: string | undefined;
}) {
  const seen = device.lastSeenAt ? agoLabel(device.lastSeenAt, now) : t('lan.never');
  return (
    <div>
      <Swap k={revoked ? 'off' : 'on'} as="span" dy={3}>
        {device.name}
        <small>
          {revoked
            ? t('lan.revoked')
            : t('lan.deviceMeta', {
                paired: momentLabel(device.pairedAt, now),
                seen,
                hint: device.hint,
              })}
        </small>
        {revoked || device.notify === undefined ? null : (
          <small className="dev-notify">{notifySummary(device.notify)}</small>
        )}
        {tested && !revoked ? (
          <small className="dev-test" role="status">
            {tested}
          </small>
        ) : null}
      </Swap>
      {revoked ? null : (
        <span className="dev-acts">
          <Button
            variant="text"
            size="sm"
            disabled={testing}
            aria-label={t('testPush.sendTo', { name: device.name })}
            onClick={onTest}
          >
            {testing ? t('testPush.sending') : t('testPush.send')}
          </Button>
          <Button
            variant="text"
            size="sm"
            aria-label={t('lan.revokeLabel', { name: device.name })}
            onClick={onRevoke}
          >
            {t('lan.revoke')}
          </Button>
        </span>
      )}
    </div>
  );
}

type LanPanelProps = { canManage: boolean };

// Hecho, and closing the dialog, go back where it was opened: Configuración, or Te toca (TS-14).
export function pairingBack(route: Route): { view: 'settings' | 'toca' } {
  return { view: route.view === 'lan' ? (route.over ?? 'toca') : 'toca' };
}

export function LanPanel({ canManage }: LanPanelProps) {
  const app = useApp();
  const [view, setView] = useState<Remote<LanView>>({ status: 'loading' });
  const [address, setAddress] = useState<string | undefined>();
  const [failure, setFailure] = useState<string | undefined>();
  const [revoked, setRevoked] = useState<ReadonlyMap<string, Device>>(new Map());
  // Each device's test push: running, then what came back.
  const [tests, setTests] = useState<ReadonlyMap<string, string | null>>(new Map());
  const testPush = (id: string) => {
    setTests((was) => new Map(was).set(id, null));
    postDeviceTestPush(id)
      .then((answer) => testPushWords(answer, { desk: true, app: app.project?.name }))
      .catch(() => t('testPush.failed'))
      .then((words) => setTests((was) => new Map(was).set(id, words)));
  };
  const [now, setNow] = useState(Date.now);
  const opened = useRef(false);

  // The dialog opens on a code with its whole lifetime ahead, as its lead says (P7-R3-5): the one
  // otea serve issued may have run half out by then. Every load after that only reads it.
  const load = useCallback(
    (signal: AbortSignal) => {
      const asked = opened.current ? fetchLan(signal, address) : freshPairingCode(address);
      opened.current = true;
      return asked.then(
        (value) => setView({ status: 'ready', value }),
        (error: unknown) => {
          if (signal.aborted) return;
          setView({ status: 'failed', message: error instanceof Error ? error.message : '' });
        },
      );
    },
    [address],
  );

  useEffect(() => {
    if (!canManage) return undefined;
    const controller = new AbortController();
    void load(controller.signal);
    const timer = setInterval(() => void load(controller.signal), REFRESH_MS);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      controller.abort();
      clearInterval(timer);
      clearInterval(tick);
    };
  }, [canManage, load]);

  const act = (run: () => Promise<unknown>) => {
    setFailure(undefined);
    run()
      .then(() => load(new AbortController().signal))
      .catch((error: unknown) => setFailure(error instanceof Error ? error.message : ''));
  };
  const done = (
    <div className="dbtns" data-i="">
      <Button variant="primary" onClick={() => app.go(pairingBack(app.route))}>
        {t('lan.done')}
      </Button>
    </div>
  );

  if (!canManage) {
    return (
      <>
        <h4 data-i="">{t('lan.title')}</h4>
        <p data-i="">{tx('lan.signIn', { command: <code className="inl">otea open</code> })}</p>
        {done}
      </>
    );
  }
  const lan = view.status === 'ready' ? view.value : undefined;
  const shown = lan ? (lan.code?.url ? new URL(lan.code.url).host : hostOf(lan.urls[0] ?? '')) : '';
  const codeLive = lan?.code && Date.parse(lan.code.expiresAt) > now ? lan.code : null;
  // The code points at this computer's .local name: the same link by IP, for a phone that cannot
  // resolve it.
  const shownName = hostnameOf(shown);
  const fallback =
    lan && codeLive && isLocalName(shownName) ? ipFallback(lan.urls, codeLive.url) : undefined;
  const devices = lan ? lan.devices : [];
  const tailscale = lan?.transport === 'tailscale';
  const gone = [...revoked.values()].filter((d) => !devices.some((x) => x.id === d.id));
  return (
    <>
      <h4 data-i="">{t('lan.title')}</h4>
      <p data-i="">
        {lan && !lan.enabled ? (
          tailscale ? (
            <>
              {t('lan.offTailscale')}{' '}
              {tx('lan.setUpTailscale', {
                command: <code className="inl">otea phone tailscale</code>,
              })}
            </>
          ) : (
            t('lan.off')
          )
        ) : tailscale ? (
          t('lan.dialogLeadTailscale')
        ) : (
          t('lan.dialogLead')
        )}
      </p>
      <BeforeScan tailscale={tailscale && lan?.enabled === true} />
      <div className="qrw" data-i="">
        <QrCode view={lan} now={now} />
        <div className="qrside">
          {lan && lan.urls.length > 1 ? (
            <>
              <select
                className="lan-net"
                aria-label={t('lan.network')}
                value={shown}
                onChange={(event) => setAddress(event.target.value.split(':')[0])}
              >
                {lan.urls.map((url, index) => (
                  <option key={url} value={hostOf(url)}>
                    {addressLabel(hostOf(url), index)}
                  </option>
                ))}
              </select>
              <span className="lan-hint">
                {addressHint(
                  shown,
                  lan.urls.findIndex((url) => hostOf(url) === shown),
                )}
              </span>
            </>
          ) : (
            <span className="lan-addr">
              {dotSegments(
                lan?.enabled ? `${tailscale ? 'https' : 'http'}://${shown}` : 'http://127.0.0.1',
              ).map((part, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: the parts of one fixed address
                <Fragment key={index}>
                  {index > 0 ? <wbr /> : null}
                  {part}
                </Fragment>
              ))}
            </span>
          )}
          <span className="lan-code">
            {codeLive
              ? t('lan.code', { code: codeLive.code, left: timeLeft(codeLive.expiresAt, now) })
              : t('lan.noCode')}
          </span>
          {fallback ? (
            <span className="lan-fall">
              {tx('lan.fallback', { name: <b>{shownName}</b>, url: <b>{fallback}</b> })}
            </span>
          ) : null}
          {lan?.enabled ? (
            <Button size="sm" variant="quiet" onClick={() => act(() => newPairingCode(address))}>
              {t('lan.newCode')}
            </Button>
          ) : lan && !tailscale ? (
            <Button size="sm" variant="quiet" onClick={() => act(openLan)}>
              {t('phone.lan.open')}
            </Button>
          ) : null}
        </div>
      </div>
      <div className="devs" data-i="">
        {devices.length + gone.length === 0 ? (
          <p className="devs-none">
            {view.status === 'failed'
              ? view.message
              : lan
                ? t('lan.noDevices')
                : t('common.loading')}
          </p>
        ) : (
          [...devices, ...gone].map((device) => (
            <DeviceRow
              key={device.id}
              device={device}
              now={now}
              revoked={revoked.has(device.id)}
              onTest={() => testPush(device.id)}
              testing={tests.get(device.id) === null}
              tested={tests.get(device.id) ?? undefined}
              onRevoke={() => {
                setRevoked((was) => new Map(was).set(device.id, device));
                act(() => revokeDevice(device.id));
              }}
            />
          ))
        )}
      </div>
      {failure ? (
        <p className="dhint" role="alert">
          {failure}
        </p>
      ) : null}
      <p className="lan-away" data-i="">
        {tailscale ? t('lan.awayTailscale') : t('lan.away')}
      </p>
      {done}
    </>
  );
}

// On Tailscale, the phone opens the QR's address only while its Tailscale app is connected: the
// owner's first scan failed for that alone.
export function BeforeScan({ tailscale }: { tailscale: boolean }) {
  if (!tailscale) return null;
  return (
    <p className="lan-before" role="note" data-i="">
      {t('lan.beforeScan')}
    </p>
  );
}
