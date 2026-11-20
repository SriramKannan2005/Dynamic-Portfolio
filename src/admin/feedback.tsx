/** Toasts (aria-live) and a promise-based confirm dialog built on the shared modal. */
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { useModal } from '../shared/Modal';
import { Icon } from '../shared/Icon';

type ToastKind = 'success' | 'error' | 'info';
interface Toast { id: number; kind: ToastKind; title: string; text?: string }
const ToastCtx = createContext<(kind: ToastKind, title: string, text?: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);
  const push = useCallback((kind: ToastKind, title: string, text?: string) => {
    const id = next.current++;
    setToasts((t) => [...t.slice(-3), { id, kind, title, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 7000 : 4000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            <Icon id={t.kind === 'error' ? 'close' : t.kind === 'success' ? 'check' : 'spark'} />
            <div><b>{t.title}</b>{t.text && <span>{t.text}</span>}</div>
            <button type="button" className="toast-x" aria-label="Dismiss" onClick={() => setToasts((all) => all.filter((x) => x.id !== t.id))}><Icon id="close" /></button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useConfirm() {
  const modal = useModal();
  return useCallback((opts: { title: string; text: string; confirmLabel?: string; danger?: boolean; origin?: HTMLElement | null }) =>
    new Promise<boolean>((resolve) => {
      let settled = false;
      const done = (v: boolean) => { if (!settled) { settled = true; resolve(v); } };
      modal.open(
        <div className="confirm">
          <h2 id="modalTitle">{opts.title}</h2>
          <p>{opts.text}</p>
          <div className="confirm-actions">
            <button type="button" className="btn btn-ghost" autoFocus onClick={() => { done(false); modal.close(); }}>Cancel</button>
            <button type="button" className={`btn ${opts.danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => { done(true); modal.close(); }}>
              {opts.confirmLabel ?? 'Confirm'}
            </button>
          </div>
        </div>,
        { narrow: true, origin: opts.origin, onClose: () => done(false) },
      );
    }), [modal]);
}
