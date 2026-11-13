import type { Linked, Missing } from '../../src/core/board/engine.ts';
import type { RefusalDetails } from '../../src/core/refusal.ts';
import { language, listOf, listOr, t } from './i18n/i18n.ts';

// A refusal from the server in the language on screen, worded from its code and details. The
// server's message is English, for agents and the CLI: it is shown only for a refusal this UI does
// not know (a code or a kind newer than it).

const NOTE = 'note';
const PARTS = 'wait:parts';
const BLOCKERS = 'wait:blockers';

// "TAR-6 (Implementar)"; with the board, "ERR-4 (Errores, Arreglar)".
function named(open: readonly Linked[], board = false): string {
  return listOf(
    open.map(({ id, board: on, step }) => {
      const where = [board ? on : '', step ?? ''].filter(Boolean).join(', ');
      return where ? `${id} (${where})` : id;
    }),
  );
}

function blockersWhy(wait: Missing): string {
  const open = wait.open ?? [];
  return t('refusal.why.blockers', { list: named(open, true), count: open.length });
}

function partsWhy(wait: Missing): string {
  const open = wait.open ?? [];
  const total = wait.total ?? open.length;
  const list = named(open);
  if (total === 1 && open.length === 1) return t('refusal.why.part', { list });
  if (open.length === total) return t('refusal.why.allParts', { list, count: total });
  return t('refusal.why.someParts', { list, count: open.length, total });
}

// What a handoff lacks leads; when only its waits hold it, those.
function handoffWhy(missing: readonly Missing[]): string {
  const note = missing.some(({ ref }) => ref === NOTE);
  const parts = missing.filter(({ reason, ref }) => reason !== 'open' && ref !== NOTE);
  if (parts.length > 0 || note) {
    const what = parts.map(({ name, reason, fresh }) => {
      const said =
        reason === 'missing' && fresh
          ? t('refusal.why.fresh')
          : reason === 'not_new'
            ? t('refusal.why.fresh')
            : reason === 'unchecked'
              ? t('refusal.why.unchecked')
              : '';
      return said ? `${name} (${said})` : name;
    });
    if (note) what.push(t('refusal.why.note'));
    return t('refusal.why.missing', { list: listOf(what), count: what.length });
  }
  return missing
    .flatMap((wait) =>
      wait.ref === PARTS ? [partsWhy(wait)] : wait.ref === BLOCKERS ? [blockersWhy(wait)] : [],
    )
    .join('; ');
}

function approvalWhy(missing: readonly Missing[]): string {
  return missing
    .flatMap((wait) => {
      const open = wait.open ?? [];
      if (wait.ref === PARTS)
        return [t('refusal.why.reopened', { list: named(open), count: open.length })];
      if (wait.ref === BLOCKERS) return [blockersWhy(wait)];
      return [];
    })
    .join('; ');
}

const DROP_WHY = {
  not_open: 'refusal.drop.notOpen',
  reason_required: 'refusal.drop.reason',
  not_droppable: 'refusal.drop.notDroppable',
} as const;

const UNDO_WHY = {
  not_moved: 'refusal.undo.notMoved',
  already_undone: 'refusal.undo.alreadyUndone',
  not_yours: 'refusal.undo.notYours',
  not_from: 'refusal.undo.notFrom',
  too_old: 'refusal.undo.tooOld',
} as const;

const RELEASE_WHY = {
  not_release: 'refusal.undo.notRelease',
  not_yours: 'refusal.undo.notYourRelease',
  too_old: 'refusal.undo.releaseTooOld',
  lost: 'refusal.undo.leaseLost',
} as const;

const HERE_WHY = {
  not_doing: 'refusal.notDoing',
  not_review: 'refusal.notReview',
  unknown_step: 'refusal.unknownStep',
} as const;

const MOVE_WHY = {
  no_move: 'refusal.move.none',
  reason_required: 'refusal.move.reason',
  not_allowed: 'refusal.move.notAllowed',
} as const;

function fieldName(field: { key: string; labels?: Record<string, string> }): string {
  return field.labels?.[language()] ?? field.key;
}

function dropWhy(details: Extract<RefusalDetails, { kind: 'drop' }>): string | undefined {
  if (details.why === 'motive_required')
    return t('refusal.drop.motive', { motives: listOr(details.motives) });
  if (details.why === 'not_relayable')
    return t('refusal.drop.notRelayable', { board: details.board });
  const key = DROP_WHY[details.why];
  return key && t(key);
}

// The words for a refusal's details; undefined for a kind this UI does not know.
function said(details: RefusalDetails): string | undefined {
  switch (details.kind) {
    case 'item_missing':
      return t('refusal.itemMissing', { item: details.item });
    case 'handoff':
      return t('refusal.handoff', { item: details.item, why: handoffWhy(details.missing) });
    case 'approval':
      return t('refusal.approval', { item: details.item, why: approvalWhy(details.missing) });
    case 'drop': {
      const why = dropWhy(details);
      return why && t('refusal.drop', { item: details.item, why });
    }
    case 'send_back_reason':
      return t('refusal.sendBackReason', { item: details.item });
    case 'way_back_reason':
      return t('refusal.wayBackReason', { item: details.item });
    case 'no_way':
      return details.way !== undefined && details.step !== undefined
        ? t('refusal.noWayNamed', { item: details.item, way: details.way, step: details.step })
        : t('refusal.noWay', { item: details.item });
    case 'not_here': {
      const key = HERE_WHY[details.why];
      return key && t(key, { item: details.item });
    }
    case 'not_your_turn': {
      const words = {
        item: details.item,
        who: details.who ?? t('refusal.thePerson'),
        step: details.step ?? t('refusal.thisStep'),
      };
      return details.review ? t('refusal.notYourReview', words) : t('refusal.notYourTurn', words);
    }
    case 'frozen':
      return t('refusal.frozen', {
        item: details.item,
        part: details.part,
        steps: listOr(details.steps),
      });
    case 'closed':
      return t('refusal.closed', { item: details.item });
    case 'undo': {
      const key = UNDO_WHY[details.why];
      return key && t('refusal.undo', { item: details.item, why: t(key) });
    }
    case 'undo_release': {
      const key = RELEASE_WHY[details.why];
      return key && t('refusal.undo', { item: details.item, why: t(key) });
    }
    case 'not_stuck':
      return details.holder === undefined
        ? t('refusal.notStuckFree', { item: details.item })
        : t('refusal.notStuck', { item: details.item, holder: details.holder });
    case 'agent_name':
      return t('refusal.agentName', { name: details.name });
    case 'move': {
      const key = MOVE_WHY[details.why];
      return key && t(key);
    }
    case 'fields_missing':
      return t('refusal.fieldsMissing', {
        list: listOf(details.fields.map(fieldName)),
        count: details.fields.length,
      });
    case 'links_open': {
      const words = {
        item: details.item,
        list: listOf(details.open),
        count: details.open.length,
        total: details.total,
      };
      return details.links === 'children'
        ? t('refusal.childrenOpen', words)
        : t('refusal.blockersOpen', words);
    }
    case 'self_link':
      return t('refusal.selfLink', { item: details.item });
    case 'already_linked':
      return t('refusal.alreadyLinked');
    case 'parent_exists':
      return t('refusal.parentExists', { item: details.item, parent: details.parent });
    case 'link_cycle':
      return t('refusal.linkCycle');
    case 'parent_closed':
      return t('refusal.parentClosed', { parent: details.parent });
    case 'parent_board':
      return details.board === undefined
        ? t('refusal.parentElsewhere', { item: details.item, parent: details.parent })
        : t('refusal.parentBoard', { parent: details.parent, board: details.board });
    case 'no_link':
      return t('refusal.noLink');
    case 'parent_required':
      return details.item !== undefined && details.parent !== undefined
        ? t('refusal.parentRequired', { item: details.item, parent: details.parent })
        : t('refusal.parentRequiredAny');
    case 'draft_changed':
      return t('refusal.draftChanged');
    case 'draft_invalid':
      return t('refusal.draftInvalid');
    case 'board_changed':
      return details.version === null
        ? t('refusal.boardUnpublished')
        : t('refusal.boardChanged', { version: details.version });
    case 'board_name_taken':
      return t('refusal.boardNameTaken', { name: details.name });
    case 'board_name_empty':
      return t('refusal.boardNameEmpty');
    case 'draft_errors':
      return t('refusal.draftErrors');
    case 'restore_used':
      return t('refusal.restoreUsed');
    case 'restore_step_lost':
      return t('refusal.restoreStepLost', {
        item: details.item,
        step: details.step,
        version: details.version,
      });
    case 'restore_name_taken':
      return t('refusal.restoreNameTaken', { name: details.name });
    case 'desk_only':
      return t('refusal.deskOnly');
    default:
      return undefined;
  }
}

// Refusals that need no details to be said: the request itself was refused.
const BY_CODE = {
  unexpected: 'refusal.unexpected',
  invalid_body: 'refusal.badRequest',
  unsupported_media_type: 'refusal.badRequest',
  forbidden_origin: 'refusal.otherOrigin',
  evidence_too_large: 'refusal.tooLarge',
  board_conflict: 'refusal.draftChanged',
} as const;

// The refusal in the language on screen, or undefined when this UI does not know it.
export function refusalWords(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const { code, details } = error as { code?: unknown; details?: unknown };
  if (typeof details === 'object' && details !== null && 'kind' in details) {
    try {
      return said(details as RefusalDetails) || undefined;
    } catch {
      // Details of a shape this UI does not know: the server's message says it.
      return undefined;
    }
  }
  if (typeof code !== 'string' || !(code in BY_CODE)) return undefined;
  return t(BY_CODE[code as keyof typeof BY_CODE]);
}
