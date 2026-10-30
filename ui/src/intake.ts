import type { FieldView, TypeView } from './types.ts';

export type FormValues = Record<string, string>;

export type Start = { state: string; incomplete: boolean; missing: string[] };

export const LEFT_TO_AGENT = 'Optional now — if left empty, an agent will complete it';

function isBlank(value: string | undefined): boolean {
  return value === undefined || value.trim() === '';
}

function blankFields(
  { fields }: TypeView,
  values: FormValues,
  required: FieldView['required'],
): string[] {
  return fields
    .filter((field) => field.required === required)
    .filter((field) => isBlank(values[field.name]) && isBlank(field.default))
    .map((field) => field.name);
}

export function initialValues({ fields }: TypeView): FormValues {
  return Object.fromEntries(fields.map((field) => [field.name, field.default ?? '']));
}

export function fieldLabel(name: string): string {
  const words = name.replaceAll('_', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function fieldHint(field: FieldView): string | undefined {
  return field.required === 'complete' ? LEFT_TO_AGENT : undefined;
}

export function missingToCreate(type: TypeView, values: FormValues): string[] {
  return blankFields(type, values, 'create');
}

export function canSubmit(type: TypeView, values: FormValues): boolean {
  return missingToCreate(type, values).length === 0;
}

export function startOf(type: TypeView, values: FormValues): Start {
  const missing = blankFields(type, values, 'complete');
  const { initial, incomplete } = type;
  if (missing.length === 0 || incomplete === undefined) {
    return { state: initial, incomplete: false, missing: [] };
  }
  return { state: incomplete, incomplete: true, missing };
}

export function payloadOf(values: FormValues): FormValues {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => !isBlank(value)));
}

export function startMessage({ state, incomplete, missing }: Start): string {
  if (!incomplete) return `Starts ready in ${state}.`;
  return `Starts in ${state}: an agent will complete ${missing.join(', ')} first.`;
}
