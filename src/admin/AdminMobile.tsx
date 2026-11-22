/**
 * Phone layout for the admin (≤900px): a bottom navigation bar with the four most
 * used tabs plus "More", which opens a bottom sheet with the rest (same pattern as the
 * public site's menu). Hidden on wider screens, where the sidebar is used.
 */
import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '../shared/Icon';

const MAIN = [
  ['overview', 'Home', 'home'],
  ['analytics', 'Analytics', 'chart'],
  ['messages', 'Inbox', 'mail'],
  ['people', 'People', 'users'],
] as const;
const MORE = [
  ['content', 'Content', 'edit'],
  ['export', 'Export', 'download'],
  ['settings', 'Settings', 'gear'],
] as const;

export function AdminDock({ unread, onSearch, onSignOut, onToggleTheme, theme }: {
  unread: number; onSearch: () => void; onSignOut: () => void; onToggleTheme: () => void; theme: 'light' | 'dark';
}) {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const sheetRef = useRef<HTMLDivElement>(null);
  const moreBtn = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ y: number; dy: number } | null>(null);
  const inMore = MORE.some(([id]) => pathname.startsWith(`/admin/${id}`));

  const close = (focusBack = true) => { setOpen(false); if (focusBack) moreBtn.current?.focus({ preventScroll: true }); };
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    document.documentElement.classList.add('sheet-open');
    requestAnimationFrame(() => (sheetRef.current?.querySelector<HTMLElement>('.sheet-item.is-active') ?? sheetRef.current?.querySelector<HTMLElement>('.sheet-item'))?.focus());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      if (e.key === 'Tab' && sheetRef.current) {
        const f = [...sheetRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')];
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); document.documentElement.classList.remove('sheet-open'); };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = (fn: () => void) => () => { close(false); fn(); };

  return (
    <>
      <nav className="admin-dock" aria-label="Admin sections">
        {MAIN.map(([id, label, icon]) => (
          <NavLink key={id} to={`/admin/${id}`} className={({ isActive }) => `dock-item${isActive ? ' is-active' : ''}`}>
            <span className="dock-ic"><Icon id={icon} />{id === 'messages' && unread > 0 && <b className="dock-badge" aria-label={`${unread} unread`}>{unread > 99 ? '99+' : unread}</b>}</span>
            <span className="dock-k">{label}</span>
          </NavLink>
        ))}
        <button ref={moreBtn} type="button" className={`dock-item${inMore || open ? ' is-active' : ''}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)}>
          <span className="dock-ic"><Icon id="menu" /></span><span className="dock-k">More</span>
        </button>
      </nav>

      <div className={`sheet-backdrop admin-sheet-backdrop${open ? ' is-open' : ''}`} onClick={() => close()} aria-hidden="true" />
      <div ref={sheetRef} className={`nav-sheet admin-sheet${open ? ' is-open' : ''}`} role="dialog" aria-modal="true" aria-label="More admin options" aria-hidden={!open}>
        <div className="sheet-grab" aria-hidden="true"
          onPointerDown={(e) => { drag.current = { y: e.clientY, dy: 0 }; sheetRef.current?.classList.add('is-dragging'); (e.target as HTMLElement).setPointerCapture?.(e.pointerId); }}
          onPointerMove={(e) => { if (!drag.current || !sheetRef.current) return; drag.current.dy = Math.max(0, e.clientY - drag.current.y); sheetRef.current.style.transform = `translateY(${drag.current.dy}px)`; }}
          onPointerUp={() => { const d = drag.current; drag.current = null; if (!sheetRef.current) return; sheetRef.current.classList.remove('is-dragging'); sheetRef.current.style.transform = ''; if (d && d.dy > 90) close(); }}>
          <span />
        </div>
        <ul className="sheet-grid">
          {MORE.map(([id, label, icon]) => (
            <li key={id}><NavLink to={`/admin/${id}`} className={({ isActive }) => `sheet-item${isActive ? ' is-active' : ''}`} onClick={() => close(false)}><Icon id={icon} /><span>{label}</span></NavLink></li>
          ))}
          <li><button type="button" className="sheet-item" onClick={go(onSearch)}><Icon id="search" /><span>Search</span></button></li>
          <li><button type="button" className="sheet-item" onClick={onToggleTheme}><Icon id={theme === 'light' ? 'moon' : 'sun'} /><span>{theme === 'light' ? 'Dark theme' : 'Light theme'}</span></button></li>
          <li><button type="button" className="sheet-item" onClick={go(() => window.open('/', '_blank', 'noopener'))}><Icon id="ext" /><span>View site</span></button></li>
          <li><button type="button" className="sheet-item" onClick={go(() => navigate('/admin/messages?folder=followup'))}><Icon id="bell" /><span>Follow-ups</span></button></li>
          <li><button type="button" className="sheet-item" onClick={go(() => navigate('/admin/settings#activity'))}><Icon id="activity" /><span>Activity</span></button></li>
          <li><button type="button" className="sheet-item is-accent" onClick={go(onSignOut)}><Icon id="logout" /><span>Sign out</span></button></li>
        </ul>
        <div className="sheet-foot">
          <span className="muted small-note">Admin · {new Date().toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
          <button type="button" className="sheet-close" onClick={() => close()} aria-label="Close"><Icon id="close" /></button>
        </div>
      </div>
    </>
  );
}
