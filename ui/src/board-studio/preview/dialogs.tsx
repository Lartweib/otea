import type { BoardRecord } from '../api.ts';
import type { ReadyDraft } from '../use-board-draft.ts';

// The editor bar's dialogs (preview slice). Stubs until the slice builds them; the editor mounts
// them by these props.

// Publicar: the change plan in sentences, the moves for items in removed steps, the effects on
// items in flight, errors that block (each with Ir) and warnings; on publish, the toast with Ver el
// tablero and Deshacer (restore).
export type PublishDialogProps = {
  draft: ReadyDraft;
  open: boolean;
  onClose: () => void;
  // The record after publishing, or after Deshacer restored the previous version.
  onPublished: (record: BoardRecord) => void;
};

export function PublishDialog(_props: PublishDialogProps) {
  return null;
}

// Descartar: asks once, then Deshacer in a toast (the draft is saved again).
export type DiscardDialogProps = {
  draft: ReadyDraft;
  open: boolean;
  onClose: () => void;
  // `deleted`: the board was never published and is gone; the editor goes back to the home.
  onDiscarded: (result: { deleted: boolean }) => void;
};

export function DiscardDialog(_props: DiscardDialogProps) {
  return null;
}

// Probar: a practice item through a throwaway copy of the draft; nothing is kept.
export type PracticeDialogProps = {
  draft: ReadyDraft;
  open: boolean;
  onClose: () => void;
};

export function PracticeDialog(_props: PracticeDialogProps) {
  return null;
}
