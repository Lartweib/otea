import { Pill } from '../kit/index.ts';
import { useValueWord } from '../preset-words.ts';
import type { EditProps, FieldModuleUi, ShowProps } from './contract.ts';

function Value({ field, value }: ShowProps) {
  const word = useValueWord();
  return <Pill>{word(field.name, value)}</Pill>;
}

// Quiet by default: a row marks only a value that departs from the field's default.
function RowValue({ field, value }: ShowProps) {
  const word = useValueWord();
  if (value === '' || value === field.default) return null;
  return (
    <Pill size="sm">
      <span className="visually-hidden">{field.name}: </span>
      {word(field.name, value)}
    </Pill>
  );
}

export function Select({ id, field, value, disabled, required, describedBy, onChange }: EditProps) {
  const word = useValueWord();
  return (
    <select
      id={id}
      className="input"
      value={value}
      disabled={disabled}
      required={required}
      aria-describedby={describedBy}
      onChange={(event) => onChange(event.target.value)}
    >
      {field.default === undefined ? <option value="">—</option> : null}
      {(field.values ?? []).map((option) => (
        <option key={option} value={option}>
          {word(field.name, option)}
        </option>
      ))}
    </select>
  );
}

const priority = {
  name: 'priority',
  module: 'enum',
  values: ['low', 'medium', 'high'],
  default: 'medium',
};

const area = { name: 'area', module: 'enum', values: ['api', 'cli', 'ui'] };

export const enumModule: FieldModuleUi = {
  name: 'enum',
  summary: 'module.enum.summary',
  origin: 'official',
  Row: RowValue,
  Detail: Value,
  Edit: Select,
  samples: [
    { label: 'module.enum.atDefault', field: priority, value: 'medium' },
    { label: 'module.enum.offDefault', field: priority, value: 'high' },
    { label: 'module.enum.empty', field: area, value: '' },
  ],
  yaml: 'fields:\n  priority: { module: enum, values: [low, medium, high], default: medium }',
};
