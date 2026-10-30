// The item type, as a short mono word in a small square box: a fact about the item, never your color.
export function TypeTag({ name, label }: { name: string; label: string }) {
  return (
    <span className="type-tag" title={label}>
      {name}
    </span>
  );
}
