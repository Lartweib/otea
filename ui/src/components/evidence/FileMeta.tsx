import { evidenceFileUrl } from '../../api.ts';
import type { Evidence } from '../../types.ts';

// The caption under a file, its name and a link to open it on its own.
export function FileMeta({ evidence }: { evidence: Evidence }) {
  return (
    <p className="ev-meta">
      <a className="ev-file" href={evidenceFileUrl(evidence.id)} target="_blank" rel="noreferrer">
        {evidence.filename}
      </a>
      {evidence.caption ? <span className="t-small">{evidence.caption}</span> : null}
    </p>
  );
}
