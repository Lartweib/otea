import { Severity, type SeverityLevel } from '../kit/index.ts';
import type { FieldView } from '../types.ts';
import type { FieldModuleUi, ShowProps } from './contract.ts';
import { Select } from './enum.tsx';
import { PlainText } from './text.tsx';

// The field's values are the core's fixed scale, least severe first: its position is the level.
// A value off the scale (an older item, a newer server) has no level.
export function levelOf({ field, value }: ShowProps): SeverityLevel {
  const index = (field.values ?? []).indexOf(value);
  return index < 0 || index > 3 ? 0 : ((index + 1) as SeverityLevel);
}

// Unlike an enum, severity is the signal a list of bugs is read by: every level marks the row.
function RowValue(props: ShowProps) {
  const level = levelOf(props);
  return level === 0 ? null : <Severity level={level} />;
}

function Value(props: ShowProps) {
  const level = levelOf(props);
  if (level === 0) return <PlainText {...props} />;
  return (
    <span className="sev-value">
      <Severity level={level} />
      <span className="body">{props.value}</span>
    </span>
  );
}

const severity: FieldView = {
  name: 'severity',
  module: 'severity',
  required: 'complete',
  values: ['low', 'medium', 'high', 'critical'],
};

export const severityModule: FieldModuleUi = {
  name: 'severity',
  summary: 'How bad it is, on a fixed scale of four levels drawn as signal bars.',
  origin: 'official',
  Row: RowValue,
  Detail: Value,
  Edit: Select,
  samples: [
    { label: 'critical, in the warning hue', field: severity, value: 'critical' },
    { label: 'medium', field: severity, value: 'medium' },
    { label: 'empty', field: severity, value: '' },
  ],
  yaml: 'fields:\n  severity: { module: severity, required: complete }  # low, medium, high, critical',
};
