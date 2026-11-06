import { type ReactNode, useContext, useLayoutEffect, useRef, useState } from 'react';
import { turnAgent, waitsOf } from '../actions.ts';
import { DETAILS_ROWS, detailsCut } from '../detail-form.ts';
import { leftovers } from '../evidence.ts';
import { actorLabel, leaseLabel, momentLabel } from '../format.ts';
import { externalUrl, gateRows } from '../gates.ts';
import { agoLabel } from '../handoff.ts';
import { useActiveLease } from '../hooks.ts';
import { type PlainKey, t, tx } from '../i18n/i18n.ts';
import { TypeIcon } from '../icons/TypeIcon.tsx';
import {
  blankValues,
  type DetailBlock,
  type DetailSection,
  detailBlocks,
  entryLabel,
  type PlacedValue,
  placesChildren,
  sectionsInRows,
  slotData,
  typeMark,
  typeOf,
} from '../item-types.ts';
import { AgentMark, Button, Icon, Node, nodeLabel, Pill, TypeTag } from '../kit/index.ts';
import { moduleFor } from '../modules/registry.ts';
import { MOTION, reducedMotion } from '../motion.ts';
import { itemNodeKind } from '../node-kind.ts';
import { ItemTypeScope, keyTitle, stateWord } from '../preset-words.ts';
import { acrossGroups } from '../relations.ts';
import { hashFor } from '../selection.ts';
import type { CollectionView, Item, ItemView, Turn, TypeView } from '../types.ts';
import { BulkTray } from './BulkTray.tsx';
import { useDetailForm } from './detail-aside.ts';
import { EvidenceList } from './EvidenceList.tsx';
import { EvidenceModule } from './evidence/EvidenceModule.tsx';
import { GateBlock } from './Gate.tsx';
import { HandoffLine } from './HandoffLine.tsx';
import { ItemActions } from './ItemActions.tsx';
import type { CollectionOf } from './ItemList.tsx';
import { OptionsModule } from './OptionsModule.tsx';
import { RoundsModule } from './RoundsModule.tsx';
import { AcrossBoards } from './relations/AcrossBoards.tsx';
import { ChildrenModule } from './relations/ChildrenModule.tsx';
import { RelationsModule } from './relations/RelationsModule.tsx';
import { ShowEmpty } from './show-empty.ts';
import { Timeline } from './Timeline.tsx';

// A field's value as the detail draws it; where the builder asks for them, an empty one says so.
function Shown({ field, value }: { field: PlacedValue['field']; value: string }) {
  const word = useContext(ShowEmpty);
  const { Detail } = moduleFor(field.module);
  if (value === '' && word !== undefined)
    return <span className="detail-none">{t('detail.emptyOn', { type: word })}</span>;
  return <Detail field={field} value={value} />;
}

// : the data attributes of the field's place in the layout, on its label and its value.
function Field({
  label,
  children,
  slot,
}: {
  label: string;
  children: ReactNode;
  slot?: Readonly<Record<string, string>>;
}) {
  return (
    <>
      <dt {...slot}>{label}</dt>
      <dd {...slot}>{children}</dd>
    </>
  );
}

function FieldList({
  values,
  className = 'fields',
}: {
  values: PlacedValue[];
  className?: string;
}) {
  return (
    <dl className={className}>
      {values.map(({ field, value, label, at }) => {
        return (
          <Field key={field.name} label={label} slot={slotData(at)}>
            <Shown field={field} value={value} />
          </Field>
        );
      })}
    </dl>
  );
}

// The header slot under the title, as a strip of what the item is (a repo task's repo, branch and
// pull request): each label over its value, a web address as an external link, an empty one said.
function IdStrip({
  type,
  values,
}: {
  type: TypeView | undefined;
  values: Readonly<Record<string, string>>;
}) {
  const entries = (type?.layout.header ?? []).flatMap((entry, index) => {
    const field = type?.fields.find(({ name }) => name === entry.field);
    if (!type || !field) return [];
    const at = { type: type.name, slot: 'header' as const, index, field: field.name };
    return [{ field, label: entryLabel(type, field.name, entry.label), at }];
  });
  if (entries.length === 0) return null;
  return (
    <dl className="detail-ids">
      {entries.map(({ field, label, at }) => {
        const value = values[field.name] ?? '';
        const url = externalUrl(value);
        const { Detail } = moduleFor(field.module);
        return (
          <div key={field.name} {...slotData(at)}>
            <dt>{label}</dt>
            <dd>
              {value === '' ? (
                <span className="detail-none">{t('detail.noneYet')}</span>
              ) : url ? (
                <a className="detail-ext" href={url} target="_blank" rel="noreferrer noopener">
                  {url.replace(/^https?:\/\//, '')}
                  <Icon name="external" />
                </a>
              ) : (
                <Detail field={field} value={value} />
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

// One section of the detail: its name in the left margin above a hairline, its content in the
// reading column beside it (above it on a phone, and on top in the band and the aside). travel: the
// key a section that moves between the forms is followed by. count: shown next to the name in the
// aside. name: the section's own, for its heading's id.
function Section({
  name,
  label,
  children,
  travel,
  count,
  section,
  half,
}: {
  name: string;
  label: string;
  children: ReactNode;
  travel?: string;
  count?: string;
  section?: number;
  half?: boolean;
}) {
  const id = `detail-${name}`;
  return (
    <section
      className={half ? 'detail-section detail-section-half' : 'detail-section'}
      aria-labelledby={id}
      data-travel={travel}
      data-section={section}
    >
      <h2 className="detail-section-label" id={id}>
        <span>{label}</span>
        {count ? <span className="t-cap detail-section-count">{count}</span> : null}
      </h2>
      <div className="detail-section-body">{children}</div>
    </section>
  );
}

// The field that leads the brief, as `otea create --description` fills it.
const LEAD = 'description';

const TURN_LABEL: Record<Turn, PlainKey> = {
  human: 'turn.yours',
  agent: 'turn.agentGeneric',
  none: 'turn.closed',
};

type ItemDetailProps = {
  item: ItemView;
  canWrite: boolean;
  collection: CollectionView | undefined;
  // Finds the collection of a related item, to draw its node.
  collectionOf: CollectionOf;
  // Opens the create form for a child of this item.
  onAddChild?: ((parent: ItemView) => void) | undefined;
  // unfold: opened inside its own row on a phone. The row is the header, and the moves wait at the
  // bottom, in reach of a thumb.
  layout?: 'pane' | 'unfold';
  onMoved?: (() => void) | undefined;
  // Beside a grid that takes the room back once nothing is open: closes the detail.
  onClose?: (() => void) | undefined;
  // The items of the board, to read a child's fields and to move ticked children together.
  itemOf?: ((id: string) => Item | undefined) | undefined;
  // Where the tray for ticked children docks: the detail pane's bottom edge (App).
  trayHost?: HTMLElement | null | undefined;
  // The viewer may reshape this view (Studio's writes, not on a phone): shows Customize view.
  canCustomize?: boolean | undefined;
  // The Customize view's canvas: Structure draws its empty rows ("No children", "No relations")
  // even where the item has none to show.
  placeholders?: boolean | undefined;
};

// The detail of another item comes in (the old one leaves at once): it rises 6px into place, or
// under reduced motion crossfades. An unfolded detail has its own motion (Unfold).
function useContentIn(id: string, enabled: boolean) {
  const root = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (!enabled || !id) return;
    const reduced = reducedMotion();
    root.current?.animate(
      reduced
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [
            { opacity: 0, transform: 'translateY(6px)' },
            { opacity: 1, transform: 'none' },
          ],
      reduced ? { duration: MOTION.fast } : { duration: MOTION.base, easing: MOTION.ease },
    );
  }, [id, enabled]);
  return root;
}

// A margin index: the header (where the item stands, its title, who handed it over, its moves), then
// Brief (what to decide on), Structure (children and relations), Details (where it lives, who made
// it) and History. On a wide pane (detail-form.ts) the header and Details form a band, closed by one
// line across both columns; below it, History sits beside Brief and Structure.
export function ItemDetail({
  item,
  canWrite,
  collection,
  collectionOf,
  onAddChild,
  layout = 'pane',
  onMoved,
  onClose,
  itemOf,
  trayHost,
  canCustomize = false,
  placeholders = false,
}: ItemDetailProps) {
  const lease = useActiveLease(item.lease);
  const root = useContentIn(item.id, layout === 'pane');
  // On a wide pane Details moves into the band and History beside the main column.
  const form = useDetailForm(root, layout === 'pane');
  // Which item's long Details is shown whole in the band.
  const [allDetails, setAllDetails] = useState<string | null>(null);
  // The last move made here, said under the moves once the item has taken it.
  const [landed, setLanded] = useState<{ id: string; to: string; at: string } | null>(null);
  // The children ticked in Structure, moved together from the tray.
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());
  const toggleTick = (id: string) =>
    setTicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const type = typeOf(collection, item.type);
  const kind = itemNodeKind(item, type, lease !== null);
  const emptyWord = useContext(ShowEmpty);
  const shownFields =
    emptyWord === undefined || !type ? item.fields : { ...blankValues(type), ...item.fields };
  const { primary, side, sections } = detailBlocks(type, shownFields);
  const parent = item.relations.find(({ kind }) => kind === 'parent');
  const gates = gateRows(type, item.state, item.gates);
  const loose = leftovers(type, item.evidence);
  const block = (part: DetailBlock, index: number) => {
    if (part.kind === 'fields') {
      // The description leads the brief as plain text, without a label; the other fields follow it.
      const lead = part.values.find(({ field }) => field.name === LEAD);
      const rest = part.values.filter((value) => value !== lead);

      return (
        <div key={`fields:${index}`} className="detail-fields">
          {lead ? (
            <div className="detail-lead" {...slotData(lead.at)}>
              <Shown field={lead.field} value={lead.value} />
            </div>
          ) : null}
          {rest.length > 0 ? <FieldList values={rest} /> : null}
        </div>
      );
    }
    if (part.kind === 'relation') {
      const key = `relation:${part.entry.module}:${index}`;
      return part.entry.module === 'children' ? (
        <ChildrenModule
          key={key}
          slot={slotData(part.at)}
          item={item}
          entry={part.entry}
          canWrite={canWrite}
          placeholder={placeholders}
          collectionOf={collectionOf}
          onAddChild={onAddChild}
          itemOf={itemOf}
          ticks={
            canWrite && itemOf && layout === 'pane'
              ? { checked: ticked, toggle: toggleTick }
              : undefined
          }
        />
      ) : (
        <RelationsModule
          key={key}
          slot={slotData(part.at)}
          item={item}
          entry={part.entry}
          canWrite={canWrite}
          placeholder={placeholders}
          collectionOf={collectionOf}
          withChildren={!placesChildren(type)}
        />
      );
    }
    if (part.kind === 'reserved') {
      const key = `reserved:${part.entry.module}:${index}`;
      if (part.entry.module === 'rounds' && type) {
        return (
          <RoundsModule
            key={key}
            slot={slotData(part.at)}
            item={item}
            type={type}
            entry={part.entry}
            canWrite={canWrite}
          />
        );
      }
      if (part.entry.module === 'options') {
        return <OptionsModule key={key} slot={slotData(part.at)} item={item} entry={part.entry} />;
      }
      return null;
    }
    if (part.kind === 'module') {
      return (
        <EvidenceModule
          key={`module:${part.entry.id}`}
          slot={slotData(part.at)}
          entry={part.entry}
          evidence={item.evidence}
          canWrite={canWrite}
        />
      );
    }
    if (loose.length === 0) return null;
    // Beside modules, the plain list holds what none of them draws.
    const others = loose.length < item.evidence.length;
    return (
      <section key="evidence" className="evidence-section" aria-labelledby="evidence-title">
        <h3 className="t-label" id="evidence-title">
          {t(others ? 'detail.otherFiles' : 'detail.evidence')}
        </h3>
        <EvidenceList evidence={loose} canWrite={canWrite} />
      </section>
    );
  };
  // Relation modules make the Structure, wherever the layout places them; the rest of the side
  // goes with the details.
  const brief = primary.filter((part) => part.kind !== 'relation');
  // With sections, relations draw where a section places them; the side's go to Structure only when
  // no section places one.
  const sectionRelations = (sections ?? []).some(({ blocks }) =>
    blocks.some((part) => part.kind === 'relation'),
  );
  const structure = [...primary, ...side].filter(
    (part) => part.kind === 'relation' && !sectionRelations,
  );
  // Details: the side slot's values and where the item lives, one row each; the side's modules
  // follow them.
  const aside = side.filter((part) => part.kind !== 'relation');
  const mark = typeMark(collection, item.type);
  const detailRows: { label: string; value: ReactNode; slot?: Record<string, string> }[] = [
    ...(mark
      ? [
          {
            label: t('detail.type'),
            value:
              mark.kind === 'icon' ? (
                <span className="detail-type">
                  <TypeIcon name={mark.icon} size={14} />
                  {mark.word}
                </span>
              ) : (
                <TypeTag name={mark.name} label={mark.label} />
              ),
          },
        ]
      : []),
    ...aside.flatMap((part) =>
      part.kind === 'fields'
        ? part.values.map(({ field, value, label, at }) => {
            return { label, value: <Shown field={field} value={value} />, slot: slotData(at) };
          })
        : [],
    ),
    { label: t('detail.collection'), value: item.collection },
    {
      label: t('detail.createdBy'),
      value: (
        <>
          {item.createdBy.kind === 'agent' ? (
            <AgentMark name={item.createdBy.name} className="created-mark" decorative />
          ) : null}
          {`${actorLabel(item.createdBy)} · ${momentLabel(item.createdAt, Date.now())}`}
        </>
      ),
    },
    ...(lease ? [{ label: t('detail.lease'), value: leaseLabel(lease) }] : []),
    { label: t('detail.updated'), value: momentLabel(item.updatedAt, Date.now()) },
  ];
  const cut = detailsCut(detailRows.length, form !== 'aside' || allDetails === item.id);
  const asideModules = aside.filter((part) => part.kind !== 'fields');
  const briefParts = brief.map(block).filter((part) => part !== null);
  const structureParts = structure.map(block).filter((part) => part !== null);
  // Sections in order; two consecutive half sections share a row. A section with nothing to show
  // is left out, except in the builder, which draws it so it can be filled.
  const partsOf = new Map(
    (sections ?? []).map((section) => [
      section.index,
      [
        ...section.blocks.map(block).filter((part) => part !== null),
        ...(section.index === sections?.[0]?.index ? briefParts : []),
      ],
    ]),
  );
  const drawSection = (section: DetailSection) => (
    <Section
      key={`section:${section.index}`}
      name={`section-${section.index}`}
      label={section.title}
      section={section.index}
      half={section.width === 'half'}
    >
      {partsOf.get(section.index)}
    </Section>
  );
  const drawn = (sections ?? []).filter(
    ({ index }) => placeholders || (partsOf.get(index)?.length ?? 0) > 0,
  );
  const sectionRows = sectionsInRows(drawn).map((row) =>
    row.length === 2 ? (
      <div key={`pair:${row[0]?.index}`} className="detail-pair">
        {row.map(drawSection)}
      </div>
    ) : (
      row.map(drawSection)
    ),
  );
  const across = acrossGroups(item.relations, item.collection);
  const standing = lease ? t('detail.onIt', { holder: lease.holder }) : t(TURN_LABEL[item.turn]);
  const unfolded = layout === 'unfold';
  const agent = turnAgent(item.events);
  const receipt =
    landed && landed.id === item.id && landed.to === item.state ? (
      <span className="move-receipt">
        {tx('detail.receipt', {
          state: <b>{stateWord(type, landed.to)}</b>,
          turn:
            item.turn === 'human'
              ? t('turn.yours')
              : item.turn === 'agent'
                ? agent
                  ? t('turn.agent', { agent })
                  : t('turn.anAgent')
                : t('turn.closed'),
          ago: agoLabel(landed.at, Date.now()),
        })}
      </span>
    ) : undefined;
  const actions = canWrite ? (
    <ItemActions
      key={`${item.id}:${item.state}`}
      id={item.id}
      moves={item.transitions}
      waits={waitsOf(item)}
      turn={item.turn}
      agent={agent}
      receipt={receipt}
      compact={layout === 'unfold'}
      onMoved={(to) => {
        setLanded({ id: item.id, to, at: new Date().toISOString() });
        onMoved?.();
      }}
    />
  ) : (
    <p className="t-small">{tx('detail.readOnly', { command: <code>otea open</code> })}</p>
  );
  const stateShown = stateWord(type, item.state);
  return (
    <ItemTypeScope type={type}>
      <article
        ref={root}
        className="detail"
        data-layout={layout}
        data-form={form}
        aria-label={unfolded ? item.title : undefined}
      >
        {unfolded ? null : (
          <header className="detail-head">
            <div className="detail-head-row">
              <div className="detail-tags">
                <Node kind={kind} label={nodeLabel(kind)} />
                <span className="t-id">{item.id}</span>
                <Pill
                  tone="state"
                  yours={item.turn === 'human'}
                  title={keyTitle(stateShown, item.state)}
                >
                  {stateShown}
                </Pill>
                <span className="t-cap">{standing}</span>
              </div>
              {canCustomize ? (
                <a
                  className="btn sm quiet detail-customize"
                  href={`#/customize/${encodeURIComponent(item.id)}`}
                >
                  <Icon name="sliders" />
                  {t('detail.customize')}
                </a>
              ) : null}
              {onClose ? (
                <Button
                  variant="quiet"
                  size="sm"
                  icon
                  className="detail-close"
                  aria-label={t('detail.close')}
                  title={t('common.close')}
                  onClick={onClose}
                >
                  <Icon name="close" />
                </Button>
              ) : null}
            </div>
            <div className="detail-head-body">
              {parent ? (
                <a className="detail-crumb" href={hashFor(parent.id)}>
                  <span className="visually-hidden">{t('detail.parent')}</span>
                  <TypeIcon
                    name={typeOf(collectionOf(parent.collection), parent.type)?.icon}
                    size={14}
                  />
                  <span className="t-id">{parent.id}</span>
                  <span className="detail-crumb-title">{parent.title}</span>
                </a>
              ) : null}
              <h1 className="t-display">{item.title}</h1>
              <IdStrip type={type} values={item.fields} />
              <HandoffLine
                item={item}
                type={type}
                canWrite={canWrite}
                collectionOf={collectionOf}
              />
              {actions}
            </div>
          </header>
        )}
        {unfolded ? null : <i className="detail-line" aria-hidden="true" />}
        <div className="detail-main">
          {/* Unfolded in its row, the header is the row: the strip leads the detail instead. */}
          {unfolded ? <IdStrip type={type} values={item.fields} /> : null}
          {item.missing.length > 0 ? (
            <div className="missing well">
              <span className="t-label">{t('detail.missing')}</span>
              <span className="t-ui">{item.missing.join(', ')}</span>
            </div>
          ) : null}
          {across.length > 0 ? (
            <Section name="across" label={t('detail.across')}>
              <AcrossBoards
                id={item.id}
                groups={across}
                canWrite={canWrite}
                collectionOf={collectionOf}
              />
            </Section>
          ) : null}
          {sections ? (
            <>
              {sectionRows}
              {sectionRows.length === 0 && briefParts.length > 0 ? (
                <div className="detail-rest">{briefParts}</div>
              ) : null}
            </>
          ) : briefParts.length > 0 || placeholders ? (
            <Section name="brief" label={t('detail.brief')}>
              {briefParts.length > 0 ? (
                briefParts
              ) : (
                <p className="t-small">{t('common.noFields')}</p>
              )}
            </Section>
          ) : null}
          {structureParts.length > 0 ? (
            <Section name="structure" label={t('detail.structure')}>
              {structureParts}
            </Section>
          ) : null}
        </div>
        <Section name="details" label={t('detail.details')} travel="details">
          <dl className="fields fields-meta">
            {detailRows.slice(0, cut.shown).map(({ label, value, slot }) => (
              <Field key={label} label={label} {...(slot ? { slot } : {})}>
                {value}
              </Field>
            ))}
          </dl>
          {form === 'aside' && detailRows.length > DETAILS_ROWS ? (
            <button
              type="button"
              className="details-more t-cap"
              aria-expanded={cut.more === 0}
              onClick={() => setAllDetails(cut.more > 0 ? item.id : null)}
            >
              {cut.more > 0 ? t('common.more', { count: cut.more }) : t('detail.fewer')}
            </button>
          ) : null}
          <GateBlock rows={gates} />
          {asideModules.map(block)}
        </Section>
        <Section
          name="history"
          label={t('detail.history')}
          travel="history"
          count={t('detail.events', { count: item.events.length })}
        >
          <Timeline events={item.events} />
        </Section>
        {unfolded ? <div className="unfold-actions">{actions}</div> : null}
        {itemOf && canWrite && layout === 'pane' ? (
          <BulkTray
            selected={[...ticked].flatMap((id) => itemOf(id) ?? [])}
            canWrite={canWrite}
            host={trayHost ?? null}
            onKeep={(ids) => setTicked(new Set(ids))}
            onClear={() => setTicked(new Set())}
            away={false}
          />
        ) : null}
      </article>
    </ItemTypeScope>
  );
}
