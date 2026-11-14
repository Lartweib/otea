import { useCallback, useEffect, useState } from 'react';
import { fetchLan, newPairingCode, openLan, revokeDevice } from '../api.ts';
import { useApp } from '../app/context.tsx';
import { agoLabel, momentLabel } from '../format.ts';
import { t, tx } from '../i18n/i18n.ts';
import { Button, Swap } from '../kit/index.ts';
import { hostnameOf, hostOf, ipFallback, isLocalName, qrPath, timeLeft } from '../pairing.ts';
import type { Remote } from '../remote.ts';
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

function DeviceRow({
  device,
  now,
  revoked,
  onRevoke,
}: {
  device: Device;
  now: number;
  revoked: boolean;
  onRevoke: () => void;
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
      </Swap>
      {revoked ? null : (
        <Button
          variant="text"
          size="sm"
          aria-label={t('lan.revokeLabel', { name: device.name })}
          onClick={onRevoke}
        >
          {t('lan.revoke')}
        </Button>
      )}
    </div>
  );
}

type LanPanelProps = { canManage: boolean };

export function LanPanel({ canManage }: LanPanelProps) {
  const app = useApp();
  const [view, setView] = useState<Remote<LanView>>({ status: 'loading' });
  const [address, setAddress] = useState<string | undefined>();
  const [failure, setFailure] = useState<string | undefined>();
  const [revoked, setRevoked] = useState<ReadonlyMap<string, Device>>(new Map());
  const [now, setNow] = useState(Date.now);

  const load = useCallback(
    (signal: AbortSignal) =>
      fetchLan(signal, address).then(
        (value) => setView({ status: 'ready', value }),
        (error: unknown) => {
          if (signal.aborted) return;
          setView({ status: 'failed', message: error instanceof Error ? error.message : '' });
        },
      ),
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
      <Button variant="primary" onClick={() => app.go({ view: 'toca' })}>
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
      <div className="qrw" data-i="">
        <QrCode view={lan} now={now} />
        <div className="qrside">
          {lan && lan.urls.length > 1 ? (
            <select
              className="lan-net"
              aria-label={t('lan.network')}
              value={shown}
              onChange={(event) => setAddress(event.target.value.split(':')[0])}
            >
              {lan.urls.map((url) => (
                <option key={url} value={hostOf(url)}>
                  {hostOf(url)}
                </option>
              ))}
            </select>
          ) : (
            <span className="lan-addr">
              {lan?.enabled ? `${tailscale ? 'https' : 'http'}://${shown}` : 'http://127.0.0.1'}
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
