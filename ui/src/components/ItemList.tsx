import { leaseLabel } from '../format.ts';
import { useActiveLease } from '../hooks.ts';
import type { Section } from '../sections.ts';
import { hashFor } from '../selection.ts';
import type { Item } from '../types.ts';

type ItemListProps = { sections: Section[]; selectedId: string | undefined };

function ItemRow({ item, selected }: { item: Item; selected: boolean }) {
  const lease = useActiveLease(item.lease);
  return (
    <li>
      <a className="item-row" href={hashFor(item.id)} aria-current={selected ? 'true' : undefined}>
        <span className="item-row-title">{item.title}</span>
        <span className="item-row-meta">
          {item.id} · {item.state}
          {lease ? <span className="lease"> · {leaseLabel(lease)}</span> : null}
        </span>
      </a>
    </li>
  );
}

export function ItemList({ sections, selectedId }: ItemListProps) {
  return (
    <nav className="item-list" aria-label="Items">
      {sections.map((section) => (
        <section key={section.turn} className="section" data-turn={section.turn}>
          <h2 className="section-title">
            {section.title}
            <span className="count">{section.items.length}</span>
          </h2>
          {section.items.length === 0 ? (
            <p className="muted">Nothing here.</p>
          ) : (
            <ul className="rows">
              {section.items.map((item) => (
                <ItemRow key={item.id} item={item} selected={item.id === selectedId} />
              ))}
            </ul>
          )}
        </section>
      ))}
    </nav>
  );
}
