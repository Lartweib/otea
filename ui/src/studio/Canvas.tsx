import {
  type MouseEvent,
  type ReactNode,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { t } from '../i18n/i18n.ts';
import {
  type Box,
  merged,
  type Part,
  type Placed,
  partFrom,
  partLabel,
  samePart,
  slotBoxes,
} from './canvas.ts';

// The preview as a canvas: the real view drawn inside, and over it the slots as fine dashed boxes,
// the part under the mouse outlined with its name, and the chosen part ringed. A click inside
// never reaches the view (no move is made, no link followed): it chooses the part it landed on.

type CanvasProps = {
  children: ReactNode;
  // The type the view draws, which every part it places belongs to.
  type: string;
  selected: Part | undefined;
  onSelect: (part: Part | undefined) => void;
  // The name a module part goes by (an evidence module's id), for its tag.
  nameOf?: ((part: Part) => string | undefined) | undefined;
  // Drawn over the view in its coordinates: + field here and the pickers they open.
  marks?: ((placed: readonly Placed[]) => ReactNode) | undefined;
  label: string;
};

const PAD = 8;
const RING = 4;

const grow = (box: Box, by: number): Box => ({
  top: box.top - by,
  left: box.left - by,
  width: box.width + by * 2,
  height: box.height + by * 2,
});

const style = (box: Box) => ({
  top: `${box.top}px`,
  left: `${box.left}px`,
  width: `${box.width}px`,
  height: `${box.height}px`,
});

function partOf(target: EventTarget | null): { part: Part; element: Element } | undefined {
  const element = target instanceof Element ? target.closest('[data-slot]') : null;
  if (!element) return undefined;
  const part = partFrom((name) => element.getAttribute(name));
  return part && { part, element };
}

function measure(root: HTMLElement): Placed[] {
  const origin = root.getBoundingClientRect();
  return [...root.querySelectorAll('[data-slot]')].flatMap((element) => {
    const part = partFrom((name) => element.getAttribute(name));
    const rect = element.getBoundingClientRect();
    if (!part || rect.width === 0 || rect.height === 0) return [];
    return [
      {
        part,
        rect: {
          top: Math.round(rect.top - origin.top),
          left: Math.round(rect.left - origin.left),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
      },
    ];
  });
}

export function Canvas({ children, type, selected, onSelect, nameOf, marks, label }: CanvasProps) {
  const root = useRef<HTMLDivElement>(null);
  const [placed, setPlaced] = useState<Placed[]>([]);
  const [hovered, setHovered] = useState<Part>();
  const remeasure = useCallback(() => {
    const element = root.current;
    if (!element) return;
    const next = merged(measure(element));
    setPlaced((current) => (JSON.stringify(current) === JSON.stringify(next) ? current : next));
  }, []);
  useLayoutEffect(() => {
    remeasure();
  });
  useLayoutEffect(() => {
    const element = root.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(remeasure);
    observer.observe(element);
    // Images and fonts settle after the first draw.
    element.addEventListener('load', remeasure, true);
    return () => {
      observer.disconnect();
      element.removeEventListener('load', remeasure, true);
    };
  }, [remeasure]);
  const choose = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const found = partOf(event.target);
    if (found) onSelect(found.part);
  };
  const boxOf = (part: Part | undefined) =>
    part && placed.find((each) => samePart(each.part, part))?.rect;
  const hoveredBox = hovered && !samePart(hovered, selected) ? boxOf(hovered) : undefined;
  const selectedBox = boxOf(selected);
  const name = (part: Part) => part.field ?? nameOf?.(part) ?? part.slot;
  return (
    <div className="st-canvas" ref={root}>
      <figure
        className="st-canvas-view"
        aria-label={label}
        onClickCapture={choose}
        onMouseOver={(event) => setHovered(partOf(event.target)?.part)}
        onFocus={(event) => setHovered(partOf(event.target)?.part)}
        onMouseLeave={() => setHovered(undefined)}
      >
        {children}
      </figure>
      <div className="st-canvas-marks">
        {slotBoxes(placed).map(({ slot, rect }) => (
          <div key={slot} className="st-slotbox" style={style(grow(rect, PAD))}>
            <button
              type="button"
              className="st-slottag"
              aria-pressed={selected?.slot === slot && selected.index < 0}
              aria-label={t('studio.canvas.slot', { slot })}
              onClick={() => onSelect({ type, slot, index: -1 })}
            >
              {slot}
            </button>
          </div>
        ))}
        {hoveredBox && hovered ? (
          <div className="st-hoverbox" style={style(grow(hoveredBox, RING))}>
            <span className="st-parttag">{name(hovered)}</span>
          </div>
        ) : null}
        {selectedBox && selected ? (
          <div className="st-selbox" style={style(grow(selectedBox, RING))}>
            <span className="st-parttag">
              {partLabel(selected, selected.field ? undefined : nameOf?.(selected))}
            </span>
          </div>
        ) : null}
        {marks?.(placed)}
      </div>
    </div>
  );
}
