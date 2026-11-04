import { useMemo, useState } from 'react';
import type { Connection as Link } from '../../../src/core/blueprint.ts';
import type { Sample } from '../../../src/core/samples.ts';
import { fetchCollections, fetchPresets } from '../api.ts';
import { type Connection, useRemote } from '../hooks.ts';
import { type PlainKey, t } from '../i18n/i18n.ts';
import { Button, Icon, Pill } from '../kit/index.ts';
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
import {
  type BlueprintDraft,
  blockLoops,
  type CardMode,
  connectionText,
  KINDS,
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
  const selected = selection?.kind === 'link' ? selection.text : undefined;
  const setSelected = (text: string | undefined) =>
    setSelection(text === undefined ? undefined : { kind: 'link', text });
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
  return (
    <div className="st-preset">
      <header className="st-head">
        <div className="st-hl">
          <a className="t-cap st-crumb" href={studioHash()}>
            {t('studio.crumbBlueprint')}
          </a>
          <h1 className="st-name">{blueprint.name}</h1>
          <Pill tone="state">
            {dirty
              ? t('studio.blueprint.draft')
              : t('studio.blueprint.saved', { version: blueprint.version })}
          </Pill>
          <span className="st-tabs">
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
          </span>
        </div>
        <div className="st-hr">
          {diagram ? (
            <span className="st-vs">
              <Icon name="list" />
              <span>{t('studio.blueprint.drawnFrom')}</span>
            </span>
          ) : (
            <>
              <span className={problems.length === 0 ? 'st-vs ok' : 'st-vs bad'}>
                {problems.length === 0 ? <OkMark /> : <ProblemMark />}
                <span>
                  <b>
                    {problems.length === 0
                      ? t('studio.valid')
                      : t('studio.problems', { count: problems.length })}
                  </b>
                  {' · '}
                  {problems.length === 0 ? t('studio.validNote') : t('studio.saveWaits')}
                </span>
              </span>
              {editable ? (
                <>
                  <Button
                    variant="quiet"
                    size="sm"
                    disabled={!dirty}
                    onClick={() => setDraft(saved)}
                  >
                    {t('studio.discard')}
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={!dirty || problems.length > 0 || busy}
                    onClick={save}
                  >
                    {t('studio.blueprint.save')}
                  </Button>
                </>
              ) : null}
            </>
          )}
        </div>
      </header>
      {phone ? <p className="t-cap st-phone-note">{t('studio.phoneReadOnly')}</p> : null}
      <SourceStatus blueprint={blueprint} editable={editable} onChanged={onChanged} />
      {applied && applied.length > 0 ? (
        <p className="st-banner" role="status">
          <OkMark />
          <span>{applied.join(' · ')}</span>
        </p>
      ) : null}
      {error ? <p className="action-error st-banner">{error}</p> : null}
      <div className="st-bws">
        <div className="st-bpw">
          {phone ? (
            <BoardList {...drawn} />
          ) : (
            <BlueprintCanvas
              {...drawn}
              mode={mode}
              onMode={setMode}
              selected={diagram ? undefined : selection}
              onSelect={setSelection}
              onAddBoard={undefined}
            />
          )}
        </div>
        <aside className="st-insp">
          {diagram ? (
            <ReadItAs
              boards={draft.boards}
              connections={read.connections}
              shapes={shapes}
              loops={loops}
            />
          ) : (
            <Inspector
              draft={draft}
              setDraft={editable ? setDraft : undefined}
              presets={presets}
              shapes={shapes}
              connections={read.connections}
              problems={problems}
              selected={selected}
              setSelected={setSelected}
              itemsOf={itemsOf}
            />
          )}
        </aside>
      </div>
    </div>
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

const MEANS: Record<string, PlainKey> = {
  blocks: 'studio.blueprint.means.blocks',
  implements: 'studio.blueprint.means.implements',
  relates: 'studio.blueprint.means.relates',
  duplicates: 'studio.blueprint.means.duplicates',
};

// ---------------------------------------------------------------- the inspector

type InspectorProps = {
  draft: BlueprintDraft;
  setDraft: ((draft: BlueprintDraft) => void) | undefined;
  presets: PresetView[];
  shapes: ReadonlyMap<string, TypeShape[]>;
  connections: Link[];
  problems: string[];
  selected: string | undefined;
  setSelected: (connection: string | undefined) => void;
  itemsOf: (board: string) => number;
};

function Inspector({
  draft,
  setDraft,
  presets,
  shapes,
  connections,
  problems,
  selected,
  setSelected,
  itemsOf,
}: InspectorProps) {
  const boards = draft.boards.map(({ name }) => name);
  const [from, setFrom] = useState({ board: boards[0] ?? '', type: '' });
  const [to, setTo] = useState({ board: boards[1] ?? boards[0] ?? '', type: '' });
  const [kind, setKind] = useState<string>('blocks');
  const typesOf = (board: string) => (shapes.get(board) ?? []).map(({ name }) => name);
  const fromType = from.type || typesOf(from.board)[0] || '';
  const toType = to.type || typesOf(to.board)[0] || '';
  const candidate = `${from.board}.${fromType} ${kind} ${to.board}.${toType}`;
  const chosen = connections.find((connection) => connectionText(connection) === selected);
  const set = setDraft;
  return (
    <div className="st-insp-b">
      {chosen ? (
        <LinkDetail
          connection={chosen}
          shapes={shapes}
          onRemove={
            set &&
            (() => {
              set({
                ...draft,
                connections: draft.connections.filter((text) => text.trim() !== selected),
              });
              setSelected(undefined);
            })
          }
        />
      ) : null}
      <section className="st-sec">
        <div className="st-sh">
          <h2 className="t-h">{t('studio.blueprint.links')}</h2>
          <span className="t-cap">{t('studio.blueprint.linksNote')}</span>
        </div>
        <ul className="st-links">
          {draft.connections.map((text) => (
            <li key={text}>
              <button
                type="button"
                aria-pressed={selected === text.trim()}
                onClick={() => setSelected(selected === text.trim() ? undefined : text.trim())}
              >
                <code>{text}</code>
              </button>
              {set ? (
                <button
                  type="button"
                  className="btn sm quiet icon"
                  aria-label={t('studio.blueprint.removeLink', { link: text })}
                  onClick={() =>
                    set({
                      ...draft,
                      connections: draft.connections.filter((each) => each !== text),
                    })
                  }
                >
                  <Icon name="close" />
                </button>
              ) : null}
            </li>
          ))}
          {draft.connections.length === 0 ? (
            <li className="t-small">{t('studio.blueprint.noLinks')}</li>
          ) : null}
        </ul>
        {set && boards.length > 1 ? (
          <div className="st-newlink">
            <span className="t-label">{t('studio.blueprint.newLink')}</span>
            <EndPicker
              label={t('studio.blueprint.from')}
              boards={boards}
              end={{ board: from.board, type: fromType }}
              typesOf={typesOf}
              onChange={setFrom}
            />
            <Seg
              mono
              label={t('studio.blueprint.kind')}
              options={[
                ...KINDS.map((value) => ({ value, label: value })),
                { value: 'parent', label: 'parent', struck: t('studio.blueprint.parentStruck') },
              ]}
              value={kind}
              onChange={setKind}
            />
            <EndPicker
              label={t('studio.blueprint.to')}
              boards={boards.filter((board) => board !== from.board)}
              end={{
                board:
                  to.board === from.board
                    ? (boards.find((board) => board !== from.board) ?? '')
                    : to.board,
                type: to.board === from.board ? '' : toType,
              }}
              typesOf={typesOf}
              onChange={setTo}
            />
            <p className="t-cap">{t(MEANS[kind] ?? 'studio.blueprint.means.relates')}</p>
            <Button
              size="sm"
              disabled={draft.connections.includes(candidate) || to.board === from.board}
              onClick={() => set({ ...draft, connections: [...draft.connections, candidate] })}
            >
              <Icon name="plus" />
              {t('studio.blueprint.addLink')}
            </Button>
          </div>
        ) : null}
      </section>
      <section className="st-sec">
        <div className="st-sh">
          <h2 className="t-h">{t('studio.blueprint.boards')}</h2>
          <span className="t-cap">{t('studio.blueprint.boardsNote')}</span>
        </div>
        <ul className="st-links">
          {draft.boards.map((board) => {
            const items = itemsOf(board.name);
            return (
              <li key={board.name}>
                <span className="st-board-li">
                  <b className="mono">{board.name}</b>
                  <span className="t-cap">{`${board.preset} · ${t('studio.blueprint.items', { count: items })}`}</span>
                </span>
                {set ? (
                  <button
                    type="button"
                    className="btn sm quiet icon"
                    disabled={items > 0}
                    title={items > 0 ? t('studio.blueprint.keepsItems') : undefined}
                    aria-label={t('studio.blueprint.removeBoard', { board: board.name })}
                    onClick={() =>
                      set({
                        ...draft,
                        boards: draft.boards.filter(({ name }) => name !== board.name),
                        connections: draft.connections.filter(
                          (text) =>
                            !text.split(/\s+/).some((part) => part.startsWith(`${board.name}.`)),
                        ),
                      })
                    }
                  >
                    <Icon name="close" />
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
        {set ? (
          <NewBoard
            presets={presets}
            taken={boards}
            onAdd={(board) => set({ ...draft, boards: [...draft.boards, board] })}
          />
        ) : null}
      </section>
      <section className="st-sec">
        <div className="st-sh">
          <h2 className="t-h">{t('studio.blueprint.playbook')}</h2>
          <span className="t-cap">{t('studio.blueprint.playbookNote')}</span>
        </div>
        <textarea
          className="st-md short"
          value={draft.playbook ?? ''}
          readOnly={set === undefined}
          aria-label={t('studio.blueprint.playbook')}
          spellCheck={false}
          onChange={(event) =>
            set?.({ ...draft, playbook: event.target.value === '' ? null : event.target.value })
          }
        />
      </section>
      {problems.length > 0 ? (
        <div className="st-tray" role="status">
          <ProblemMark />
          <div className="st-tp">
            <b>{t('studio.problems', { count: problems.length })}</b>
            {problems.map((problem) => (
              <code key={problem}>{problem}</code>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function EndPicker({
  label,
  boards,
  end,
  typesOf,
  onChange,
}: {
  label: string;
  boards: string[];
  end: { board: string; type: string };
  typesOf: (board: string) => string[];
  onChange: (end: { board: string; type: string }) => void;
}) {
  return (
    <span className="st-end">
      <span className="t-cap">{label}</span>
      <select
        className="st-input mono"
        value={end.board}
        aria-label={`${label}: ${t('studio.blueprint.board')}`}
        onChange={(event) => onChange({ board: event.target.value, type: '' })}
      >
        {boards.map((board) => (
          <option key={board}>{board}</option>
        ))}
      </select>
      <span className="st-arw">.</span>
      <select
        className="st-input mono"
        value={end.type}
        aria-label={`${label}: ${t('studio.blueprint.type')}`}
        onChange={(event) => onChange({ board: end.board, type: event.target.value })}
      >
        {typesOf(end.board).map((type) => (
          <option key={type}>{type}</option>
        ))}
      </select>
    </span>
  );
}

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

function LinkDetail({
  connection,
  shapes,
  onRemove,
}: {
  connection: Link;
  shapes: ReadonlyMap<string, TypeShape[]>;
  onRemove: (() => void) | undefined;
}) {
  const waits = shapes
    .get(connection.to.board)
    ?.find(({ name }) => name === connection.to.type)
    ?.waits.find(({ on }) => on === 'blockers');
  return (
    <section className="st-linkd raised">
      <span className="t-label">{t('studio.blueprint.link')}</span>
      <code>{connectionText(connection)}</code>
      <span className="t-label">{t('studio.blueprint.whatItDoes')}</span>
      <p className="t-small">{describe(connection, waits?.state)}</p>
      {connection.kind === 'blocks' ? (
        <p className="st-note">
          {waits ? <span className="st-bw-i">⧗</span> : <Icon name="warn" />}
          <span>
            {waits
              ? t('studio.blueprint.waitsIn', { type: connection.to.type, state: waits.state })
              : t('studio.blueprint.waitsNothing', { type: connection.to.type })}
          </span>
        </p>
      ) : null}
      {onRemove ? (
        <Button variant="quiet" size="sm" onClick={onRemove}>
          {t('studio.blueprint.removeThis')}
        </Button>
      ) : null}
    </section>
  );
}

function describe(connection: Link, state: string | undefined): string {
  const params = {
    from: `${connection.from.board}.${connection.from.type}`,
    to: `${connection.to.board}.${connection.to.type}`,
    state: state ?? '',
  };
  if (connection.kind === 'blocks') return t('studio.blueprint.doesBlocks', params);
  if (connection.kind === 'implements') return t('studio.blueprint.doesImplements', params);
  if (connection.kind === 'duplicates') return t('studio.blueprint.doesDuplicates', params);
  return t('studio.blueprint.doesRelates', params);
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
