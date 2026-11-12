import { useState } from 'react';
import type { ReadyDraft } from '../use-board-draft.ts';
import { DiscardDialog, PracticeDialog, PublishDialog } from './dialogs.tsx';

// TEMPORARY (removed before the slice's last commit): mounts the bar's dialogs beside the pane
// until the editor slice's bar does, only with ?bsp-harness in the address.
export function Harness({ draft }: { draft: ReadyDraft }) {
  const [open, setOpen] = useState<'publish' | 'discard' | 'practice' | null>(null);
  if (typeof window === 'undefined' || !window.location.search.includes('bsp-harness')) return null;
  return (
    <div className="bsp-harness">
      <button type="button" className="btn quiet sm" onClick={() => setOpen('discard')}>
        harness: Descartar
      </button>
      <button type="button" className="btn quiet sm" onClick={() => setOpen('practice')}>
        harness: Probar
      </button>
      <button type="button" className="btn primary sm" onClick={() => setOpen('publish')}>
        harness: Publicar
      </button>
      <PublishDialog
        draft={draft}
        open={open === 'publish'}
        onClose={() => setOpen(null)}
        onPublished={() => draft.reload()}
      />
      <DiscardDialog
        draft={draft}
        open={open === 'discard'}
        onClose={() => setOpen(null)}
        onDiscarded={({ deleted }) => {
          if (deleted) window.location.hash = '#/studio/boards';
          else draft.reload();
        }}
      />
      <PracticeDialog draft={draft} open={open === 'practice'} onClose={() => setOpen(null)} />
    </div>
  );
}
