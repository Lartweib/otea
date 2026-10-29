import { fieldHint, fieldLabel } from '../intake.ts';
import { moduleFor } from '../modules/registry.ts';
import type { FieldView } from '../types.ts';

type FieldControlProps = {
  id: string;
  field: FieldView;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
};

// A labelled field control, drawn by the field's module. Intake and the catalog preview share it.
export function FieldControl({ id, field, value, disabled, onChange }: FieldControlProps) {
  const hint = fieldHint(field);
  const hintId = hint ? `${id}-hint` : undefined;
  const required = field.required === 'create';
  const { Edit } = moduleFor(field.module);
  return (
    <div className="intake-field">
      <label className="t-label" htmlFor={id}>
        {fieldLabel(field.name)}
        {required ? <span className="required"> (required)</span> : null}
      </label>
      <Edit
        id={id}
        field={field}
        value={value}
        disabled={disabled}
        required={required}
        describedBy={hintId}
        onChange={onChange}
      />
      {hint ? (
        <p className="t-small" id={hintId}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
