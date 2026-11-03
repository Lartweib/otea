import { useEffect, useRef, useState } from 'react';
import {
  addCommand,
  CONNECT_COMMAND,
  createCommand,
  playbookCommand,
  routeOf,
} from '../empty-states.ts';
import { type PlainKey, t, tx } from '../i18n/i18n.ts';
import { Button, Icon, NodeMark } from '../kit/index.ts';
import { LANE } from '../lanes.ts';
import type { Item, PresetView } from '../types.ts';

const COPIED_MS = 1600;

// A command to run in the repo, with a button that copies it.
export function CommandLine({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const copy = () => {
    void navigator.clipboard?.writeText(command).then(() => {
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), COPIED_MS);
    });
  };
  return (
    <div className="empty-code">
      <code>
        <span className="empty-prompt" aria-hidden="true">
          ${' '}
        </span>
        {command}
      </code>
      <Button size="sm" variant="quiet" className="empty-copy" onClick={copy}>
        {copied ? <Icon name="done" /> : null}
        {t(copied ? 'emptyList.copied' : 'emptyList.copy')}
      </Button>
    </div>
  );
}

// The two lanes, drawn and waiting: the agent's dashed while no agent has ever acted here.
function Lanes({ height, agents = true }: { height: number; agents?: boolean }) {
  return (
    <>
      <path
        className="ln"
        data-waiting={agents ? undefined : ''}
        d={`M${LANE.agent} 0 V${height}`}
      />
      <path className="lny" d={`M${LANE.you} 0 V${height}`} />
    </>
  );
}

const STEP = 30;

// A preset's route down the lanes: each state on the lane of its turn, the line an item travels.
function Route({ preset }: { preset: PresetView }) {
  const route = routeOf(preset, STEP);
  return (
    <div className="empty-route" aria-hidden="true">
      <span className="lane-names">
        <span>{t('list.laneAgents')}</span>
        <span className="lane-names-you">{t('list.laneYou')}</span>
      </span>
      <div className="empty-route-body" style={{ height: route.height }}>
        <svg className="empty-route-lanes" width={56} height={route.height} aria-hidden="true">
          <Lanes height={route.height} />
          <path className="empty-route-path" d={route.path} />
          {route.stops.map((stop, index) => (
            <NodeMark
              key={stop.name}
              kind={stop.kind}
              cx={stop.x}
              cy={index * STEP + STEP / 2}
              r={5}
            />
          ))}
        </svg>
        <ol className="empty-route-names">
          {route.stops.map((stop) => (
            <li key={stop.name} className="t-cap" style={{ height: STEP }}>
              {stop.name}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

const PRESET_NOTE: Readonly<Record<string, PlainKey>> = {
  'bug-triage': 'emptyList.presetBugs',
  tasks: 'emptyList.presetTasks',
  change: 'emptyList.presetChange',
};

// The presets a first collection can follow, and the one shown: the one chosen, else bug-triage.
export function offeredPresets(presets: readonly PresetView[], chosen: string | undefined) {
  const offered = presets.filter(({ types }) => types.length > 0);
  const preset =
    offered.find(({ name }) => name === chosen) ??
    offered.find(({ name }) => name === 'bug-triage') ??
    offered[0];
  return { offered, preset };
}

// The list beside the first run: the chosen preset's route, on the lanes items will travel.
export function FirstRoute({ preset }: { preset: PresetView | undefined }) {
  return (
    <section className="empty-state empty-first" data-route-only="">
      {preset ? <Route key={preset.name} preset={preset} /> : null}
    </section>
  );
}

type FirstRunProps = {
  presets: readonly PresetView[];
  chosen: string | undefined;
  onChoose: (preset: string) => void;
  // Beside the list the route is drawn on the list's lanes; alone (a phone) the first run draws it.
  route: boolean;
};

// No collection yet: pick a preset and it previews itself on the lanes; the command makes it.
export function FirstRun({ presets, chosen, onChoose, route }: FirstRunProps) {
  const { offered, preset } = offeredPresets(presets, chosen);
  const setChosen = onChoose;
  return (
    <section
      className="empty-state empty-first"
      data-route={route ? '' : undefined}
      aria-labelledby="empty-first-title"
    >
      {route && preset ? <Route key={preset.name} preset={preset} /> : null}
      <div className="empty-copy-col">
        <h2 className="empty-title" id="empty-first-title">
          {t('emptyList.firstTitle')}
        </h2>
        <p className="t-small">{t('emptyList.firstBody')}</p>
        <div className="empty-presets">
          {offered.map(({ name }) => {
            const note = PRESET_NOTE[name];
            return (
              <button
                key={name}
                type="button"
                className="empty-preset"
                aria-pressed={name === preset?.name}
                onClick={() => setChosen(name)}
              >
                <span className="empty-radio" aria-hidden="true" />
                <span className="mono">{name}</span>
                {note ? <span className="t-small">{t(note)}</span> : null}
              </button>
            );
          })}
        </div>
        {preset ? (
          <>
            <p className="t-small">{t('emptyList.firstMake')}</p>
            <CommandLine command={addCommand(preset.name)} />
            <p className="t-small">{t('emptyList.firstLater')}</p>
          </>
        ) : null}
        <p className="t-small empty-then">{t('emptyList.firstConnect')}</p>
        <CommandLine command={CONNECT_COMMAND} />
      </div>
    </section>
  );
}

const GHOSTS = [0, 1, 2];
const GHOST_H = 56;

type EmptyCollectionProps = {
  // The collection listed, or undefined under All work (the first collection is shown how).
  collection: string | undefined;
  example: string;
  agents: boolean;
  onCreate: (() => void) | undefined;
};

// A collection with nothing in it: the lanes run under rows still to come, and it says how the first
// one arrives (an agent files it; you can too).
export function EmptyCollection({ collection, example, agents, onCreate }: EmptyCollectionProps) {
  const height = GHOSTS.length * GHOST_H;
  return (
    <section className="empty-state empty-collection" aria-labelledby="empty-collection-title">
      <div className="empty-ghosts" aria-hidden="true">
        <svg width={56} height={height} className="empty-ghost-lanes" aria-hidden="true">
          <Lanes height={height} agents={agents} />
        </svg>
        {GHOSTS.map((index) => (
          <span key={index} className="empty-ghost" style={{ top: index * GHOST_H + 4 }} />
        ))}
      </div>
      <div className="empty-copy-col">
        <h2 className="empty-title" id="empty-collection-title">
          {collection === undefined ? t('empty.noItems') : t('emptyList.nothingIn', { collection })}
        </h2>
        <p className="t-small">
          {tx('emptyList.agentsFile', { command: <code>{playbookCommand(example)}</code> })}
        </p>
        <CommandLine command={createCommand(example, t('emptyList.exampleTitle'))} />
        <div className="empty-actions">
          {onCreate ? (
            <Button onClick={onCreate}>
              <Icon name="plus" />
              {t('app.newItem')}
            </Button>
          ) : null}
          <span className="t-small">{t('emptyList.orAsk')}</span>
        </div>
      </div>
    </section>
  );
}

// Nothing on your turn: said above the list, which keeps running with your lane empty.
export function InboxZero({ items }: { items: readonly Pick<Item, 'turn'>[] }) {
  const working = items.filter(({ turn }) => turn === 'agent').length;
  return (
    <section className="empty-zero" aria-live="polite">
      <h2 className="empty-title">{t('emptyList.zeroTitle')}</h2>
      <p className="t-small">{t('emptyList.zeroBody', { count: working })}</p>
    </section>
  );
}

const STEP_H = 76;

// No agent has acted here yet: how to bring the first one, on the lanes it will use.
export function NoAgent() {
  const height = STEP_H * 3;
  const steps = [
    {
      you: true,
      title: t('emptyList.agentStep1'),
      body: <CommandLine command={CONNECT_COMMAND} />,
    },
    { you: true, title: t('emptyList.agentStep2'), body: t('emptyList.agentAsk') },
    { you: false, title: t('emptyList.agentStep3'), body: t('emptyList.agentWaits') },
  ];
  return (
    <section className="empty-state empty-agent" aria-labelledby="empty-agent-title">
      <div className="empty-copy-col empty-agent-head">
        <h2 className="empty-title" id="empty-agent-title">
          {t('emptyList.agentTitle')}
        </h2>
        <p className="t-small">{t('emptyList.agentBody')}</p>
      </div>
      <div className="empty-steps">
        <svg className="empty-steps-lanes" width={56} height={height} aria-hidden="true">
          <Lanes height={height} agents={false} />
          {steps.map(({ you, title }, index) =>
            you ? (
              <circle
                key={title}
                className="empty-step-dot"
                cx={LANE.you}
                cy={index * STEP_H + 12}
                r={4.5}
              />
            ) : (
              <NodeMark
                key={title}
                kind="incomplete"
                cx={LANE.agent}
                cy={index * STEP_H + 12}
                r={5}
              />
            ),
          )}
        </svg>
        <ol className="empty-step-list">
          {steps.map(({ title, body }) => (
            <li key={title} style={{ minHeight: STEP_H }}>
              <span className="t-ui">{title}</span>
              {typeof body === 'string' ? <span className="t-small">{body}</span> : body}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
