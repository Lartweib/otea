import { useMemo, useState } from 'react';
import type { Connection as Link } from '../../../src/core/blueprint.ts';
import type { Sample } from '../../../src/core/samples.ts';
import { fetchCollections, fetchPresets } from '../api.ts';
import { type Connection, useRemote } from '../hooks.ts';
import { t } from '../i18n/i18n.ts';
import { Button, Icon } from '../kit/index.ts';
import type { Remote } from '../remote.ts';
import { studioHash } from '../selection.ts';
import type { CollectionView, PresetView } from '../types.ts';
import {
  applyBlueprint,
  type BlueprintListing,
  type BlueprintSummary,
  editBlueprint,
  fetchBlueprints,
  fetchPresetSamples,
  fetchProjectBlueprint,
  type ProjectBlueprint,
  updateBlueprint,
} from './api.ts';
import { BlueprintCanvas, BoardList, type Selection } from './BlueprintCanvas.tsx';
import { BlueprintInspector } from './BlueprintInspector.tsx';
import {
  type BlueprintDraft,
  blockLoops,
  type CardMode,
  connectionText,
  type Reading,
  readBlueprintDraft,
  readingsFor,
  shapesOf,
  type TypeShape,
} from './blueprint.ts';
import { OkMark, ProblemMark, Seg } from './parts.tsx';
import { boardSample } from './preview.ts';

// The project's blueprint in Studio: its boards and the links allowed between them, edited as the
// project's own copy, or drawn as the diagram of who waits for whom. A project without one picks a
// blueprint to build its boards from.

type PageProps = {
  diagram: boolean;
  connection: Connection;
  version: number;
  canWrite: boolean;
  phone: boolean;
  onChanged: () => void;
};

export function BlueprintPage({
  diagram,
  connection,
  version,
  canWrite,
  phone,
  onChanged,
}: PageProps) {
  const [revision, setRevision] = useState(0);
  const state = useRemote(fetchProjectBlueprint, version + revision, connection);
  const presets = useRemote(fetchPresets, version + revision, connection);
  const collections = useRemote(fetchCollections, version + revision, connection);
  // Each preset's samples, read once per set of presets: they are files, not items.
  const names = [
    ...new Set(
      state.status === 'ready'
        ? (state.value.blueprint?.boards ?? []).map(({ preset }) => preset)
        : [],
    ),
  ]
    .sort()
    .join(',');
  const loadSamples = useMemo(() => samplesOf(names), [names]);
  const samples = useRemote(loadSamples, revision, connection);
  const changed = () => {
    setRevision((count) => count + 1);
    onChanged();
  };
  if (state.status === 'loading' || presets.status === 'loading')
    return <p className="t-small st-msg">{t('common.loading')}</p>;
  if (state.status === 'failed') return <p className="action-error st-msg">{state.message}</p>;
  if (presets.status === 'failed') return <p className="action-error st-msg">{presets.message}</p>;
  const { blueprint, problems } = state.value;
  if (blueprint === null) {
    return (
      <>
        {problems.length > 0 ? <p className="action-error st-msg">{problems.join('; ')}</p> : null}
        <Picker
          connection={connection}
          version={version}
          presets={presets.value}
          hasBlueprint={false}
          canWrite={canWrite && !phone}
          onApplied={changed}
        />
      </>
    );
  }
  return (
    <Editor
      key={`${blueprint.name}-${blueprint.connections.join('|')}-${blueprint.boards.map(({ name, preset }) => `${name}:${preset}`).join('|')}-${blueprint.playbook ?? ''}`}
      blueprint={blueprint}
      presets={presets.value}
      samples={samples.status === 'ready' ? samples.value : new Map()}
      icons={collections.status === 'ready' ? collections.value : []}
      diagram={diagram}
      editable={canWrite && !phone}
      phone={phone}
      onChanged={changed}
    />
  );
}

// The samples of each preset named, by preset; a preset whose samples cannot be read has none.
const samplesOf = (names: string) => (signal: AbortSignal) =>
  Promise.all(
    names
      .split(',')
      .filter(Boolean)
      .map((name) =>
        fetchPresetSamples(name)(signal).then(
          ({ samples }) => [name, samples] as const,
          () => [name, []] as const,
        ),
      ),
  ).then((entries) => new Map<string, readonly Sample[]>(entries));

// ---------------------------------------------------------------- the editor

type EditorProps = {
  blueprint: ProjectBlueprint;
  presets: PresetView[];
  samples: ReadonlyMap<string, readonly Sample[]>;
  icons: readonly CollectionView[];
  diagram: boolean;
  editable: boolean;
  phone: boolean;
  onChanged: () => void;
};

function Editor({
  blueprint,
  presets,
  samples,
  icons,
  diagram,
  editable,
  phone,
  onChanged,
}: EditorProps) {
  const saved: BlueprintDraft = {
    boards: blueprint.boards.map(({ name, preset }) => ({ name, preset })),
    connections: blueprint.connections,
    playbook: blueprint.playbook,
  };
  const [draft, setDraft] = useState<BlueprintDraft>(saved);
  const [selection, setSelection] = useState<Selection>();
  const [mode, setMode] = useState<CardMode>('types');
  const [page, setPage] = useState<'canvas' | 'playbook'>('canvas');
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [applied, setApplied] = useState<string[]>();
  const read = readBlueprintDraft(blueprint.name, draft, presets);
  const loops = blockLoops(read.connections);
  const problems = [
    ...read.problems,
    ...loops.map((loop) => t('studio.blueprint.loop', { boards: loop.join(' → ') })),
  ];
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const shapes = new Map(
    draft.boards.map((board) => [
      board.name,
      shapesOf(presets.find(({ name }) => name === board.preset)),
    ]),
  );
  const set = editable && !diagram ? setDraft : undefined;
  const save = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const result = await editBlueprint(draft);
      setApplied(result.applied);
      onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('common.failed'));
    } finally {
      setBusy(false);
    }
  };
  const itemsOf = (board: string) =>
    blueprint.boards.find(({ name }) => name === board)?.items ?? 0;
  const presetOf = (board: string) => {
    const name = draft.boards.find((each) => each.name === board)?.preset;
    return presets.find((each) => each.name === name);
  };
  const drawn = {
    boards: draft.boards,
    connections: read.connections,
    shapes,
    presets,
    // A board not saved yet has no collection: its preset's first type icon stands in.
    iconOf: (board: string) =>
      icons.find(({ name }) => name === board)?.icon ??
      presetOf(board)?.types.find(({ icon }) => icon)?.icon,
    sampleOf: (board: string) => {
      const preset = presetOf(board);
      const sample = preset && boardSample(samples.get(preset.name) ?? [], preset.types);
      // With the board's own prefix, as an item there would read.
      const prefix = icons.find(({ name }) => name === board)?.prefix;
      return sample && prefix ? { ...sample, id: sample.id.replace(/^[^-]+/, prefix) } : sample;
    },
  };
  const select = (next: Selection | undefined) => {
    setSelection(next);
    setPage('canvas');
  };
  const source = 'name' in blueprint.status ? blueprint.status : undefined;
  return (
    <div className="st-preset st-studio st-bp">
      <header className="st-head">
        <div className="st-hl">
          <a className="st-crumb mono" href={studioHash()}>
            {t('studio.crumbBlueprint')}
          </a>
          <h1 className="st-name">{blueprint.name}</h1>
          <span className="st-ver">
            {dirty
              ? t('studio.preset.draftOf', { version: blueprint.version })
              : t('studio.preset.saved', { version: blueprint.version })}
          </span>
          <fieldset className="st-pills" aria-label={t('studio.bar.view')}>
            <a
              href={studioHash({ kind: 'blueprint', diagram: false })}
              aria-current={diagram ? undefined : 'page'}
            >
              {t('studio.blueprint.edit')}
            </a>
            <a
              href={studioHash({ kind: 'blueprint', diagram: true })}
              aria-current={diagram ? 'page' : undefined}
            >
              {t('studio.blueprint.diagram')}
            </a>
          </fieldset>
        </div>
        <div className="st-hr">
          <Verdict problems={problems.length} />
          {editable && !diagram ? (
            <>
              <Button variant="quiet" size="sm" disabled={!dirty} onClick={() => setDraft(saved)}>
                {t('studio.discard')}
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={!dirty || problems.length > 0 || busy}
                onClick={save}
              >
                {t('studio.blueprint.save', { version: blueprint.version })}
              </Button>
            </>
          ) : null}
        </div>
      </header>
      {phone ? (
        <p className="st-phone-strip">
          <Icon name="eye" />
          {t('studio.phone.readOnly')}
        </p>
      ) : null}
      <SourceStatus blueprint={blueprint} editable={editable} onChanged={onChanged} />
      {applied && applied.length > 0 ? (
        <p className="st-banner" role="status">
          <OkMark />
          <span>{applied.join(' · ')}</span>
        </p>
      ) : null}
      {error ? <p className="action-error st-banner">{error}</p> : null}
      {problems.length > 0 ? (
        <div className="st-banner st-bp-problems" role="status">
          <ProblemMark />
          <span>
            {problems.map((problem) => (
              <code key={problem}>{problem}</code>
            ))}
          </span>
        </div>
      ) : null}
      {phone ? (
        <BoardList {...drawn} />
      ) : (
        <div className="st-bpg">
          <nav className="st-bpx" aria-label={t('studio.index.blueprint')}>
            <span className="st-insp-k">{t('studio.index.blueprint')}</span>
            <ul className="st-ix-list">
              {(
                [
                  ['boards', t('studio.blueprint.boards'), draft.boards.length],
                  ['links', t('studio.blueprint.links'), draft.connections.length],
                  ['playbook', t('studio.blueprint.playbookShort'), draft.playbook ? 1 : 0],
                ] as const
              ).map(([key, label, count]) => {
                const current =
                  key === 'playbook'
                    ? page === 'playbook'
                    : page === 'canvas' && (key === 'boards') === (selection?.kind === 'board');
                return (
                  <li key={key}>
                    <button
                      type="button"
                      className="st-ix-row"
                      aria-current={current || undefined}
                      onClick={() => {
                        if (key === 'playbook') setPage('playbook');
                        else if (key === 'boards') {
                          const first = draft.boards[0];
                          select(first && { kind: 'board', name: first.name });
                        } else select(undefined);
                      }}
                    >
                      <span>{label}</span>
                      <span className="st-ix-n">{count}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="st-bpx-foot">
              <span>{t('studio.blueprint.copy')}</span>
              <span>
                {t('studio.blueprint.copyFrom', {
                  name: source?.name ?? blueprint.name,
                  version: source?.version ?? blueprint.version,
                })}
              </span>
              <span>{t('studio.blueprint.savedIn')}</span>
            </p>
          </nav>
          <div className="st-bpw">
            {page === 'playbook' ? (
              <section className="st-sec st-bp-playbook">
                <div className="st-sh">
                  <h2 className="t-h">{t('studio.blueprint.playbook')}</h2>
                  <span className="t-cap">{t('studio.blueprint.playbookNote')}</span>
                </div>
                <textarea
                  className="st-md"
                  value={draft.playbook ?? ''}
                  readOnly={set === undefined}
                  aria-label={t('studio.blueprint.playbook')}
                  spellCheck={false}
                  onChange={(event) =>
                    set?.({
                      ...draft,
                      playbook: event.target.value === '' ? null : event.target.value,
                    })
                  }
                />
              </section>
            ) : (
              <BlueprintCanvas
                {...drawn}
                mode={mode}
                onMode={setMode}
                selected={diagram ? undefined : selection}
                onSelect={select}
                onAddBoard={set && (() => setAdding(!adding))}
              />
            )}
            {adding && set ? (
              <div className="st-bp-add raised">
                <NewBoard
                  presets={presets}
                  taken={draft.boards.map(({ name }) => name)}
                  onAdd={(board) => {
                    set({ ...draft, boards: [...draft.boards, board] });
                    setAdding(false);
                    select({ kind: 'board', name: board.name });
                  }}
                />
              </div>
            ) : null}
          </div>
          {diagram ? (
            <aside className="st-insp">
              <ReadItAs
                boards={draft.boards}
                connections={read.connections}
                shapes={shapes}
                loops={loops}
              />
            </aside>
          ) : (
            <BlueprintInspector
              draft={draft}
              set={set}
              shapes={shapes}
              presets={presets}
              sampleOf={drawn.sampleOf}
              selection={selection}
              onSelect={select}
              itemsOf={itemsOf}
            />
          )}
        </div>
      )}
    </div>
  );
}

function Verdict({ problems }: { problems: number }) {
  return (
    <span className={problems === 0 ? 'st-vs ok' : 'st-vs bad'}>
      {problems === 0 ? <OkMark /> : <ProblemMark />}
      <span>
        <b>{problems === 0 ? t('studio.valid') : t('studio.problems', { count: problems })}</b>
        {' · '}
        {problems === 0 ? t('studio.validNote') : t('studio.saveWaits')}
      </span>
    </span>
  );
}

function SourceStatus({
  blueprint,
  editable,
  onChanged,
}: {
  blueprint: ProjectBlueprint;
  editable: boolean;
  onChanged: () => void;
}) {
  const [result, setResult] = useState<{ applied: string[]; kept: string[] }>();
  const [error, setError] = useState<string>();
  const { status } = blueprint;
  if (result) {
    return (
      <div className="st-banner" role="status">
        <OkMark />
        <span>
          {[...result.applied, ...result.kept].join(' · ') || t('studio.blueprint.refreshed')}
        </span>
      </div>
    );
  }
  if ('error' in status) return <p className="st-banner t-small">{status.error}</p>;
  if (status.upToDate) return null;
  return (
    <div className="st-source">
      <Icon name="warn" />
      <div className="st-source-b">
        <b>
          {status.missing
            ? t('studio.blueprint.sourceMissing')
            : t('studio.blueprint.sourceChanged', { name: status.name })}
        </b>
        {status.missing ? <span className="t-small">{status.missing}</span> : null}
        <ul>
          {status.changes.map((change) => (
            <li key={change}>
              <code>{change}</code>
            </li>
          ))}
        </ul>
        <span className="t-cap">{t('studio.blueprint.sourceNote')}</span>
        {error ? <span className="action-error t-small">{error}</span> : null}
      </div>
      {editable && !status.missing ? (
        <Button
          size="sm"
          onClick={async () => {
            try {
              setResult(await updateBlueprint());
              onChanged();
            } catch (caught) {
              setError(caught instanceof Error ? caught.message : t('common.failed'));
            }
          }}
        >
          {t('studio.blueprint.update')}
        </Button>
      ) : null}
    </div>
  );
}

// + board on the canvas: a name and the preset that builds it; save creates its collection.
function NewBoard({
  presets,
  taken,
  onAdd,
}: {
  presets: PresetView[];
  taken: string[];
  onAdd: (board: { name: string; preset: string }) => void;
}) {
  const [name, setName] = useState('');
  const [preset, setPreset] = useState(presets[0]?.name ?? '');
  const valid = /^[a-z0-9][a-z0-9-]*$/.test(name) && !taken.includes(name);
  return (
    <form
      className="st-newboard"
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid) return;
        onAdd({ name, preset });
        setName('');
      }}
    >
      <span className="t-label">{t('studio.blueprint.newBoard')}</span>
      <input
        className="st-input mono"
        value={name}
        placeholder={t('studio.fields.name')}
        aria-label={t('studio.blueprint.boardName')}
        onChange={(event) => setName(event.target.value.trim())}
        spellCheck={false}
      />
      <select
        className="st-input mono"
        value={preset}
        aria-label={t('studio.blueprint.preset')}
        onChange={(event) => setPreset(event.target.value)}
      >
        {presets.map((each) => (
          <option key={each.name} value={each.name}>
            {`${each.name} v${each.version}`}
          </option>
        ))}
      </select>
      <Button size="sm" type="submit" disabled={!valid}>
        <Icon name="plus" />
        {t('studio.blueprint.addBoard')}
      </Button>
      <span className="t-cap">{t('studio.blueprint.newBoardNote')}</span>
    </form>
  );
}

// ---------------------------------------------------------------- read it as

function ReadItAs({
  boards,
  connections,
  shapes,
  loops,
}: {
  boards: BlueprintDraft['boards'];
  connections: Link[];
  shapes: ReadonlyMap<string, TypeShape[]>;
  loops: string[][];
}) {
  const [board, setBoard] = useState(boards[0]?.name ?? '');
  const readings = readingsFor(board, connections, shapes);
  const group = (kinds: Reading['kind'][]) =>
    readings.filter((reading) => kinds.includes(reading.kind));
  const waits = group(['waits', 'children']);
  const fed = group(['fed']);
  const holds = group(['holds']);
  return (
    <div className="st-insp-b">
      <span className="t-label">{t('studio.blueprint.readAs')}</span>
      <Seg
        mono
        label={t('studio.blueprint.readAs')}
        options={boards.map(({ name }) => ({ value: name, label: name }))}
        value={board}
        onChange={setBoard}
      />
      <h2 className="t-h">{t('studio.blueprint.agentIn', { board })}</h2>
      <ReadGroup title={t('studio.blueprint.waitsFor')} readings={waits} board={board} />
      <ReadGroup title={t('studio.blueprint.fedBy')} readings={fed} board={board} />
      <ReadGroup title={t('studio.blueprint.holdsUp')} readings={holds} board={board} />
      <p className="st-note">
        {loops.length === 0 ? <OkMark /> : <ProblemMark />}
        <span>
          {loops.length === 0
            ? t('studio.blueprint.noLoops')
            : loops
                .map((loop) => t('studio.blueprint.loop', { boards: loop.join(' → ') }))
                .join(' · ')}
        </span>
      </p>
    </div>
  );
}

function ReadGroup({
  title,
  readings,
  board,
}: {
  title: string;
  readings: Reading[];
  board: string;
}) {
  return (
    <div className="st-rg">
      <span className="t-label">{title}</span>
      {readings.length === 0 ? (
        <p className="st-ri">
          <OkMark />
          <span>
            <b>{t('studio.blueprint.nothing')}</b>
          </span>
        </p>
      ) : (
        readings.map((reading) => (
          <ReadLine key={JSON.stringify(reading)} reading={reading} board={board} />
        ))
      )}
    </div>
  );
}

function ReadLine({ reading, board }: { reading: Reading; board: string }) {
  if (reading.kind === 'children') {
    return (
      <p className="st-ri">
        <span className="st-bw-i">⧗</span>
        <span>
          <b>{t('studio.blueprint.ownChildren')}</b>
          <span className="t-small">
            {t('studio.blueprint.childrenLine', { type: reading.type, state: reading.state })}
          </span>
        </span>
      </p>
    );
  }
  const { connection } = reading;
  const other = connection.from.board === board ? connection.to : connection.from;
  const waits = reading.kind === 'waits' || reading.kind === 'holds';
  const silent = waits && reading.state === undefined;
  return (
    <p className="st-ri">
      {silent ? (
        <Icon name="warn" />
      ) : waits ? (
        <span className="st-bw-i">⧗</span>
      ) : (
        <Icon name="link" />
      )}
      <span>
        <b>{`${other.board} · ${connectionText(connection)}`}</b>
        <span className="t-small">
          {reading.kind === 'waits' && reading.state
            ? t('studio.blueprint.waitsLine', {
                type: connection.to.type,
                state: reading.state,
                other: connection.from.type,
                board: connection.from.board,
              })
            : reading.kind === 'holds' && reading.state
              ? t('studio.blueprint.holdsLine', {
                  type: connection.to.type,
                  board: connection.to.board,
                  state: reading.state,
                })
              : silent
                ? t('studio.blueprint.waitsNothing', { type: connection.to.type })
                : t('studio.blueprint.fedLine')}
        </span>
      </span>
    </p>
  );
}

// ---------------------------------------------------------------- picking a blueprint (TP-Create)

type PickerProps = {
  connection: Connection;
  version: number;
  presets: PresetView[];
  hasBlueprint: boolean;
  canWrite: boolean;
  onApplied: () => void;
};

export function Picker({
  connection,
  version,
  presets,
  hasBlueprint,
  canWrite,
  onApplied,
}: PickerProps) {
  const listing: Remote<BlueprintListing> = useRemote(fetchBlueprints, version, connection);
  const [chosen, setChosen] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  if (listing.status !== 'ready')
    return (
      <p className="t-small st-msg">
        {listing.status === 'loading' ? t('common.loading') : listing.message}
      </p>
    );
  const blueprints = listing.value.blueprints;
  const picked = blueprints.find(({ name }) => name === chosen) ?? blueprints[0];
  return (
    <div className="st-start">
      <h1 className="t-display">
        {hasBlueprint ? t('studio.picker.otherTitle') : t('studio.picker.title')}
      </h1>
      <p className="t-body st-lede">{t('studio.picker.lede')}</p>
      <div className="st-pick">
        <div className="st-pick-l">
          <span className="t-label">{t('studio.picker.blueprints')}</span>
          {blueprints.map((blueprint) => (
            <button
              key={blueprint.name}
              type="button"
              className="st-card raised"
              aria-pressed={blueprint === picked}
              onClick={() => setChosen(blueprint.name)}
            >
              <span className="st-card-h">
                <b className="mono">{blueprint.name}</b>
                <span className="t-cap">
                  {`${t('studio.blueprint.boardsCount', { count: blueprint.boards.length })} · ${t(
                    'studio.picker.links',
                    { count: blueprint.connections.length },
                  )}`}
                </span>
                <span className="t-cap st-li-origin">
                  {blueprint.origin === 'official'
                    ? t('studio.picker.official')
                    : t('studio.index.project')}
                </span>
              </span>
              <span className="st-fs">
                {blueprint.boards.map((board) => (
                  <span key={board.name} className="st-chip">
                    {board.name}
                  </span>
                ))}
              </span>
            </button>
          ))}
          {listing.value.problems.map((problem) => (
            <p key={problem.message} className="st-note">
              <ProblemMark />
              <span>{`${problem.blueprint}: ${problem.message}`}</span>
            </p>
          ))}
        </div>
        {picked ? <PickPreview blueprint={picked} presets={presets} /> : null}
      </div>
      {picked && canWrite && !hasBlueprint ? (
        <div className="st-pick-a">
          <Button
            variant="primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(undefined);
              try {
                await applyBlueprint(picked.name);
                onApplied();
                window.location.hash = studioHash({ kind: 'blueprint', diagram: true });
              } catch (caught) {
                setError(caught instanceof Error ? caught.message : t('common.failed'));
              } finally {
                setBusy(false);
              }
            }}
          >
            {t('studio.picker.create', { count: picked.boards.length })}
          </Button>
          <span className="t-cap">
            {t('studio.picker.presetsAsAre', {
              presets: picked.boards
                .map(
                  ({ preset }) =>
                    `${preset} v${presets.find(({ name }) => name === preset)?.version ?? '?'}`,
                )
                .join(', '),
            })}
          </span>
          {error ? <span className="action-error t-small">{error}</span> : null}
        </div>
      ) : hasBlueprint ? (
        <p className="t-cap">{t('studio.picker.hasOne')}</p>
      ) : null}
    </div>
  );
}

function PickPreview({
  blueprint,
  presets,
}: {
  blueprint: BlueprintSummary;
  presets: PresetView[];
}) {
  return (
    <section className="st-gets raised">
      <span className="st-card-h">
        <span className="t-label">{t('studio.picker.gets')}</span>
        <span className="t-cap st-li-origin">{`${blueprint.name} v${blueprint.version}`}</span>
      </span>
      {blueprint.boards.map((board) => {
        const preset = presets.find(({ name }) => name === board.preset);
        return (
          <div key={board.name} className="st-gets-b">
            <span>
              <b>{board.name}</b>
              <span className="t-cap">{t('studio.picker.boardOf', { preset: board.preset })}</span>
            </span>
            <span className="t-cap">
              {(preset?.types ?? []).map(({ name }) => name).join(' · ')}
            </span>
          </div>
        );
      })}
      <span className="t-label">{t('studio.picker.between')}</span>
      {blueprint.connections.length === 0 ? (
        <span className="t-small">{t('studio.blueprint.noLinks')}</span>
      ) : null}
      {blueprint.connections.map((text) => (
        <code key={text} className="t-small">
          {text}
        </code>
      ))}
      <span className="t-label">{t('studio.picker.and')}</span>
      {blueprint.playbook ? <span className="t-small">{t('studio.picker.playbook')}</span> : null}
      <span className="t-small">{t('studio.picker.copy')}</span>
    </section>
  );
}
