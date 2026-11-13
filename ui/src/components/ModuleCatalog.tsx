import { useState } from 'react';
import {
  boardsOf,
  type CatalogEntry,
  type CatalogOrigin,
  type ModuleUse,
  usageSummary,
} from '../catalog.ts';
import { type PlainKey, t, tx } from '../i18n/i18n.ts';
import { Pill } from '../kit/index.ts';
import { NodeGlyph } from '../lanes/NodeGlyph.tsx';
import type { FieldModuleUi, Sample } from '../modules/contract.ts';
import { moduleFor } from '../modules/registry.ts';
import type { Remote } from '../remote.ts';
import { ITEMS_HASH, modulesHash } from '../selection.ts';
import type { FieldView, PresetView } from '../types.ts';
import { FieldControl } from './FieldControl.tsx';

const ORIGIN_NOTE: Record<CatalogOrigin, PlainKey | undefined> = {
  official: undefined,
  local: 'catalog.localNote',
  unknown: 'catalog.unknownNote',
};

// Official is the norm, so it stays outlined; local and unknown stand out a little.
function OriginPill({ origin }: { origin: CatalogOrigin }) {
  return origin === 'official' ? (
    <Pill tone="state">{t('catalog.official')}</Pill>
  ) : (
    <Pill>{t(origin === 'local' ? 'catalog.local' : 'catalog.unknown')}</Pill>
  );
}

function summaryOf(entry: CatalogEntry): string {
  return t(entry.origin === 'unknown' ? 'catalog.unknownSummary' : moduleFor(entry.name).summary);
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
        <span className="mod-entry-says">{summaryOf(entry)}</span>
        <span className="mod-entry-use">{note ? t(note) : usageSummary(entry.uses)}</span>
      </a>
    </li>
  );
}

// The left pane: every module the UI knows, then the ones boards name that it does not.
export function ModuleIndex({ entries, selected }: IndexProps) {
  const known = entries.filter(({ origin }) => origin !== 'unknown');
  const unknown = entries.filter(({ origin }) => origin === 'unknown');
  return (
    <nav className="mod-index" aria-label={t('catalog.title')}>
      <div className="mod-index-head">
        <a className="mod-index-title" href={modulesHash()}>
          {t('catalog.title')}
        </a>
        <a className="mod-back" href={ITEMS_HASH}>
          {t('catalog.back')}
        </a>
      </div>
      <ul className="mod-entries">
        {known.map((entry) => (
          <IndexEntry key={entry.name} entry={entry} selected={entry.name === selected} />
        ))}
      </ul>
      {unknown.length > 0 ? (
        <>
          <h2 className="mod-index-sub">{t('catalog.unknownHeading')}</h2>
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
      <NodeGlyph look="queued" size={16} />
      <span className="sample-row-title">
        {isTitle && value !== '' ? value : t('catalog.sampleItem')}
      </span>
      {Row ? <Row field={sample.field} value={value} /> : null}
      {Row || isTitle ? null : <span className="st-small">{t('catalog.outOfRow')}</span>}
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
    <section className="sample" aria-label={t('catalog.sample', { label: t(sample.label) })}>
      <h3 className="sample-label">{t(sample.label)}</h3>
      <dl className="sample-views">
        <dt>{t('catalog.row')}</dt>
        <dd>
          <RowPreview module={module} sample={sample} value={value} />
        </dd>
        <dt>{t('catalog.detail')}</dt>
        <dd>
          {value.trim() === '' ? (
            <span className="st-small">{t('catalog.emptyDetail')}</span>
          ) : (
            <Detail field={sample.field} value={value} />
          )}
        </dd>
        <dt>{t('catalog.edit')}</dt>
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

// A field as its board calls it: its label, else its name.
const fieldName = (field: FieldView) => field.label ?? field.name;

function Uses({ uses, presets }: { uses: ModuleUse[]; presets: Remote<PresetView[]> }) {
  if (presets.status === 'loading') return <p className="st-small">{t('catalog.loadingBoards')}</p>;
  if (presets.status === 'failed') return <p className="st-error">{presets.message}</p>;
  if (uses.length === 0) return <p className="st-small">{t('catalog.noUses')}</p>;
  return (
    <ul className="mod-uses">
      {uses.map((use) => (
        <li key={`${use.board}:${use.field.name}`} className="mod-use">
          <span className="mod-use-head">
            <span className="mod-use-field">{fieldName(use.field)}</span>
            <span className="st-cap">{t('catalog.onBoardName', { board: use.board })}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

type PanelProps = { entry: CatalogEntry; presets: Remote<PresetView[]> };

// The right pane for one module: what it is, how it looks and which board fields use it.
export function ModulePanel({ entry, presets }: PanelProps) {
  const known = entry.origin !== 'unknown';
  const module = moduleFor(entry.name);
  const note = ORIGIN_NOTE[entry.origin];
  return (
    <article className="mod-sheet" aria-labelledby="mod-title">
      <header className="mod-head" data-c="">
        <p className="kicker">
          <b>{t('catalog.fieldModule')}</b> · <OriginPill origin={entry.origin} />
        </p>
        <h1 className="mod-name" id="mod-title">
          {entry.name}
        </h1>
        <p className="dek">{summaryOf(entry)}</p>
        {note ? <p className="mod-note">{t(note)}</p> : null}
      </header>
      {known ? (
        <section className="mod-sec" aria-labelledby="mod-preview">
          <h2 className="margin-label" id="mod-preview">
            {t('catalog.preview')}
            <span>{t('catalog.previewNote')}</span>
          </h2>
          <div className="mod-samples">
            {module.samples.map((sample, index) => (
              <SamplePreview
                key={sample.label}
                module={module}
                sample={sample}
                id={`sample-${entry.name}-${index}`}
              />
            ))}
          </div>
        </section>
      ) : (
        <p className="mod-plain">{tx('catalog.plainUntil', { name: <code>{entry.name}</code> })}</p>
      )}
      <section className="mod-sec" aria-labelledby="mod-uses">
        <h2 className="margin-label" id="mod-uses">
          {t('catalog.usedBy')}
        </h2>
        <Uses uses={entry.uses} presets={presets} />
      </section>
    </article>
  );
}

function BoardList({ presets }: { presets: Remote<PresetView[]> }) {
  if (presets.status === 'loading') return <p className="st-small">{t('catalog.loadingBoards')}</p>;
  if (presets.status === 'failed') return <p className="st-error">{presets.message}</p>;
  const boards = boardsOf(presets.value);
  if (boards.length === 0) return <p className="st-small">{t('catalog.noBoards')}</p>;
  return (
    <ul className="mod-uses">
      {boards.map(({ board, fields }) => (
        <li key={board} className="mod-use">
          <span className="mod-use-head">
            <span className="mod-use-field">{board}</span>
          </span>
          <span className="mod-use-modules">
            {fields.map((field) => (
              <a key={field.name} className="mod-chip" href={modulesHash(field.module)}>
                <span className="st-cap">{fieldName(field)}</span>
                <Pill size="sm">{field.module}</Pill>
              </a>
            ))}
          </span>
        </li>
      ))}
    </ul>
  );
}

// The right pane with no module chosen: what modules are, and which board fields use which.
export function CatalogOverview({ presets }: { presets: Remote<PresetView[]> }) {
  return (
    <article className="mod-sheet" aria-labelledby="mod-title">
      <header className="mod-head" data-c="">
        <p className="kicker">
          <b>{t('catalog.kicker')}</b> · {t('catalog.kickerNote')}
        </p>
        <h1 className="mod-name" id="mod-title">
          {t('catalog.title')}
        </h1>
        <p className="dek">{tx('catalog.intro', { folder: <code>.otea/modules/</code> })}</p>
      </header>
      <section className="mod-sec" aria-labelledby="mod-boards">
        <h2 className="margin-label" id="mod-boards">
          {t('catalog.boards')}
        </h2>
        <BoardList presets={presets} />
      </section>
    </article>
  );
}
