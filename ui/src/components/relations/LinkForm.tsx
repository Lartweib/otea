import { useEffect, useId, useRef, useState } from 'react';
import { fetchItems, linkItems } from '../../api.ts';
import { typeOf } from '../../item-types.ts';
import { Button, NODE_LABEL, Node } from '../../kit/index.ts';
import { itemNodeKind } from '../../node-kind.ts';
import { LINK_CHOICES, linkRequestOf, matchItems } from '../../relations.ts';
import type { Item, ItemView, RelationView } from '../../types.ts';
import type { CollectionOf } from '../ItemList.tsx';

type LinkFormProps = {
  item: ItemView;
  collectionOf: CollectionOf;
  onDone: () => void;
};

// Pick how the item relates, then the other item by id or title. Linking closes the form; the
// detail redraws from the live stream.
export function LinkForm({ item, collectionOf, onDone }: LinkFormProps) {
  const [kind, setKind] = useState<RelationView>('relates');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [posting, setPosting] = useState<string>();
  const [error, setError] = useState<string>();
  const search = useRef<HTMLInputElement>(null);
  const id = useId();
  useEffect(() => {
    const controller = new AbortController();
    fetchItems(controller.signal).then(setItems, () => {});
    search.current?.focus();
    return () => controller.abort();
  }, []);
  const linked = item.relations.filter((relation) => relation.kind === kind).map(({ id }) => id);
  const found = matchItems(items, query, [item.id, ...linked]);
  const link = (other: string) => {
    setPosting(other);
    setError(undefined);
    linkItems(linkRequestOf(item.id, kind, other)).then(onDone, (failure: unknown) => {
      setPosting(undefined);
      setError(failure instanceof Error ? failure.message : 'Failed');
    });
  };
  return (
    <form
      className="link-form"
      aria-label={`Link ${item.id}`}
      onSubmit={(event) => {
        event.preventDefault();
        const [first] = found;
        if (first && posting === undefined) link(first.id);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onDone();
        }
      }}
    >
      <div className="link-form-row">
        <span className="t-id">{item.id}</span>
        <label className="visually-hidden" htmlFor={`${id}-kind`}>
          Relation
        </label>
        <select
          id={`${id}-kind`}
          className="input link-kind"
          value={kind}
          disabled={posting !== undefined}
          onChange={(event) => setKind(event.target.value as RelationView)}
        >
          {LINK_CHOICES.map((choice) => (
            <option key={choice.kind} value={choice.kind}>
              {choice.label}
            </option>
          ))}
        </select>
      </div>
      <label className="visually-hidden" htmlFor={`${id}-search`}>
        Item to link, by id or title
      </label>
      <input
        id={`${id}-search`}
        ref={search}
        className="input"
        type="search"
        placeholder="Item id or title"
        autoComplete="off"
        value={query}
        disabled={posting !== undefined}
        onChange={(event) => setQuery(event.target.value)}
      />
      {found.length > 0 ? (
        <ul className="link-results" aria-label="Matching items">
          {found.map((candidate) => {
            const node = itemNodeKind(
              candidate,
              typeOf(collectionOf(candidate.collection), candidate.type),
              candidate.lease !== null,
            );
            return (
              <li key={candidate.id}>
                <button
                  type="button"
                  className="link-result"
                  disabled={posting !== undefined}
                  aria-busy={posting === candidate.id || undefined}
                  onClick={() => link(candidate.id)}
                >
                  <Node kind={node} label={NODE_LABEL[node]} />
                  <span className="rel-id">{candidate.id}</span>
                  <span className="rel-title">{candidate.title}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : query.trim() !== '' ? (
        <p className="t-small link-none">No item matches.</p>
      ) : null}
      <div className="action-buttons">
        <Button variant="quiet" size="sm" onClick={onDone}>
          Cancel
        </Button>
      </div>
      {error ? (
        <p className="action-error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
