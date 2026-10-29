import { useState } from 'react';
import { type CatalogEntry, type CatalogOrigin, type ModuleUse, usageSummary } from '../catalog.ts';
import { Node, Pill } from '../kit/index.ts';
import type { FieldModuleUi, Sample } from '../modules/contract.ts';
import { moduleFor } from '../modules/registry.ts';
import type { Remote } from '../remote.ts';
import { ITEMS_HASH, modulesHash } from '../selection.ts';
import type { PresetView } from '../types.ts';
import { FieldControl } from './FieldControl.tsx';

const ORIGIN_NOTE: Record<CatalogOrigin, string | undefined> = {
  official: undefined,
  local: 'unofficial · at your own risk',
  unknown: 'unknown module · renders as plain text',
};

// Official is the norm, so it stays outlined; local and unknown stand out a little.
function OriginPill({ origin }: { origin: CatalogOrigin }) {
  return origin === 'official' ? (
    <Pill tone="state">official</Pill>
  ) : (
    <Pill>{origin === 'local' ? 'local' : 'unknown'}</Pill>
  );
}

function summaryOf(entry: CatalogEntry): string {
  return entry.origin === 'unknown'
    ? 'Named by a loaded preset, but this UI has no module for it.'
    : moduleFor(entry.name).summary;
}

type IndexProps = { entries: CatalogEntry[]; selected: string | undefined };

function IndexEntry({ entry, selected }: { entry: CatalogEntry; selected: boolean }) {
  const note = ORIGIN_NOTE[entry.origin];
  return (
    <li>
      <a
        className="mod-entry"
        href={modulesHash(entry.name)}
        aria-current={selected ? 'page' : undefined}
      >
        <span className="mod-entry-head">
          <span className="mod-entry-name">{entry.name}</span>
          <OriginPill origin={entry.origin} />
        </span>
        <span className="t-small">{summaryOf(entry)}</span>
        <span className="t-cap">{note ?? usageSummary(entry.uses)}</span>
      </a>
    </li>
  );
}

// The left pane: every module the UI knows, then the ones presets name that it does not.
export function ModuleIndex({ entries, selected }: IndexProps) {
  const known = entries.filter(({ origin }) => origin !== 'unknown');
  const unknown = entries.filter(({ origin }) => origin === 'unknown');
  return (
    <nav className="mod-index" aria-label="Field modules">
      <div className="mod-index-head">
        <a className="t-h mod-index-title" href={modulesHash()}>
          Field modules
        </a>
        <a className="quiet-link t-small" href={ITEMS_HASH}>
          Back to items
        </a>
      </div>
      <ul className="mod-entries">
        {known.map((entry) => (
          <IndexEntry key={entry.name} entry={entry} selected={entry.name === selected} />
        ))}
      </ul>
      {unknown.length > 0 ? (
        <>
          <h2 className="t-label mod-index-sub">Named by presets, not in this UI</h2>
          <ul className="mod-entries">
            {unknown.map((entry) => (
              <IndexEntry key={entry.name} entry={entry} selected={entry.name === selected} />
            ))}
          </ul>
        </>
      ) : null}
    </nav>
  );
}

function RowPreview({
  module,
  sample,
  value,
}: {
  module: FieldModuleUi;
  sample: Sample;
  value: string;
}) {
  const { Row } = module;
  // The list draws the title itself; every other field reaches the row only through its module.
  const isTitle = sample.field.name === 'title';
  return (
    <span className="sample-row">
      <Node kind="queued" />
      <span className="sample-row-title">{isTitle && value !== '' ? value : 'Sample item'}</span>
      {Row ? <Row field={sample.field} value={value} /> : null}
      {Row || isTitle ? null : <span className="t-small">stays out of the row</span>}
    </span>
  );
}

// One sample: its edit control drives its row and detail, locally. Nothing is ever saved.
function SamplePreview({
  module,
  sample,
  id,
}: {
  module: FieldModuleUi;
  sample: Sample;
  id: string;
}) {
  const [value, setValue] = useState(sample.value);
  const { Detail } = module;
  return (
    <section className="sample" aria-label={`Sample: ${sample.label}`}>
      <h3 className="t-label sample-label">{sample.label}</h3>
      <dl className="fields sample-views">
        <dt>row</dt>
        <dd>
          <RowPreview module={module} sample={sample} value={value} />
        </dd>
        <dt>detail</dt>
        <dd>
          {value.trim() === '' ? (
            <span className="t-small">empty: the detail leaves it out</span>
          ) : (
            <Detail field={sample.field} value={value} />
          )}
        </dd>
        <dt>edit</dt>
        <dd>
          <FieldControl
            id={id}
            field={sample.field}
            value={value}
            disabled={false}
            onChange={setValue}
          />
        </dd>
      </dl>
    </section>
  );
}

function fieldFacts({ field }: ModuleUse): string[] {
  const facts: string[] = [];
  if (field.required) facts.push(`required to ${field.required}`);
  if (field.values) facts.push(`values ${field.values.join(', ')}`);
  if (field.default !== undefined) facts.push(`default ${field.default}`);
  return facts;
}

function Uses({ uses, presets }: { uses: ModuleUse[]; presets: Remote<PresetView[]> }) {
  if (presets.status === 'loading') return <p className="t-small">Loading presets…</p>;
  if (presets.status === 'failed') return <p className="action-error">{presets.message}</p>;
  if (uses.length === 0) return <p className="t-small">No loaded preset uses it yet.</p>;
  return (
    <ul className="mod-uses">
      {uses.map((use) => (
        <li key={`${use.preset}:${use.field.name}`} className="mod-use">
          <span className="mod-use-head">
            <code className="mod-use-field">
              {use.preset}.{use.field.name}
            </code>
            <span className="t-cap">
              {use.origin} preset · v{use.version}
            </span>
          </span>
          {fieldFacts(use).length > 0 ? (
            <span className="t-small">{fieldFacts(use).join(' · ')}</span>
          ) : null}
          <span className="t-small">
            {use.collections.length > 0
              ? `in ${use.collections.join(', ')}`
              : 'no collection uses this preset yet'}
          </span>
        </li>
      ))}
    </ul>
  );
}

type PanelProps = { entry: CatalogEntry; presets: Remote<PresetView[]> };

// The right pane for one module: what it is, how it looks, who uses it, how to declare it.
export function ModulePanel({ entry, presets }: PanelProps) {
  const known = entry.origin !== 'unknown';
  const module = moduleFor(entry.name);
  const note = ORIGIN_NOTE[entry.origin];
  return (
    <article className="detail mod" aria-labelledby="mod-title">
      <header className="detail-head">
        <div className="detail-tags">
          <OriginPill origin={entry.origin} />
          <span className="t-cap">field module</span>
        </div>
        <h1 className="t-display mod-name" id="mod-title">
          {entry.name}
        </h1>
        <p className="t-body">{summaryOf(entry)}</p>
        {note ? <p className="mod-note t-small">{note}</p> : null}
      </header>
      {known ? (
        <section className="mod-section" aria-labelledby="mod-preview">
          <div className="mod-section-head">
            <h2 className="t-h" id="mod-preview">
              Preview
            </h2>
            <p className="t-small">
              Sample values. Edits here stay on this page and are never saved.
            </p>
          </div>
          {module.samples.map((sample, index) => (
            <SamplePreview
              key={sample.label}
              module={module}
              sample={sample}
              id={`sample-${entry.name}-${index}`}
            />
          ))}
        </section>
      ) : (
        <p className="t-body">
          Its values show and edit as plain text until a module named <code>{entry.name}</code> is
          available.
        </p>
      )}
      <section className="mod-section" aria-labelledby="mod-uses">
        <h2 className="t-h" id="mod-uses">
          Used by
        </h2>
        <Uses uses={entry.uses} presets={presets} />
      </section>
      {known ? (
        <section className="mod-section" aria-labelledby="mod-yaml">
          <h2 className="t-h" id="mod-yaml">
            In preset.yaml
          </h2>
          <pre className="mod-yaml well">
            <code>{module.yaml}</code>
          </pre>
        </section>
      ) : null}
    </article>
  );
}

function PresetList({ presets }: { presets: Remote<PresetView[]> }) {
  if (presets.status === 'loading') return <p className="t-small">Loading presets…</p>;
  if (presets.status === 'failed') return <p className="action-error">{presets.message}</p>;
  return (
    <ul className="mod-uses">
      {presets.value.map((preset) => (
        <li key={preset.name} className="mod-use">
          <span className="mod-use-head">
            <code className="mod-use-field">{preset.name}</code>
            <span className="t-cap">
              {preset.origin} preset · v{preset.version}
            </span>
          </span>
          <span className="mod-use-modules">
            {preset.fields.map((field) => (
              <a key={field.name} className="mod-chip" href={modulesHash(field.module)}>
                <span className="t-cap">{field.name}</span>
                <Pill size="sm">{field.module}</Pill>
              </a>
            ))}
          </span>
          <span className="t-small">
            {preset.collections.length > 0
              ? `in ${preset.collections.join(', ')}`
              : 'no collection uses it yet'}
          </span>
        </li>
      ))}
    </ul>
  );
}

// The right pane with no module chosen: what modules are, and which presets pick which.
export function CatalogOverview({ presets }: { presets: Remote<PresetView[]> }) {
  return (
    <article className="detail mod" aria-labelledby="mod-title">
      <header className="detail-head">
        <h1 className="t-display" id="mod-title">
          Field modules
        </h1>
        <p className="t-body">
          Every preset field picks a module. The module decides how the value shows in a list row
          and in the item detail, and how you edit it. Official modules ship with Otea; local
          modules from <code>.otea/modules/</code> will be marked unofficial and run at your own
          risk.
        </p>
      </header>
      <section className="mod-section" aria-labelledby="mod-presets">
        <h2 className="t-h" id="mod-presets">
          Loaded presets
        </h2>
        <PresetList presets={presets} />
      </section>
    </article>
  );
}
