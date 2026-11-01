import { Severity, type SeverityLevel } from '../kit/index.ts';
import type { Section } from '../sections.ts';

const LEVELS = ['low', 'medium', 'high', 'critical'];

// A group's header in the list and in the grid: its name (after its bars, grouped by severity), how
// many it holds, and, grouped by anything but turn, how many of them wait for you. The name and the
// count travel between the two views.
export function GroupLabel({
  section,
  total,
  severity = false,
}: {
  section: Section;
  total: number;
  severity?: boolean;
}) {
  const level = LEVELS.indexOf(section.key) + 1;
  const yours =
    section.turn === undefined ? section.items.filter(({ turn }) => turn === 'human').length : 0;
  return (
    <>
      {severity && level > 0 ? (
        <span className="group-bars" data-m={`g:${section.key}:b`}>
          <Severity level={level as SeverityLevel} />
        </span>
      ) : null}
      <span className="group-name" data-m={`g:${section.key}:l`}>
        {section.title}
      </span>
      <span className="count" data-m={`g:${section.key}:c`}>
        {total}
      </span>
      {yours > 0 ? <span className="group-yours">· {yours} for you</span> : null}
    </>
  );
}
