import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { fetchLan, newPairingCode, revokeDevice } from '../api.ts';
import { agoLabel, momentLabel } from '../format.ts';
import { t, tx } from '../i18n/i18n.ts';
import { Button } from '../kit/index.ts';
import { hostnameOf, hostOf, ipFallback, isLocalName, qrPath, timeLeft } from '../pairing.ts';
import type { Remote } from '../remote.ts';
import type { Device, LanView } from '../types.ts';

const REFRESH_MS = 3000;

function QrCode({ view, now }: { view: LanView; now: number }) {
  const code = view.code && Date.parse(view.code.expiresAt) > now ? view.code : null;
  const size = code?.qr.size ?? 0;
  return (
    <div className={code ? 'lan-qr on' : 'lan-qr'}>
      {code ? (
        <svg
          viewBox={`-2 -2 ${size + 4} ${size + 4}`}
          role="img"
          aria-label={t('lan.qrLabel')}
          shapeRendering="crispEdges"
        >
          <rect x="-2" y="-2" width={size + 4} height={size + 4} className="lan-qr-paper" />
          <path d={qrPath(code.qr.cells)} className="lan-qr-ink" />
        </svg>
      ) : (
        <span className="lan-qr-off">
          <span className="t-cap">{view.enabled ? t('lan.qrExpired') : t('lan.qrOff')}</span>
          <span className="t-small">
            {view.enabled ? t('lan.qrExpiredText') : t('lan.qrOffText')}
          </span>
        </span>
      )}
    </div>
  );
}

type DeviceRowProps = { device: Device; now: number; onRevoke: (device: Device) => void };

function DeviceRow({ device, now, onRevoke }: DeviceRowProps) {
  const seen = device.lastSeenAt ? agoLabel(device.lastSeenAt, now) : t('lan.never');
  return (
    <li className="lan-device">
      <span className="lan-device-text">
        <span className="t-ui">{device.name}</span>
        <span className="t-cap">
          {t('lan.deviceMeta', {
            paired: momentLabel(device.pairedAt, now),
            seen,
            hint: device.hint,
          })}
        </span>
      </span>
      <Button
        size="sm"
        aria-label={t('lan.revokeLabel', { name: device.name })}
        onClick={() => onRevoke(device)}
      >
        {t('lan.revoke')}
      </Button>
    </li>
  );
}

// LAN access from the desk (#/lan): whether phones on this network can reach Otea, the pairing
// code as a QR code, and the paired devices, each revocable. Turning LAN access on stays a
// command (otea serve --lan): nothing in a page can open the door.
type LanPanelProps = {
  canManage: boolean;
  // The sidebar beside the page, as the catalog has it; none on the phone.
  rail?: ReactNode;
  sidebar?: boolean;
};

function Page({
  rail,
  sidebar,
  children,
}: Omit<LanPanelProps, 'canManage'> & { children: ReactNode }) {
  return (
    <main className="layout lan-layout with-rail" data-sidebar={sidebar ? 'on' : 'off'}>
      {rail}
      <div className="lan-page">{children}</div>
    </main>
  );
}

export function LanPanel({ canManage, rail, sidebar = true }: LanPanelProps) {
  const [view, setView] = useState<Remote<LanView>>({ status: 'loading' });
  const [address, setAddress] = useState<string | undefined>();
  const [failure, setFailure] = useState<string | undefined>();
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
    const timer = setInterval(() => {
      setNow(Date.now());
      void load(controller.signal);
    }, REFRESH_MS);
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

  if (!canManage) {
    return (
      <Page rail={rail} sidebar={sidebar}>
        <p className="pane-message t-small">
          {tx('lan.signIn', { command: <code>otea open</code> })}
        </p>
      </Page>
    );
  }
  if (view.status !== 'ready') {
    return (
      <Page rail={rail} sidebar={sidebar}>
        <p
          className={
            view.status === 'failed' ? 'pane-message action-error' : 'pane-message t-small'
          }
        >
          {view.status === 'failed' ? view.message : t('common.loading')}
        </p>
      </Page>
    );
  }
  const lan = view.value;
  const shown = lan.code?.url ? new URL(lan.code.url).host : hostOf(lan.urls[0] ?? '');
  const codeLive = lan.code && Date.parse(lan.code.expiresAt) > now ? lan.code : null;
  // The QR code points at this computer's .local name: the same link by IP, for a phone that cannot
  // resolve it.
  const shownName = hostnameOf(shown);
  const fallback =
    codeLive && isLocalName(shownName) ? ipFallback(lan.urls, codeLive.url) : undefined;
  return (
    <Page rail={rail} sidebar={sidebar}>
      <section className="lan-section" aria-labelledby="lan-title">
        <div className="lan-head">
          <div>
            <h2 id="lan-title" className="t-h">
              {t('lan.title')}
            </h2>
            <p className="t-small">{t('lan.lead')}</p>
          </div>
          <span className="t-cap">{lan.enabled ? shown : t('lan.where.off')}</span>
        </div>
        <div className={lan.enabled ? 'raised lan-panel' : 'raised lan-panel off'}>
          <div className="lan-left">
            <div className="lan-status">
              <span className={lan.enabled ? 'lan-dot on' : 'lan-dot'} aria-hidden="true" />
              <span className="t-small">
                {lan.enabled ? t('lan.on', { address: shown }) : t('lan.off')}
                {lan.enabled ? null : (
                  <> {tx('lan.turnOn', { command: <code>otea serve --lan</code> })}</>
                )}
              </span>
            </div>
            <div className="lan-devices-head">
              <span className="t-label">{t('lan.devices')}</span>
              <span className="t-cap">
                {lan.devices.length === 0
                  ? ''
                  : lan.enabled
                    ? t('lan.devicesActive')
                    : t('lan.devicesPaused')}
              </span>
            </div>
            {lan.devices.length === 0 ? (
              <p className="t-small lan-empty">{t('lan.noDevices')}</p>
            ) : (
              <ul className="lan-devices">
                {lan.devices.map((device) => (
                  <DeviceRow
                    key={device.id}
                    device={device}
                    now={now}
                    onRevoke={({ id }) => act(() => revokeDevice(id))}
                  />
                ))}
              </ul>
            )}
            <p className="t-small lan-away">{t('lan.away')}</p>
            {failure ? (
              <p className="action-error t-small" role="alert">
                {failure}
              </p>
            ) : null}
          </div>
          <div className="lan-right">
            <QrCode view={lan} now={now} />
            <div className="lan-code">
              {lan.urls.length > 1 ? (
                <select
                  className="lan-network mono"
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
                <span className="mono">{lan.enabled ? `http://${shown}` : 'http://127.0.0.1'}</span>
              )}
              <span className="t-cap">
                {codeLive
                  ? t('lan.code', { code: codeLive.code, left: timeLeft(codeLive.expiresAt, now) })
                  : t('lan.noCode')}
              </span>
              {fallback ? (
                <span className="t-small lan-fallback">
                  {tx('lan.fallback', {
                    name: <span className="mono">{shownName}</span>,
                    url: <span className="mono">{fallback}</span>,
                  })}
                </span>
              ) : null}
              <span className="t-small">{t('lan.codeNote')}</span>
              {lan.enabled ? (
                <div>
                  <Button size="sm" onClick={() => act(() => newPairingCode(address))}>
                    {t('lan.newCode')}
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    </Page>
  );
}
