import { useEffect, useRef, useState } from 'react';
import type { Preset } from '../../../src/core/preset.ts';
import type { Connection } from '../hooks.ts';
import { useRemote } from '../hooks.ts';
import { type PlainKey, t } from '../i18n/i18n.ts';
import { Button, Icon, Pill } from '../kit/index.ts';
import { studioHash } from '../selection.ts';
import type { Item } from '../types.ts';
import { duplicatePreset, fetchPresetSource, type PresetSource, savePreset } from './api.ts';
import {
  diffLines,
  rawOf,
  readDraft,
  type Section,
  sectionOf,
  setIn,
  workflowOf,
} from './draft.ts';
import { Lanes } from './Lanes.tsx';
import { Chip, OkMark, ProblemMark, Seg } from './parts.tsx';
import {
  FieldsSection,
  GatesSection,
  LayoutSection,
  MovesSection,
  type SectionProps,
  StatesSection,
  TypesSection,
  ViewsSection,
} from './sections.tsx';

// A preset in Studio: its outline, the section being edited and a live preview. A project preset
// is edited as a draft, kept in this browser until it is saved; the core reads the draft on every
// change, and save waits until it reads no problem. An official preset is only read: duplicate it
// into the project to change it.

const SECTIONS: readonly Section[] = [
  'types',
  'fields',
  'layout',
  'states',
  'moves',
  'gates',
  'views',
  'playbook',
];

const SECTION_LABEL: Record<Section, PlainKey> = {
  types: 'studio.section.types',
  fields: 'studio.section.fields',
  layout: 'studio.section.layout',
  states: 'studio.section.states',
  moves: 'studio.section.moves',
  gates: 'studio.section.gates',
  views: 'studio.section.views',
  playbook: 'studio.section.playbook',
};

type Draft = { base: string; yaml: string; playbooks: Record<string, string> };

const draftKey = (name: string) => `otea.studio.draft.${name}`;

function storedDraft(name: string, base: string): Draft | undefined {
  try {
    const text = window.localStorage.getItem(draftKey(name));
    const draft = text === null ? undefined : (JSON.parse(text) as Draft);
    return draft?.base === base ? draft : undefined;
  } catch {
    return undefined;
  }
}

function storeDraft(name: string, draft: Draft | undefined): void {
  try {
    if (draft === undefined) window.localStorage.removeItem(draftKey(name));
    else window.localStorage.setItem(draftKey(name), JSON.stringify(draft));
  } catch {
    // The draft still lives in this tab; it is just not kept across a reload.
  }
}

type PresetEditorProps = {
  name: string;
  connection: Connection;
  canWrite: boolean;
  phone: boolean;
  items: readonly Item[];
  onSaved: () => void;
};

export function PresetEditor(props: PresetEditorProps) {
  const [revision, setRevision] = useState(0);
  const source = useRemote(fetchPresetSource(props.name), revision, props.connection);
  if (source.status === 'loading') return <p className="t-small st-msg">{t('common.loading')}</p>;
  if (source.status === 'failed') return <p className="action-error st-msg">{source.message}</p>;
  return (
    <Loaded
      key={`${source.value.name}-${source.value.yaml.length}-${source.value.version}`}
      {...props}
      source={source.value}
      onSaved={() => {
        setRevision((current) => current + 1);
        props.onSaved();
      }}
    />
  );
}

// The playbooks a draft points to: the preset's, then each type's.
function playbookFiles(
  raw: ReturnType<typeof rawOf>,
): Array<{ path: string; owner: string | undefined }> {
  const files: Array<{ path: string; owner: string | undefined }> = [];
  if (raw.playbook) files.push({ path: raw.playbook, owner: undefined });
  for (const [type, spec] of Object.entries(raw.types ?? {})) {
    if (spec?.playbook && !files.some(({ path }) => path === spec.playbook))
      files.push({ path: spec.playbook, owner: type });
  }
  return files;
}

type LoadedProps = PresetEditorProps & { source: PresetSource };

function Loaded({ source, canWrite, phone, items, onSaved }: LoadedProps) {
  const [draft, setDraft] = useState<Draft | undefined>(() =>
    storedDraft(source.name, source.yaml),
  );
  const [section, setSection] = useState<Section>('fields');
  const raw0 = rawOf(draft?.yaml ?? source.yaml);
  const typeNames = Object.keys(raw0.types ?? {});
  const [type, setType] = useState<string | undefined>(typeNames[0]);
  const [preview, setPreview] = useState<'form' | 'lanes' | 'yaml'>('form');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const yaml = draft?.yaml ?? source.yaml;
  const playbooks = { ...source.playbooks, ...(draft?.playbooks ?? {}) };
  const raw = rawOf(yaml);
  const reading = readDraft(yaml);
  const lastGood = useRef<Preset | undefined>(undefined);
  if (reading.ok) lastGood.current = reading.preset;
  const files = playbookFiles(raw);
  const missing = files
    .filter(({ path }) => playbooks[path] === undefined)
    .map(({ path }) => `playbook: ${path} does not exist`);
  const problems = [...(reading.ok ? [] : reading.problems), ...missing];
  const editable = source.editable && canWrite && !phone;
  const dirty =
    draft !== undefined &&
    (draft.yaml !== source.yaml ||
      Object.entries(draft.playbooks).some(([path, text]) => source.playbooks[path] !== text));
  const next = (source.version ?? 0) + 1;
  useEffect(() => storeDraft(source.name, dirty ? draft : undefined), [source.name, draft, dirty]);
  if (type !== undefined && !(type in (raw.types ?? {}))) setType(Object.keys(raw.types ?? {})[0]);
  const change = editable
    ? (text: string) =>
        setDraft({ base: source.yaml, yaml: text, playbooks: draft?.playbooks ?? {} })
    : undefined;
  const setPlaybook = editable
    ? (path: string, text: string) =>
        setDraft({
          base: source.yaml,
          yaml,
          playbooks: { ...(draft?.playbooks ?? {}), [path]: text },
        })
    : undefined;
  const sectionProps: SectionProps = {
    raw,
    yaml,
    change,
    type,
    problems,
    preset: lastGood.current,
  };
  const counts = (key: Section) => problems.filter((problem) => sectionOf(problem) === key).length;
  const save = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const sent = Object.fromEntries(
        files
          .filter(({ path }) => path in playbooks)
          .map(({ path }) => [path, playbooks[path] as string]),
      );
      await savePreset(source.name, yaml, sent);
      storeDraft(source.name, undefined);
      setDraft(undefined);
      setConfirming(false);
      onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('common.failed'));
    } finally {
      setBusy(false);
    }
  };
  const used = source.collections.map(({ name, items: count }) =>
    t('studio.preset.usedBy', { name, count }),
  );
  return (
    <div className="st-preset">
      <header className="st-head">
        <div className="st-hl">
          <a className="t-cap st-crumb" href={studioHash()}>
            {t('studio.crumbPreset')}
          </a>
          <h1 className="st-name">{source.name}</h1>
          {source.origin === 'official' ? (
            <Pill tone="state">{t('studio.preset.official')}</Pill>
          ) : dirty ? (
            <Pill tone="state">{t('studio.preset.draftOf', { version: next })}</Pill>
          ) : (
            <Pill tone="state">{t('studio.preset.saved', { version: source.version ?? '?' })}</Pill>
          )}
          <span className="t-cap st-used">
            {used.length > 0 ? used.join(' · ') : t('studio.preset.unused')}
          </span>
        </div>
        <div className="st-hr">
          <Verdict problems={problems.length} />
          {source.origin === 'official' ? (
            canWrite && !phone ? (
              <Duplicate name={source.name} />
            ) : null
          ) : editable ? (
            <>
              <Button
                variant="quiet"
                size="sm"
                disabled={!dirty}
                onClick={() => {
                  storeDraft(source.name, undefined);
                  setDraft(undefined);
                }}
              >
                {t('studio.discard')}
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={!dirty || problems.length > 0}
                onClick={() => setConfirming(true)}
              >
                {t('studio.preset.save', { version: next })}
              </Button>
            </>
          ) : null}
        </div>
      </header>
      {phone ? <p className="t-cap st-phone-note">{t('studio.phoneReadOnly')}</p> : null}
      <div className="st-ws">
        <nav className="st-out" aria-label={t('studio.outline')}>
          {typeNames.length > 0 ? (
            <>
              <span className="t-label">{t('studio.types.title')}</span>
              <fieldset className="st-types" aria-label={t('studio.types.title')}>
                {typeNames.map((name) => (
                  <button
                    key={name}
                    type="button"
                    aria-pressed={name === type}
                    onClick={() => setType(name)}
                  >
                    {name}
                  </button>
                ))}
              </fieldset>
            </>
          ) : null}
          <div className="st-ol">
            {SECTIONS.map((key) => (
              <button
                key={key}
                type="button"
                aria-current={key === section ? 'true' : undefined}
                onClick={() => setSection(key)}
              >
                <span>{t(SECTION_LABEL[key])}</span>
                {counts(key) > 0 ? (
                  <span className="st-count bad">
                    <ProblemMark />
                    {counts(key)}
                  </span>
                ) : (
                  <span className="t-cap">{outlineCount(key, raw, type, files.length)}</span>
                )}
              </button>
            ))}
          </div>
          <div className="st-saved-in">
            <span className="t-label">{t('studio.preset.savedIn')}</span>
            <code className="t-cap">
              {source.origin === 'official'
                ? `presets/${source.name}/`
                : `.otea/presets/${source.name}/`}
            </code>
          </div>
        </nav>
        <section className="st-ed">
          {section === 'types' ? <TypesSection {...sectionProps} /> : null}
          {section === 'fields' ? <FieldsSection {...sectionProps} /> : null}
          {section === 'layout' ? <LayoutSection {...sectionProps} /> : null}
          {section === 'states' ? <StatesSection {...sectionProps} /> : null}
          {section === 'moves' ? <MovesSection {...sectionProps} /> : null}
          {section === 'gates' ? <GatesSection {...sectionProps} /> : null}
          {section === 'views' ? <ViewsSection {...sectionProps} /> : null}
          {section === 'playbook' ? (
            <PlaybookSection
              files={files}
              playbooks={playbooks}
              type={type}
              yaml={yaml}
              change={change}
              setPlaybook={setPlaybook}
              setDraftAll={
                editable
                  ? (text, path) =>
                      setDraft({
                        base: source.yaml,
                        yaml: text,
                        playbooks: { ...(draft?.playbooks ?? {}), [path]: '' },
                      })
                  : undefined
              }
            />
          ) : null}
          {problems.length > 0 ? (
            <Tray problems={problems} onPick={(problem) => setSection(sectionOf(problem))} />
          ) : null}
          {source.warnings.length > 0 ? (
            <ul className="st-warns">
              {source.warnings.map((warning) => (
                <li key={warning} className="t-cap">
                  <Icon name="warn" />
                  {warning}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
        <aside className="st-pv" aria-label={t('studio.preview.title')}>
          <div className="st-pvh">
            <span className="t-label">{t('studio.preview.title')}</span>
            <Seg
              label={t('studio.preview.title')}
              options={[
                { value: 'form', label: t('studio.preview.form') },
                { value: 'lanes', label: t('studio.preview.lanes') },
                { value: 'yaml', label: t('studio.preview.yaml') },
              ]}
              value={preview}
              onChange={(value) => setPreview(value as typeof preview)}
            />
          </div>
          {preview === 'form' ? <FormPreview preset={lastGood.current} type={type} /> : null}
          {preview === 'lanes' ? <LanesPreview raw={raw} type={type} /> : null}
          {preview === 'yaml' ? <YamlPreview before={source.yaml} after={yaml} /> : null}
        </aside>
      </div>
      {confirming ? (
        <SaveConfirm
          source={source}
          yaml={yaml}
          preset={reading.ok ? reading.preset : undefined}
          items={items}
          version={next}
          busy={busy}
          error={error}
          onSave={save}
          onBack={() => setConfirming(false)}
        />
      ) : null}
    </div>
  );
}

function outlineCount(
  key: Section,
  raw: ReturnType<typeof rawOf>,
  type: string | undefined,
  playbooks: number,
): string {
  const workflow = workflowOf(raw, type);
  switch (key) {
    case 'types':
      return String(Object.keys(raw.types ?? {}).length);
    case 'fields':
      return String(
        Object.keys(raw.fields ?? {}).length +
          Object.keys((type && raw.types?.[type]?.fields) ?? {}).length,
      );
    case 'states':
      return String(Object.keys(workflow.states ?? {}).length);
    case 'moves':
      return String((workflow.transitions ?? []).length);
    case 'gates':
      return String(Object.keys(workflow.gates ?? {}).length);
    case 'views':
      return raw.view?.kind ?? 'list';
    case 'playbook':
      return String(playbooks);
    default:
      return '';
  }
}

function Verdict({ problems }: { problems: number }) {
  return problems === 0 ? (
    <span className="st-vs ok">
      <OkMark />
      <span>
        <b>{t('studio.valid')}</b> · {t('studio.validNote')}
      </span>
    </span>
  ) : (
    <span className="st-vs bad">
      <ProblemMark />
      <span>
        <b>{t('studio.problems', { count: problems })}</b> · {t('studio.saveWaits')}
      </span>
    </span>
  );
}

function Tray({ problems, onPick }: { problems: string[]; onPick: (problem: string) => void }) {
  return (
    <div className="st-tray" role="status">
      <ProblemMark />
      <div className="st-tp">
        <b>{t('studio.problems', { count: problems.length })}</b>
        {problems.map((problem) => (
          <button key={problem} type="button" className="st-tpb" onClick={() => onPick(problem)}>
            <code>{problem}</code>
          </button>
        ))}
      </div>
    </div>
  );
}

function Duplicate({ name }: { name: string }) {
  const [as, setAs] = useState(`${name}-copy`);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="st-dup"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError(undefined);
        try {
          const copy = await duplicatePreset(name, as.trim());
          window.location.hash = studioHash({ kind: 'preset', name: copy.name });
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : t('common.failed'));
        } finally {
          setBusy(false);
        }
      }}
    >
      <input
        className="st-input mono"
        value={as}
        onChange={(event) => setAs(event.target.value)}
        aria-label={t('studio.preset.copyName')}
        spellCheck={false}
      />
      <Button variant="primary" size="sm" type="submit" disabled={busy || as.trim() === ''}>
        {t('studio.preset.duplicate')}
      </Button>
      {error ? <span className="action-error t-small">{error}</span> : null}
    </form>
  );
}

// ---------------------------------------------------------------- playbook

type PlaybookProps = {
  files: Array<{ path: string; owner: string | undefined }>;
  playbooks: Record<string, string>;
  type: string | undefined;
  yaml: string;
  change: ((next: string) => void) | undefined;
  setPlaybook: ((path: string, text: string) => void) | undefined;
  setDraftAll: ((yaml: string, path: string) => void) | undefined;
};

function PlaybookSection({
  files,
  playbooks,
  type,
  yaml,
  setPlaybook,
  setDraftAll,
}: PlaybookProps) {
  const [chosen, setChosen] = useState(files[0]?.path);
  const path = files.some((file) => file.path === chosen) ? chosen : files[0]?.path;
  const text = path === undefined ? undefined : playbooks[path];
  const parts = (text ?? '')
    .split('\n')
    .filter((line) => /^##\s/.test(line))
    .map((line) => line.replace(/^##\s+/, ''));
  const typeHasOwn = type !== undefined && files.some(({ owner }) => owner === type);
  const presetHasOwn = files.some(({ owner }) => owner === undefined);
  return (
    <section className="st-sec">
      <div className="st-sh">
        <h2 className="t-h">{t('studio.section.playbook')}</h2>
        <span className="t-cap">{t('studio.playbook.note')}</span>
      </div>
      <div className="st-pb">
        <div className="st-pbl">
          {files.map((file) => (
            <button
              key={file.path}
              type="button"
              aria-current={file.path === path ? 'true' : undefined}
              onClick={() => setChosen(file.path)}
            >
              <span>{file.owner === undefined ? t('studio.playbook.everyType') : file.owner}</span>
              <code className="t-cap">{file.path}</code>
            </button>
          ))}
          {setDraftAll && !presetHasOwn ? (
            <button
              type="button"
              className="btn sm quiet"
              onClick={() =>
                setDraftAll(setIn(yaml, ['playbook'], './playbook.md'), './playbook.md')
              }
            >
              <Icon name="plus" />
              {t('studio.playbook.addShared')}
            </button>
          ) : null}
          {setDraftAll && type !== undefined && !typeHasOwn ? (
            <button
              type="button"
              className="btn sm quiet"
              onClick={() =>
                setDraftAll(
                  setIn(yaml, ['types', type, 'playbook'], `./playbook/${type}.md`),
                  `./playbook/${type}.md`,
                )
              }
            >
              <Icon name="plus" />
              {t('studio.playbook.addFor', { type })}
            </button>
          ) : null}
          {parts.length > 0 ? (
            <div className="st-parts">
              <span className="t-label">{t('studio.playbook.parts')}</span>
              {parts.map((part) => (
                <span key={part} className="t-small">
                  {part}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <div className="st-pbe">
          {path === undefined ? (
            <p className="t-small">{t('studio.playbook.none')}</p>
          ) : (
            <textarea
              className="st-md"
              value={text ?? ''}
              readOnly={setPlaybook === undefined}
              spellCheck={false}
              aria-label={t('studio.playbook.edit', { path })}
              onChange={(event) => setPlaybook?.(path, event.target.value)}
            />
          )}
          <p className="t-cap">{t('studio.playbook.order')}</p>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- previews

function FormPreview({ preset, type }: { preset: Preset | undefined; type: string | undefined }) {
  const shape = preset?.types.find(({ name }) => name === type) ?? preset?.types[0];
  if (!shape) return <p className="t-small">{t('studio.preview.invalid')}</p>;
  const intake = shape.layout.intake.filter((entry) => entry.field !== undefined);
  const row = shape.layout.row.filter((entry) => entry.field !== undefined);
  return (
    <div className="st-pvb">
      <p className="t-cap">{t('studio.preview.formNote')}</p>
      <div className="st-form">
        <span className="t-label">
          {t('studio.preview.newOf', { type: shape.label.toLowerCase() })}
        </span>
        {intake.map(({ field }) => {
          const spec = shape.fields[field as string];
          if (!spec) return null;
          if (spec.module === 'enum' || spec.module === 'severity') {
            return (
              <div key={field} className="st-in choice">
                <span className="t-cap">{field}</span>
                <Seg
                  label={field as string}
                  options={(spec.values ?? []).map((value) => ({ value, label: value }))}
                  value={spec.default}
                />
              </div>
            );
          }
          return (
            <div key={field} className={spec.module === 'markdown' ? 'st-in tall' : 'st-in'}>
              <span className="t-cap">{field}</span>
              <span className="st-rq">
                {spec.required === 'create'
                  ? t('studio.fields.toCreate')
                  : spec.required === 'complete'
                    ? t('studio.fields.toStart')
                    : ''}
              </span>
            </div>
          );
        })}
        <div className="st-fa">
          <span className="btn primary sm" aria-hidden="true">
            {t('studio.preview.create')}
          </span>
          {shape.workflow.incomplete ? (
            <span className="t-cap">
              {t('studio.preview.incomplete', { state: shape.workflow.incomplete })}
            </span>
          ) : null}
        </div>
      </div>
      <span className="t-label">{t('studio.preview.inRow')}</span>
      <div className="st-prow">
        <b>{t('studio.preview.sampleTitle')}</b>
        <span className="t-cap">
          {[shape.workflow.initial, ...row.map(({ field }) => field as string)].join(' · ')}
        </span>
      </div>
    </div>
  );
}

function LanesPreview({ raw, type }: { raw: ReturnType<typeof rawOf>; type: string | undefined }) {
  const workflow = workflowOf(raw, type);
  const states = Object.entries(workflow.states ?? {}).map(([name, state]) => ({
    name,
    turn: state?.turn ?? 'agent',
    closes: state?.closes,
  }));
  const moves = (workflow.transitions ?? []).flatMap((move) =>
    [move.from ?? []].flat().map((from) => ({ from, to: move.to ?? '', by: move.by ?? '' })),
  );
  const humanUi = moves.filter(({ by }) => by === 'human-ui');
  return (
    <div className="st-pvb">
      <p className="t-cap">{t('studio.preview.lanesNote')}</p>
      <Lanes
        states={states}
        moves={moves}
        initial={workflow.initial}
        incomplete={workflow.incomplete}
      />
      {humanUi.length > 0 ? (
        <div className="st-key">
          <span className="t-label">{t('studio.moves.humanUi')}</span>
          {humanUi.map(({ from, to }) => (
            <Chip key={`${from}-${to}`}>{`${from} → ${to}`}</Chip>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function YamlPreview({ before, after }: { before: string; after: string }) {
  const lines = diffLines(before, after);
  return (
    <div className="st-pvb">
      <p className="t-cap">
        {before === after ? t('studio.preview.yamlSame') : t('studio.preview.yamlNote')}
      </p>
      <pre className="st-src">
        {lines.map((line, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: lines are positional
          <span key={index} className={line.kind}>
            {line.kind === 'add' ? '+ ' : line.kind === 'del' ? '- ' : '  '}
            {line.text}
            {'\n'}
          </span>
        ))}
      </pre>
    </div>
  );
}

type SaveConfirmProps = {
  source: PresetSource;
  yaml: string;
  preset: Preset | undefined;
  items: readonly Item[];
  version: number;
  busy: boolean;
  error: string | undefined;
  onSave: () => void;
  onBack: () => void;
};

// Before writing: the YAML that changes, and the items left in a state or type the draft removes.
function SaveConfirm({
  source,
  yaml,
  preset,
  items,
  version,
  busy,
  error,
  onSave,
  onBack,
}: SaveConfirmProps) {
  const boards = source.collections.map(({ name }) => name);
  const stranded = items.filter((item) => {
    if (!boards.includes(item.collection) || preset === undefined) return false;
    const shape = preset.types.find(({ name }) => name === item.type);
    return shape === undefined || !shape.workflow.states.some(({ name }) => name === item.state);
  });
  const changed = diffLines(source.yaml, yaml).filter((line) => line.kind !== 'same');
  return (
    <div
      className="st-confirm"
      role="dialog"
      aria-modal="true"
      aria-label={t('studio.preset.save', { version })}
    >
      <div className="st-confirm-card raised">
        <h2 className="t-h">{t('studio.preset.save', { version })}</h2>
        <pre className="st-src">
          {changed.map((line, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: lines are positional
            <span key={index} className={line.kind}>
              {line.kind === 'add' ? '+ ' : '- '}
              {line.text}
              {'\n'}
            </span>
          ))}
        </pre>
        {stranded.length > 0 ? (
          <p className="st-note">
            <Icon name="warn" />
            <span>
              {t('studio.preset.stranded', {
                count: stranded.length,
                ids: stranded
                  .slice(0, 4)
                  .map(({ id }) => id)
                  .join(', '),
              })}
            </span>
          </p>
        ) : null}
        <p className="t-cap">
          {t('studio.preset.writes', { path: `.otea/presets/${source.name}/preset.yaml`, version })}
        </p>
        {error ? <p className="action-error t-small">{error}</p> : null}
        <div className="st-confirm-actions">
          <Button variant="primary" onClick={onSave} disabled={busy}>
            {t('studio.preset.save', { version })}
          </Button>
          <Button variant="quiet" onClick={onBack}>
            {t('studio.back')}
          </Button>
        </div>
      </div>
    </div>
  );
}
