import { createContext, useContext } from 'react';
import { evidenceFileUrl } from './api.ts';
import type { Evidence } from './types.ts';

// Where a piece of evidence's file loads from: the server's file of a stored item, unless a view
// says otherwise. Studio's preview draws sample items, whose files live beside their preset.
export type FileUrl = (evidence: Pick<Evidence, 'id' | 'filename'>) => string;

export const EvidenceFiles = createContext<FileUrl>(({ id }) => evidenceFileUrl(id));

export const useFileUrl = (): FileUrl => useContext(EvidenceFiles);
