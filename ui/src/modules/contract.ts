import type { ReactNode } from 'react';
import type { FieldView } from '../types.ts';

// Official modules ship with Otea. Local ones (.otea/modules/, not loaded yet) are unofficial and
// run at the user's own risk.
export type ModuleOrigin = 'official' | 'local';

// A field and its value, to show.
export type ShowProps = { field: FieldView; value: string };

// A field and its value, to edit. The caller owns the label and the hint.
export type EditProps = {
  id: string;
  field: FieldView;
  value: string;
  disabled: boolean;
  required: boolean;
  describedBy?: string | undefined;
  onChange: (value: string) => void;
};

// An example field and value the catalog previews the module with.
export type Sample = { label: string; field: FieldView; value: string };

// How a preset field module looks in the UI. Built only from the kit primitives and tokens.
export type FieldModuleUi = {
  name: string;
  // One line: what the module is for.
  summary: string;
  origin: ModuleOrigin;
  // In a list row, after the title. Absent: the module stays out of the row.
  Row?: (props: ShowProps) => ReactNode;
  // In the item detail.
  Detail: (props: ShowProps) => ReactNode;
  // In intake: the control that writes the value.
  Edit: (props: EditProps) => ReactNode;
  samples: readonly Sample[];
  // How a preset declares a field with this module.
  yaml: string;
};
