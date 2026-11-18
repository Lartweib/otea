import { useEffect, useRef, useState } from 'react';
import { useFileUrl } from '../../evidence-files.ts';
import { t } from '../../i18n/i18n.ts';
import type { Evidence } from '../../types.ts';
import { FileMeta } from './FileMeta.tsx';
import type { OpenPdf } from './pdf-engine.ts';
import { pageInView, pageScale, ZOOM_MAX, ZOOM_MIN, zoomIn, zoomOut } from './pdf-view.ts';

type Pdf = { status: 'loading' } | { status: 'failed' } | { status: 'ready'; pdf: OpenPdf };

// Fetches the file as it is served (headers untouched) and hands its bytes to the engine, which
// loads on first use.
function usePdf(url: string): Pdf {
  const [state, setState] = useState<Pdf>({ status: 'loading' });
  useEffect(() => {
    const controller = new AbortController();
    let opened: OpenPdf | undefined;
    setState({ status: 'loading' });
    Promise.all([
      fetch(url, { signal: controller.signal }).then((response) => {
        if (!response.ok) throw new Error(`GET failed with ${response.status}`);
        return response.arrayBuffer();
      }),
      import('./pdf-engine.ts'),
    ])
      .then(([bytes, engine]) => engine.openPdf(bytes))
      .then(
        (pdf) => {
          if (controller.signal.aborted) return pdf.close();
          opened = pdf;
          setState({ status: 'ready', pdf });
        },
        () => {
          if (!controller.signal.aborted) setState({ status: 'failed' });
        },
      );
    return () => {
      controller.abort();
      opened?.close();
    };
  }, [url]);
  return state;
}

// One page: its place kept at its size, drawn once it comes near the screen and again when the
// zoom or the width changes.
function PdfPageCanvas({
  pdf,
  at,
  scale,
  root,
  onShown,
}: {
  pdf: OpenPdf;
  at: number;
  scale: number;
  root: HTMLElement | null;
  onShown: (at: number, ratio: number) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState(false);
  const page = pdf.pages[at] ?? { width: 595, height: 842 };
  useEffect(() => {
    const el = box.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setNear(true);
      return;
    }
    const nearBy = new IntersectionObserver(([entry]) => entry?.isIntersecting && setNear(true), {
      root,
      rootMargin: '150% 0px',
    });
    const shown = new IntersectionObserver(
      ([entry]) => onShown(at, entry?.intersectionRatio ?? 0),
      {
        root,
        threshold: [0, 0.1, 0.25, 0.5, 0.75, 1],
      },
    );
    nearBy.observe(el);
    shown.observe(el);
    return () => {
      nearBy.disconnect();
      shown.disconnect();
    };
  }, [root, at, onShown]);
  useEffect(() => {
    if (near && canvas.current) void pdf.draw(at, canvas.current, scale).catch(() => undefined);
  }, [near, pdf, at, scale]);
  return (
    <div
      ref={box}
      className="ev-pdf-page"
      data-page={at + 1}
      style={{ width: page.width * scale, height: page.height * scale }}
    >
      <canvas
        ref={canvas}
        role="img"
        aria-label={t('evidence.pdf.page', { n: at + 1, total: pdf.pages.length })}
      />
    </div>
  );
}

function PdfPages({ pdf, label }: { pdf: OpenPdf; label: string }) {
  const [scroller, setScroller] = useState<HTMLElement | null>(null);
  const [width, setWidth] = useState(0);
  const [zoom, setZoom] = useState(1);
  const shown = useRef<number[]>([]);
  const [current, setCurrent] = useState(1);
  const [onShown] = useState(() => (at: number, ratio: number) => {
    shown.current[at] = ratio;
    setCurrent(pageInView(shown.current));
  });
  useEffect(() => {
    if (!scroller) return;
    const measure = () => setWidth(scroller.clientWidth - 2 * PAD);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const watch = new ResizeObserver(measure);
    watch.observe(scroller);
    return () => watch.disconnect();
  }, [scroller]);
  const widest = Math.max(...pdf.pages.map((page) => page.width));
  const scale = pageScale(widest, width, zoom);
  const total = pdf.pages.length;
  return (
    <>
      <div className="ev-tools ev-pdf-tools">
        <span className="t-cap" aria-live="polite">
          {t('evidence.pdf.page', { n: current, total })}
        </span>
        <span className="ev-pdf-zoom">
          <button
            type="button"
            className="btn quiet sm icon"
            disabled={zoom <= ZOOM_MIN}
            aria-label={t('evidence.pdf.zoomOut')}
            onClick={() => setZoom(zoomOut(zoom))}
          >
            −
          </button>
          <button
            type="button"
            className="btn quiet sm"
            aria-pressed={zoom === 1}
            aria-label={t('evidence.pdf.fit')}
            title={t('evidence.pdf.fit')}
            onClick={() => setZoom(1)}
          >
            {zoom === 1 ? t('evidence.pdf.fitShort') : `${Math.round(zoom * 100)} %`}
          </button>
          <button
            type="button"
            className="btn quiet sm icon"
            disabled={zoom >= ZOOM_MAX}
            aria-label={t('evidence.pdf.zoomIn')}
            onClick={() => setZoom(zoomIn(zoom))}
          >
            +
          </button>
        </span>
      </div>
      <section ref={setScroller} className="ev-pdf-pages" aria-label={label}>
        {width > 0
          ? pdf.pages.map((_, at) => (
              <PdfPageCanvas
                // biome-ignore lint/suspicious/noArrayIndexKey: a page is its place.
                key={at}
                pdf={pdf}
                at={at}
                scale={scale}
                root={scroller}
                onShown={onShown}
              />
            ))
          : null}
      </section>
    </>
  );
}

// The page box's inner padding, kept out of the width a page fits.
const PAD = 12;

// A PDF read as its pages, each a picture fitted to the width, zoomed by steps; the same on the
// desk and on the phone.
export function PdfFileView({ evidence }: { evidence: Evidence }) {
  const url = useFileUrl()(evidence);
  const state = usePdf(url);
  return (
    <div className="ev-pdf">
      {state.status === 'ready' ? (
        <PdfPages pdf={state.pdf} label={t('evidence.pdf.pages', { file: evidence.filename })} />
      ) : state.status === 'failed' ? (
        <PdfUnreadable url={url} filename={evidence.filename} />
      ) : (
        <div className="ev-code-state well" aria-busy="true">
          <span className="t-cap">{t('evidence.loading')}</span>
        </div>
      )}
      <FileMeta evidence={evidence} />
    </div>
  );
}

// A PDF this browser could not draw: said, with the file a tap away in its own tab, where the
// phone's or the browser's own viewer opens it (DR2-3: the phone said «ábrelo por separado» with
// no way to).
export function PdfUnreadable({ url, filename }: { url: string; filename: string }) {
  return (
    <div className="ev-code-state well ev-pdf-failed" role="status">
      <span className="t-cap">{t('evidence.unreadable')}</span>
      <a className="btn quiet sm" href={url} target="_blank" rel="noreferrer">
        {t('evidence.pdf.open', { file: filename })}
      </a>
    </div>
  );
}
