import { presetText, t } from '../../i18n/i18n.ts';
import { childTally } from '../../relations.ts';
import type { ItemView, LayoutEntry } from '../../types.ts';
import type { CollectionOf } from '../ItemList.tsx';
import { ChildBar } from './ChildBar.tsx';
import { RelatedRow, relatedNodeKind } from './RelatedRow.tsx';

type ChildrenModuleProps = {
  item: ItemView;
  entry: LayoutEntry;
  canWrite: boolean;
  collectionOf: CollectionOf;
  onAddChild?: ((parent: ItemView) => void) | undefined;
};

// A parent's children: a list, not a graph. The bar gives the shape of the work at a glance (one
// segment per child, closed first, then yours, then the agents'), its legend counts them, and each
// child follows with its node, id, icon, title and state. "+ child" opens the create form.
export function ChildrenModule({
  item,
  entry,
  canWrite,
  collectionOf,
  onAddChild,
}: ChildrenModuleProps) {
  const children = item.relations.filter(({ kind }) => kind === 'child');
  const add =
    canWrite && onAddChild ? (
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
            {children.map((child) => (
              <RelatedRow key={child.id} related={child} collectionOf={collectionOf} />
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
