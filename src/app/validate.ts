import { OteaError } from '../core/errors.ts';
import { type Finding, itemFindings } from '../core/validation.ts';
import { listCollections, selectItems } from '../store/queries.ts';
import type { Context } from './context.ts';
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

export function validateProject(ctx: Context): ValidationReport {
  const findings: Finding[] = [
    ...ctx.presets.problems.map(({ preset, message }) => ({
      severity: 'error' as const,
      subject: `preset ${preset}`,
      message,
    })),
    ...ctx.presets.warnings.map(({ preset, message }) => ({
      severity: 'warning' as const,
      subject: `preset ${preset}`,
      message,
    })),
  ];
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
  const errors = findings.filter(({ severity }) => severity === 'error').length;
  return { errors, warnings: findings.length - errors, findings };
}
