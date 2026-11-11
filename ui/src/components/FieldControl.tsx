import type { ReactNode } from 'react';
import { t } from '../i18n/i18n.ts';
import { fieldHint, fieldLabel } from '../intake.ts';
import { ChipButton } from '../kit/Button.tsx';
import { moduleFor } from '../modules/registry.ts';
import type { FieldView } from '../types.ts';

type FieldControlProps = {
  id: string;
  field: FieldView;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  // The preset's label for the field in the language on screen; its name otherwise.
  label?: string | undefined;
  placeholder?: string | undefined;
  // The data attributes of its place in the layout (slotData), for Studio to find it.
  slot?: Readonly<Record<string, string>>;
};

// A field of the new-item form (mock:676-683): a 112 px caps label, then the control. A choice
// among a few values (enum, severity) is a row of chips; a line is a serif input; markdown a serif
// textarea; any other module draws its own control. Intake and the catalog preview share it.
export function FieldControl({
  id,
  field,
  value,
  disabled,
  onChange,
  label,
  placeholder,
  slot,
}: FieldControlProps) {
  const hint = fieldHint(field);
  const hintId = hint ? `${id}-hint` : undefined;
  const required = field.required === 'create';
  const name =
    label === undefined ? fieldLabel(field.name) : label.charAt(0).toUpperCase() + label.slice(1);
  const mark =
    required && field.name !== 'title' ? (
      <span className="required"> {t('intake.required')}</span>
    ) : null;
  const values = field.values ?? [];
  const chips = (field.module === 'enum' || field.module === 'severity') && values.length > 0;

  let control: ReactNode;
  if (chips) {
    control = (
      <fieldset className="chips" aria-labelledby={`${id}-label`}>
        {values.map((v) => (
          <ChipButton
            key={v}
            on={value === v}
            disabled={disabled}
            // A chip pressed again clears an optional field.
            onClick={() => onChange(value === v && !required ? '' : v)}
          >
            {v}
          </ChipButton>
        ))}
      </fieldset>
    );
  } else if (field.module === 'text') {
    control = (
      <input
        type="text"
        id={id}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        aria-describedby={hintId}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  } else if (field.module === 'markdown') {
    control = (
      <textarea
        id={id}
        rows={3}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        aria-describedby={hintId}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  } else {
    const { Edit } = moduleFor(field.module);
    control = (
      <Edit
        id={id}
        field={field}
        value={value}
        disabled={disabled}
        required={required}
        describedBy={hintId}
        onChange={onChange}
      />
    );
  }

  return (
    <div className="ffield" {...slot}>
      {chips ? (
        <span className="flab" id={`${id}-label`}>
          {name}
          {mark}
        </span>
      ) : (
        <label htmlFor={id} id={`${id}-label`}>
          {name}
          {mark}
        </label>
      )}
      <div className="fctl">
        {control}
        {hint ? (
          <p className="fhint" id={hintId}>
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  );
}
