import { gateRows } from '../../gates.ts';
import { presetText, t } from '../../i18n/i18n.ts';
import { rowValues, takesChildren, typeOf } from '../../item-types.ts';
import { childTally } from '../../relations.ts';
import type { Item, ItemView, LayoutEntry } from '../../types.ts';
import { GateCell } from '../Gate.tsx';
import type { CollectionOf } from '../ItemList.tsx';
import { ChildBar } from './ChildBar.tsx';
import { RelatedRow, relatedNodeKind } from './RelatedRow.tsx';

type ChildrenModuleProps = {
  item: ItemView;
  entry: LayoutEntry;
  canWrite: boolean;
  collectionOf: CollectionOf;
  onAddChild?: ((parent: ItemView) => void) | undefined;
  // The board's items, to show each child's row values and gates.
  itemOf?: ((id: string) => Item | undefined) | undefined;
  // The ticked children, when several wait for you and can be moved together from the tray.
  ticks?: { checked: ReadonlySet<string>; toggle: (id: string) => void } | undefined;
};

// A parent's children: a list, not a graph. The bar gives the shape of the work at a glance (one
// segment per child, closed first, then yours, then the agents'), its legend counts them, and each
// child follows with its node, id, icon, title and state. "+ child" opens the create form, which
// offers only the types the parent's type takes.
export function ChildrenModule({
  item,
  entry,
  canWrite,
  collectionOf,
  onAddChild,
  itemOf,
  ticks,
}: ChildrenModuleProps) {
  const children = item.relations.filter(({ kind }) => kind === 'child');
  // A type the hierarchy gives no children offers no "+ child".
  const takes = takesChildren(typeOf(collectionOf(item.collection), item.type));
  const add =
    canWrite && onAddChild && takes ? (
      <button type="button" className="rel-add" onClick={() => onAddChild(item)}>
        <span className="rel-add-plus" aria-hidden="true">
          +
        </span>
        {t('children.add')}
      </button>
    ) : null;
  if (children.length === 0 && !add) return null;
  const kinds = children.map((child) => relatedNodeKind(child, collectionOf));
  const tally = childTally(kinds);
  // Ticks show once two or more children wait for you: a plan approved per child, together.
  const tickable = ticks && tally.yours >= 2;
  const headingId = `children-${item.id}`;
  const count = children.length;
  const label = entry.label === undefined ? undefined : presetText(entry.label);
  return (
    <section className="children-module" aria-labelledby={headingId}>
      <header className="sub-head">
        <h3 className="sub-title" id={headingId}>
          {label === undefined
            ? count === 0
              ? t('children.none')
              : t('children.count', { count })
            : count === 0
              ? t('relations.noneLabelled', { label })
              : t('relations.labelled', { count, label })}
        </h3>
        {add}
      </header>
      {children.length > 0 ? (
        <>
          <ChildBar kinds={kinds} size="lg" />
          <p className="child-legend">
            <span className="child-legend-key" data-kind="you">
              {t('children.yours', { count: tally.yours })}
            </span>
            <span className="child-legend-key" data-kind="working">
              {t('children.agents', { count: tally.agents })}
            </span>
            <span className="child-legend-key" data-kind="done">
              {t('children.closed', { count: tally.closed })}
            </span>
          </p>
          <ul className="rel-list children-list">
            {children.map((child, index) => {
              const type = typeOf(collectionOf(child.collection), child.type);
              const full = itemOf?.(child.id);
              const lead = full
                ? rowValues(type, full.fields)
                    .map(({ value }) => value)
                    .filter((value) => value !== '')
                    .join(' · ')
                : '';
              // A child still where its type starts (a repo task proposed) has not touched its gates.
              const gates = child.state === type?.initial ? [] : gateRows(type, child.state);
              return (
                <RelatedRow
                  key={child.id}
                  related={child}
                  collectionOf={collectionOf}
                  lead={lead || undefined}
                  trail={gates.length > 0 ? <GateCell rows={gates} /> : undefined}
                  tick={
                    tickable && kinds[index] === 'you'
                      ? {
                          checked: ticks.checked.has(child.id),
                          onToggle: () => ticks.toggle(child.id),
                        }
                      : undefined
                  }
                />
              );
            })}
          </ul>
        </>
      ) : null}
    </section>
  );
}
