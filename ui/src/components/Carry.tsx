import { Component, createRef, type ReactNode, type RefObject } from 'react';
import {
  MOTION,
  type Motion,
  type Placement,
  planMotion,
  reducedMotion,
  TIMING,
} from '../motion.ts';
import type { Turn } from '../types.ts';

// What a row looked like before it changed hands. A row that changes section is a new element, so its
// node and text would show their new look at once; the old look is played back into the new one instead.
type Look = { fill: string; stroke: string; dash: string; color: string; struck: boolean };

type Snapshot = { places: Map<string, Placement>; looks: Map<string, Look> };

type CarryProps = {
  children: ReactNode;
  // Motion only explains a change in place: a new scope (another collection) is a new list.
  scope: string;
  className: string;
  // Set while something else moves the list (the tree draw): the update is not played back.
  still?: RefObject<boolean>;
};

const FLIP = 'flip';
const SETTLE_MS = 1500;

function blocksOf(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('[data-flip]')];
}

function placeOf(element: HTMLElement, rootTop: number): Placement {
  const top = element.getBoundingClientRect().top - rootTop;
  const turn = element.dataset.turn as Turn | undefined;
  return turn === undefined ? { top } : { top, turn, x: Number(element.dataset.x) };
}

function lookOf(element: HTMLElement): Look | undefined {
  const shape = element.querySelector('.node .shape');
  const row = element.querySelector('.row');
  if (!shape || !row) return undefined;
  const node = getComputedStyle(shape);
  return {
    fill: node.fill,
    stroke: node.stroke,
    dash: node.strokeDasharray,
    color: getComputedStyle(row).color,
    struck: row.getAttribute('data-kind') === 'discarded',
  };
}

function measure(root: HTMLElement): Snapshot {
  const rootTop = root.getBoundingClientRect().top;
  const places = new Map<string, Placement>();
  const looks = new Map<string, Look>();
  for (const element of blocksOf(root)) {
    const key = element.dataset.flip ?? '';
    places.set(key, placeOf(element, rootTop));
    const look = lookOf(element);
    if (look) looks.set(key, look);
  }
  return { places, looks };
}

function run(element: Element | null, keyframes: Keyframe[], options: KeyframeAnimationOptions) {
  element?.animate(keyframes, { id: FLIP, ...options });
}

// Decorations (lift, raise, tint, ripple, ghost) are CSS keyframes switched on by data-motion.
function decorate(element: HTMLElement, { kind, toYou, fromX }: Motion) {
  const tokens = ['lift'];
  if (toYou) tokens.push('you');
  if (kind === 'carry') tokens.push('ghost');
  element.querySelector('.ghost')?.setAttribute('cx', String(fromX));
  delete element.dataset.motion;
  void element.offsetWidth;
  const stamp = String(performance.now());
  element.dataset.motion = tokens.join(' ');
  element.dataset.motionAt = stamp;
  setTimeout(() => {
    if (element.dataset.motionAt !== stamp) return;
    delete element.dataset.motion;
    delete element.dataset.motionAt;
  }, SETTLE_MS);
}

// The new look arrives while the node is in the air, and the check or slash draws once it is set down.
function replayLook(element: HTMLElement, look: Look) {
  const shape = element.querySelector('.node .shape');
  const row = element.querySelector<HTMLElement>('.row');
  if (!shape || !row) return;
  const node = getComputedStyle(shape);
  const from = { fill: look.fill, stroke: look.stroke, strokeDasharray: look.dash };
  const to = { fill: node.fill, stroke: node.stroke, strokeDasharray: node.strokeDasharray };
  run(shape, [from, { ...from, offset: 0.34 }, { ...to, offset: 0.81 }, to], {
    duration: TIMING.travel.duration,
  });
  run(
    element.querySelector('.node .mark.on'),
    [{ strokeDashoffset: 14 }, { strokeDashoffset: 0 }],
    {
      duration: 360,
      delay: 560,
      easing: MOTION.ease,
      fill: 'backwards',
    },
  );
  run(row, [{ color: look.color }, { color: getComputedStyle(row).color }], {
    duration: 420,
    delay: 200,
    fill: 'backwards',
  });
  if (!look.struck && row.dataset.kind === 'discarded') {
    run(
      row.querySelector('.ttl'),
      [{ backgroundSize: '0% 1.5px' }, { backgroundSize: '100% 1.5px' }],
      {
        duration: 480,
        delay: 380,
        easing: MOTION.ease,
        fill: 'backwards',
      },
    );
  }
}

// carried: a turn change is in the plan, so the rows making room follow the carry's clock;
// otherwise a layout change is a plain FLIP on the motion tokens.
function play(
  element: HTMLElement,
  motion: Motion,
  look: Look | undefined,
  reduced: boolean,
  carried: boolean,
) {
  const { kind, dy, fromX, toX } = motion;
  if (reduced) {
    // No travel: what changed crossfades in place, the rest is already where it belongs.
    if (kind !== 'room') run(element, [{ opacity: 0 }, { opacity: 1 }], { duration: MOTION.fast });
    return;
  }
  if (kind === 'room') {
    const timing = carried ? TIMING.room : { duration: MOTION.slow, easing: MOTION.ease };
    run(element, [{ transform: `translateY(${dy}px)` }, { transform: 'none' }], {
      ...timing,
      fill: 'backwards',
    });
    return;
  }
  if (kind === 'enter') {
    run(
      element,
      [
        { opacity: 0, transform: 'translateY(-6px)' },
        { opacity: 1, transform: 'none' },
      ],
      {
        duration: MOTION.base,
        easing: MOTION.ease,
        fill: 'backwards',
        delay: carried ? TIMING.room.delay : 0,
      },
    );
    return;
  }
  run(element, [{ transform: `translateY(${dy}px)` }, { transform: 'none' }], TIMING.travel);
  run(
    element.querySelector('.carry'),
    [{ transform: `translateX(${fromX - toX}px)` }, { transform: 'none' }],
    TIMING.travel,
  );
  if (look) replayLook(element, look);
  decorate(element, motion);
}

// Measures every [data-flip] block before and after each update and animates the difference (FLIP).
// A class, because getSnapshotBeforeUpdate is the one hook that reads the DOM before React changes it.
export class Carry extends Component<CarryProps> {
  private readonly root = createRef<HTMLDivElement>();

  override getSnapshotBeforeUpdate(previous: CarryProps): Snapshot | null {
    const root = this.root.current;
    if (!root || previous.scope !== this.props.scope || this.props.still?.current) return null;
    return measure(root);
  }

  override componentDidUpdate(_props: CarryProps, _state: unknown, before: Snapshot | null) {
    const root = this.root.current;
    if (!root || !before) return;
    const blocks = new Map(blocksOf(root).map((element) => [element.dataset.flip ?? '', element]));
    // Settle what is still moving, so the new layout is read without transforms.
    for (const element of blocks.values()) {
      for (const animation of element.getAnimations({ subtree: true })) {
        if (animation.id === FLIP) animation.cancel();
      }
    }
    const after = measure(root);
    const reduced = reducedMotion();
    const plan = planMotion(before.places, after.places);
    const carried = plan.some(({ kind }) => kind !== 'room' && kind !== 'enter');
    for (const motion of plan) {
      const element = blocks.get(motion.key);
      if (element) play(element, motion, before.looks.get(motion.key), reduced, carried);
    }
  }

  override render() {
    return (
      <div ref={this.root} className={this.props.className}>
        {this.props.children}
      </div>
    );
  }
}
