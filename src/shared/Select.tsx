/**
 * Themed dropdown (listbox pattern) replacing native <select>, whose popup can't be
 * styled consistently across browsers.
 * Keyboard: Enter / Space / Alt+Down open; Up / Down / Home / End move; typing jumps
 * to a matching option; Enter / Space choose; Esc / Tab close. Focus returns to the
 * button after a choice. Opens upward when there isn't room below.
 */
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import './select.css';

export interface SelectOption<V extends string | number = string> { value: V; label: string; hint?: string }

export function Select<V extends string | number>({
  label, value, options, onChange, placeholder = 'Choose…', disabled = false, className = '', hideLabel = false,
}: {
  label: string;
  value: V | null;
  options: SelectOption<V>[];
  onChange: (v: V) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  hideLabel?: boolean;
}) {
  const uid = useId().replace(/:/g, '');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [up, setUp] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLUListElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const typed = useRef({ text: '', at: 0 });
  const current = options.find((o) => o.value === value);

  const show = (at?: number) => {
    if (disabled || !options.length) return;
    const sel = options.findIndex((o) => o.value === value);
    setActive(at ?? (sel >= 0 ? sel : 0));
    setOpen(true);
  };
  const close = (refocus = true) => { setOpen(false); if (refocus) btn.current?.focus(); };
  const choose = (i: number) => { const o = options[i]; if (o) onChange(o.value); close(); };

  // Place the menu, then move focus into it
  useLayoutEffect(() => {
    if (!open || !btn.current || !menu.current) return;
    const r = btn.current.getBoundingClientRect();
    const h = Math.min(menu.current.scrollHeight, 300);
    setUp(window.innerHeight - r.bottom < h + 16 && r.top > h + 16);
    menu.current.focus({ preventScroll: true });
  }, [open]);
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLElement>(`#${uid}-o${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active, uid]);
  // Close on outside pointer
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [open]);

  const typeahead = (key: string) => {
    const now = Date.now();
    const t = typed.current;
    t.text = now - t.at > 700 ? key : t.text + key;
    t.at = now;
    const start = t.text.length === 1 ? active + 1 : active;
    for (let k = 0; k < options.length; k++) {
      const i = (start + k) % options.length;
      if (options[i].label.toLowerCase().startsWith(t.text)) { setActive(i); return i; }
    }
    return -1;
  };

  const onBtnKey = (e: KeyboardEvent) => {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); e.stopPropagation(); show(); }
  };
  const onMenuKey = (e: KeyboardEvent) => {
    const last = options.length - 1;
    const handled = () => { e.preventDefault(); e.stopPropagation(); };
    switch (e.key) {
      case 'ArrowDown': handled(); setActive((a) => Math.min(last, a + 1)); break;
      case 'ArrowUp': handled(); setActive((a) => Math.max(0, a - 1)); break;
      case 'Home': case 'PageUp': handled(); setActive(0); break;
      case 'End': case 'PageDown': handled(); setActive(last); break;
      case 'Enter': case ' ': handled(); choose(active); break;
      case 'Escape': handled(); close(); break;
      case 'Tab': setOpen(false); break;
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { handled(); typeahead(e.key.toLowerCase()); }
    }
  };

  return (
    <div className={`dd${open ? ' is-open' : ''}${disabled ? ' is-disabled' : ''} ${className}`} ref={wrap}>
      <span className={hideLabel ? 'visually-hidden' : 'dd-label'} id={`${uid}-l`}>{label}</span>
      <div className="dd-anchor">
        <button ref={btn} type="button" className="dd-btn" id={`${uid}-b`} disabled={disabled}
          aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? `${uid}-m` : undefined} aria-labelledby={`${uid}-l ${uid}-b`}
          onClick={() => (open ? close() : show())} onKeyDown={onBtnKey}>
          <span className={`dd-value${current ? '' : ' is-placeholder'}`}>{current?.label ?? placeholder}</span>
          <svg className="dd-chev" viewBox="0 0 12 8" aria-hidden="true"><path d="m1 1.5 5 5 5-5" /></svg>
        </button>
        {open && (
          <ul ref={menu} className={`dd-menu${up ? ' is-up' : ''}`} id={`${uid}-m`} role="listbox" tabIndex={-1}
            aria-labelledby={`${uid}-l`} aria-activedescendant={`${uid}-o${active}`} onKeyDown={onMenuKey} onBlur={(e) => { if (!wrap.current?.contains(e.relatedTarget as Node)) setOpen(false); }}>
            {options.map((o, i) => (
              <li key={String(o.value)} id={`${uid}-o${i}`} role="option" aria-selected={o.value === value}
                className={`dd-opt${i === active ? ' is-active' : ''}`}
                onMouseMove={() => i !== active && setActive(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(i)}>
                <svg className="dd-tick" viewBox="0 0 12 10" aria-hidden="true"><path d="m1 5 3.5 3.5L11 1.5" /></svg>
                <span className="dd-opt-label">{o.label}</span>
                {o.hint && <span className="dd-hint">{o.hint}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
