import type { ReactNode } from 'react';
import { Icon } from '../kit/index.ts';

// Studio's small controls: a segmented choice, a chip, a problem line.

export type SegOption = {
  value: string;
  label: string;
  // Struck through, with the reason as its title: the core would refuse it.
  struck?: string;
};

type SegProps = {
  options: readonly SegOption[];
  value: string | undefined;
  onChange?: ((value: string) => void) | undefined;
  label: string;
  mono?: boolean;
};

export function Seg({ options, value, onChange, label, mono = false }: SegProps) {
  return (
    <fieldset className={mono ? 'st-seg mono' : 'st-seg'} aria-label={label}>
      {options.map((option) => {
        const on = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={on}
            className={option.struck === undefined ? undefined : 'struck'}
            title={option.struck}
            disabled={onChange === undefined || option.struck !== undefined}
            onClick={() => {
              if (!on) onChange?.(option.value);
            }}
          >
            {option.label}
          </button>
        );
      })}
    </fieldset>
  );
}

type CheckProps = {
  checked: boolean;
  onChange?: ((checked: boolean) => void) | undefined;
  children: ReactNode;
  struck?: string | undefined;
};

export function Check({ checked, onChange, children, struck }: CheckProps) {
  return (
    <label className={`st-check${checked ? ' on' : ''}${struck ? ' struck' : ''}`} title={struck}>
      <input
        type="checkbox"
        checked={checked}
        disabled={onChange === undefined || struck !== undefined}
        onChange={(event) => onChange?.(event.target.checked)}
      />
      <span>{children}</span>
    </label>
  );
}

export function Chip({
  children,
  tone,
}: {
  children: ReactNode;
  tone?: 'module' | 'current' | undefined;
}) {
  return <span className={tone ? `st-chip ${tone}` : 'st-chip'}>{children}</span>;
}

export function ProblemMark() {
  return (
    <span className="st-bad" aria-hidden="true">
      <Icon name="warn" />
    </span>
  );
}

export function OkMark() {
  return (
    <span className="st-ok" aria-hidden="true">
      <Icon name="done" />
    </span>
  );
}

type NameFormProps = {
  label: string;
  placeholder: string;
  submit: string;
  onSubmit: (name: string) => void;
  pattern?: RegExp;
  // What a name must look like, said when it does not.
  hint?: string;
};

// A one-line form that adds something by name: a field, a state, a type, an action.
export function NameForm({
  label,
  placeholder,
  submit,
  onSubmit,
  pattern = /^[a-z][a-z0-9_]*$/,
  hint,
}: NameFormProps) {
  return (
    <form
      className="st-nameform"
      onSubmit={(event) => {
        event.preventDefault();
        const input = event.currentTarget.elements.namedItem('name') as HTMLInputElement;
        const name = input.value.trim();
        if (!pattern.test(name)) {
          input.setCustomValidity(hint ?? placeholder);
          input.reportValidity();
          return;
        }
        input.setCustomValidity('');
        onSubmit(name);
        input.value = '';
      }}
    >
      <input
        name="name"
        aria-label={label}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        onInput={(event) => event.currentTarget.setCustomValidity('')}
      />
      <button type="submit" className="btn sm">
        <Icon name="plus" />
        {submit}
      </button>
    </form>
  );
}

// One question of the inspector: its words, the key it writes and a note under its control.
export function Ask({
  question,
  yamlKey,
  note,
  children,
}: {
  question: string;
  yamlKey?: string;
  note?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="st-ask">
      <div className="st-ask-h">
        <h3>{question}</h3>
        {yamlKey ? <code>{yamlKey}</code> : null}
      </div>
      {children}
      {note ? <p className="st-ask-n">{note}</p> : null}
    </section>
  );
}
