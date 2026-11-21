import { type ReactNode, useEffect, useId, useState } from 'react';
import { DEFAULT_QUIET, type NotifyPrefs } from '../../../src/core/notify/planner.ts';
import type { NotifyKind } from '../../../src/core/notify/signals.ts';
import { fetchNotify, fetchProjects, postNotifyPrefs, postTestPush } from '../api.ts';
import type { Platform } from '../home-screen.ts';
import { language, type PlainKey, t } from '../i18n/i18n.ts';
import { Icon } from '../kit/Icon.tsx';
import { type NotifyOffer, type NotifyView, notifyOffer } from './offer.ts';
import { localPush, placeHere, subscribeHere, unsubscribeHere } from './push-client.ts';
import { testPushWords } from './test-push.ts';

// Preferencias › Avisos. On a phone over HTTPS: turn them on (the browser asks), then what you are
// told and when, and turn them off. On a phone that cannot have them: one line that says why and
// what would make it work. In the desktop app: the same choices for the system's notifications.
// The kinds are what the server tells (core/notify/signals.ts); with several projects, each can be
// muted. The server keeps the choice per device and applies it before anything is sent.

const KINDS: {
  kind: NotifyKind;
  label: PlainKey;
  hint?: PlainKey;
}[] = [
  { kind: 'turn', label: 'notify.turn', hint: 'notify.turnHint' },
  { kind: 'ask', label: 'notify.ask' },
  { kind: 'replied', label: 'notify.replied' },
  { kind: 'stuck', label: 'notify.stuck', hint: 'notify.stuckHint' },
  { kind: 'aside', label: 'notify.aside' },
];

export type NotifyProject = { id: string; name: string };

// Mutes a project, or hears it again.
export function toggleMuted(prefs: NotifyPrefs, project: string, on: boolean): NotifyPrefs {
  const rest = prefs.muted.filter((id) => id !== project);
  return { ...prefs, muted: on ? rest : [...rest, project] };
}

function Toggle({
  on,
  onChange,
  children,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      className="ntog"
      onClick={() => onChange(!on)}
    >
      <span className="nsw" aria-hidden="true" />
      <span className="ntx">{children}</span>
    </button>
  );
}

export type NotifyChoicesProps = {
  prefs: NotifyPrefs;
  projects: readonly NotifyProject[];
  onChange: (next: NotifyPrefs) => void;
};

export function NotifyChoices({ prefs, projects, onChange }: NotifyChoicesProps) {
  const from = useId();
  const quiet = prefs.quiet;
  return (
    <div className="nchoices">
      {KINDS.map(({ kind, label, hint }) => (
        <Toggle
          key={kind}
          on={prefs[kind]}
          onChange={(next) => onChange({ ...prefs, [kind]: next })}
        >
          {t(label)}
          {hint ? <small>{t(hint)}</small> : null}
        </Toggle>
      ))}
      <Toggle
        on={quiet !== null}
        onChange={(next) => onChange({ ...prefs, quiet: next ? DEFAULT_QUIET : null })}
      >
        {t('notify.quiet')}
      </Toggle>
      {quiet ? (
        <div className="nquiet">
          <label htmlFor={from}>{t('notify.from')}</label>
          <input
            id={from}
            type="time"
            aria-label={t('notify.quietFrom')}
            className="input"
            value={quiet.from}
            onChange={(e) => {
              if (e.target.value) onChange({ ...prefs, quiet: { ...quiet, from: e.target.value } });
            }}
          />
          <span>{t('notify.to')}</span>
          <input
            type="time"
            className="input"
            aria-label={t('notify.quietTo')}
            value={quiet.to}
            onChange={(e) => {
              if (e.target.value) onChange({ ...prefs, quiet: { ...quiet, to: e.target.value } });
            }}
          />
        </div>
      ) : null}
      {projects.length > 1 ? (
        <>
          <span className="nhead">{t('notify.projects')}</span>
          {projects.map((project) => (
            <Toggle
              key={project.id}
              on={!prefs.muted.includes(project.id)}
              onChange={(next) => onChange(toggleMuted(prefs, project.id, next))}
            >
              {project.name}
            </Toggle>
          ))}
        </>
      ) : null}
    </div>
  );
}

const WHY: Partial<
  Record<
    NotifyOffer,
    'notify.needsHttps' | 'notify.needsHome' | 'notify.unsupported' | 'notify.blocked'
  >
> = {
  'needs-https': 'notify.needsHttps',
  'needs-home-screen': 'notify.needsHome',
  unsupported: 'notify.unsupported',
  blocked: 'notify.blocked',
};

export type NotifyBodyProps = {
  offer: NotifyOffer;
  view: NotifyView;
  busy: boolean;
  problem: 'notify.failed' | 'notify.saveFailed' | null;
  projects: readonly NotifyProject[];
  onOn: () => void;
  onOff: () => void;
  onPrefs: (next: NotifyPrefs) => void;
  platform?: Platform;
  // On for the server, but this browser cannot show them: its subscription is gone.
  blockedHere?: boolean;
  // A test push: running, and what came back.
  testing?: boolean;
  tested?: string | null;
  onTest?: () => void;
  // Reads the permission and the subscription again (after allowing them in Android's settings).
  onRecheck?: () => void;
};

// Where to allow them again, with a way to read it again once allowed.
function Blocked({
  platform,
  lost,
  onRecheck,
}: {
  platform: Platform | undefined;
  lost: boolean;
  onRecheck: (() => void) | undefined;
}) {
  const words =
    platform === 'android' ? 'notify.androidBlocked' : lost ? 'notify.lost' : 'notify.blocked';
  return (
    <>
      <p className="gnote nproblem" role="status">
        {t(words)}
      </p>
      <button type="button" className="plink" onClick={onRecheck}>
        <Icon name="check" />
        {t('notify.recheck')}
      </button>
    </>
  );
}

export function NotifyBody({
  offer,
  view,
  busy,
  problem,
  projects,
  onOn,
  onOff,
  onPrefs,
  platform,
  blockedHere = false,
  testing = false,
  tested = null,
  onTest,
  onRecheck,
}: NotifyBodyProps) {
  if (offer === 'blocked')
    return <Blocked platform={platform} lost={false} onRecheck={onRecheck} />;
  const why = WHY[offer];
  if (why) return <p className="gnote">{t(why)}</p>;
  const failed = problem ? (
    <p className="gnote nproblem" role="status">
      {t(problem)}
    </p>
  ) : null;
  if (offer === 'push' && !view.subscribed) {
    return (
      <>
        <button type="button" className="plink" disabled={busy} onClick={onOn}>
          <Icon name="bell" />
          {t('notify.on')}
        </button>
        <p className="gnote">{t('notify.onNote')}</p>
        {failed}
      </>
    );
  }
  return (
    <>
      {offer === 'push' && blockedHere ? (
        <Blocked platform={platform} lost onRecheck={onRecheck} />
      ) : null}
      <NotifyChoices prefs={view.prefs} projects={projects} onChange={onPrefs} />
      {offer === 'desktop' ? <p className="gnote">{t('notify.desktopNote')}</p> : null}
      {failed}
      {offer === 'push' ? (
        <>
          <button type="button" className="plink" disabled={busy || testing} onClick={onTest}>
            <Icon name="bell" />
            {testing ? t('testPush.sending') : t('testPush.send')}
          </button>
          {tested ? (
            <p className="gnote" role="status">
              {tested}
            </p>
          ) : null}
        </>
      ) : null}
      {offer === 'push' ? (
        <button type="button" className="plink" disabled={busy} onClick={onOff}>
          <Icon name="x" />
          {t('notify.off')}
        </button>
      ) : null}
    </>
  );
}

export function NotifyGroup() {
  const [view, setView] = useState<NotifyView | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<NotifyBodyProps['problem']>(null);
  const [projects, setProjects] = useState<NotifyProject[]>([]);
  const [testing, setTesting] = useState(false);
  const [tested, setTested] = useState<string | null>(null);
  // What this browser holds: its permission, and whether it still has a push subscription. Read as
  // the group opens and as the app comes back to the front (from Android's settings, say).
  const [here, setHere] = useState<{ permission: string; subscribed: boolean | null } | null>(null);
  const [checks, setChecks] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: Comprobar de nuevo bumps checks to read again
  useEffect(() => {
    let live = true;
    const read = () => {
      void localPush().then((next) => {
        if (live) setHere(next);
      });
    };
    read();
    const front = () => {
      if (document.visibilityState === 'visible') read();
    };
    document.addEventListener('visibilitychange', front);
    return () => {
      live = false;
      document.removeEventListener('visibilitychange', front);
    };
  }, [checks]);
  useEffect(() => {
    const controller = new AbortController();
    fetchNotify(controller.signal)
      .then((answer) => {
        if (answer && typeof answer === 'object' && 'target' in answer) setView(answer);
      })
      .catch(() => undefined);
    fetchProjects(controller.signal)
      .then((all) => {
        if (Array.isArray(all)) setProjects(all.map(({ id, name }) => ({ id, name })));
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);
  if (!view) return null;
  const place = placeHere(view);
  const offer = notifyOffer(place);
  if (offer === null) return null;
  const blockedHere =
    view.target === 'device' &&
    view.subscribed &&
    here !== null &&
    (here.permission === 'denied' || here.subscribed === false);
  const act = async (
    run: () => Promise<NotifyView | null>,
    failure: NonNullable<NotifyBodyProps['problem']>,
  ) => {
    setBusy(true);
    setProblem(null);
    try {
      const next = await run();
      if (next) setView(next);
      else setProblem(failure);
    } catch {
      setProblem(failure);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="pgroup" data-i="">
      <span className="gl">{t('notify.title')}</span>
      <div className="gb">
        <NotifyBody
          offer={offer}
          view={view}
          busy={busy}
          problem={problem}
          projects={projects}
          onOn={() =>
            void act(async () => {
              if (!view.key) return null;
              const out = await subscribeHere(view.key, language());
              return 'view' in out ? out.view : null;
            }, 'notify.failed')
          }
          onOff={() => void act(unsubscribeHere, 'notify.failed')}
          platform={place.platform}
          blockedHere={blockedHere}
          testing={testing}
          tested={tested}
          onTest={() => {
            setTesting(true);
            setTested(null);
            postTestPush()
              .then((answer) => setTested(testPushWords(answer, { blocked: blockedHere })))
              .catch(() => setTested(t('testPush.failed')))
              .finally(() => setTesting(false));
          }}
          onRecheck={() => setChecks((n) => n + 1)}
          onPrefs={(prefs) => {
            const before = view;
            setView({ ...view, prefs });
            void postNotifyPrefs(prefs, language())
              .then(setView)
              .catch(() => {
                setView(before);
                setProblem('notify.saveFailed');
              });
          }}
        />
      </div>
    </div>
  );
}
