import { partRule } from '../core/board/joins.ts';
import { OteaError } from '../core/errors.ts';
import { type Finding, itemFindings } from '../core/validation.ts';
import type { Workflow } from '../core/workflow.ts';
import { findItem, listCollections, selectItems, selectRelations } from '../store/queries.ts';
import type { Context } from './context.ts';
import { workflowOf } from './items.ts';
import { liveBoardOf } from './next.ts';
import { type LoadedPreset, requirePreset } from './presets.ts';

export type ValidationReport = { errors: number; warnings: number; findings: Finding[] };

function resolve(ctx: Context, name: string): LoadedPreset | string {
  try {
    return requirePreset(ctx.presets, name);
  } catch (error) {
    if (error instanceof OteaError) return error.message;
    throw error;
  }
}

// Whether some state of the item's workflow waits for its children; false when its preset is gone.
function waitsForChildren(ctx: Context, item: { collection: string; type: string }): boolean {
  let workflow: Workflow;
  try {
    workflow = workflowOf(ctx, item);
  } catch (error) {
    if (error instanceof OteaError) return false;
    throw error;
  }
  return workflow.states.some(({ requires }) => requires?.includes('children_closed'));
}

// A parent in another collection, linked before a tree had to live in one: it still reads, and each
// is reported with its two ways out. Merging the collections keeps the tree; converting it to blocks
// keeps the wait of a parent that waits for its children, and to implements keeps the rest. A part
// on the board its parent's board divides into ("se divide en") is the declared join, not a stray.
function declaredPart(ctx: Context, child: string, parent: string): boolean {
  const childBoard = liveBoardOf(ctx, child);
  const parentBoard = liveBoardOf(ctx, parent);
  return !!childBoard && !!parentBoard && partRule(parentBoard, childBoard) === 'ok';
}

function parentAcrossBoards(ctx: Context): Finding[] {
  return selectRelations(ctx.db, 'parent').flatMap(({ from, to }) => {
    const child = findItem(ctx.db, from);
    const parent = findItem(ctx.db, to);
    if (!child || !parent || child.collection === parent.collection) return [];
    if (declaredPart(ctx, child.collection, parent.collection)) return [];
    const merge = `merge ${child.collection} and ${parent.collection} into one preset as types`;
    const unlink = `otea unlink ${from} parent ${to}`;
    const convert = waitsForChildren(ctx, parent)
      ? `convert the link to blocks, since ${to} waits for its children: ${unlink}, otea link ${from} blocks ${to}, and write requires: blockers_closed where its preset requires children_closed`
      : `convert the link to implements: ${unlink}, otea link ${from} implements ${to}`;
    return [
      {
        severity: 'warning' as const,
        subject: from,
        message: `parent ${to} is in another collection (${parent.collection}); ${merge}, or ${convert}`,
      },
    ];
  });
}

// The preset notes otea validate prints: the warnings of the project's own presets. An official
// preset is read-only, so its notes (an approval only the web UI may give, say) are by design, and
// Studio shows them; info notes only say what a preset does, and stay in Studio too.
function presetWarnings(ctx: Context): Finding[] {
  return ctx.presets.warnings
    .filter(({ origin, level = 'warning' }) => origin === 'project' && level === 'warning')
    .map(({ preset, message }) => ({
      severity: 'warning' as const,
      subject: `preset ${preset}`,
      message,
    }));
}

// `extra` carries findings checked elsewhere.
export function validateProject(ctx: Context, extra: readonly Finding[] = []): ValidationReport {
  const findings: Finding[] = [
    ...ctx.presets.problems.map(({ preset, message }) => ({
      severity: 'error' as const,
      subject: `preset ${preset}`,
      message,
    })),
    ...presetWarnings(ctx),
  ];
  findings.push(...extra);
  for (const collection of listCollections(ctx.db)) {
    const preset = resolve(ctx, collection.preset);
    if (typeof preset === 'string') {
      findings.push({
        severity: 'error',
        subject: `collection ${collection.name}`,
        message: preset,
      });
      continue;
    }
    for (const item of selectItems(ctx.db, { collection: collection.name })) {
      findings.push(...itemFindings(preset, item));
    }
  }
  findings.push(...parentAcrossBoards(ctx));
  const errors = findings.filter(({ severity }) => severity === 'error').length;
  return { errors, warnings: findings.length - errors, findings };
}
