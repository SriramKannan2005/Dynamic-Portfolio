/**
 * /admin: lazy-loaded, noindex, guarded.
 * Signed out -> login only. Signed in -> must be in VITE_ADMIN_UIDS *and* carry the
 * custom claim admin == true (which the Firestore rules and Functions also enforce).
 * Any other signed-in account is signed out and redirected to the home page.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import type { User } from 'firebase/auth';
import { ModalProvider, useModal } from '../shared/Modal';
import { Icon } from '../shared/Icon';
import { content } from '../site/content';
import { AdminDock } from './AdminMobile';
import { ProfileMark } from './ProfileMark';
import { AdminErrorBoundary } from './ErrorBoundary';
import { DEMO_USER, demoActive, endDemo, startDemo } from './demo';
import { getAuthInstance, adminUids, firebaseConfigured, useEmulators } from '../shared/firebase';
import { ToastProvider, useToast } from './feedback';
import { Login } from './Login';
import { Analytics } from './Analytics';
import { Messages, ShortcutsHelp } from './Messages';
import { ExportTab, useAutoSync, syncNow } from './Export';
import { Overview } from './Overview';
import { ContentTab } from './ContentTab';
import { Settings } from './Settings';
import { People } from './People';
import { CommandPalette, type Command } from './CommandPalette';
import { ReplyModal } from './ReplyModal';
import { InboxProvider, useInbox } from './inbox';
import { usePrefs } from './prefs';
import { logAction } from './api';
import '../site/styles.css';
import './styles/base.css';      // layout, cards, forms
import './styles/components.css'; // inbox, palette, toasts, content table
import './styles/features.css';  // people, status, analytics panels
import './styles/theme.css';     // sidebar, page heads, overview, messages studio
import './styles/glass.css';     // glassmorphism layer
import './styles/mobile.css';    // phones: bottom bar, Gmail-style messages (last)

type Status = 'loading' | 'signedOut' | 'admin' | 'needsClaim' | 'setup' | 'misconfigured';
export const IDLE_FLAG = 'sk-admin-idle-out';

function useNoIndex() {
  useEffect(() => {
    const html = document.documentElement;
    html.classList.add('route-admin');
    document.getElementById('loader')?.remove();
    const prevTitle = document.title;
    document.title = 'Admin · Sriram Kannan';
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => { meta.remove(); document.title = prevTitle; html.classList.remove('route-admin'); };
  }, []);
}

const currentTheme = () => (document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark');
function setTheme(next: 'light' | 'dark') {
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('sk-theme', next); } catch { /* blocked */ }
  window.dispatchEvent(new CustomEvent('sk-theme', { detail: next }));
}

function ThemeButton() {
  const [theme, setT] = useState(currentTheme);
  useEffect(() => {
    const on = (e: Event) => setT((e as CustomEvent<'light' | 'dark'>).detail);
    window.addEventListener('sk-theme', on);
    return () => window.removeEventListener('sk-theme', on);
  }, []);
  return (
    <button type="button" className="icon-btn" aria-label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
      onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
      <Icon id={theme === 'light' ? 'moon' : 'sun'} />
    </button>
  );
}

/** Signs out after `minutes` without input; warns one minute before. */
function useIdleSignOut(minutes: number, onSignOut: () => void) {
  const toast = useToast();
  const last = useRef(Date.now());
  const warned = useRef(false);
  useEffect(() => {
    if (!minutes) return;
    const limit = minutes * 60_000;
    let lastMove = 0;
    const bump = (e: Event) => {
      if (e.type === 'mousemove') { const now = Date.now(); if (now - lastMove < 2000) return; lastMove = now; }
      last.current = Date.now();
      warned.current = false;
    };
    const evts = ['pointerdown', 'keydown', 'mousemove', 'wheel', 'touchstart', 'focus'];
    evts.forEach((t) => window.addEventListener(t, bump, { passive: true }));
    const timer = window.setInterval(() => {
      const idle = Date.now() - last.current;
      if (idle >= limit) {
        try { sessionStorage.setItem(IDLE_FLAG, String(minutes)); } catch { /* blocked */ }
        onSignOut();
      } else if (idle >= limit - 60_000 && !warned.current) {
        warned.current = true;
        toast('info', 'Signing out in 1 minute', 'You have been inactive. Move the mouse or press a key to stay signed in.');
      }
    }, 10_000);
    return () => { evts.forEach((t) => window.removeEventListener(t, bump)); clearInterval(timer); };
  }, [minutes, onSignOut, toast]);
}

const TABS = [
  ['overview', 'Overview', 'grid'],
  ['analytics', 'Analytics', 'chart'],
  ['messages', 'Messages', 'mail'],
  ['people', 'People', 'users'],
  ['content', 'Content', 'edit'],
  ['export', 'Export', 'download'],
  ['settings', 'Settings', 'gear'],
] as const;

function Dashboard({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  useAutoSync();
  const [prefs] = usePrefs();
  useIdleSignOut(prefs.idleMinutes, onSignOut);
  const { unread, list } = useInbox();
  const modal = useModal();
  const toast = useToast();
  const navigate = useNavigate();
  const listRef = useRef(list);
  listRef.current = list;
  const [theme, setThemeState] = useState<'light' | 'dark'>(currentTheme);
  useEffect(() => {
    const on = (e: Event) => setThemeState((e as CustomEvent<'light' | 'dark'>).detail);
    window.addEventListener('sk-theme', on);
    return () => window.removeEventListener('sk-theme', on);
  }, []);

  // One sign-in entry per browser session in the audit log
  useEffect(() => {
    try {
      if (sessionStorage.getItem('sk-admin-signin-logged') === user.uid) return;
      sessionStorage.setItem('sk-admin-signin-logged', user.uid);
    } catch { /* blocked */ }
    logAction('auth.signin', 'Signed in to the admin panel');
  }, [user.uid]);

  const openPalette = useCallback((origin?: HTMLElement | null) => {
    const go = (path: string) => () => { modal.close(); navigate(path); };
    const commands: Command[] = [
      ...TABS.map(([id, label, icon]) => ({ id: `go-${id}`, group: 'Go to', icon, label, run: go(`/admin/${id}`) })),
      { id: 'unread', group: 'Messages', icon: 'mail', label: 'Open the inbox', keywords: 'unread messages', run: go('/admin/messages') },
      { id: 'followup', group: 'Messages', icon: 'bell', label: 'Follow-up reminders', keywords: 'remind due', run: go('/admin/messages?folder=followup') },
      { id: 'spam', group: 'Messages', icon: 'ban', label: 'Spam folder', keywords: 'junk', run: go('/admin/messages?folder=spam') },
      { id: 'trash', group: 'Messages', icon: 'trash', label: 'Trash', keywords: 'deleted restore', run: go('/admin/messages?folder=trash') },
      { id: 'blocked', group: 'Actions', icon: 'ban', label: 'Blocked senders', keywords: 'block list', run: go('/admin/settings#blocked') },
      { id: 'status', group: 'Actions', icon: 'shield', label: 'System status', keywords: 'health check config', run: go('/admin/settings') },
      { id: 'theme', group: 'Actions', icon: 'sun', label: 'Toggle light / dark theme', keywords: 'dark mode', run: () => { setTheme(currentTheme() === 'light' ? 'dark' : 'light'); modal.close(); } },
      { id: 'sync', group: 'Actions', icon: 'refresh', label: 'Sync messages to Google Sheets', keywords: 'spreadsheet', run: () => {
        modal.close();
        syncNow(listRef.current ?? undefined).then((r) => toast('success', 'Synced to Google Sheets', `${r.count} rows`)).catch((e) => toast('error', 'Sync failed', (e as Error).message));
      } },
      { id: 'site', group: 'Actions', icon: 'ext', label: 'View the portfolio', keywords: 'open site home', run: () => { modal.close(); window.open('/', '_blank', 'noopener'); } },
      { id: 'activity', group: 'Actions', icon: 'activity', label: 'Activity log', keywords: 'audit history', run: go('/admin/settings#activity') },
      { id: 'keys', group: 'Actions', icon: 'keyboard', label: 'Keyboard shortcuts', keywords: 'help', run: () => modal.open(<ShortcutsHelp />, { narrow: true }) },
      { id: 'signout', group: 'Actions', icon: 'logout', label: 'Sign out', keywords: 'logout', run: () => { modal.close(); onSignOut(); } },
    ];
    modal.open(
      <CommandPalette
        commands={commands}
        messages={listRef.current ?? []}
        onSearch={(q) => { modal.close(); navigate(`/admin/messages?q=${encodeURIComponent(q)}`); }}
        onReply={(m) => modal.open(<ReplyModal message={m} onReplied={() => {}} />)}
      />,
      { narrow: true, label: 'Command palette', origin },
    );
  }, [modal, navigate, onSignOut, toast]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (!document.querySelector('.modal')) openPalette(null);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [openPalette]);

  return (
    <div className="admin">
      <header className="admin-bar">
        <a className="nav-logo" href="/" aria-label="Back to the portfolio"><ProfileMark /><span className="logo-text">Admin</span></a>
        <nav className="admin-tabs" aria-label="Admin sections">
          {TABS.map(([id, label, icon]) => (
            <NavLink key={id} to={`/admin/${id}`} className={({ isActive }) => `admin-tab${isActive ? ' is-active' : ''}`}>
              <Icon id={icon} /><span>{label}</span>
              {id === 'messages' && unread > 0 && <span className="tab-badge" aria-label={`${unread} unread`}>{unread > 99 ? '99+' : unread}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="admin-actions">
          <button type="button" className="cmdk-btn" onClick={(e) => openPalette(e.currentTarget)} aria-label="Open command palette (Ctrl+K)">
            <Icon id="search" /><span>Search</span><kbd>Ctrl K</kbd>
          </button>
          <span className="admin-user mono" title={user.uid}>{user.email}</span>
          <ThemeButton />
          <button type="button" className="icon-btn" onClick={onSignOut} aria-label="Sign out"><Icon id="logout" /></button>
        </div>
      </header>
      <main className="admin-main" id="main" tabIndex={-1}>
        <Routes>
          <Route path="overview" element={<Overview name={user.displayName || content.profile.name} />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="messages" element={<Messages />} />
          <Route path="people" element={<People />} />
          <Route path="content" element={<ContentTab />} />
          <Route path="export" element={<ExportTab />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="overview" replace />} />
        </Routes>
      </main>
      <AdminDock unread={unread} theme={theme} onSearch={() => openPalette(null)} onSignOut={onSignOut}
        onToggleTheme={() => setTheme(theme === 'light' ? 'dark' : 'light')} />
    </div>
  );
}

function SetupScreen({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="admin-center"><div className="login-card glass setup-card">
      <h1>Finish admin setup</h1>
      <p>You're signed in as <b>{user.email}</b>, but no admin accounts are configured yet, so the dashboard stays locked.</p>
      <div className="uid-box">
        <span className="mono">{user.uid}</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => { navigator.clipboard?.writeText(user.uid).then(() => setCopied(true)).catch(() => {}); }}>
          {copied ? 'Copied' : 'Copy UID'}
        </button>
      </div>
      <ol className="setup-steps">
        <li>Put this UID in <code>VITE_ADMIN_UIDS</code> and <code>ADMIN_UIDS</code> in <code>.env.local</code> (and in Netlify's environment variables).</li>
        <li>Grant the admin claim once: <code>npm run admin:claim -- {user.uid}</code> (README, step 3).</li>
        <li>Restart <code>npm run dev</code>, then sign out and sign in again.</li>
      </ol>
      <button type="button" className="btn btn-primary" onClick={onSignOut}>Sign out</button>
    </div></div>
  );
}

export default function AdminApp() {
  useNoIndex();
  // Demo mode: sample data only, no sign-in, no Firebase (see demo.ts)
  const [inDemo, setInDemo] = useState(demoActive);
  const [status, setStatus] = useState<Status>(firebaseConfigured ? 'loading' : 'misconfigured');
  const [user, setUser] = useState<User | null>(null);
  const enterDemo = useCallback(() => { startDemo(); setInDemo(true); }, []);
  const exitDemo = useCallback(() => { endDemo(); window.location.assign('/admin'); }, []);

  useEffect(() => {
    if (!firebaseConfigured || inDemo) return;
    let unsub = () => {};
    let alive = true;
    (async () => {
      const auth = await getAuthInstance();
      const { onAuthStateChanged, signOut } = await import('firebase/auth');
      unsub = onAuthStateChanged(auth, async (u) => {
        if (!alive) return;
        if (!u) { setUser(null); setStatus('signedOut'); return; }
        const listed = adminUids.includes(u.uid);
        const claims = (await u.getIdTokenResult(true)).claims;
        if (listed && claims.admin === true) { setUser(u); setStatus('admin'); return; }
        if (listed) { setUser(u); setStatus('needsClaim'); return; }
        // First-time setup: no allow-list configured yet. Show this account's UID so it
        // can be added. Grants nothing: Firestore rules and Functions still refuse it.
        if (adminUids.length === 0) { setUser(u); setStatus('setup'); return; }
        await signOut(auth);
        window.location.replace('/'); // full load so the 3D site boots cleanly
      });
    })();
    return () => { alive = false; unsub(); };
  }, [inDemo]);

  const signOutNow = useCallback(async () => {
    try { sessionStorage.removeItem('sk-admin-signin-logged'); } catch { /* blocked */ }
    if (demoActive()) { exitDemo(); return; }
    const auth = await getAuthInstance();
    const { signOut } = await import('firebase/auth');
    await signOut(auth);
  }, [exitDemo]);

  let body;
  if (inDemo) {
    body = (
      <AdminErrorBoundary>
        <InboxProvider>
          <p className="demo-banner" role="status">
            <b>Demo mode</b><span> · sample data · nothing is saved, sent or published</span>
            <button type="button" onClick={exitDemo}>Exit demo</button>
          </p>
          <Dashboard user={DEMO_USER as unknown as User} onSignOut={exitDemo} />
        </InboxProvider>
      </AdminErrorBoundary>
    );
  } else if (status === 'misconfigured') {
    body = (
      <div className="admin-center"><div className="login-card glass">
        <h1>Admin unavailable</h1>
        <p>Firebase is not configured for this build. Set the <code>VITE_FIREBASE_*</code> environment variables and redeploy.</p>
        <a className="btn btn-ghost" href="/">Back to the portfolio</a>
      </div></div>
    );
  } else if (status === 'loading') {
    body = <div className="admin-boot" role="status">Checking session…</div>;
  } else if (status === 'admin' && user) {
    body = <AdminErrorBoundary><InboxProvider><Dashboard user={user} onSignOut={signOutNow} /></InboxProvider></AdminErrorBoundary>;
  } else if (status === 'needsClaim' && user) {
    body = (
      <div className="admin-center"><div className="login-card glass">
        <h1>Almost there</h1>
        <p>This account is on the admin allow-list but doesn't have the <code>admin</code> custom claim yet, so Firestore will refuse it.
          Run <code>npm run admin:claim -- {user.uid}</code> (see README), then sign in again.</p>
        <button type="button" className="btn btn-primary" onClick={signOutNow}>Sign out</button>
      </div></div>
    );
  } else if (status === 'setup' && user) {
    body = <SetupScreen user={user} onSignOut={signOutNow} />;
  } else {
    body = <Login onDemo={enterDemo} />;
  }

  return (
    <ToastProvider>
      <ModalProvider>
        {useEmulators && <p className="emulator-banner mono">Emulator mode: local data only</p>}
        {body}
      </ModalProvider>
    </ToastProvider>
  );
}
