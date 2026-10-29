import type { FieldView } from '../types.ts';

export type FieldValue = { field: FieldView; value: string };

// An item's values with the preset field that shapes each one. A value whose field the preset
// no longer declares, or whose preset has not loaded yet, shows as plain text.
export function valuesOf(
  fields: readonly FieldView[] | undefined,
  values: Readonly<Record<string, string>>,
): FieldValue[] {
  return Object.entries(values).map(([name, value]) => ({
    field: fields?.find((field) => field.name === name) ?? { name, module: 'text' },
    value,
  }));
}
