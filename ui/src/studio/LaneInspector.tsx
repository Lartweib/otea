import { useState } from 'react';
import { t, tx } from '../i18n/i18n.ts';
import { Icon } from '../kit/index.ts';
import {
  asList,
  type RawPreset,
  removeState,
  renameState,
  setIn,
  workflowOf,
  workflowPath,
} from './draft.ts';
import { byWord, type LaneChoice, moveWord } from './LanesEdit.tsx';
import {
  addMove,
  addState,
  type By,
  byChoices,
  type Closes,
  type Requirement,
  removeMove,
  setCloses,
  setMove,
  setRequires,
  setTurn,
  type Turn,
  waysOut,
} from './lanes-edit.ts';
import { Ask, NameForm, Seg } from './parts.tsx';

// The inspector of the lanes: a state (whose turn, whether it closes, what entering it waits for,
// its ways out and its words) or a move (who may make it, whether it asks a reason, and what the
// state it enters waits for). Only what the core accepts is offered; the rest is struck with why.

export type LaneInspectorProps = {
  raw: RawPreset;
  yaml: string;
  type: string;
  choice: LaneChoice;
  change: ((next: string) => void) | undefined;
  onChoose: (choice: LaneChoice | undefined) => void;
  // How many saved items sit in a state.
  sitting: (state: string) => number;
};

const REQUIREMENTS: readonly Requirement[] = ['blockers_closed', 'children_closed'];

const words = (raw: RawPreset) =>
  (raw as { labels?: { es?: { states?: Record<string, string> } } }).labels?.es;

function Requires({
  raw,
  yaml,
  type,
  state,
  change,
  note,
}: Pick<LaneInspectorProps, 'raw' | 'yaml' | 'type' | 'change'> & { state: string; note: string }) {
  const required = asList(workflowOf(raw, type).states?.[state]?.requires);
  return (
    <Ask question={t('studio.state.waits')} yamlKey={`states.${state}.requires`} note={note}>
      <span className="st-vals">
        {REQUIREMENTS.map((requirement) => {
          const on = required.includes(requirement);
          return (
            <button
              key={requirement}
              type="button"
              className={`st-tog${on ? ' on' : ''}`}
              aria-pressed={on}
              disabled={change === undefined}
              onClick={() => change?.(setRequires(yaml, raw, type, state, requirement, !on))}
            >
              {on ? <Icon name="check" /> : null}
              {requirement.replace('_', ' ')}
            </button>
          );
        })}
      </span>
    </Ask>
  );
}

function StateInspector({
  raw,
  yaml,
  type,
  name,
  change,
  onChoose,
  sitting,
}: LaneInspectorProps & { name: string }) {
  const [renaming, setRenaming] = useState(false);
  const workflow = workflowOf(raw, type);
  const names = Object.keys(workflow.states ?? {});
  const state = workflow.states?.[name] ?? {};
  const turn = (state.turn ?? 'agent') as Turn;
  const out = waysOut(raw, type, name);
  const required = asList(state.requires);
  const es = words(raw);
  const at = workflowPath(raw, type);
  return (
    <>
      <div className="st-insp-h">
        <span className="st-insp-k">{t('studio.state.title')}</span>
        <span className="st-insp-k">
          {t('studio.lanes.of', { at: names.indexOf(name) + 1, total: names.length })}
        </span>
      </div>
      {renaming && change ? (
        <NameForm
          label={t('studio.inspect.renameTo', { name })}
          placeholder={name}
          hint={t('studio.snakeHint')}
          submit={t('studio.rename')}
          onSubmit={(next) => {
            change(renameState(yaml, at, name, next));
            setRenaming(false);
            onChoose({ kind: 'state', name: next });
          }}
        />
      ) : (
        <h2 className="st-insp-name">{name}</h2>
      )}
      <Ask
        question={t('studio.state.whose')}
        yamlKey="turn"
        note={t(
          turn === 'human'
            ? 'studio.state.whose.human'
            : turn === 'none'
              ? 'studio.state.whose.none'
              : 'studio.state.whose.agent',
        )}
      >
        <Seg
          mono
          label={t('studio.state.whose')}
          options={[
            { value: 'agent', label: t('studio.lanes.by.agent') },
            { value: 'human', label: t('studio.lanes.by.human') },
            { value: 'none', label: t('studio.state.nobody') },
          ]}
          value={turn}
          onChange={change && ((value) => change(setTurn(yaml, raw, type, name, value as Turn)))}
        />
      </Ask>
      <Ask question={t('studio.state.closes')} yamlKey="closes">
        <Seg
          mono
          label={t('studio.state.closes')}
          options={[
            { value: '', label: t('studio.fields.notRequired') },
            { value: 'done', label: t('studio.state.asDone') },
            { value: 'discarded', label: t('studio.state.asDiscarded') },
          ]}
          value={state.closes ?? ''}
          onChange={
            change &&
            ((value) =>
              change(
                setCloses(yaml, raw, type, name, value === '' ? undefined : (value as Closes)),
              ))
          }
        />
      </Ask>
      <Requires
        raw={raw}
        yaml={yaml}
        type={type}
        state={name}
        change={change}
        note={
          required.length === 0
            ? t('studio.state.waitsNothing', { state: name })
            : t('studio.state.waitsUntil', { state: name })
        }
      />
      <Ask question={t('studio.state.waysOut')} yamlKey="transitions">
        {out.length === 0 ? (
          <p className="st-ask-n">{t('studio.state.noWayOut')}</p>
        ) : (
          <span className="st-ways">
            {out.map((way) => (
              <button
                key={way.index}
                type="button"
                className="st-val"
                onClick={() => onChoose({ kind: 'move', index: way.index })}
              >
                {`${way.to} · ${moveWord(way.by, way.reason === 'required')}`}
              </button>
            ))}
          </span>
        )}
      </Ask>
      {es ? (
        <Ask question={t('studio.inspect.inSpanish')} yamlKey={`labels.es.states.${name}`}>
          <input
            className="st-input"
            aria-label={t('studio.inspect.inSpanish')}
            value={es.states?.[name] ?? ''}
            readOnly={change === undefined}
            spellCheck={false}
            onChange={(event) =>
              change?.(
                setIn(
                  yaml,
                  ['labels', 'es', 'states', name],
                  event.target.value === '' ? undefined : event.target.value,
                ),
              )
            }
          />
        </Ask>
      ) : null}
      <div className="st-insp-f">
        {change ? (
          <>
            <button type="button" className="btn sm quiet" onClick={() => setRenaming(!renaming)}>
              {t('studio.rename')}
            </button>
            <button
              type="button"
              className="btn sm quiet"
              onClick={() => {
                change(removeState(yaml, at, name));
                onChoose(undefined);
              }}
            >
              {t('studio.state.remove')}
            </button>
          </>
        ) : null}
        <span className="st-insp-k st-insp-used">
          {t('studio.state.sits', { count: sitting(name), state: name })}
        </span>
      </div>
    </>
  );
}

function MoveInspector({
  raw,
  yaml,
  type,
  index,
  change,
  onChoose,
  sitting,
}: LaneInspectorProps & { index: number }) {
  const moves = workflowOf(raw, type).transitions ?? [];
  const move = moves[index];
  if (!move) return null;
  const to = move.to ?? '';
  const from = asList(move.from);
  const choices = byChoices(raw, type, to);
  const struck = choices.find(({ value }) => value === 'agent')?.struck;
  const es = words(raw);
  return (
    <>
      <div className="st-insp-h">
        <span className="st-insp-k">{t('studio.move.title')}</span>
        <span className="st-insp-k">
          {t('studio.lanes.of', { at: index + 1, total: moves.length })}
        </span>
      </div>
      <h2 className="st-insp-name">{`${from.join(', ')} → ${to}`}</h2>
      <Ask
        question={t('studio.move.who')}
        yamlKey="by"
        note={
          move.by === 'human-ui'
            ? tx('studio.move.who.humanUi', { only: <b>{byWord('human-ui')}</b> })
            : move.by === 'human'
              ? t('studio.move.who.human')
              : t('studio.move.who.agent')
        }
      >
        <Seg
          mono
          label={t('studio.move.who')}
          options={choices.map(({ value, struck: why }) => ({
            value,
            label: byWord(value),
            ...(why === undefined ? {} : { struck: why }),
          }))}
          value={move.by}
          onChange={
            change && ((value) => change(setMove(yaml, raw, type, index, { by: value as By })))
          }
        />
      </Ask>
      {struck ? (
        <div className="st-attach">
          <b>{t('studio.move.whyOff')}</b>
          <p>{t('studio.move.whyOffNote', { state: to })}</p>
        </div>
      ) : null}
      <Ask question={t('studio.move.reason')} yamlKey={`reason: ${move.reason ?? '—'}`}>
        <Seg
          mono
          label={t('studio.move.reason')}
          options={[
            { value: '', label: t('studio.move.notAsked') },
            { value: 'required', label: t('studio.move.required') },
          ]}
          value={move.reason ?? ''}
          onChange={
            change &&
            ((value) =>
              change(
                setMove(yaml, raw, type, index, {
                  reason: value === 'required' ? 'required' : undefined,
                }),
              ))
          }
        />
      </Ask>
      <Requires
        raw={raw}
        yaml={yaml}
        type={type}
        state={to}
        change={change}
        note={t('studio.move.waitsNote')}
      />
      {es ? (
        <Ask
          question={t('studio.move.button')}
          yamlKey={`labels.es.states.${to}`}
          note={tx('studio.move.buttonNote', { word: <b>{es.states?.[to] ?? to}</b> })}
        >
          <input
            className="st-input"
            aria-label={t('studio.move.button')}
            value={es.states?.[to] ?? ''}
            readOnly={change === undefined}
            spellCheck={false}
            onChange={(event) =>
              change?.(
                setIn(
                  yaml,
                  ['labels', 'es', 'states', to],
                  event.target.value === '' ? undefined : event.target.value,
                ),
              )
            }
          />
        </Ask>
      ) : null}
      <div className="st-insp-f">
        {change ? (
          <button
            type="button"
            className="btn sm quiet"
            onClick={() => {
              change(removeMove(yaml, raw, type, index));
              onChoose(undefined);
            }}
          >
            {t('studio.move.remove')}
          </button>
        ) : null}
        <span className="st-insp-k st-insp-used">
          {t('studio.state.sits', {
            count: from.reduce((sum, state) => sum + sitting(state), 0),
            state: from.join(', '),
          })}
        </span>
      </div>
    </>
  );
}

function NewState({ raw, yaml, type, change, onChoose }: LaneInspectorProps) {
  const [turn, setLane] = useState<Turn>('agent');
  const names = Object.keys(workflowOf(raw, type).states ?? {});
  return (
    <>
      <div className="st-insp-h">
        <span className="st-insp-k">{t('studio.state.new')}</span>
      </div>
      <Ask question={t('studio.state.whose')} yamlKey="turn" note={t('studio.state.newNote')}>
        <Seg
          mono
          label={t('studio.state.whose')}
          options={[
            { value: 'agent', label: t('studio.lanes.by.agent') },
            { value: 'human', label: t('studio.lanes.by.human') },
          ]}
          value={turn}
          onChange={(value) => setLane(value as Turn)}
        />
      </Ask>
      <Ask question={t('studio.state.name')} yamlKey="states.*">
        <NameForm
          label={t('studio.state.name')}
          placeholder={t('studio.state.namePlaceholder')}
          hint={t('studio.snakeHint')}
          submit={t('studio.lanes.addState')}
          onSubmit={(name) => {
            if (names.includes(name) || !change) return;
            change(addState(yaml, raw, type, name, turn));
            onChoose({ kind: 'state', name });
          }}
        />
      </Ask>
    </>
  );
}

function NewMove({ raw, yaml, type, change, onChoose }: LaneInspectorProps) {
  const workflow = workflowOf(raw, type);
  const names = Object.keys(workflow.states ?? {});
  const open = names.filter((name) => workflow.states?.[name]?.turn !== 'none');
  const [from, setFrom] = useState(open[0] ?? '');
  const [to, setTo] = useState(names.find((name) => name !== open[0]) ?? '');
  const choices = byChoices(raw, type, to);
  const [by, setBy] = useState<By>('human');
  const total = workflow.transitions?.length ?? 0;
  return (
    <>
      <div className="st-insp-h">
        <span className="st-insp-k">{t('studio.move.new')}</span>
      </div>
      <Ask question={t('studio.move.from')} yamlKey="from">
        <select
          className="st-input"
          aria-label={t('studio.move.from')}
          value={from}
          onChange={(event) => setFrom(event.target.value)}
        >
          {open.map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
      </Ask>
      <Ask question={t('studio.move.to')} yamlKey="to">
        <select
          className="st-input"
          aria-label={t('studio.move.to')}
          value={to}
          onChange={(event) => setTo(event.target.value)}
        >
          {names.map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
      </Ask>
      <Ask question={t('studio.move.who')} yamlKey="by">
        <Seg
          mono
          label={t('studio.move.who')}
          options={choices.map(({ value, struck }) => ({
            value,
            label: byWord(value),
            ...(struck === undefined ? {} : { struck }),
          }))}
          value={by}
          onChange={(value) => setBy(value as By)}
        />
      </Ask>
      <div className="st-insp-f">
        <button
          type="button"
          className="btn sm"
          disabled={
            !change ||
            from === '' ||
            to === '' ||
            from === to ||
            choices.find(({ value }) => value === by)?.struck !== undefined
          }
          onClick={() => {
            change?.(addMove(yaml, raw, type, from, to, by));
            onChoose({ kind: 'move', index: total });
          }}
        >
          <Icon name="plus" />
          {t('studio.lanes.addMove')}
        </button>
      </div>
    </>
  );
}

export function LaneInspector(props: LaneInspectorProps) {
  const { choice } = props;
  return (
    <aside className="st-insp" aria-label={t('studio.inspect.title')}>
      {choice.kind === 'state' ? (
        <StateInspector {...props} name={choice.name} />
      ) : choice.kind === 'move' ? (
        <MoveInspector {...props} index={choice.index} />
      ) : choice.kind === 'new-state' ? (
        <NewState {...props} />
      ) : (
        <NewMove {...props} />
      )}
    </aside>
  );
}
