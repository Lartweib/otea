import type { Performer } from '../core/authority.ts';
import { transaction } from '../store/database.ts';
import type { EvidenceRecord } from '../store/queries.ts';
import { type EvidenceFile, placeFile, recordEvidence } from './evidence.ts';
import { type CreateItemInput, type Item, insertNewItem, systemClock } from './items.ts';
import type { Project } from './project.ts';

export type CreatedWithEvidence = Item & { evidence: EvidenceRecord[] };

// A new item and the files it was filed with, in one write: every file is placed (size, module,
// role) before any is stored, and a refusal of any of them creates nothing.
export function createItemWithEvidence(
  project: Project,
  input: CreateItemInput & Performer,
  files: readonly EvidenceFile[],
  now = systemClock,
): CreatedWithEvidence {
  return transaction(project.db, () => {
    const at = now();
    const { item, created } = insertNewItem(project, input, at);
    const placed = files.map((file) => placeFile(project, item, file, input.actor, at));
    const evidence = placed.map((file) => recordEvidence(project, item.id, file, input, at));
    return { ...created, evidence };
  });
}
