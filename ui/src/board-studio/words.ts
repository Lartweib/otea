import type {
  BoardDefinition,
  Doer,
  PartKind,
  Reviewer,
  Target,
} from '../../../src/core/board/model.ts';
import { DONE, isAgent, stepById } from '../../../src/core/board/model.ts';
import type { Change } from '../../../src/core/board/plan.ts';
import type { Problem } from '../../../src/core/board/problems.ts';
import { listOf, listOr, type PlainKey, t } from '../i18n/i18n.ts';

// The board Studio's sentences: problems, publish changes, who does and reviews a step, and the
// kinds of parts, in the language on screen. The core says what (codes and params); this says it.

const str = (value: unknown) => (Array.isArray(value) ? value.map(String) : String(value ?? ''));

export function doesText(who: Doer): string {
  if (who === 'you') return t('bs.does.you');
  if (who === 'any') return t('bs.does.any');
  return t('bs.does.agent', { agent: who.agent });
}

export function reviewsText(who: Reviewer): string {
  if (who === 'you') return t('bs.reviews.you');
  if (who === 'none') return t('bs.reviews.none');
  return t('bs.reviews.agent', { agent: who.agent });
}

export function whoName(who: Doer | Reviewer): string {
  if (isAgent(who)) return who.agent;
  return t(who === 'you' ? 'bs.who.you' : who === 'any' ? 'bs.who.any' : 'bs.who.none');
}

export function targetName(def: BoardDefinition, target: Target): string {
  if (target === DONE) return t('bs.done');
  return stepById(def, target)?.name ?? '…';
}

const KIND_NAMES: Readonly<Record<PartKind, PlainKey>> = {
  text: 'bs.kind.text',
  long: 'bs.kind.long',
  check: 'bs.kind.check',
  choice: 'bs.kind.choice',
  multi: 'bs.kind.multi',
  level: 'bs.kind.level',
  number: 'bs.kind.number',
  date: 'bs.kind.date',
  yesno: 'bs.kind.yesno',
  url: 'bs.kind.url',
  branch: 'bs.kind.branch',
  images: 'bs.kind.images',
  video: 'bs.kind.video',
  audio: 'bs.kind.audio',
  code: 'bs.kind.code',
  log: 'bs.kind.log',
  diagram: 'bs.kind.diagram',
  file: 'bs.kind.file',
};

export function kindName(kind: PartKind): string {
  return t(KIND_NAMES[kind]);
}

// "una línea", "capturas, bocetos, referencias": what a kind is for, under its name in the picker.
export function kindGloss(kind: PartKind): string {
  return t(`${KIND_NAMES[kind]}.gloss` as PlainKey);
}

const USES: Readonly<Record<string, PlainKey>> = {
  title: 'bs.use.title',
  field: 'bs.use.field',
  evidence: 'bs.use.evidence',
  step: 'bs.use.step',
};

const MANY_USES: Readonly<Record<string, 'bs.use.fields' | 'bs.use.evidences' | 'bs.use.steps'>> = {
  field: 'bs.use.fields',
  evidence: 'bs.use.evidences',
  step: 'bs.use.steps',
};

export function problemText(problem: Problem): string {
  const p = problem.params;
  switch (problem.code) {
    case 'board_unnamed':
      return t('bs.problem.board_unnamed');
    case 'board_name_taken':
      return t('bs.problem.board_name_taken', { name: str(p.name) as string });
    case 'no_steps':
      return t('bs.problem.no_steps');
    case 'step_unnamed':
      return t('bs.problem.step_unnamed');
    case 'part_unnamed':
      return t('bs.problem.part_unnamed');
    case 'duplicate_name': {
      // Two steps with one name read «para dos pasos», never «un paso y un paso».
      const counts = new Map<string, number>();
      for (const use of str(p.uses) as string[]) counts.set(use, (counts.get(use) ?? 0) + 1);
      const uses = [...counts].map(([use, n]) =>
        n > 1 ? t(MANY_USES[use] ?? 'bs.use.fields', { n }) : t(USES[use] ?? 'bs.use.field'),
      );
      return t('bs.problem.duplicate_name', { name: str(p.name) as string, uses: listOf(uses) });
    }
    case 'part_missing':
      return t('bs.problem.part_missing');
    case 'reserved_name':
      return t('bs.problem.reserved_name', { name: str(p.name) as string });
    case 'when_unreadable':
      return t('bs.problem.when_unreadable', {
        part: str(p.part) as string,
        step: str(p.step) as string,
      });
    case 'way_invalid':
      return t('bs.problem.way_invalid', { step: str(p.step) as string });
    case 'back_invalid':
      return t('bs.problem.back_invalid', { step: str(p.step) as string });
    case 'cap_invalid':
      return t('bs.problem.cap_invalid');
    case 'agent_offline':
      return t('bs.problem.agent_offline', {
        agent: str(p.agent) as string,
        step: str(p.step) as string,
      });
    case 'self_review':
      return t('bs.problem.self_review', { step: str(p.step) as string });
    case 'agent_closes':
      return t('bs.problem.agent_closes', { step: str(p.step) as string });
    case 'wait_no_split':
      return t('bs.problem.wait_no_split', {
        step: str(p.step) as string,
        board: str(p.board) as string,
      });
    case 'skip_invalid':
      return t('bs.problem.skip_invalid', { step: str(p.step) as string });
    case 'split_cycle':
      return t('bs.problem.split_cycle', {
        board: str(p.board) as string,
        other: str(p.other) as string,
      });
    case 'split_unknown':
      return t('bs.problem.split_unknown', { board: str(p.board) as string });
    case 'guard_no_push':
      return t('bs.problem.guard_no_push', { part: str(p.part) as string });
    case 'initial_invalid':
      return t('bs.problem.initial_invalid', { part: str(p.part) as string });
    case 'motive_agent_drop':
      return t('bs.problem.motive_agent_drop', { step: str(p.step) as string });
  }
}

const LEVEL_WORDS: Readonly<Record<string, PlainKey>> = {
  low: 'bs.level.low',
  medium: 'bs.level.medium',
  high: 'bs.level.high',
  critical: 'bs.level.critical',
  yes: 'bs.yes',
  no: 'bs.no',
};

// A start value as people read it: a choice by its name, a level or yes-or-no in words.
export function initialName(value: string, name?: string): string {
  if (name !== undefined) return name;
  const key = LEVEL_WORDS[value];
  return key ? t(key) : value;
}

function waitsText(name: string, waits: readonly string[], board?: string): string {
  const parts = waits.includes('parts');
  const blockers = waits.includes('blockers');
  if (parts && blockers)
    return t('bs.change.waits_both', { name, board: board ?? t('bs.change.waits_parts_any') });
  if (parts)
    return t('bs.change.waits_parts', { name, board: board ?? t('bs.change.waits_parts_any') });
  if (blockers) return t('bs.change.waits_blockers', { name });
  return t('bs.change.waits_none', { name });
}

function groupName(group: string | undefined): string | undefined {
  if (group === 'step') return t('bs.change.group_step');
  if (group === 'motive') return t('bs.change.group_motive');
  return group;
}

function reqText(req: 'always' | 'when' | 'no', fresh: boolean): string {
  if (req === 'always') return t(fresh ? 'bs.req.always_fresh' : 'bs.req.always');
  return t(req === 'when' ? 'bs.req.when' : 'bs.req.no');
}

export function changeText(change: Change): string {
  switch (change.kind) {
    case 'created':
      return t('bs.change.created', {
        board: change.board,
        steps: listOf(change.steps),
        count: change.steps.length,
      });
    case 'board_renamed':
      return t('bs.change.board_renamed', { to: change.to });
    case 'item_renamed':
      return t('bs.change.item_renamed', { to: change.to });
    case 'step_added':
      return t('bs.change.step_added', {
        name: change.name,
        doer: doesText(change.doer),
        reviewer: reviewsText(change.reviewer),
      });
    case 'step_renamed':
      return t('bs.change.step_renamed', { from: change.from, to: change.to });
    case 'step_doer':
      return t('bs.change.step_doer', { name: change.name, doer: doesText(change.doer) });
    case 'step_reviewer':
      return t('bs.change.step_reviewer', {
        name: change.name,
        reviewer: reviewsText(change.reviewer),
      });
    case 'hand_added':
      return t('bs.change.hand_added', {
        name: change.name,
        part: change.partName,
        req: reqText(change.req, change.fresh),
      });
    case 'hand_changed':
      return t('bs.change.hand_changed', {
        name: change.name,
        part: change.partName,
        req: reqText(change.req, change.fresh),
      });
    case 'step_back':
      return t('bs.change.step_back', { name: change.name, to: change.to });
    case 'hand_removed':
      return t('bs.change.hand_removed', { name: change.name, part: change.partName });
    case 'step_instructions':
      return t('bs.change.step_instructions', { name: change.name });
    case 'step_ways':
      return t('bs.change.step_ways', { name: change.name });
    case 'step_removed':
      return t('bs.change.step_removed', { name: change.name });
    case 'steps_reordered':
      return t('bs.change.steps_reordered');
    case 'part_renamed':
      return t('bs.change.part_renamed', { from: change.from, to: change.to });
    case 'part_added':
      return t(change.evidence ? 'bs.change.evidence_added' : 'bs.change.field_added', {
        name: change.name,
      });
    case 'form':
      return t('bs.change.form', { names: listOf(change.names) });
    case 'layout':
      return t('bs.change.layout');
    case 'board_instructions':
      return t('bs.change.board_instructions');
    case 'cap':
      return change.cap.on ? t('bs.change.cap_on', { n: change.cap.n }) : t('bs.change.cap_off');
    case 'skip':
      return change.on
        ? t('bs.change.skip_on', { to: change.to })
        : t('bs.change.skip_off', { name: change.name });
    case 'way_back':
      if (!change.on) return t('bs.change.way_back_off', { name: change.name, to: change.to });
      return t(change.you ? 'bs.change.give_back_on' : 'bs.change.way_back_on', {
        name: change.name,
        to: change.to,
      });
    case 'note':
      return t(change.on ? 'bs.change.note_on' : 'bs.change.note_off', { name: change.name });
    case 'waits':
      return waitsText(change.name, change.waits, change.board);
    case 'doer_drop':
      return t(change.on ? 'bs.change.doer_drop_on' : 'bs.change.doer_drop_off', {
        name: change.name,
      });
    case 'guard':
      return change.push === null
        ? t('bs.change.guard_off', { part: change.partName })
        : t('bs.change.guard_on', { part: change.partName, steps: listOr(change.push) });
    case 'initial':
      return change.value === null
        ? t('bs.change.initial_off', { part: change.partName })
        : t('bs.change.initial_on', {
            part: change.partName,
            value: initialName(change.value, change.valueName),
          });
    case 'split':
      if (change.board === null) return t('bs.change.split_off');
      return t(change.always ? 'bs.change.split_always' : 'bs.change.split_on', {
        board: change.board,
      });
    case 'motives':
      return change.names.length === 0
        ? t('bs.change.motives_off')
        : t('bs.change.motives_on', { names: listOr(change.names) });
    case 'drop_by':
      return t(change.by === 'page' ? 'bs.change.drop_by_page' : 'bs.change.drop_by_anyone');
    case 'list': {
      const group = groupName(change.group);
      const as = t(change.as === 'table' ? 'bs.change.list_table' : 'bs.change.list_list');
      return group ? t('bs.change.list_grouped', { as, group }) : t('bs.change.list', { as });
    }
  }
}
