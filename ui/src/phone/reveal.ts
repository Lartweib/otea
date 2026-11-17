// A box opened low on the phone (Triaje's send-back reason, DR2-9) must end above the bottom bar
// and, while typing, above the keyboard: these scroll the page until it does.

const MARGIN = 12;

// How far the page must scroll so a box's foot shows: the floor is the bottom bar's top, or the
// top of the keyboard (the visual viewport's foot) when that is higher, less a margin.
export function hiddenBelow(
  box: { bottom: number },
  screen: { innerHeight: number; visible: number; bar: number | null },
): number {
  const floor = Math.min(screen.bar ?? screen.innerHeight, screen.visible) - MARGIN;
  return Math.max(0, Math.round(box.bottom - floor));
}

// Scrolls the page (or the box's scrolling parent) so `node` shows above the bar and the keyboard.
export function revealAbove(node: HTMLElement): void {
  const vv = window.visualViewport;
  const bar = document.querySelector<HTMLElement>('.tabbar');
  const barTop =
    bar && getComputedStyle(bar).display !== 'none' ? bar.getBoundingClientRect().top : null;
  const by = hiddenBelow(node.getBoundingClientRect(), {
    innerHeight: window.innerHeight,
    visible: vv ? vv.offsetTop + vv.height : window.innerHeight,
    bar: barTop,
  });
  if (by === 0) return;
  let scroller: HTMLElement | null = node.parentElement;
  while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY))
    scroller = scroller.parentElement;
  if (scroller && scroller.scrollHeight > scroller.clientHeight) scroller.scrollBy({ top: by });
  else window.scrollBy({ top: by });
}

// Reveals `node` now, once it has settled (its entrance, the card growing around it), and each time
// the keyboard comes up or goes. Returns the way to stop.
export function keepRevealed(node: HTMLElement, settle = 500): () => void {
  const vv = window.visualViewport;
  const again = () => revealAbove(node);
  const frame = requestAnimationFrame(again);
  const settled = setTimeout(again, settle);
  vv?.addEventListener('resize', again);
  return () => {
    cancelAnimationFrame(frame);
    clearTimeout(settled);
    vv?.removeEventListener('resize', again);
  };
}
