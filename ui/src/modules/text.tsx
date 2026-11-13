import { useValueWord } from '../preset-words.ts';
import type { EditProps, FieldModuleUi, ShowProps } from './contract.ts';

// The value as written; a checklist's or a multi choice's list of ids by its names.
export function PlainText({ field, value }: ShowProps) {
  const word = useValueWord();
  return <span className="body">{word(field.name, value)}</span>;
}

// In the row only when the type places it there (a repo task's repo): the value as written, in ink,
// with the field named for a screen reader. An empty one puts nothing.
function RowText({ field, value }: ShowProps) {
  const word = useValueWord();
  if (value === '') return null;
  const said = word(field.name, value);
  return (
    <span className="row-text" title={said}>
      <span className="visually-hidden">{field.name}: </span>
      {said}
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
};
