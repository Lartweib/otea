import type { Missing } from './board/engine.ts';

// What a refusal says, as data. The error's message stays English, for agents and the CLI; the web
// UI words the refusal in the language on screen from its code and these details, never from the
// message. Names here (parts, steps, boards) are as the board or preset wrote them; ids are ids.
export type RefusalDetails =
  // An item the request names does not exist.
  | { kind: 'item_missing'; item: string }
  // A handoff that lacks what its step asks for, or whose waits do not hold.
  | { kind: 'handoff'; item: string; missing: Missing[] }
  // An approval whose waits no longer hold: a part reopened, a blocker added.
  | { kind: 'approval'; item: string; missing: Missing[] }
  // A send-back or a way back without a reason.
  | { kind: 'send_back_reason'; item: string }
  | { kind: 'way_back_reason'; item: string }
  // A way the item does not have from where it stands, with the ways it has: on (`ways`) and, while
  // its step is being done, back to an earlier step (`back`).
  | {
      kind: 'no_way';
      item: string;
      way?: string;
      step?: string;
      ways?: string[];
      back?: string[];
    }
  // The item is not where the move starts: not being done, not in a review, or in a lost step.
  | { kind: 'not_here'; item: string; why: 'not_doing' | 'not_review' | 'unknown_step' }
  // Not this performer's turn: `who` is an agent's name, or undefined for the person.
  | { kind: 'not_your_turn'; item: string; step?: string; who?: string; review: boolean }
  // A relay of a human decision on a step the relaying agent (`who`) did itself in this round.
  | { kind: 'own_step'; item: string; step: string; who: string }
  // A review by an agent (`who`) of a step it did itself in this round: another agent reviews it.
  | { kind: 'own_review'; item: string; step: string; who: string }
  // A discard the board does not take.
  | {
      kind: 'drop';
      item: string;
      board: string;
      why: 'not_open' | 'reason_required' | 'motive_required' | 'not_droppable' | 'not_relayable';
      motives: string[];
    }
  // The protected branch (or its repository) cannot change at this step.
  | { kind: 'frozen'; item: string; part: string; steps: string[] }
  // An item that has ended takes no update.
  | { kind: 'closed'; item: string }
  // An undo the server no longer honours.
  | {
      kind: 'undo';
      item: string;
      why: 'not_moved' | 'already_undone' | 'not_yours' | 'not_from' | 'too_old';
    }
  | { kind: 'undo_release'; item: string; why: 'not_release' | 'not_yours' | 'too_old' | 'lost' }
  // Retomar or Reasignar on an item that is not stuck: still held, or never held.
  | { kind: 'not_stuck'; item: string; holder?: string }
  | { kind: 'agent_name'; name: string }
  // A preset workflow's move: no such move, not the performer's, or it needs a reason.
  // `from` and `to`: the states, by key.
  | {
      kind: 'move';
      why: 'no_move' | 'reason_required' | 'not_allowed';
      from?: string;
      to?: string;
    }
  // Evidence a file does not fit, or fits more than one of: the modules, by id.
  | { kind: 'modules'; modules: string[] }
  // Fields a create refused (missing, unknown or a value not allowed), by key.
  | { kind: 'invalid_fields'; fields: string[] }
  // A preset move that needs fields filled first; `labels` by language, when the preset gives them.
  | { kind: 'fields_missing'; fields: { key: string; labels?: Record<string, string> }[] }
  // A preset state that takes the item only once its children or blockers are closed.
  | {
      kind: 'links_open';
      item: string;
      links: 'children' | 'blockers';
      open: string[];
      total: number;
    }
  // Linking: to itself, twice, a second parent, a cycle, a closed parent, a part of the wrong board.
  | { kind: 'self_link'; item: string }
  | { kind: 'already_linked' }
  | { kind: 'parent_exists'; item: string; parent: string }
  | { kind: 'link_cycle' }
  | { kind: 'parent_closed'; parent: string }
  | { kind: 'parent_board'; item: string; parent: string; board?: string }
  | { kind: 'no_link' }
  // A part created alone on a board whose items are always part of another's.
  | { kind: 'parent_required'; item?: string; parent?: string }
  // Studio: the draft or the board changed under the editor, a name, a draft with errors.
  | { kind: 'draft_changed' }
  | { kind: 'draft_invalid' }
  | { kind: 'board_changed'; version: number | null }
  | { kind: 'board_name_taken'; name: string }
  | { kind: 'board_name_empty' }
  | { kind: 'draft_errors'; codes: string[] }
  | { kind: 'restore_used' }
  | { kind: 'restore_step_lost'; item: string; step: string; version: number }
  | { kind: 'restore_name_taken'; name: string }
  // A setup change from a device other than this computer's signed-in browser.
  | { kind: 'desk_only' }
  // Archiving and deleting boards (app/board-archive.ts): an item or a board of an archived board
  // (read-only), Pedidos, a board another divides into, a delete that needs the name typed, a
  // board that still has items, one to restore with the board it was archived with.
  | { kind: 'board_archived'; board: string; item?: string }
  | { kind: 'board_builtin'; board: string }
  | { kind: 'board_split_child'; board: string; parent: string }
  | { kind: 'board_delete_confirm'; board: string; items: number }
  | { kind: 'board_has_items'; board: string; items: number }
  | { kind: 'board_not_archived'; board: string }
  // A note from the person, or an agent's answer to one, refused: left by someone other than the
  // person (or answered by someone other than an agent), without text, on an item no agent is
  // doing, or on evidence not attached to the item in this round.
  | {
      kind: 'note';
      item: string;
      why: 'not_person' | 'not_agent' | 'empty' | 'not_working' | 'anchor';
    }
  // An agent's question to the person (otea ask) or its answer refused: asked by the person, an
  // empty one, off a step an agent is doing, while one already waits, or no question to answer; and
  // an agent's handoff while its question waits (`asking`).
  | {
      kind: 'question';
      item: string;
      why: 'not_person' | 'not_agent' | 'empty' | 'not_working' | 'asking' | 'none_open';
    };
