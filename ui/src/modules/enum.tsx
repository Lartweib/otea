import { Pill } from '../kit/index.ts';
import type { EditProps, FieldModuleUi, ShowProps } from './contract.ts';

function Value({ value }: ShowProps) {
  return <Pill>{value}</Pill>;
}

// Quiet by default: a row marks only a value that departs from the field's default.
function RowValue({ field, value }: ShowProps) {
  if (value === '' || value === field.default) return null;
  return (
    <Pill size="sm">
      <span className="visually-hidden">{field.name}: </span>
      {value}
    </Pill>
  );
}

export function Select({ id, field, value, disabled, required, describedBy, onChange }: EditProps) {
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
          {option}
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
