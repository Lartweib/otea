import { evidenceFileUrl } from '../api.ts';
import { Pill } from '../kit/index.ts';
import type { Evidence } from '../types.ts';

type EvidenceListProps = { evidence: Evidence[]; canWrite: boolean };

// The files attached as proof, oldest first. The server hands them only to a signed-in browser,
// so a read-only one lists them without thumbnails or links.
export function EvidenceList({ evidence, canWrite }: EvidenceListProps) {
  return (
    <ul className="evidence">
      {evidence.map((entry) => {
        const url = evidenceFileUrl(entry.id);
        return (
          <li key={entry.id} className="evidence-entry">
            {canWrite && entry.kind === 'image' ? (
              <a className="evidence-thumb well" href={url} target="_blank" rel="noreferrer">
                <img src={url} alt={entry.caption ?? entry.filename} loading="lazy" />
              </a>
            ) : null}
            <div className="evidence-text">
              <span className="evidence-tags">
                {entry.role === 'single' ? null : <Pill size="sm">{entry.role}</Pill>}
                <span className="t-cap">{entry.kind}</span>
              </span>
              {canWrite ? (
                <a className="evidence-name" href={url} target="_blank" rel="noreferrer">
                  {entry.filename}
                </a>
              ) : (
                <span className="evidence-name">{entry.filename}</span>
              )}
              {entry.caption ? <span className="t-small">{entry.caption}</span> : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
