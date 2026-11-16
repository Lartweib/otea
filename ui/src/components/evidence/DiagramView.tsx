import { type CSSProperties, useState } from 'react';
import {
  addedLines,
  addedSince,
  type Diagram,
  edgeKey,
  layoutDiagram,
  type Parsed,
  type Placed,
  parseDiagram,
} from '../../diagram.ts';
import { momentLabel } from '../../format.ts';
import { t } from '../../i18n/i18n.ts';
import { Dialog } from '../../kit/pop/Dialog.tsx';
import type { Evidence } from '../../types.ts';
import { TextState, useEvidenceText } from './TextViews.tsx';

type View = 'diagram' | 'source';

function Segment({
  on,
  onClick,
  className,
  label,
  children,
}: {
  on?: boolean;
  onClick: () => void;
  className?: string;
  label?: string;
  children: string;
}) {
  return (
    <button
      type="button"
      className={className ? `dg-seg ${className}` : 'dg-seg'}
      aria-pressed={on}
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function NodeBox({ node, added }: { node: Placed; added: boolean }) {
  const cx = node.x + node.w / 2;
  const cy = node.y + node.h / 2;
  return (
    <g className="dg-node" data-shape={node.shape} data-added={added || undefined}>
      {node.shape === 'diamond' ? (
        <path
          d={`M${cx} ${node.y} L${node.x + node.w} ${cy} L${cx} ${node.y + node.h} L${node.x} ${cy} Z`}
        />
      ) : (
        <rect
          x={node.x}
          y={node.y}
          width={node.w}
          height={node.h}
          rx={node.shape === 'round' ? node.h / 2 : 8}
        />
      )}
      <text className="dg-title" x={cx} y={node.sub ? cy - 4 : cy + 4.5}>
        {node.title}
      </text>
      {node.sub ? (
        <text className="dg-sub" x={cx} y={cy + 13}>
          {node.sub}
        </text>
      ) : null}
    </g>
  );
}

// In the item's column the drawing takes the column's width but never shrinks below three quarters
// of its own size, so its labels stay readable: a wider one scrolls sideways. Enlarged, it is drawn
// at the zoom picked.
function Drawing({
  diagram,
  previous,
  zoom,
}: {
  diagram: Diagram;
  previous: Diagram | undefined;
  zoom?: number;
}) {
  const drawing = layoutDiagram(diagram);
  const added = addedSince(diagram, previous);
  const label = t('diagram.aria', { count: diagram.nodes.length });
  // Two edges can join the same nodes: their place in the file tells them apart.
  const edges = drawing.edges.map((edge, at) => ({ ...edge, key: `${edgeKey(edge)}#${at}` }));
  return (
    <svg
      className="dg"
      viewBox={`0 0 ${drawing.width} ${drawing.height}`}
      width={drawing.width}
      data-zoom={zoom === undefined ? undefined : true}
      style={
        (zoom === undefined
          ? { '--dg-w': drawing.width }
          : { width: drawing.width * zoom }) as CSSProperties
      }
      role="img"
      aria-label={label}
    >
      <defs>
        <marker
          id="dg-arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path className="dg-head" d="M1 1.5 L9 5 L1 8.5 Z" />
        </marker>
      </defs>
      {edges.map((edge) => (
        <path
          key={edge.key}
          className="dg-edge"
          d={edge.d}
          data-dashed={edge.dashed || undefined}
          data-added={added.edges.has(edgeKey(edge)) || undefined}
          markerEnd="url(#dg-arrow)"
        />
      ))}
      {drawing.nodes.map((node) => (
        <NodeBox key={node.id} node={node} added={added.nodes.has(node.id)} />
      ))}
      {edges.map((edge) =>
        edge.label ? (
          <g key={`label:${edge.key}`} className="dg-label">
            <rect
              x={edge.lx - edge.label.length * 3.4 - 8}
              y={edge.ly - 10}
              width={edge.label.length * 6.8 + 16}
              height={20}
              rx={10}
            />
            <text x={edge.lx} y={edge.ly + 4}>
              {edge.label}
            </text>
          </g>
        ) : null,
      )}
    </svg>
  );
}

function Source({ text, added, failed }: { text: string; added: Set<number>; failed?: number }) {
  return (
    <pre className="dg-source">
      {text.split(/\r?\n/).map((line, index) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: lines are their positions
          key={index}
          className="dg-line"
          data-added={added.has(index) || undefined}
          data-failed={failed === index + 1 || undefined}
        >
          {line || ' '}
        </span>
      ))}
    </pre>
  );
}

const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];

// The diagram on the whole screen: zoom out and in by steps, scroll (or drag a finger) to move
// round it.
function Enlarged({
  open,
  onClose,
  title,
  diagram,
  previous,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  diagram: Diagram;
  previous: Diagram | undefined;
}) {
  const [step, setStep] = useState(ZOOMS.indexOf(1));
  const zoom = ZOOMS[step] ?? 1;
  return (
    <Dialog open={open} label={title} onClose={onClose} size="lg" className="dg-dialog">
      <div className="dg-bar" data-i>
        <span className="dg-file">{title}</span>
        <span className="dg-switch">
          <Segment
            label={t('diagram.zoomOut')}
            onClick={() => setStep(Math.max(0, step - 1))}
            className="dg-zoom"
          >
            −
          </Segment>
          <span className="dg-seg dg-level" aria-live="polite">
            {`${Math.round(zoom * 100)}%`}
          </span>
          <Segment
            label={t('diagram.zoomIn')}
            onClick={() => setStep(Math.min(ZOOMS.length - 1, step + 1))}
            className="dg-zoom"
          >
            +
          </Segment>
        </span>
        <span className="dg-switch">
          <Segment onClick={onClose}>{t('diagram.close')}</Segment>
        </span>
      </div>
      <div className="dg-stage dg-stage-big well" data-i>
        <Drawing diagram={diagram} previous={previous} zoom={zoom} />
      </div>
    </Dialog>
  );
}

// One version's text, read once it is shown, with the version before for what changed.
function Version({
  shown,
  before,
  view,
  number,
  enlarged,
  onClose,
}: {
  shown: Evidence;
  before: Evidence | undefined;
  view: View;
  number: number;
  enlarged: boolean;
  onClose: () => void;
}) {
  const text = useEvidenceText(shown);
  const prior = useEvidenceText(before ?? shown);
  if (text.status !== 'ready') return <TextState state={text} evidence={shown} />;
  const previousText = before && prior.status === 'ready' ? prior.text : undefined;
  const parsed: Parsed = parseDiagram(text.text);
  const previous = previousText === undefined ? undefined : parseDiagram(previousText);
  const previousDiagram = previous?.ok ? previous.diagram : undefined;
  const lines = addedLines(text.text, previousText);
  if (!parsed.ok) {
    return (
      <div className="dg-body">
        <p className="dg-error t-small">
          {t('diagram.unreadable', { line: parsed.line, message: parsed.message })}
        </p>
        <Source text={text.text} added={lines} failed={parsed.line} />
      </div>
    );
  }
  const added = addedSince(parsed.diagram, previousDiagram);
  const names = parsed.diagram.nodes
    .filter(({ id }) => added.nodes.has(id))
    .map(({ title }) => title);
  return (
    <div className="dg-body">
      {view === 'source' ? (
        <Source text={text.text} added={lines} />
      ) : (
        <div className="dg-stage well">
          <Drawing diagram={parsed.diagram} previous={previousDiagram} />
        </div>
      )}
      {before && (names.length > 0 || added.edges.size > 0) ? (
        <p className="dg-changed t-cap">
          <i className="dg-key" aria-hidden="true" />
          {names.length > 0
            ? t('diagram.newNodes', { version: number, names: names.join(', ') })
            : t('diagram.newEdges', { version: number, count: added.edges.size })}
        </p>
      ) : null}
      <Enlarged
        open={enlarged}
        onClose={onClose}
        title={shown.filename}
        diagram={parsed.diagram}
        previous={previousDiagram}
      />
    </div>
  );
}

// One file's diagram, newest version first: each attach of the same file is a version, and what the
// shown version adds to the one before is drawn dashed and named under it. Its source is a toggle
// away; Enlarge draws it on the whole screen.
function DiagramFile({ versions }: { versions: readonly Evidence[] }) {
  const [picked, setPicked] = useState<number>();
  const [view, setView] = useState<View>('diagram');
  const [enlarged, setEnlarged] = useState(false);
  const index = Math.max(
    0,
    picked === undefined ? versions.length - 1 : versions.findIndex(({ id }) => id === picked),
  );
  const shown = versions[index];
  if (!shown) return null;
  const before = index > 0 ? versions[index - 1] : undefined;
  return (
    <div className="dg-module">
      <div className="dg-bar">
        <span className="dg-file">{shown.filename}</span>
        <span className="t-cap">
          {t('diagram.version', { version: index + 1 })} ·{' '}
          {momentLabel(shown.createdAt, Date.now())}
        </span>
        <span className="dg-switch">
          <Segment on={view === 'diagram'} onClick={() => setView('diagram')}>
            {t('diagram.diagram')}
          </Segment>
          <Segment on={view === 'source'} onClick={() => setView('source')}>
            {t('diagram.source')}
          </Segment>
        </span>
        {versions.length > 1 ? (
          <span className="dg-switch dg-versions">
            {versions.map((version, at) => (
              <Segment key={version.id} on={at === index} onClick={() => setPicked(version.id)}>
                {t('diagram.v', { version: at + 1 })}
              </Segment>
            ))}
          </span>
        ) : null}
        <span className="dg-switch">
          <Segment className="dg-enlarge" onClick={() => setEnlarged(true)}>
            {t('diagram.enlarge')}
          </Segment>
        </span>
      </div>
      <Version
        key={shown.id}
        shown={shown}
        before={before}
        view={view}
        number={index + 1}
        enlarged={enlarged}
        onClose={() => setEnlarged(false)}
      />
    </div>
  );
}

// The diagrams an agent attached: each file is drawn on its own, in the order first attached; only
// the same file attached again counts as its next version.
export function DiagramView({ evidence }: { evidence: readonly Evidence[] }) {
  const files = new Map<string, Evidence[]>();
  for (const entry of [...evidence].sort((a, b) => a.id - b.id)) {
    files.set(entry.filename, [...(files.get(entry.filename) ?? []), entry]);
  }
  return (
    <>
      {[...files].map(([filename, versions]) => (
        <DiagramFile key={filename} versions={versions} />
      ))}
    </>
  );
}
