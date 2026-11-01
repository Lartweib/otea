import { type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { turnAgent } from '../actions.ts';
import { DETAILS_ROWS, detailsCut } from '../detail-form.ts';
import { leftovers } from '../evidence.ts';
import { actorLabel, leaseLabel, momentLabel } from '../format.ts';
import { agoLabel } from '../handoff.ts';
import { useActiveLease } from '../hooks.ts';
import { TypeIcon } from '../icons/TypeIcon.tsx';
import {
  type DetailBlock,
  detailBlocks,
  type PlacedValue,
  placesChildren,
  showsTypes,
  typeOf,
} from '../item-types.ts';
import { NODE_LABEL, Node, Pill, TypeTag } from '../kit/index.ts';
import { moduleFor } from '../modules/registry.ts';
import { MOTION, reducedMotion } from '../motion.ts';
import { itemNodeKind } from '../node-kind.ts';
import type { CollectionView, ItemView, Turn } from '../types.ts';
import { useDetailForm } from './detail-aside.ts';
import { EvidenceList } from './EvidenceList.tsx';
import { EvidenceModule } from './evidence/EvidenceModule.tsx';
import { HandoffLine } from './HandoffLine.tsx';
import { ItemActions } from './ItemActions.tsx';
import type { CollectionOf } from './ItemList.tsx';
import { ChildrenModule } from './relations/ChildrenModule.tsx';
import { RelationsModule } from './relations/RelationsModule.tsx';
import { Timeline } from './Timeline.tsx';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{children}</dd>
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
      {values.map(({ field, value, label }) => {
        const { Detail } = moduleFor(field.module);
        return (
          <Field key={field.name} label={label}>
            <Detail field={field} value={value} />
          </Field>
        );
      })}
    </dl>
  );
}

// One section of the detail: its name in the left margin above a hairline, its content in the
// reading column beside it (above it on a phone, and on top in the band and the aside). travel: the
// key a section that moves between the forms is followed by. count: shown next to the name in the
// aside.
function Section({
  label,
  children,
  travel,
  count,
}: {
  label: string;
  children: ReactNode;
  travel?: string;
  count?: string;
}) {
  const id = `detail-${label.toLowerCase()}`;
  return (
    <section className="detail-section" aria-labelledby={id} data-travel={travel}>
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

const TURN_LABEL: Record<Turn, string> = {
  human: 'your turn',
  agent: 'agent’s turn',
  none: 'closed',
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
}: ItemDetailProps) {
  const lease = useActiveLease(item.lease);
  const root = useContentIn(item.id, layout === 'pane');
  // On a wide pane Details moves into the band and History beside the main column.
  const form = useDetailForm(root, layout === 'pane');
  // Which item's long Details is shown whole in the band.
  const [allDetails, setAllDetails] = useState<string | null>(null);
  // The last move made here, said under the moves once the item has taken it.
  const [landed, setLanded] = useState<{ id: string; to: string; at: string } | null>(null);
  const type = typeOf(collection, item.type);
  const kind = itemNodeKind(item, type, lease !== null);
  const { head, primary, side } = detailBlocks(type, item.fields);
  const loose = leftovers(type, item.evidence);
  const block = (part: DetailBlock, index: number) => {
    if (part.kind === 'fields') {
      // The description leads the brief as plain text, without a label; the other fields follow it.
      const lead = part.values.find(({ field }) => field.name === LEAD);
      const rest = part.values.filter((value) => value !== lead);
      const Lead = lead ? moduleFor(lead.field.module).Detail : undefined;
      return (
        <div key={`fields:${index}`} className="detail-fields">
          {lead && Lead ? (
            <div className="detail-lead">
              <Lead field={lead.field} value={lead.value} />
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
          item={item}
          entry={part.entry}
          canWrite={canWrite}
          collectionOf={collectionOf}
          onAddChild={onAddChild}
        />
      ) : (
        <RelationsModule
          key={key}
          item={item}
          entry={part.entry}
          canWrite={canWrite}
          collectionOf={collectionOf}
          withChildren={!placesChildren(type)}
        />
      );
    }
    if (part.kind === 'module') {
      return (
        <EvidenceModule
          key={`module:${part.entry.id}`}
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
          {others ? 'other files' : 'evidence'}
        </h3>
        <EvidenceList evidence={loose} canWrite={canWrite} />
      </section>
    );
  };
  // Relation modules make the Structure, wherever the layout places them; the rest of the side
  // goes with the details.
  const brief = primary.filter((part) => part.kind !== 'relation');
  const structure = [...primary, ...side].filter((part) => part.kind === 'relation');
  // Details: the side slot's values and where the item lives, one row each; the side's modules
  // follow them.
  const aside = side.filter((part) => part.kind !== 'relation');
  const detailRows: { label: string; value: ReactNode }[] = [
    ...aside.flatMap((part) =>
      part.kind === 'fields'
        ? part.values.map(({ field, value, label }) => {
            const { Detail } = moduleFor(field.module);
            return { label, value: <Detail field={field} value={value} /> };
          })
        : [],
    ),
    { label: 'collection', value: item.collection },
    {
      label: 'created by',
      value: `${actorLabel(item.createdBy)} · ${momentLabel(item.createdAt, Date.now())}`,
    },
    ...(lease ? [{ label: 'lease', value: leaseLabel(lease) }] : []),
    { label: 'updated', value: momentLabel(item.updatedAt, Date.now()) },
  ];
  const cut = detailsCut(detailRows.length, form !== 'aside' || allDetails === item.id);
  const asideModules = aside.filter((part) => part.kind !== 'fields');
  const briefParts = brief.map(block).filter((part) => part !== null);
  const structureParts = structure.map(block).filter((part) => part !== null);
  const standing = lease ? `${lease.holder} is on it` : TURN_LABEL[item.turn];
  const unfolded = layout === 'unfold';
  const agent = turnAgent(item.events);
  const receipt =
    landed && landed.id === item.id && landed.to === item.state ? (
      <span className="move-receipt">
        <b>{landed.to}</b> · now{' '}
        {item.turn === 'human'
          ? 'your turn'
          : item.turn === 'agent'
            ? `${agent ?? 'an agent'}’s turn`
            : 'closed'}{' '}
        · {agoLabel(landed.at, Date.now())}
      </span>
    ) : undefined;
  const actions = canWrite ? (
    <ItemActions
      key={`${item.id}:${item.state}`}
      id={item.id}
      moves={item.transitions}
      openChildren={item.children}
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
    <p className="t-small">
      Read-only. Run <code>otea open</code> to act from this browser.
    </p>
  );
  const typeLabel = type?.label ?? item.type;
  // A preset without types names its only type after itself (an epic, a bug-triage item).
  const kindWord = showsTypes(collection)
    ? typeLabel.toLowerCase()
    : (collection?.preset ?? item.type);
  return (
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
              <Node kind={kind} label={NODE_LABEL[kind]} />
              <span className="t-id">{item.id}</span>
              <Pill tone="state" yours={item.turn === 'human'}>
                {item.state}
              </Pill>
              <span className="t-cap">{standing}</span>
            </div>
            {type?.icon ? (
              <span className="detail-type">
                <TypeIcon name={type.icon} size={14} />
                {kindWord}
              </span>
            ) : showsTypes(collection) ? (
              <TypeTag name={item.type} label={typeLabel} />
            ) : null}
          </div>
          <h1 className="t-display">{item.title}</h1>
          <HandoffLine item={item} type={type} canWrite={canWrite} collectionOf={collectionOf} />
          {actions}
        </header>
      )}
      {unfolded ? null : <i className="detail-line" aria-hidden="true" />}
      <div className="detail-main">
        {item.missing.length > 0 ? (
          <div className="missing well">
            <span className="t-label">missing to complete</span>
            <span className="t-ui">{item.missing.join(', ')}</span>
          </div>
        ) : null}
        <Section label="Brief">
          {head.length > 0 ? <FieldList values={head} className="fields fields-head" /> : null}
          {briefParts.length > 0 || head.length > 0 ? (
            briefParts
          ) : (
            <p className="t-small">No fields.</p>
          )}
        </Section>
        {structureParts.length > 0 ? <Section label="Structure">{structureParts}</Section> : null}
      </div>
      <Section label="Details" travel="details">
        <dl className="fields fields-meta">
          {detailRows.slice(0, cut.shown).map(({ label, value }) => (
            <Field key={label} label={label}>
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
            {cut.more > 0 ? `${cut.more} more` : 'fewer'}
          </button>
        ) : null}
        {asideModules.map(block)}
      </Section>
      <Section
        label="History"
        travel="history"
        count={`${item.events.length} ${item.events.length === 1 ? 'event' : 'events'}`}
      >
        <Timeline events={item.events} />
      </Section>
      {unfolded ? <div className="unfold-actions">{actions}</div> : null}
    </article>
  );
}
