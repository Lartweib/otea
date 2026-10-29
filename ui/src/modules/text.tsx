import type { EditProps, FieldModuleUi, ShowProps } from './contract.ts';

export function PlainText({ value }: ShowProps) {
  return <span className="body">{value}</span>;
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
  summary: 'A single line of plain text, such as a title.',
  origin: 'official',
  Detail: PlainText,
  Edit: TextInput,
  samples: [
    { label: 'short', field: title, value: 'Flaky login test' },
    {
      label: 'long',
      field: title,
      value:
        'Login fails on CI only when the session cookie expires between the two retries of the suite',
    },
    { label: 'empty', field: { name: 'owner', module: 'text' }, value: '' },
  ],
  yaml: 'fields:\n  title: { module: text, required: create }',
};
