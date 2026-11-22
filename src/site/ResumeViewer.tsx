/**
 * In-page resume viewer: pick a version, read it, download it.
 * PDFs are drawn with pdf.js (loaded only when the viewer opens, so the first page
 * load is unaffected). Browsers' own PDF viewers are inconsistent (Chrome on
 * Android won't show one inline at all), canvases look the same everywhere.
 * The extracted text is also placed in a visually-hidden block for screen readers.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '../shared/Icon';
import type { Resume } from './content';

type PdfModule = typeof import('pdfjs-dist/legacy/build/pdf.mjs');
type PdfDoc = Awaited<ReturnType<PdfModule['getDocument']>['promise']>;

let pdfjsPromise: Promise<PdfModule> | null = null;
function loadPdfjs(): Promise<PdfModule> {
  pdfjsPromise ??= Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
  ]).then(([pdfjs, worker]) => {
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    return pdfjs;
  });
  return pdfjsPromise;
}
const docs = new Map<string, Promise<PdfDoc>>();
const openDoc = (url: string) => {
  if (!docs.has(url)) docs.set(url, loadPdfjs().then((p) => p.getDocument({ url, isEvalSupported: false }).promise));
  return docs.get(url)!;
};

/** 'page' fits the whole page in view (default); numbers are multiples of fit-to-width. */
const ZOOMS = ['page', 1, 1.25, 1.5, 2] as const;
const zoomLabel = (z: (typeof ZOOMS)[number]) => (z === 'page' ? 'Page' : z === 1 ? 'Width' : `${Math.round(z * 100)}%`);
const track = (id: string) => { import('./tracking').then((t) => t.trackResumeDownload(id)).catch(() => {}); };

export function ResumeViewer({ resumes, initial = 0 }: { resumes: Resume[]; initial?: number }) {
  const [idx, setIdx] = useState(Math.min(initial, resumes.length - 1));
  const [zoomIdx, setZoomIdx] = useState(0); // 0 = whole page in view
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [text, setText] = useState('');
  const [box, setBox] = useState({ w: 0, h: 0 });
  const width = box.w;
  const stageRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const r = resumes[idx];

  // Track the stage width so pages re-render crisply when the dialog resizes
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    // contentRect excludes the stage padding, so this is the space a page can use
    const ro = new ResizeObserver(([e]) => setBox({ w: Math.floor(e.contentRect.width), h: Math.floor(e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const render = useCallback(async (signal: { cancelled: boolean }) => {
    const host = pagesRef.current;
    if (!host || !width) return;
    setState('loading');
    try {
      const doc = await openDoc(r.file);
      if (signal.cancelled) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const zoom = ZOOMS[zoomIdx];
      const canvases: HTMLCanvasElement[] = [];
      const words: string[] = [];
      for (let n = 1; n <= doc.numPages; n++) {
        const page = await doc.getPage(n);
        if (signal.cancelled) return;
        const base = page.getViewport({ scale: 1 });
        const fitWidth = (width - 2) / base.width;
        const scale = zoom === 'page' ? Math.min(fitWidth, (box.h - 2) / base.height) : fitWidth * zoom;
        const vp = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.className = 'rv-page';
        canvas.width = Math.floor(vp.width * dpr);
        canvas.height = Math.floor(vp.height * dpr);
        canvas.style.width = `${Math.floor(vp.width)}px`;
        canvas.style.height = `${Math.floor(vp.height)}px`;
        canvas.setAttribute('aria-hidden', 'true');
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('no canvas');
        await page.render({ canvasContext: ctx, viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined }).promise;
        if (signal.cancelled) return;
        canvases.push(canvas);
        const tc = await page.getTextContent();
        words.push(tc.items.map((it) => ('str' in it ? it.str : '')).join(' '));
      }
      host.replaceChildren(...canvases);
      setText(words.join('\n').replace(/[^\S\n]+/g, ' ').trim());
      setState('ready');
    } catch {
      if (!signal.cancelled) setState('error');
    }
  }, [r.file, width, box.h, zoomIdx]);

  useEffect(() => {
    const signal = { cancelled: false };
    render(signal);
    return () => { signal.cancelled = true; };
  }, [render]);

  // Prefetch the other versions once the first is on screen
  useEffect(() => {
    if (state !== 'ready') return;
    const t = setTimeout(() => resumes.forEach((x) => { openDoc(x.file).catch(() => {}); }), 600);
    return () => clearTimeout(t);
  }, [state, resumes]);

  const onTabsKey = (e: React.KeyboardEvent) => {
    const k = e.key;
    if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'].includes(k)) return;
    e.preventDefault();
    const last = resumes.length - 1;
    const next = k === 'Home' ? 0 : k === 'End' ? last : (k === 'ArrowRight' || k === 'ArrowDown') ? (idx === last ? 0 : idx + 1) : (idx === 0 ? last : idx - 1);
    setIdx(next);
    requestAnimationFrame(() => document.getElementById(`rv-tab-${resumes[next].id}`)?.focus());
  };

  return (
    <div className="rv">
      <header className="rv-head">
        <div>
          <p className="kicker mono">Resume</p>
          <h2 id="modalTitle">Pick the version that fits the role</h2>
        </div>
      </header>
      <div className="rv-body">
        <div className="rv-tabs" role="tablist" aria-label="Resume versions" aria-orientation="vertical" onKeyDown={onTabsKey}>
          {resumes.map((x, i) => (
            <button key={x.id} id={`rv-tab-${x.id}`} type="button" role="tab" aria-selected={i === idx} aria-controls="rv-panel"
              tabIndex={i === idx ? 0 : -1} className={`rv-tab${i === idx ? ' is-active' : ''}`} {...(i === idx ? { autoFocus: true } : {})}
              onClick={() => setIdx(i)}>
              <span className="rv-tab-num mono">0{i + 1}</span>
              <span className="rv-tab-text">
                <b>{x.label}</b>
                <small>{x.description}</small>
                {x.updated && <small className="mono rv-updated">Updated {x.updated}</small>}
              </span>
            </button>
          ))}
        </div>
        <section className="rv-main" id="rv-panel" role="tabpanel" aria-labelledby={`rv-tab-${r.id}`}>
          <div className="rv-toolbar">
            <div className="rv-zoom" role="group" aria-label="Zoom">
              <button type="button" className="icon-btn" onClick={() => setZoomIdx((z) => Math.max(0, z - 1))} disabled={zoomIdx === 0} aria-label="Zoom out"><span aria-hidden="true">−</span></button>
              <button type="button" className="rv-zoom-val mono" onClick={() => setZoomIdx(zoomIdx === 0 ? 1 : 0)}
                title={zoomIdx === 0 ? 'Fit to width' : 'Show the whole page'}>{zoomLabel(ZOOMS[zoomIdx])}</button>
              <button type="button" className="icon-btn" onClick={() => setZoomIdx((z) => Math.min(ZOOMS.length - 1, z + 1))} disabled={zoomIdx === ZOOMS.length - 1} aria-label="Zoom in"><span aria-hidden="true">+</span></button>
            </div>
            <div className="rv-actions">
              <a className="btn btn-ghost btn-sm-site" href={r.file} target="_blank" rel="noopener"><Icon id="ext" /><span>Open PDF</span></a>
              <a className="btn btn-primary btn-sm-site" href={r.file} download={r.filename ?? true} onClick={() => track(r.id)}><Icon id="download" /><span>Download</span></a>
            </div>
          </div>
          <div className={`rv-stage is-${state}`} ref={stageRef}>
            {state === 'loading' && <div className="rv-skeleton" aria-hidden="true"><span /><span /><span /><span /><span /></div>}
            {state === 'error' && (
              <div className="rv-error">
                <p>The preview couldn't load here, but the PDF is fine.</p>
                <a className="btn btn-primary" href={r.file} target="_blank" rel="noopener"><Icon id="ext" /><span>Open the PDF</span></a>
              </div>
            )}
            <div className="rv-pages" ref={pagesRef} />
            <p role="status" className="visually-hidden">{state === 'loading' ? `Loading ${r.label} resume` : state === 'ready' ? `${r.label} resume loaded` : ''}</p>
          </div>
          {text && <div className="visually-hidden" aria-label={`${r.label} resume text`}>{text}</div>}
        </section>
      </div>
    </div>
  );
}
