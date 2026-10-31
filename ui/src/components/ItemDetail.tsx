import type { ReactNode } from 'react';
import { leftovers } from '../evidence.ts';
import { actorLabel, leaseLabel, momentLabel } from '../format.ts';
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
import { itemNodeKind } from '../node-kind.ts';
import type { CollectionView, ItemView, Turn } from '../types.ts';
import { EvidenceList } from './EvidenceList.tsx';
import { EvidenceModule } from './evidence/EvidenceModule.tsx';
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
// reading column beside it (above it on a phone).
function Section({ label, children }: { label: string; children: ReactNode }) {
  const id = `detail-${label.toLowerCase()}`;
  return (
    <section className="detail-section" aria-labelledby={id}>
      <h2 className="detail-section-label" id={id}>
        {label}
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
  // Drawn at the end of the header row (the focus toggle).
  headAction?: ReactNode;
  // unfold: opened inside its own row on a phone. The row is the header, and the moves wait at the
  // bottom, in reach of a thumb.
  layout?: 'pane' | 'unfold';
  onMoved?: (() => void) | undefined;
};

// A margin index: the header (where the item stands, its title, its moves), then Brief (what to
// decide on), Structure (children and relations), Details (where it lives, who made it) and History.
export function ItemDetail({
  item,
  canWrite,
  collection,
  collectionOf,
  onAddChild,
  headAction,
  layout = 'pane',
  onMoved,
}: ItemDetailProps) {
  const lease = useActiveLease(item.lease);
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
  const aside = side.filter((part) => part.kind !== 'relation');
  const briefParts = brief.map(block).filter((part) => part !== null);
  const structureParts = structure.map(block).filter((part) => part !== null);
  const standing = lease ? `${lease.holder} is on it` : TURN_LABEL[item.turn];
  const unfolded = layout === 'unfold';
  const actions = canWrite ? (
    <ItemActions
      key={`${item.id}:${item.state}`}
      id={item.id}
      moves={item.transitions}
      openChildren={item.children}
      onMoved={onMoved}
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
    <article className="detail" data-layout={layout} aria-label={unfolded ? item.title : undefined}>
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
            {headAction}
          </div>
          <h1 className="t-display">{item.title}</h1>
          {actions}
        </header>
      )}
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
      <Section label="Details">
        {aside.map(block)}
        <dl className="fields fields-meta">
          <Field label="collection">{item.collection}</Field>
          <Field label="created by">
            {actorLabel(item.createdBy)} · {momentLabel(item.createdAt, Date.now())}
          </Field>
          {lease ? <Field label="lease">{leaseLabel(lease)}</Field> : null}
          <Field label="updated">{momentLabel(item.updatedAt, Date.now())}</Field>
        </dl>
      </Section>
      <Section label="History">
        <Timeline events={item.events} />
      </Section>
      {unfolded ? <div className="unfold-actions">{actions}</div> : null}
    </article>
  );
}
