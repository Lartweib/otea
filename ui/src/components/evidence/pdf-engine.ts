// The PDF engine (Mozilla's pdf.js), loaded only when a PDF is opened. Its worker is a file of this
// build, never fetched from elsewhere. A page is drawn as a picture: no scripts, no forms, no links
// run from the file.
import { AnnotationMode, GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = workerUrl;

export type PdfPage = { width: number; height: number };

export type OpenPdf = {
  pages: PdfPage[];
  // Draws page `at` (from 0) into `canvas` at `scale`, sharp on this screen. Resolves when drawn;
  // a later draw of the same canvas cancels this one.
  draw(at: number, canvas: HTMLCanvasElement, scale: number): Promise<void>;
  close(): void;
};

export async function openPdf(bytes: ArrayBuffer): Promise<OpenPdf> {
  const task = getDocument({ data: new Uint8Array(bytes), enableXfa: false });
  const doc = await task.promise;
  const pages: PdfPage[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const viewport = (await doc.getPage(n)).getViewport({ scale: 1 });
    pages.push({ width: viewport.width, height: viewport.height });
  }
  const drawing = new WeakMap<HTMLCanvasElement, { cancel(): void }>();
  return {
    pages,
    async draw(at, canvas, scale) {
      drawing.get(canvas)?.cancel();
      const page = await doc.getPage(at + 1);
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const viewport = page.getViewport({ scale: scale * dpr });
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const render = page.render({ canvas, viewport, annotationMode: AnnotationMode.DISABLE });
      drawing.set(canvas, render);
      try {
        await render.promise;
      } catch (error) {
        if ((error as { name?: string }).name !== 'RenderingCancelledException') throw error;
      }
    },
    close() {
      void task.destroy();
    },
  };
}
