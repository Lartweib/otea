import type { EditProps, FieldModuleUi, ShowProps } from './contract.ts';

export function PlainText({ value }: ShowProps) {
  return <span className="body">{value}</span>;
}

// In the row only when the type places it there (a repo task's repo): the value as written, in ink,
// with the field named for a screen reader. An empty one puts nothing.
function RowText({ field, value }: ShowProps) {
  if (value === '') return null;
  return (
    <span className="row-text" title={value}>
      <span className="visually-hidden">{field.name}: </span>
      {value}
    </span>
  );
}

export function TextInput({ id, value, disabled, required, describedBy, onChange }: EditProps) {
  return (
    <input
      type="text"
      id={id}
      className="input"
      value={value}
      disabled={disabled}
      required={required}
      aria-describedby={describedBy}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

const title = { name: 'title', module: 'text', required: 'create' } as const;

export const text: FieldModuleUi = {
  name: 'text',
  summary: 'module.text.summary',
  origin: 'official',
  Detail: PlainText,
  Row: RowText,
  Edit: TextInput,
  samples: [
    { label: 'module.text.short', field: title, value: 'Flaky login test' },
    {
      label: 'module.text.long',
      field: title,
      value:
        'Login fails on CI only when the session cookie expires between the two retries of the suite',
    },
    { label: 'module.text.empty', field: { name: 'owner', module: 'text' }, value: '' },
  ],
  yaml: 'fields:\n  title: { module: text, required: create }',
};
