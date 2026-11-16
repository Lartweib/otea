import { t } from '../i18n/i18n.ts';
import type { Evidence } from '../types.ts';
import { EvidenceViewer } from './evidence/EvidenceViewer.tsx';

type EvidenceListProps = { evidence: Evidence[]; canWrite: boolean };

// The files attached as proof, oldest first, each read in the viewer for its kind (an image shown,
// a recording or a voice note played, a diff or a log as lines, a document formatted). The server
// hands files only to a signed-in browser, so a read-only one lists their names and kinds.
export function EvidenceList({ evidence, canWrite }: EvidenceListProps) {
  return (
    <ul className="evidence">
      {evidence.map((entry) =>
        canWrite ? (
          <li key={entry.id} className="evidence-entry evidence-file">
            <EvidenceViewer evidence={entry} />
          </li>
        ) : (
          <li key={entry.id} className="evidence-entry">
            <div className="evidence-text">
              <span className="t-cap">{t(`evidence.kind.${entry.kind}`)}</span>
              <span className="evidence-name">{entry.filename}</span>
              {entry.caption ? <span className="t-small">{entry.caption}</span> : null}
            </div>
          </li>
        ),
      )}
    </ul>
  );
}
