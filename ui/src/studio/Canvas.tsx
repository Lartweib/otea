import {
  type MouseEvent,
  type ReactNode,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { t } from '../i18n/i18n.ts';
import type { LayoutSlot } from '../types.ts';
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
  // The slot last pointed at stays until the pointer leaves the canvas, so its marks can be reached.
  marks?: ((placed: readonly Placed[], slot: LayoutSlot | undefined) => ReactNode) | undefined;
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

// The part under the pointer, also beneath a link stretched over a whole row.
function partAt(event: MouseEvent): Part | undefined {
  const direct = partOf(event.target)?.part;
  if (direct || typeof document.elementsFromPoint !== 'function') return direct;
  const view = event.currentTarget;
  for (const element of document.elementsFromPoint(event.clientX, event.clientY)) {
    if (!view.contains(element)) continue;
    const found = partOf(element);
    if (found) return found.part;
  }
  return undefined;
}

function measure(root: HTMLElement): Placed[] {
  const origin = root.getBoundingClientRect();
  return [...root.querySelectorAll('.st-canvas-view [data-slot]')].flatMap((element) => {
    const part = partFrom((name) => element.getAttribute(name));
    if (!part) return [];
    // A box-less wrapper (a row's mark) is measured by what it holds.
    const own = element.getBoundingClientRect();
    const rects =
      own.width > 0 && own.height > 0
        ? [own]
        : [...element.children].map((child) => child.getBoundingClientRect());
    return rects
      .filter((rect) => rect.width > 0 && rect.height > 0)
      .map((rect) => ({
        part,
        rect: {
          top: Math.round(rect.top - origin.top),
          left: Math.round(rect.left - origin.left),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
      }));
  });
}

export function Canvas({ children, type, selected, onSelect, nameOf, marks, label }: CanvasProps) {
  const root = useRef<HTMLDivElement>(null);
  const [placed, setPlaced] = useState<Placed[]>([]);
  const [hovered, setHovered] = useState<Part>();
  const [slot, setSlot] = useState<LayoutSlot>();
  // Where the pointer is down the canvas: of a part drawn in every row, the one under it is outlined.
  const pointerY = useRef<number | undefined>(undefined);
  const point = (part: Part | undefined) => {
    setHovered(part);
    if (part) setSlot(part.slot);
  };
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
    const leave = () => setSlot(undefined);
    element.addEventListener('mouseleave', leave);
    return () => {
      observer.disconnect();
      element.removeEventListener('load', remeasure, true);
      element.removeEventListener('mouseleave', leave);
    };
  }, [remeasure]);
  const choose = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const part = partAt(event);
    if (part) onSelect(part);
  };
  const boxOf = (part: Part | undefined, near?: number) => {
    const boxes = part ? placed.filter((each) => samePart(each.part, part)) : [];
    const under =
      near === undefined
        ? undefined
        : boxes.find(({ rect }) => near >= rect.top && near <= rect.top + rect.height);
    return (under ?? boxes[0])?.rect;
  };
  const hoveredBox =
    hovered && !samePart(hovered, selected) ? boxOf(hovered, pointerY.current) : undefined;
  const selectedBox = boxOf(selected);
  const name = (part: Part) => part.field ?? nameOf?.(part) ?? part.slot;
  return (
    <div className="st-canvas" ref={root}>
      <figure
        className="st-canvas-view"
        aria-label={label}
        onClickCapture={choose}
        onMouseMove={(event) => {
          const top = root.current?.getBoundingClientRect().top ?? 0;
          pointerY.current = event.clientY - top;
          const part = partAt(event);
          if (!samePart(part, hovered)) point(part);
        }}
        onFocus={(event) => point(partOf(event.target)?.part)}
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
          <div
            className="st-hoverbox"
            data-slot={hovered.slot}
            style={style(grow(hoveredBox, RING))}
          >
            <span className="st-parttag">{name(hovered)}</span>
          </div>
        ) : null}
        {selectedBox && selected ? (
          <div
            className="st-selbox"
            data-slot={selected.slot}
            style={style(grow(selectedBox, RING))}
          >
            <span className="st-parttag">
              {partLabel(selected, selected.field ? undefined : nameOf?.(selected))}
            </span>
          </div>
        ) : null}
        {marks?.(placed, slot)}
      </div>
    </div>
  );
}
