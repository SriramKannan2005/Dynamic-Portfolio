/**
 * Accessible modal with a FLIP entrance from the element that opened it.
 * - focus moves into the dialog, Tab is trapped, Esc / backdrop close it
 * - the app root is made `inert` and scroll is locked while open
 * - focus returns to the opener on close
 */
import { createContext, useCallback, useContext, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export interface ModalOptions {
  origin?: HTMLElement | null;
  narrow?: boolean;
  label?: string;          // aria-label when the content has no #modalTitle
  onClose?: () => void;
}
interface ModalApi { open: (node: ReactNode, opts?: ModalOptions) => void; close: () => void }

const ModalCtx = createContext<ModalApi>({ open: () => {}, close: () => {} });
export const useModal = () => useContext(ModalCtx);

const FOCUSABLE = 'a[href], button:not([disabled]), video[controls], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function ModalProvider({ children, reduced = false }: { children: ReactNode; reduced?: boolean }) {
  const [state, setState] = useState<{ node: ReactNode; opts: ModalOptions; key: number } | null>(null);
  const [shown, setShown] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<Element | null>(null);
  const closing = useRef(false);
  const keyRef = useRef(0);

  const flip = useCallback((rect: DOMRect | undefined, reverse: boolean) => {
    const panel = panelRef.current;
    if (!panel || !rect || !rect.width || reduced || !panel.animate) return null;
    const f = panel.getBoundingClientRect();
    const from = {
      transform: `translate(${rect.left - f.left}px, ${rect.top - f.top}px) scale(${rect.width / f.width}, ${rect.height / f.height})`,
      opacity: 0.35, borderRadius: '18px',
    };
    const to = { transform: 'none', opacity: 1, borderRadius: '22px' };
    return panel.animate(reverse ? [to, from] : [from, to], {
      duration: reverse ? 360 : 560, easing: reverse ? 'cubic-bezier(.5,0,.75,0)' : 'cubic-bezier(.2,.9,.25,1)', fill: 'both',
    });
  }, [reduced]);

  // open/close must be stable: content passed to open() (e.g. a confirm dialog's
  // buttons) captures them before the modal exists, so they read state via a ref.
  const stateRef = useRef(state);
  stateRef.current = state;

  const open = useCallback((node: ReactNode, opts: ModalOptions = {}) => {
    if (!stateRef.current) returnFocus.current = document.activeElement;
    closing.current = false;
    keyRef.current += 1;
    const next = { node, opts, key: keyRef.current };
    stateRef.current = next;
    setState(next);
  }, []);

  const close = useCallback(() => {
    const state = stateRef.current;
    if (!state || closing.current) return;
    closing.current = true;
    const origin = state.opts.origin;
    const r = origin?.isConnected ? origin.getBoundingClientRect() : undefined;
    const onScreen = r && r.bottom > 0 && r.top < window.innerHeight;
    setShown(false);
    const anim = onScreen ? flip(r, true) : null;
    const finish = () => {
      anim?.cancel();
      state.opts.onClose?.();
      // A new modal may have been opened meanwhile (e.g. reply -> confirm); keep it.
      if (stateRef.current?.key !== state.key) { closing.current = false; return; }
      stateRef.current = null;
      setState(null);
      // Un-inert the app now (the effect cleanup runs a render later), otherwise
      // focusing the opener silently fails and focus falls back to <body>.
      const root = document.getElementById('root');
      if (root) root.inert = false;
      const el = returnFocus.current as HTMLElement | null;
      if (el?.isConnected && el.focus) el.focus({ preventScroll: true });
    };
    if (anim) anim.onfinish = finish; else setTimeout(finish, reduced ? 0 : 180);
  }, [flip, reduced]);

  // Open: lock page, FLIP in, focus first control
  useLayoutEffect(() => {
    if (!state) return;
    const root = document.getElementById('root');
    const html = document.documentElement;
    if (root) root.inert = true;
    html.style.overflow = 'hidden';
    const panel = panelRef.current;
    if (panel) panel.scrollTop = 0;
    const anim = flip(state.opts.origin?.getBoundingClientRect(), false);
    if (anim) anim.onfinish = () => anim.cancel();
    const raf = requestAnimationFrame(() => {
      setShown(true);
      // React's autoFocus focuses on mount but renders no [autofocus] attribute, so
      // keep focus if it already landed inside the dialog.
      if (panel?.contains(document.activeElement) && document.activeElement !== panel) return;
      const target = panel?.querySelector<HTMLElement>('[autofocus]') ?? panel?.querySelector<HTMLElement>('.modal-close');
      (target ?? panel)?.focus({ preventScroll: true });
    });
    return () => {
      cancelAnimationFrame(raf);
      if (root) root.inert = false;
      html.style.overflow = '';
    };
    // re-run only when a new modal is opened
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.key]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key !== 'Tab' || !panelRef.current) return;
    const f = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
    if (!f.length) { e.preventDefault(); panelRef.current.focus(); return; }
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  return (
    <ModalCtx.Provider value={{ open, close }}>
      {children}
      {state && createPortal(
        <div className={`modal${shown ? ' is-open' : ''}`} onKeyDown={onKeyDown}>
          <div className="modal-backdrop" onClick={close} />
          <div
            ref={panelRef}
            className={`modal-panel${state.opts.narrow ? ' is-narrow' : ''}`}
            role="dialog"
            aria-modal="true"
            {...(state.opts.label ? { 'aria-label': state.opts.label } : { 'aria-labelledby': 'modalTitle' })}
            tabIndex={-1}
          >
            <button className="modal-close icon-btn" type="button" onClick={close} aria-label="Close dialog">
              <svg className="ic" aria-hidden="true"><use href="#i-close" /></svg>
            </button>
            <div className="modal-body" key={state.key}>{state.node}</div>
          </div>
        </div>,
        document.body,
      )}
    </ModalCtx.Provider>
  );
}
