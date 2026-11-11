import { useEffect, useRef, useState } from 'react';
import {
  addCommand,
  CONNECT_COMMAND,
  createCommand,
  playbookCommand,
  routeOf,
} from '../empty-states.ts';
import { type PlainKey, t, tx } from '../i18n/i18n.ts';
import { Button, ChipButton, Icon } from '../kit/index.ts';
import { X } from '../lanes/geometry.ts';
import { lookGlyph } from '../lanes/looks.ts';
import type { Item, PresetView } from '../types.ts';
import { CopyGlyph } from './CopyCommand.tsx';

// The list when there is nothing (yet) to list, in the empty-big grammar (mock:251-254): the lanes
// already drawn and waiting at the left, an italic serif paragraph, the commands in mono wells, the
// ways out as kit buttons. The first run draws its preset's route on the lanes.

const COPIED_MS = 1600;

// A command to run in the repo, in a mono well, with a button that copies it.
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
    <span className="pj-cmd empty-cmd">
      <span className="pj-prompt" aria-hidden="true">
        $
      </span>
      <code>{command}</code>
      <button
        type="button"
        className="pj-copy"
        data-tip={t(copied ? 'emptyList.copied' : 'emptyList.copy')}
        aria-label={t('emptyList.copy')}
        onClick={copy}
      >
        {copied ? <Icon name="check" /> : <CopyGlyph />}
      </button>
    </span>
  );
}

// The two lanes, drawn and waiting: the agents' dashed while no agent has ever acted here.
function Lanes({ height, agents = true }: { height: number; agents?: boolean }) {
  return (
    <>
      <path
        className="eln"
        d={`M${X.ag} 0 V${height}`}
        strokeDasharray={agents ? undefined : '3 4'}
      />
      <path className="elny" d={`M${X.you} 0 V${height}`} />
    </>
  );
}

const STEP = 34;

// A preset's route down the lanes: each state on the lane of its turn, the line an item travels.
function Route({ preset }: { preset: PresetView }) {
  const route = routeOf(preset, STEP);
  return (
    <div className="empty-route" aria-hidden="true">
      <span className="lane-head">
        <span>{t('lanes.agents')}</span>
        <span className="you">{t('lanes.you')}</span>
      </span>
      <div className="empty-route-body" style={{ height: route.height }}>
        <svg className="empty-route-lanes" width={56} height={route.height} aria-hidden="true">
          <Lanes height={route.height} />
          <path className="empty-route-path" d={route.path} />
          {route.stops.map((stop, index) => (
            <g
              key={stop.name}
              transform={`translate(${stop.x} ${index * STEP + STEP / 2})`}
              // biome-ignore lint/security/noDangerouslySetInnerHtml: the lanes' fixed glyph markup
              dangerouslySetInnerHTML={{
                __html: `<circle class="ko" r="6"/>${lookGlyph(stop.look)}`,
              }}
            />
          ))}
        </svg>
        <ol className="empty-route-names">
          {route.stops.map((stop) => (
            <li key={stop.name} style={{ height: STEP }}>
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
    <section className="empty-big empty-first" data-route-only="">
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

// No board yet: pick a preset and it previews itself on the lanes; the command makes it.
export function FirstRun({ presets, chosen, onChoose, route }: FirstRunProps) {
  const { offered, preset } = offeredPresets(presets, chosen);
  return (
    <section
      className="empty-big empty-first"
      data-route={route ? '' : undefined}
      aria-labelledby="empty-first-title"
    >
      {route && preset ? <Route key={preset.name} preset={preset} /> : null}
      <div className="empty-copy">
        <h2 className="empty-title" id="empty-first-title">
          {t('emptyList.firstTitle')}
        </h2>
        <p>{t('emptyList.firstBody')}</p>
        <fieldset className="chips empty-presets" aria-labelledby="empty-first-title">
          {offered.map(({ name }) => {
            const note = PRESET_NOTE[name];
            return (
              <ChipButton key={name} on={name === preset?.name} onClick={() => onChoose(name)}>
                <span className="mono">{name}</span>
                {note ? <small>{t(note)}</small> : null}
              </ChipButton>
            );
          })}
        </fieldset>
        {preset ? (
          <>
            <p className="empty-step">{t('emptyList.firstMake')}</p>
            <CommandLine command={addCommand(preset.name)} />
            <p className="empty-note">{t('emptyList.firstLater')}</p>
          </>
        ) : null}
        <p className="empty-step">{t('emptyList.firstConnect')}</p>
        <CommandLine command={CONNECT_COMMAND} />
      </div>
    </section>
  );
}

const GHOSTS = [0, 1, 2];
const GHOST_H = 56;

type EmptyCollectionProps = {
  // The board listed, or undefined under all work (the first board is shown how).
  collection: string | undefined;
  example: string;
  agents: boolean;
  onCreate: (() => void) | undefined;
};

// A board with nothing in it: the lanes run under rows still to come, and it says how the first one
// arrives (an agent files it; you can too).
export function EmptyCollection({ collection, example, agents, onCreate }: EmptyCollectionProps) {
  const height = GHOSTS.length * GHOST_H;
  return (
    <section className="empty-big empty-collection" aria-labelledby="empty-collection-title">
      <div className="empty-ghosts" aria-hidden="true">
        <svg width={56} height={height} className="empty-ghost-lanes" aria-hidden="true">
          <Lanes height={height} agents={agents} />
        </svg>
        {GHOSTS.map((index) => (
          <span key={index} className="empty-ghost" style={{ top: index * GHOST_H + 8 }} />
        ))}
      </div>
      <div className="empty-copy">
        <h2 className="empty-title" id="empty-collection-title">
          {collection === undefined ? t('empty.noItems') : t('emptyList.nothingIn', { collection })}
        </h2>
        <p>{tx('emptyList.agentsFile', { command: <code>{playbookCommand(example)}</code> })}</p>
        <CommandLine command={createCommand(example, t('emptyList.exampleTitle'))} />
        <div className="acts2">
          {onCreate ? (
            <Button variant="primary" onClick={onCreate}>
              {t('app.newItem')}
            </Button>
          ) : null}
          <span className="empty-note">{t('emptyList.orAsk')}</span>
        </div>
      </div>
    </section>
  );
}

// Nothing on your turn: said above the list, which keeps running with your lane empty.
export function InboxZero({ items }: { items: readonly Pick<Item, 'turn'>[] }) {
  const working = items.filter(({ turn }) => turn === 'agent').length;
  return (
    <section className="empty-big empty-zero" aria-live="polite">
      <h2 className="empty-title">{t('emptyList.zeroTitle')}</h2>
      <p>{t('emptyList.zeroBody', { count: working })}</p>
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
    <section className="empty-big empty-agent" aria-labelledby="empty-agent-title">
      <div className="empty-copy">
        <h2 className="empty-title" id="empty-agent-title">
          {t('emptyList.agentTitle')}
        </h2>
        <p>{t('emptyList.agentBody')}</p>
      </div>
      <div className="empty-steps">
        <svg className="empty-steps-lanes" width={56} height={height} aria-hidden="true">
          <Lanes height={height} agents={false} />
          {steps.map(({ you, title }, index) => (
            <g
              key={title}
              transform={`translate(${you ? X.you : X.ag} ${index * STEP_H + 12})`}
              // biome-ignore lint/security/noDangerouslySetInnerHtml: the lanes' fixed glyph markup
              dangerouslySetInnerHTML={{
                __html: `<circle class="ko" r="6"/>${lookGlyph(you ? 'yours' : 'waiting')}`,
              }}
            />
          ))}
        </svg>
        <ol className="empty-step-list">
          {steps.map(({ title, body }) => (
            <li key={title} style={{ minHeight: STEP_H }}>
              <span className="empty-step-title">{title}</span>
              {typeof body === 'string' ? <span className="empty-note">{body}</span> : body}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
