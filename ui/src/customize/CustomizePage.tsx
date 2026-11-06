import type { CustomizeTarget } from '../selection.ts';

// Placeholder: the Customize view builder replaces this file (feat/customize-view).
export function CustomizePage({ target }: { target: CustomizeTarget }) {
  return (
    <main className="layout">
      <p className="t-small">{target.kind === 'preset' ? target.name : target.id}</p>
    </main>
  );
}
