// How a PDF reads in the page: each page fits the width it has, then zooms by steps from there.

const STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3] as const;
export const ZOOM_MIN = STEPS[0];
export const ZOOM_MAX = STEPS[STEPS.length - 1] as number;

// The scale a page of `pageWidth` points is drawn at to fill `boxWidth` CSS pixels at `zoom`. A box
// not measured yet draws the page at its own size.
export function pageScale(pageWidth: number, boxWidth: number, zoom: number): number {
  const fit = boxWidth > 0 && pageWidth > 0 ? boxWidth / pageWidth : 1;
  return fit * zoom;
}

export function zoomIn(zoom: number): number {
  return STEPS.find((step) => step > zoom + 1e-9) ?? ZOOM_MAX;
}

export function zoomOut(zoom: number): number {
  return [...STEPS].reverse().find((step) => step < zoom - 1e-9) ?? ZOOM_MIN;
}

// The page being read, counted from 1: the one with most of it on screen.
export function pageInView(shown: readonly number[]): number {
  let best = 0;
  shown.forEach((ratio, at) => {
    if (ratio > (shown[best] ?? 0)) best = at;
  });
  return best + 1;
}

// Which pdf.js build this browser runs: the modern one needs Chrome 140+ (it calls Uint8Array's
// toHex and newer APIs); before that the legacy build, which carries its own polyfills (DR2-3: a
// PDF failed on Chrome 133 with «a.toHex is not a function»).
export function pdfBuild(uint8: object = Uint8Array.prototype): 'modern' | 'legacy' {
  return typeof (uint8 as { toHex?: unknown }).toHex === 'function' ? 'modern' : 'legacy';
}
