import { type ReactNode, useEffect, useId, useState } from 'react';
import { DEFAULT_QUIET, type NotifyPrefs } from '../../../src/core/notify/planner.ts';
import type { NotifyKind } from '../../../src/core/notify/signals.ts';
import { fetchNotify, fetchProjects, postNotifyPrefs } from '../api.ts';
import { language, type PlainKey, t } from '../i18n/i18n.ts';
import { Icon } from '../kit/Icon.tsx';
import { type NotifyOffer, type NotifyView, notifyOffer } from './offer.ts';
import { placeHere, subscribeHere, unsubscribeHere } from './push-client.ts';

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
};

export function NotifyBody({
  offer,
  view,
  busy,
  problem,
  projects,
  onOn,
  onOff,
  onPrefs,
}: NotifyBodyProps) {
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
      <NotifyChoices prefs={view.prefs} projects={projects} onChange={onPrefs} />
      {offer === 'desktop' ? <p className="gnote">{t('notify.desktopNote')}</p> : null}
      {failed}
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
  const offer = notifyOffer(placeHere(view));
  if (offer === null) return null;
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
