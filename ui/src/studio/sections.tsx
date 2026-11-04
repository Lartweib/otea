import { useState } from 'react';
import { LAYOUT_SLOTS } from '../../../src/core/modules.ts';
import {
  BUILT_IN_COLUMNS,
  FIELD_MODULES,
  type Preset,
  SEVERITY_SCALE,
} from '../../../src/core/preset.ts';
import { t } from '../i18n/i18n.ts';
import { Icon, Node } from '../kit/index.ts';
import type { NodeKind } from '../node-kind.ts';
import {
  asList,
  type Path,
  pushIn,
  type RawField,
  type RawPreset,
  type RawTransition,
  removeState,
  renameState,
  setIn,
  workflowOf,
  workflowPath,
} from './draft.ts';
import { Check, Chip, NameForm, ProblemMark, Seg } from './parts.tsx';

// The editor's sections, one per part of a preset. Each draws the draft's raw YAML data and edits
// it through the draft's YAML document; what is invalid is left to the core to say.

export type SectionProps = {
  raw: RawPreset;
  yaml: string;
  // Undefined while the preset cannot be edited here (official, signed out, on a phone).
  change: ((next: string) => void) | undefined;
  type: string | undefined;
  problems: readonly string[];
  // The draft as the core last read it without problems.
  preset: Preset | undefined;
};

const problemsAt = (problems: readonly string[], at: string) =>
  problems.filter((problem) => problem.startsWith(`${at}:`) || problem.startsWith(`${at}.`));

function Head({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="st-sh">
      <h2 className="t-h">{title}</h2>
      {note ? <span className="t-cap">{note}</span> : null}
      {children ? <span className="st-sha">{children}</span> : null}
    </div>
  );
}

// ---------------------------------------------------------------- fields

const REQUIRED = [
  { value: '', label: 'studio.fields.notRequired' },
  { value: 'complete', label: 'studio.fields.toStart' },
  { value: 'create', label: 'studio.fields.toCreate' },
] as const;

function slotsOf(preset: Preset | undefined, type: string | undefined, field: string): string[] {
  const shape = preset?.types.find(({ name }) => name === type) ?? preset?.types[0];
  if (!shape) return [];
  return LAYOUT_SLOTS.filter((slot) => shape.layout[slot].some((entry) => entry.field === field));
}

type FieldRowProps = {
  name: string;
  field: RawField;
  path: Path;
  open: boolean;
  onToggle: () => void;
  props: SectionProps;
};

function FieldRow({ name, field, path, open, onToggle, props }: FieldRowProps) {
  const { yaml, change, problems, preset, type } = props;
  const title = name === 'title';
  const set = change && !title ? (next: RawField) => change(setIn(yaml, path, next)) : undefined;
  const values = field.module === 'severity' ? [...SEVERITY_SCALE] : (field.values ?? []);
  const bad = problemsAt(problems, path.join('.')).length > 0;
  const placed = slotsOf(preset, type, name);
  return (
    <>
      <button
        type="button"
        className={`st-fr${open ? ' sel' : ''}${bad ? ' bad' : ''}`}
        onClick={onToggle}
        aria-expanded={open}
      >
        <span className="st-fk">
          {bad ? <ProblemMark /> : null}
          {name}
        </span>
        <span className="st-fm">{field.module ?? '—'}</span>
        <span className="st-fm">{field.required ?? '—'}</span>
        <span className="st-fv">{values.length > 0 ? values.join(' · ') : '—'}</span>
        <span className="st-fs">
          {placed.map((slot) => (
            <Chip key={slot}>{slot}</Chip>
          ))}
        </span>
        <span className="st-chev" data-open={open}>
          <Icon name="chevron" />
        </span>
      </button>
      {open ? (
        <div className="st-fx">
          {title ? <p className="t-small">{t('studio.fields.titleLocked')}</p> : null}
          <dl className="st-kv">
            <dt>{t('studio.fields.module')}</dt>
            <dd>
              <Seg
                mono
                label={t('studio.fields.module')}
                options={FIELD_MODULES.map((module) => ({ value: module, label: module }))}
                value={field.module}
                onChange={
                  set &&
                  ((module) => {
                    const next: RawField = { module };
                    if (field.required) next.required = field.required;
                    if (module === 'enum') next.values = field.values ?? ['one', 'two'];
                    set(next);
                  })
                }
              />
            </dd>
            {field.module === 'enum' ? (
              <>
                <dt>{t('studio.fields.values')}</dt>
                <dd>
                  <span className="st-vals">
                    {values.map((value) => (
                      <span key={value} className="st-val">
                        {value}
                        {set && values.length > 1 ? (
                          <button
                            type="button"
                            className="st-valx"
                            aria-label={t('studio.fields.removeValue', { value })}
                            onClick={() => {
                              const kept = values.filter((each) => each !== value);
                              const next: RawField = { ...field, values: kept };
                              if (next.default === value) delete next.default;
                              set(next);
                            }}
                          >
                            <Icon name="close" />
                          </button>
                        ) : null}
                      </span>
                    ))}
                    {set ? (
                      <NameForm
                        label={t('studio.fields.addValue')}
                        placeholder={t('studio.fields.valueHint')}
                        submit={t('studio.fields.value')}
                        pattern={/^\S+$/}
                        onSubmit={(value) => {
                          if (!values.includes(value))
                            set({ ...field, values: [...values, value] });
                        }}
                      />
                    ) : null}
                  </span>
                </dd>
              </>
            ) : null}
            {values.length > 0 ? (
              <>
                <dt>{t('studio.fields.default')}</dt>
                <dd>
                  <Seg
                    mono
                    label={t('studio.fields.default')}
                    options={[
                      { value: '', label: '—' },
                      ...values.map((value) => ({ value, label: value })),
                    ]}
                    value={field.default ?? ''}
                    onChange={
                      set &&
                      ((value) => {
                        const next = { ...field };
                        if (value === '') delete next.default;
                        else next.default = value;
                        set(next);
                      })
                    }
                  />
                  <span className="t-cap">{t('studio.fields.defaultNote')}</span>
                </dd>
              </>
            ) : null}
            <dt>{t('studio.fields.required')}</dt>
            <dd>
              <Seg
                label={t('studio.fields.required')}
                options={REQUIRED.map(({ value, label }) => ({ value, label: t(label) }))}
                value={field.required ?? ''}
                onChange={
                  set &&
                  ((value) => {
                    const next = { ...field };
                    if (value === '') delete next.required;
                    else next.required = value;
                    set(next);
                  })
                }
              />
            </dd>
            <dt>{t('studio.fields.placed')}</dt>
            <dd>
              <span className="st-vals">
                {placed.length === 0 ? (
                  <span className="t-cap">{t('studio.fields.nowhere')}</span>
                ) : (
                  placed.map((slot) => <Chip key={slot}>{slot}</Chip>)
                )}
              </span>
              <span className="t-cap">{t('studio.fields.placedNote')}</span>
            </dd>
          </dl>
          {set ? (
            <div className="st-fxa">
              <button
                type="button"
                className="btn sm quiet"
                onClick={() => change?.(setIn(yaml, path, undefined))}
              >
                {t('studio.fields.remove')}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function FieldTable({
  fields,
  base,
  props,
}: {
  fields: Record<string, RawField>;
  base: Path;
  props: SectionProps;
}) {
  const [open, setOpen] = useState<string>();
  return (
    <div className="st-ft">
      <div className="st-fr hd" aria-hidden="true">
        <span>{t('studio.fields.name')}</span>
        <span>{t('studio.fields.module')}</span>
        <span>{t('studio.fields.required')}</span>
        <span>{t('studio.fields.values')}</span>
        <span>{t('studio.fields.placed')}</span>
        <span />
      </div>
      {Object.entries(fields).map(([name, field]) => (
        <FieldRow
          key={name}
          name={name}
          field={field ?? {}}
          path={[...base, name]}
          open={open === name}
          onToggle={() => setOpen(open === name ? undefined : name)}
          props={props}
        />
      ))}
      {Object.keys(fields).length === 0 ? (
        <p className="t-small st-empty">{t('common.noFields')}</p>
      ) : null}
    </div>
  );
}

export function FieldsSection(props: SectionProps) {
  const { raw, yaml, change, type } = props;
  const own = type === undefined ? undefined : (raw.types?.[type]?.fields ?? {});
  const add = (base: Path) => (name: string) =>
    change?.(setIn(yaml, [...base, name], { module: 'text' }));
  return (
    <>
      <section className="st-sec">
        <Head title={t('studio.fields.title')} note={t('studio.fields.note')}>
          {change ? (
            <NameForm
              label={t('studio.fields.add')}
              placeholder={t('studio.fields.name')}
              hint={t('studio.snakeHint')}
              submit={t('studio.fields.field')}
              onSubmit={add(['fields'])}
            />
          ) : null}
        </Head>
        <FieldTable fields={raw.fields ?? {}} base={['fields']} props={props} />
      </section>
      {own !== undefined && type !== undefined ? (
        <section className="st-sec">
          <Head title={t('studio.fields.own', { type })} note={t('studio.fields.ownNote')}>
            {change ? (
              <NameForm
                label={t('studio.fields.add')}
                placeholder={t('studio.fields.name')}
                hint={t('studio.snakeHint')}
                submit={t('studio.fields.field')}
                onSubmit={add(['types', type, 'fields'])}
              />
            ) : null}
          </Head>
          <FieldTable fields={own} base={['types', type, 'fields']} props={props} />
        </section>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------- layout (read here, edited in the YAML)

export function LayoutSection({ preset, type }: SectionProps) {
  const shape = preset?.types.find(({ name }) => name === type) ?? preset?.types[0];
  return (
    <section className="st-sec">
      <Head title={t('studio.layout.title')} note={t('studio.layout.note')} />
      {shape ? (
        <div className="st-lay">
          {LAYOUT_SLOTS.map((slot) => (
            <div key={slot} className="st-ly">
              <span className="st-lyk">{slot}</span>
              <span className="st-lyv">
                {shape.layout[slot].length === 0 ? <span className="t-cap">—</span> : null}
                {shape.layout[slot].map((entry, index) => (
                  <Chip
                    key={`${entry.module}-${entry.field ?? index}`}
                    tone={entry.field ? undefined : 'module'}
                  >
                    {entry.field ?? entry.id ?? entry.module}
                  </Chip>
                ))}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="t-small">{t('studio.layout.invalid')}</p>
      )}
      <p className="t-cap">{t('studio.layout.ringed')}</p>
    </section>
  );
}

// ---------------------------------------------------------------- states

const TURNS = [
  { value: 'agent', label: 'studio.states.agent' },
  { value: 'human', label: 'turn.you' },
  { value: 'none', label: 'studio.states.closed' },
] as const;

function nodeKind(
  turn: string | undefined,
  closes: string | undefined,
  incomplete: boolean,
): NodeKind {
  if (turn === 'none') return closes === 'done' ? 'done' : 'discarded';
  if (turn === 'human') return 'you';
  return incomplete ? 'incomplete' : 'queued';
}

function WorkflowNote({ raw, type }: { raw: RawPreset; type: string | undefined }) {
  const own = type !== undefined && raw.types?.[type]?.workflow !== undefined;
  if (type === undefined) return null;
  return (
    <p className="t-cap st-wfn">
      {own ? t('studio.workflow.own', { type }) : t('studio.workflow.shared', { type })}
    </p>
  );
}

export function StatesSection(props: SectionProps) {
  const { raw, yaml, change, type, problems } = props;
  const at = workflowPath(raw, type);
  const workflow = workflowOf(raw, type);
  const states = Object.entries(workflow.states ?? {});
  const [renaming, setRenaming] = useState<string>();
  const names = states.map(([name]) => name);
  const set =
    change && ((path: Path, value: unknown) => change(setIn(yaml, [...at, ...path], value)));
  return (
    <section className="st-sec">
      <Head title={t('studio.states.title')}>
        {change ? (
          <NameForm
            label={t('studio.states.add')}
            placeholder={t('studio.fields.name')}
            hint={t('studio.snakeHint')}
            submit={t('studio.states.state')}
            onSubmit={(name) => {
              if (!names.includes(name)) set?.(['states', name], { turn: 'agent' });
            }}
          />
        ) : null}
      </Head>
      <WorkflowNote raw={raw} type={type} />
      <div className="st-starts">
        <span className="t-cap">{t('studio.states.startsIn')}</span>
        <Seg
          mono
          label={t('studio.states.initial')}
          options={names.map((name) => ({ value: name, label: name }))}
          value={workflow.initial}
          onChange={set && ((name) => set(['initial'], name))}
        />
      </div>
      <div className="st-starts">
        <span className="t-cap">{t('studio.states.incompleteIn')}</span>
        <Seg
          mono
          label={t('studio.states.incomplete')}
          options={[
            { value: '', label: '—' },
            ...names
              .filter((name) => name !== workflow.initial)
              .map((name) => ({ value: name, label: name })),
          ]}
          value={workflow.incomplete ?? ''}
          onChange={set && ((name) => set(['incomplete'], name === '' ? undefined : name))}
        />
      </div>
      <div className="st-st">
        {states.map(([name, state]) => {
          const found = problemsAt(problems, [...at, 'states', name].join('.'));
          const requires = asList(state?.requires);
          const toggle = (requirement: string) => (on: boolean) => {
            const next = on
              ? [...requires, requirement]
              : requires.filter((each) => each !== requirement);
            set?.(
              ['states', name, 'requires'],
              next.length === 0 ? undefined : next.length === 1 ? next[0] : next,
            );
          };
          return (
            <div key={name} className={found.length > 0 ? 'st-srw bad' : 'st-srw'}>
              <div className="st-sr">
                <span className="st-sn">
                  <Node kind={nodeKind(state?.turn, state?.closes, name === workflow.incomplete)} />
                  {renaming === name && change ? (
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        const input = event.currentTarget.elements.namedItem(
                          'to',
                        ) as HTMLInputElement;
                        const to = input.value.trim();
                        if (/^[a-z][a-z0-9_]*$/.test(to) && !names.includes(to))
                          change(renameState(yaml, at, name, to));
                        setRenaming(undefined);
                      }}
                    >
                      <input
                        name="to"
                        defaultValue={name}
                        aria-label={t('studio.states.renameTo')}
                        ref={(input) => input?.focus()}
                        onBlur={() => setRenaming(undefined)}
                      />
                    </form>
                  ) : (
                    <b>{name}</b>
                  )}
                  {name === workflow.initial ? (
                    <span className="t-cap">{t('studio.states.initialTag')}</span>
                  ) : null}
                </span>
                <Seg
                  label={t('studio.states.turn')}
                  options={TURNS.map(({ value, label }) => ({ value, label: t(label) }))}
                  value={state?.turn}
                  onChange={
                    set &&
                    ((turn) => {
                      const next = { ...state, turn };
                      if (turn === 'none') next.closes = state?.closes ?? 'discarded';
                      else delete next.closes;
                      set(['states', name], next);
                    })
                  }
                />
                {state?.turn === 'none' ? (
                  <span className="st-closes">
                    <span className="t-cap">{t('studio.states.closes')}</span>
                    <Seg
                      mono
                      label={t('studio.states.closes')}
                      options={[
                        { value: 'done', label: 'done' },
                        { value: 'discarded', label: 'discarded' },
                      ]}
                      value={state.closes}
                      onChange={set && ((closes) => set(['states', name, 'closes'], closes))}
                    />
                  </span>
                ) : null}
                <span className="st-req">
                  <Check
                    checked={requires.includes('children_closed')}
                    onChange={set && toggle('children_closed')}
                  >
                    {t('studio.states.children')}
                  </Check>
                  <Check
                    checked={requires.includes('blockers_closed')}
                    onChange={set && toggle('blockers_closed')}
                  >
                    {t('studio.states.blockers')}
                  </Check>
                </span>
                <span className="st-rowa">
                  {change ? (
                    <>
                      <button
                        type="button"
                        className="btn sm quiet"
                        onClick={() => setRenaming(name)}
                      >
                        {t('studio.rename')}
                      </button>
                      <button
                        type="button"
                        className="btn sm quiet icon"
                        aria-label={t('studio.states.remove', { state: name })}
                        onClick={() => change(removeState(yaml, at, name))}
                      >
                        <Icon name="close" />
                      </button>
                    </>
                  ) : null}
                </span>
              </div>
              {found.map((problem) => (
                <p key={problem} className="st-why">
                  <ProblemMark />
                  <code>{problem}</code>
                </p>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- moves

const WHO = [
  { value: 'agent', label: 'studio.moves.agent' },
  { value: 'human', label: 'studio.moves.human' },
  { value: 'human-ui', label: 'studio.moves.humanUi' },
] as const;

export function MovesSection(props: SectionProps) {
  const { raw, yaml, change, type, problems } = props;
  const at = workflowPath(raw, type);
  const workflow = workflowOf(raw, type);
  const states = workflow.states ?? {};
  const moves = workflow.transitions ?? [];
  const [open, setOpen] = useState<number>();
  const set =
    change &&
    ((index: number, move: RawTransition | undefined) =>
      change(setIn(yaml, [...at, 'transitions', index], move)));
  const startable = Object.entries(states)
    .filter(([, state]) => state?.turn !== 'none')
    .map(([name]) => name);
  return (
    <section className="st-sec">
      <Head title={t('studio.moves.title')} note={t('studio.moves.note')}>
        {change && startable.length > 0 ? (
          <button
            type="button"
            className="btn sm"
            onClick={() => {
              const from = startable[0] as string;
              const to = Object.keys(states).find((name) => name !== from) ?? from;
              change(pushIn(yaml, [...at, 'transitions'], { from, to, by: 'human' }));
              setOpen(moves.length);
            }}
          >
            <Icon name="plus" />
            {t('studio.moves.move')}
          </button>
        ) : null}
      </Head>
      <WorkflowNote raw={raw} type={type} />
      <div className="st-mt">
        {moves.map((move, index) => {
          const sources = asList(move.from);
          const closesDone = states[move.to ?? '']?.closes === 'done';
          const found = problemsAt(problems, [...at, 'transitions', index].join('.'));
          const selected = open === index;
          const key = `${sources.join(',')}-${move.to}-${move.by}-${index}`;
          return (
            <div
              key={key}
              className={`st-mrw${selected ? ' sel' : ''}${found.length > 0 ? ' bad' : ''}`}
            >
              <div className="st-mr">
                <button
                  type="button"
                  className="st-mf"
                  onClick={() => setOpen(selected ? undefined : index)}
                  aria-expanded={selected}
                >
                  <span className="st-from">{sources.join(', ')}</span>
                  <span className="st-arw">→</span>
                  <b>{move.to}</b>
                </button>
                <Seg
                  label={t('studio.moves.who')}
                  options={WHO.map(({ value, label }) => ({
                    value,
                    label: t(label),
                    ...(value === 'agent' && closesDone
                      ? { struck: t('studio.moves.agentStruck') }
                      : {}),
                  }))}
                  value={move.by}
                  onChange={set && ((by) => set(index, { ...move, by }))}
                />
                <Seg
                  mono
                  label={t('studio.moves.reason')}
                  options={[
                    { value: '', label: t('studio.moves.noReason') },
                    { value: 'required', label: t('studio.moves.reasonRequired') },
                  ]}
                  value={move.reason ?? ''}
                  onChange={
                    set &&
                    ((reason) => {
                      const next = { ...move };
                      if (reason === '') delete next.reason;
                      else next.reason = reason;
                      set(index, next);
                    })
                  }
                />
              </div>
              {selected ? (
                <div className="st-mx">
                  {closesDone ? (
                    <p className="st-note">
                      <Icon name="warn" />
                      <span>{t('studio.moves.agentWhy', { state: move.to ?? '' })}</span>
                    </p>
                  ) : null}
                  <dl className="st-kv">
                    <dt>{t('studio.moves.from')}</dt>
                    <dd>
                      <span className="st-vals">
                        {startable.map((name) => (
                          <Check
                            key={name}
                            checked={sources.includes(name)}
                            onChange={
                              set &&
                              ((on) => {
                                const next = on
                                  ? [...sources, name]
                                  : sources.filter((each) => each !== name);
                                if (next.length > 0)
                                  set(index, {
                                    ...move,
                                    from: next.length === 1 ? (next[0] as string) : next,
                                  });
                              })
                            }
                          >
                            {name}
                          </Check>
                        ))}
                      </span>
                      <span className="t-cap">{t('studio.moves.closedNoStart')}</span>
                    </dd>
                    <dt>{t('studio.moves.to')}</dt>
                    <dd>
                      <Seg
                        mono
                        label={t('studio.moves.to')}
                        options={Object.keys(states).map((name) => ({ value: name, label: name }))}
                        value={move.to}
                        onChange={set && ((to) => set(index, { ...move, to }))}
                      />
                    </dd>
                  </dl>
                  {set ? (
                    <div className="st-fxa">
                      <button
                        type="button"
                        className="btn sm quiet"
                        onClick={() => {
                          set(index, undefined);
                          setOpen(undefined);
                        }}
                      >
                        {t('studio.moves.remove')}
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {found.map((problem) => (
                <p key={problem} className="st-why">
                  <ProblemMark />
                  <code>{problem}</code>
                </p>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- gates

export function GatesSection(props: SectionProps) {
  const { raw, yaml, change, type, problems } = props;
  const at = workflowPath(raw, type);
  const workflow = workflowOf(raw, type);
  const states = Object.keys(workflow.states ?? {});
  const gates = Object.entries(workflow.gates ?? {});
  return (
    <section className="st-sec">
      <Head title={t('studio.gates.title')} note={t('studio.gates.note')}>
        {change ? (
          <NameForm
            label={t('studio.gates.add')}
            placeholder={t('studio.fields.name')}
            hint={t('studio.snakeHint')}
            submit={t('studio.gates.action')}
            onSubmit={(name) => change(setIn(yaml, [...at, 'gates', name], states.slice(0, 1)))}
          />
        ) : null}
      </Head>
      <WorkflowNote raw={raw} type={type} />
      {gates.length === 0 ? (
        <p className="t-small">{t('studio.gates.none')}</p>
      ) : (
        <div
          className="st-gm"
          style={{ gridTemplateColumns: `140px repeat(${states.length}, minmax(0, 1fr)) 32px` }}
        >
          <span className="st-gh" />
          {states.map((state) => (
            <span key={state} className="st-gh">
              {state}
            </span>
          ))}
          <span className="st-gh" />
          {gates.map(([action, allowed]) => (
            <GateRow
              key={action}
              action={action}
              allowed={allowed ?? []}
              states={states}
              bad={problemsAt(problems, [...at, 'gates', action].join('.')).length > 0}
              set={change && ((next) => change(setIn(yaml, [...at, 'gates', action], next)))}
            />
          ))}
        </div>
      )}
      <p className="t-cap">{t('studio.gates.read')}</p>
    </section>
  );
}

type GateRowProps = {
  action: string;
  allowed: string[];
  states: string[];
  bad: boolean;
  set: ((next: string[] | undefined) => void) | undefined;
};

function GateRow({ action, allowed, states, bad, set }: GateRowProps) {
  return (
    <>
      <span className="st-ga">
        {bad ? <ProblemMark /> : null}
        {action}
      </span>
      {states.map((state) => (
        <span key={state} className="st-gc">
          <input
            type="checkbox"
            aria-label={t('studio.gates.cell', { action, state })}
            checked={allowed.includes(state)}
            disabled={set === undefined || (allowed.length === 1 && allowed.includes(state))}
            title={
              allowed.length === 1 && allowed.includes(state)
                ? t('studio.gates.atLeastOne')
                : undefined
            }
            onChange={(event) =>
              set?.(
                event.target.checked
                  ? states.filter((each) => each === state || allowed.includes(each))
                  : allowed.filter((each) => each !== state),
              )
            }
          />
        </span>
      ))}
      <span className="st-gc">
        {set ? (
          <button
            type="button"
            className="btn sm quiet icon"
            aria-label={t('studio.gates.remove', { action })}
            onClick={() => set(undefined)}
          >
            <Icon name="close" />
          </button>
        ) : null}
      </span>
    </>
  );
}

// ---------------------------------------------------------------- views

const ONE_LINE = ['enum', 'severity', 'text'];

export function ViewsSection(props: SectionProps) {
  const { raw, yaml, change, preset } = props;
  const view = raw.view ?? {};
  const types = preset?.types ?? [];
  const fieldNames = [...new Set(types.flatMap((type) => Object.keys(type.fields)))];
  const moduleOf = (name: string) => types.map((type) => type.fields[name]?.module).find(Boolean);
  const everyType = (name: string) => types.every((type) => type.fields[name] !== undefined);
  const groups = [
    ...['turn', 'state', 'type'].map((value) => ({ value, label: value })),
    ...fieldNames
      .filter((name) => name !== 'title' && everyType(name))
      .map((name) => ({
        value: name,
        label: name,
        ...(ONE_LINE.includes(moduleOf(name) ?? '')
          ? {}
          : { struck: t('studio.views.notOneLine', { module: moduleOf(name) ?? '' }) }),
      })),
  ];
  const columns = preset?.view.columns ?? [];
  const candidates = [
    ...BUILT_IN_COLUMNS,
    ...fieldNames.filter((name) => name !== 'title' && ONE_LINE.includes(moduleOf(name) ?? '')),
  ];
  const set =
    change && ((key: string, value: unknown) => change(setIn(yaml, ['view', key], value)));
  return (
    <section className="st-sec">
      <Head title={t('studio.views.title')} note={t('studio.views.note')} />
      <dl className="st-kv">
        <dt>{t('studio.views.kind')}</dt>
        <dd>
          <Seg
            mono
            label={t('studio.views.kind')}
            options={['list', 'grid', 'board'].map((value) => ({ value, label: value }))}
            value={view.kind ?? 'list'}
            onChange={set && ((kind) => set('kind', kind === 'list' ? undefined : kind))}
          />
          {view.kind === 'board' ? (
            <span className="t-cap">{t('studio.views.boardNote')}</span>
          ) : null}
        </dd>
        <dt>{t('studio.views.groupBy')}</dt>
        <dd>
          <Seg
            mono
            label={t('studio.views.groupBy')}
            options={groups}
            value={view.group_by ?? 'turn'}
            onChange={set && ((group) => set('group_by', group === 'turn' ? undefined : group))}
          />
        </dd>
        <dt>{t('studio.views.columns')}</dt>
        <dd>
          <span className="st-vals">
            {candidates.map((column) => (
              <Check
                key={column}
                checked={columns.includes(column)}
                struck={column === 'title' ? t('studio.views.titleAlways') : undefined}
                onChange={
                  set &&
                  ((on) => {
                    const next = on
                      ? candidates.filter((each) => each === column || columns.includes(each))
                      : columns.filter((each) => each !== column);
                    set('columns', next);
                  })
                }
              >
                {column}
              </Check>
            ))}
          </span>
          <span className="t-cap">
            {view.columns ? t('studio.views.ownColumns') : t('studio.views.defaultColumns')}
          </span>
        </dd>
      </dl>
    </section>
  );
}

// ---------------------------------------------------------------- types

export function TypesSection(props: SectionProps) {
  const { raw, yaml, change, problems } = props;
  const types = Object.entries(raw.types ?? {});
  const names = types.map(([name]) => name);
  const hierarchy = types.some(([, type]) => type?.children !== undefined);
  const [open, setOpen] = useState<string>();
  const roots = types.filter(([, type]) => type?.root !== false).map(([name]) => name);
  return (
    <section className="st-sec">
      <Head title={t('studio.types.title')} note={t('studio.types.note')}>
        {change ? (
          <NameForm
            label={t('studio.types.add')}
            placeholder={t('studio.fields.name')}
            hint={t('studio.snakeHint')}
            submit={t('studio.types.type')}
            onSubmit={(name) => {
              if (!names.includes(name))
                change(
                  setIn(yaml, ['types', name], {
                    label: name.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()),
                  }),
                );
            }}
          />
        ) : null}
      </Head>
      {types.length === 0 ? <p className="t-small">{t('studio.types.none')}</p> : null}
      <div className="st-ft">
        <div className="st-tr hd" aria-hidden="true">
          <span>{t('studio.types.type')}</span>
          <span>{t('studio.types.label')}</span>
          <span>{t('studio.types.mayHold')}</span>
          <span>{t('studio.types.topLevel')}</span>
          <span>{t('studio.types.playbook')}</span>
          <span />
        </div>
        {types.map(([name, type]) => {
          const children = type?.children ?? [];
          const selected = open === name;
          const bad = problemsAt(problems, `types.${name}`).some((problem) =>
            /^types\.[^.]+(\.children|\.root|\.label|\.icon|:)/.test(problem),
          );
          const set =
            change &&
            ((key: string, value: unknown) => change(setIn(yaml, ['types', name, key], value)));
          return (
            <div key={name}>
              <button
                type="button"
                className={`st-tr${selected ? ' sel' : ''}${bad ? ' bad' : ''}`}
                onClick={() => setOpen(selected ? undefined : name)}
                aria-expanded={selected}
              >
                <span className="st-fk">
                  {bad ? <ProblemMark /> : null}
                  {name}
                </span>
                <span>{type?.label}</span>
                <span className="st-fs">
                  {hierarchy ? (
                    children.length > 0 ? (
                      children.map((child) => <Chip key={child}>{child}</Chip>)
                    ) : (
                      <span className="t-cap">{t('studio.types.holdsNothing')}</span>
                    )
                  ) : (
                    <span className="t-cap">{t('studio.types.anyChild')}</span>
                  )}
                </span>
                <span className="t-cap">
                  {type?.root === false ? t('studio.types.onlyChild') : t('studio.types.yes')}
                </span>
                <span className="t-cap">{type?.playbook ?? t('studio.types.sharedOnly')}</span>
                <span className="st-chev" data-open={selected}>
                  <Icon name="chevron" />
                </span>
              </button>
              {selected ? (
                <div className="st-fx">
                  <dl className="st-kv">
                    <dt>{t('studio.types.label')}</dt>
                    <dd>
                      <input
                        className="st-input"
                        defaultValue={type?.label ?? ''}
                        disabled={!set}
                        aria-label={t('studio.types.label')}
                        onBlur={(event) => {
                          const label = event.target.value.trim();
                          if (label !== '' && label !== type?.label) set?.('label', label);
                        }}
                      />
                    </dd>
                    <dt>{t('studio.types.mayHold')}</dt>
                    <dd>
                      <span className="st-vals">
                        {names.map((child) => (
                          <Check
                            key={child}
                            checked={children.includes(child)}
                            onChange={
                              set &&
                              ((on) =>
                                set(
                                  'children',
                                  on
                                    ? names.filter(
                                        (each) => each === child || children.includes(each),
                                      )
                                    : children.filter((each) => each !== child),
                                ))
                            }
                          >
                            {child}
                          </Check>
                        ))}
                      </span>
                      <span className="t-cap">{t('studio.types.onlyThese')}</span>
                    </dd>
                    {hierarchy ? (
                      <>
                        <dt>{t('studio.types.topLevel')}</dt>
                        <dd>
                          <Seg
                            label={t('studio.types.topLevel')}
                            options={[
                              { value: 'yes', label: t('studio.types.yes') },
                              { value: 'child', label: t('studio.types.onlyChild') },
                            ]}
                            value={type?.root === false ? 'child' : 'yes'}
                            onChange={
                              set && ((value) => set('root', value === 'child' ? false : undefined))
                            }
                          />
                        </dd>
                      </>
                    ) : null}
                    <dt>{t('studio.types.workflow')}</dt>
                    <dd>
                      <span className="t-cap">
                        {type?.workflow
                          ? t('studio.types.ownWorkflow')
                          : t('studio.types.sharedWorkflow')}
                      </span>
                      {set && type?.workflow === undefined && raw.workflow ? (
                        <button
                          type="button"
                          className="btn sm quiet"
                          onClick={() => set('workflow', structuredClone(raw.workflow))}
                        >
                          {t('studio.types.giveWorkflow')}
                        </button>
                      ) : null}
                    </dd>
                  </dl>
                  {set && types.length > 1 ? (
                    <div className="st-fxa">
                      <button
                        type="button"
                        className="btn sm quiet"
                        onClick={() => change?.(setIn(yaml, ['types', name], undefined))}
                      >
                        {t('studio.types.remove')}
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      {hierarchy ? (
        <div className="st-sub">
          <Head title={t('studio.types.hierarchy')} note={t('studio.types.hierarchyNote')} />
          <div className="st-tree">
            {roots.map((root) => (
              <div key={root} className="st-tree-row">
                <Chip tone="current">{root}</Chip>
                <span className="st-arw">→</span>
                {(raw.types?.[root]?.children ?? []).length === 0 ? (
                  <span className="t-cap">{t('studio.types.holdsNothing')}</span>
                ) : (
                  (raw.types?.[root]?.children ?? []).map((child) => (
                    <Chip key={child}>{child}</Chip>
                  ))
                )}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
