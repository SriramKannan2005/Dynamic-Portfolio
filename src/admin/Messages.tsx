/**
 * Inbox: live list (shared listener), folders (Inbox / Follow-up / Starred / Archived /
 * Spam / Trash / All), filters, search with highlighting (?q= so the command palette
 * can deep-link), multi-select bulk actions, private notes, re-categorising, follow-up
 * reminders, spam + sender blocking, soft delete with Undo, and keyboard shortcuts.
 */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Icon } from '../shared/Icon';
import { Select } from '../shared/Select';
import { useModal } from '../shared/Modal';
import {
  CATEGORIES, TRASH_DAYS, blockSender, dayKey, deleteMessages, fetchReplies, logAction, msgDate, setNote, updateMessages,
  type Message, type MessagePatch, type Reply,
} from './api';
import { useConfirm, useToast } from './feedback';
import { useInbox } from './inbox';
import { ReplyModal } from './ReplyModal';
import { download, messagesCsv, stamp } from './Export';
import { catVar, hue, initials } from './look';
import { ProfileMark } from './ProfileMark';

type Folder = 'inbox' | 'followup' | 'starred' | 'archived' | 'spam' | 'trash' | 'all';
type Status = 'any' | 'unread' | 'read' | 'pending' | 'replied';
const PAGE = 40;
const FOLDERS: [Folder, string, string?][] = [
  ['inbox', 'Inbox'], ['followup', 'Follow-up', 'bell'], ['starred', 'Starred', 'star'], ['archived', 'Archived', 'archive'],
  ['spam', 'Spam', 'ban'], ['trash', 'Trash', 'trash'], ['all', 'All'],
];

export const SHORTCUTS: [string, string][] = [
  ['j / k', 'Next / previous message'],
  ['x', 'Select the current message'],
  ['r', 'AI Reply to the current message'],
  ['s', 'Star / unstar'],
  ['e', 'Archive / unarchive'],
  ['u', 'Mark read / unread'],
  ['n', 'Add or edit a note'],
  ['f', 'Follow up tomorrow / clear'],
  ['!', 'Mark as spam'],
  ['#', 'Move to Trash (Undo available)'],
  ['/', 'Search'],
  ['Esc', 'Clear the selection'],
  ['Ctrl + K', 'Command palette (anywhere in admin)'],
  ['?', 'Show these shortcuts'],
];

export const today = () => dayKey(new Date());
export const inDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return dayKey(d); };
export const isLive = (m: Message) => !m.trashedAt && !m.spam;
/** "due" (today or overdue) / "later" / null */
export const followUpState = (m: Message): 'due' | 'later' | null => (!m.followUpAt ? null : m.followUpAt <= today() ? 'due' : 'later');
const prettyDay = (key: string) => {
  if (key === today()) return 'today';
  if (key === inDays(1)) return 'tomorrow';
  if (key < today()) return `overdue (${new Date(`${key}T00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })})`;
  return new Date(`${key}T00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
};

export function ShortcutsHelp() {
  return (
    <div className="confirm">
      <h2 id="modalTitle">Keyboard shortcuts</h2>
      <dl className="kbd-list">
        {SHORTCUTS.map(([k, v]) => <div key={k}><dt>{k.split(' / ').map((x, i) => <Fragment key={x}>{i > 0 && ' / '}<kbd>{x}</kbd></Fragment>)}</dt><dd>{v}</dd></div>)}
      </dl>
    </div>
  );
}

function Highlight({ text, needle }: { text: string; needle: string }): ReactNode {
  if (!needle || !text) return text;
  const lower = text.toLowerCase();
  const out: ReactNode[] = [];
  let i = 0;
  for (let hit = lower.indexOf(needle); hit >= 0 && out.length < 40; hit = lower.indexOf(needle, i)) {
    if (hit > i) out.push(text.slice(i, hit));
    out.push(<mark key={hit}>{text.slice(hit, hit + needle.length)}</mark>);
    i = hit + needle.length;
  }
  out.push(text.slice(i));
  return out;
}

function NoteEditor({ m, onDone }: { m: Message; onDone: () => void }) {
  const toast = useToast();
  const [v, setV] = useState(m.note ?? '');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await setNote(m.id, v); toast('success', v.trim() ? 'Note saved' : 'Note removed'); onDone(); }
    catch (e) { toast('error', 'Could not save the note', (e as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <div className="note-edit">
      <label className="visually-hidden" htmlFor={`note-${m.id}`}>Private note</label>
      <textarea id={`note-${m.id}`} rows={3} maxLength={2000} value={v} autoFocus placeholder="Private note: only visible here (e.g. 'call back Friday')"
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save(); if (e.key === 'Escape') { e.stopPropagation(); onDone(); } }} />
      <div className="note-actions">
        <span className="muted">Ctrl + Enter to save</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onDone}>Cancel</button>
        <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save note'}</button>
      </div>
    </div>
  );
}

/** Mark as spam, optionally blocking the sender(s) at the database level. */
function SpamDialog({ list, onDone }: { list: Message[]; onDone: (block: boolean) => void }) {
  const modal = useModal();
  const emails = [...new Set(list.map((m) => m.email.trim().toLowerCase()))];
  const [block, setBlock] = useState(true);
  return (
    <div className="confirm">
      <h2 id="modalTitle">{list.length === 1 ? 'Mark as spam?' : `Mark ${list.length} messages as spam?`}</h2>
      <p>{list.length === 1 ? `The message from ${list[0].name} moves to the Spam folder.` : 'They move to the Spam folder.'}</p>
      <label className="check-row">
        <input type="checkbox" checked={block} onChange={(e) => setBlock(e.target.checked)} />
        <span>Also block {emails.length === 1 ? <b>{emails[0]}</b> : `these ${emails.length} senders`}: new messages from {emails.length === 1 ? 'it' : 'them'} are refused by the database.</span>
      </label>
      <div className="confirm-actions">
        <button type="button" className="btn btn-ghost" autoFocus onClick={() => modal.close()}>Cancel</button>
        <button type="button" className="btn btn-danger" onClick={() => { modal.close(); onDone(block); }}>{block ? 'Spam + block' : 'Mark as spam'}</button>
      </div>
    </div>
  );
}

export function Messages() {
  const toast = useToast();
  const confirm = useConfirm();
  const modal = useModal();
  const { list, error } = useInbox();
  const [params, setParams] = useSearchParams();
  const urlQ = params.get('q') ?? '';
  const urlFolder = params.get('folder') as Folder | null;
  // Local state drives the input; the URL is a mirror (for deep links from the
  // command palette). Driving the input from the URL drops fast keystrokes.
  const [q, setQ] = useState(urlQ);
  const lastPushed = useRef(urlQ);
  useEffect(() => { if (urlQ !== lastPushed.current) { lastPushed.current = urlQ; setQ(urlQ); } }, [urlQ]);
  useEffect(() => {
    const t = setTimeout(() => {
      if (q !== lastPushed.current) {
        lastPushed.current = q;
        setParams((p) => { const n = new URLSearchParams(p); if (q) n.set('q', q); else n.delete('q'); return n; }, { replace: true });
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q, setParams]);
  const [folder, setFolder] = useState<Folder>(urlFolder && FOLDERS.some(([f]) => f === urlFolder) ? urlFolder : 'inbox');
  useEffect(() => { if (urlFolder && FOLDERS.some(([f]) => f === urlFolder)) setFolder(urlFolder); }, [urlFolder]);
  const [status, setStatus] = useState<Status>('any');
  const [cat, setCat] = useState('all');
  const [sort, setSort] = useState<'new' | 'old'>('new');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [active, setActive] = useState(-1);
  const [shown, setShown] = useState(PAGE);
  const [noteFor, setNoteFor] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const needle = q.trim().toLowerCase();

  // Empty the trash of anything older than TRASH_DAYS (once per visit)
  const purged = useRef(false);
  useEffect(() => {
    if (!list || purged.current) return;
    purged.current = true;
    const cutoff = Date.now() - TRASH_DAYS * 86_400_000;
    const old = list.filter((m) => m.trashedAt && Date.parse(m.trashedAt) < cutoff);
    if (!old.length) return;
    deleteMessages(old.map((m) => m.id))
      .then(() => { logAction('message.purge', `Auto-deleted ${old.length} message${old.length === 1 ? '' : 's'} trashed over ${TRASH_DAYS} days ago`); toast('info', `Emptied ${old.length} old message${old.length === 1 ? '' : 's'} from Trash`, `Trash keeps messages for ${TRASH_DAYS} days.`); })
      .catch(() => {});
  }, [list, toast]);

  const inFolder = useCallback((m: Message, f: Folder) => {
    switch (f) {
      case 'trash': return !!m.trashedAt;
      case 'spam': return !m.trashedAt && !!m.spam;
      case 'inbox': return isLive(m) && !m.archived;
      case 'followup': return isLive(m) && !!m.followUpAt;
      case 'starred': return isLive(m) && !!m.starred;
      case 'archived': return isLive(m) && !!m.archived;
      default: return isLive(m);
    }
  }, []);

  const counts = useMemo(() => Object.fromEntries(FOLDERS.map(([f]) => [f, (list ?? []).filter((m) => inFolder(m, f)).length])) as Record<Folder, number>, [list, inFolder]);
  const dueCount = useMemo(() => (list ?? []).filter((m) => isLive(m) && followUpState(m) === 'due').length, [list]);
  const catCounts = useMemo(() => {
    const c: Record<string, number> = {};
    (list ?? []).filter(isLive).forEach((m) => { const k = m.category ?? 'General'; c[k] = (c[k] ?? 0) + 1; });
    return c;
  }, [list]);

  const filtered = useMemo(() => {
    const out = (list ?? []).filter((m) => {
      if (!inFolder(m, folder)) return false;
      if (cat !== 'all' && (m.category ?? 'General') !== cat) return false;
      if (status === 'unread' && m.read) return false;
      if (status === 'read' && !m.read) return false;
      if (status === 'replied' && !m.replied) return false;
      if (status === 'pending' && m.replied) return false;
      if (!needle) return true;
      return [m.name, m.email, m.subject, m.message, m.note].some((v) => (v ?? '').toLowerCase().includes(needle));
    });
    if (folder === 'followup') return out.sort((a, b) => String(a.followUpAt).localeCompare(String(b.followUpAt)));
    return sort === 'old' ? out.reverse() : out;
  }, [list, folder, cat, status, needle, sort, inFolder]);
  const visible = filtered.slice(0, shown);

  useEffect(() => {
    setSelected((s) => {
      const ids = new Set(filtered.map((m) => m.id));
      const next = new Set([...s].filter((id) => ids.has(id)));
      return next.size === s.size ? s : next;
    });
  }, [filtered]);
  useEffect(() => { setShown(PAGE); setActive(-1); }, [folder, cat, status, needle, sort]);

  const sel = filtered.filter((m) => selected.has(m.id));
  const allChecked = visible.length > 0 && visible.every((m) => selected.has(m.id));
  const toggleSel = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const run = useCallback(async (fn: () => Promise<unknown>, ok: string, fail = 'Update failed') => {
    try { await fn(); if (ok) toast('success', ok); } catch (e) { toast('error', fail, (e as Error).message); }
  }, [toast]);
  const patchMany = (ms: Message[], patch: MessagePatch, ok: string) => run(() => updateMessages(ms.map((m) => m.id), patch), ok);

  /** Soft delete: moves to Trash, with Undo in the toast. */
  const trashMany = async (ms: Message[]) => {
    if (!ms.length) return;
    const ids = ms.map((m) => m.id);
    try {
      await updateMessages(ids, { trashedAt: new Date().toISOString() });
      setSelected(new Set());
      toast('info', ms.length === 1 ? 'Moved to Trash' : `${ms.length} messages moved to Trash`, `Kept for ${TRASH_DAYS} days.`, {
        label: 'Undo', run: () => { updateMessages(ids, { trashedAt: null }).catch((e) => toast('error', 'Undo failed', (e as Error).message)); },
      });
    } catch (e) { toast('error', 'Could not move to Trash', (e as Error).message); }
  };
  const restoreMany = (ms: Message[]) => { setSelected(new Set()); return patchMany(ms, { trashedAt: null }, ms.length === 1 ? 'Restored' : `${ms.length} messages restored`); };
  const destroyMany = async (ms: Message[], origin?: HTMLElement | null, all = false) => {
    if (!ms.length) return;
    const one = ms.length === 1;
    const ok = await confirm({
      title: all ? 'Empty the trash?' : one ? 'Delete forever?' : `Delete ${ms.length} messages forever?`,
      text: `${one ? 'This message' : `${ms.length} messages`} will be permanently deleted. This cannot be undone.`,
      confirmLabel: all ? 'Empty trash' : 'Delete forever', danger: true, origin,
    });
    if (!ok) return;
    await run(async () => {
      await deleteMessages(ms.map((m) => m.id));
      setSelected(new Set());
      logAction('message.delete', one ? `Permanently deleted message from ${ms[0].name} <${ms[0].email}>` : `Permanently deleted ${ms.length} messages${all ? ' (emptied trash)' : ''}`);
    }, one ? 'Deleted forever' : `${ms.length} messages deleted forever`, 'Delete failed');
  };
  const spamMany = (ms: Message[], origin?: HTMLElement | null) => {
    if (!ms.length) return;
    modal.open(<SpamDialog list={ms} onDone={async (block) => {
      await run(async () => {
        await updateMessages(ms.map((m) => m.id), { spam: true, read: true });
        if (block) {
          const emails = [...new Set(ms.map((m) => m.email.trim().toLowerCase()))];
          await Promise.all(emails.map((e) => blockSender(e, 'Marked as spam')));
        }
        setSelected(new Set());
      }, block ? 'Marked as spam and blocked' : 'Marked as spam');
    }} />, { narrow: true, origin });
  };

  const reply = useCallback((m: Message, origin?: HTMLElement | null) => {
    if (!m.read) updateMessages([m.id], { read: true }).catch(() => {});
    modal.open(<ReplyModal message={m} onReplied={() => {}} />, { origin });
  }, [modal]);

  const exportSel = () => {
    download(`messages-selected-${stamp()}.csv`, messagesCsv(sel), 'text/csv;charset=utf-8');
    logAction('messages.export', `Exported ${sel.length} selected messages as CSV`);
    toast('success', `Exported ${sel.length} messages`, 'CSV');
  };

  // ---- keyboard shortcuts ----
  const stateRef = useRef({ visible, active, folder });
  stateRef.current = { visible, active, folder };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable="true"], .dd')) return;
      if (document.querySelector('.modal')) return;
      const { visible: vis, active: act, folder: fol } = stateRef.current;
      const cur = vis[act];
      const move = (to: number) => {
        const n = Math.max(0, Math.min(vis.length - 1, to));
        setActive(n);
        requestAnimationFrame(() => {
          const el = listRef.current?.children[n] as HTMLElement | undefined;
          el?.focus({ preventScroll: true });
          el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        });
      };
      switch (e.key) {
        case 'j': e.preventDefault(); move(act + 1); break;
        case 'k': e.preventDefault(); move(act < 0 ? 0 : act - 1); break;
        case '/': e.preventDefault(); searchRef.current?.focus(); break;
        case '?': e.preventDefault(); modal.open(<ShortcutsHelp />, { narrow: true }); break;
        case 'Escape': setSelected(new Set()); break;
        default:
          if (!cur) return;
          if (e.key === 'x') { e.preventDefault(); toggleSel(cur.id); }
          else if (e.key === 'r') { e.preventDefault(); reply(cur, listRef.current?.children[act] as HTMLElement); }
          else if (e.key === 's') { e.preventDefault(); patchMany([cur], { starred: !cur.starred }, ''); }
          else if (e.key === 'e') { e.preventDefault(); patchMany([cur], { archived: !cur.archived }, cur.archived ? 'Moved to inbox' : 'Archived'); }
          else if (e.key === 'u') { e.preventDefault(); patchMany([cur], { read: !cur.read }, ''); }
          else if (e.key === 'n') { e.preventDefault(); setNoteFor(cur.id); }
          else if (e.key === 'f') { e.preventDefault(); patchMany([cur], { followUpAt: cur.followUpAt ? null : inDays(1) }, cur.followUpAt ? 'Reminder cleared' : 'Follow up tomorrow'); }
          else if (e.key === '!') { e.preventDefault(); if (!cur.spam) spamMany([cur]); }
          else if (e.key === '#') { e.preventDefault(); if (fol === 'trash') destroyMany([cur]); else trashMany([cur]); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modal, reply]);


  const unreadInbox = (list ?? []).filter((m) => isLive(m) && !m.read && !m.archived);
  const inTrash = folder === 'trash';
  const inSpam = folder === 'spam';
  const cur = active >= 0 ? visible[active] : undefined;

  // Reading pane: open a message (marks it read), and its sent-reply thread
  const [reading, setReading] = useState(false);
  const [thread, setThread] = useState<Reply[] | null>(null);
  const open = (i: number) => {
    setActive(i);
    setReading(true);
    const m = visible[i];
    if (m && !m.read && !m.trashedAt) updateMessages([m.id], { read: true }).catch(() => {});
  };
  useEffect(() => {
    if (!cur) { setThread(null); return; }
    if (!cur.replyCount && !cur.replied) { setThread([]); return; }
    let live = true;
    setThread(null);
    fetchReplies(cur.id).then((r) => { if (live) setThread(r); }).catch(() => { if (live) setThread([]); });
    return () => { live = false; };
  }, [cur?.id, cur?.replyCount, cur?.replied]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (active < 0) setReading(false); }, [active]);

  // Phone layout: folders live in a slide-in drawer; the bottom bar hides while reading
  const [drawer, setDrawer] = useState(false);
  useEffect(() => {
    const html = document.documentElement;
    html.classList.toggle('mx-reading', reading && !!cur);
    return () => html.classList.remove('mx-reading');
  }, [reading, cur]);
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setDrawer(false); } };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [drawer]);

  // Gmail-style swipe on touch: drag a row sideways past ~35% of its width to archive it
  // (in Trash: restore). Vertical drags scroll the list as usual.
  const swipe = useRef<{ x: number; y: number; dx: number; lock: boolean | null; row: HTMLElement } | null>(null);
  const swallowClick = useRef(false);
  const swipeAction = (m: Message) => {
    if (m.trashedAt) restoreMany([m]);
    else patchMany([m], { archived: !m.archived }, m.archived ? 'Moved to inbox' : 'Archived');
  };
  const onSwipeDown = (e: React.PointerEvent<HTMLLIElement>) => {
    if (e.pointerType === 'mouse') return;
    const row = e.currentTarget.querySelector<HTMLElement>('.mx-row');
    if (row) swipe.current = { x: e.clientX, y: e.clientY, dx: 0, lock: null, row };
  };
  const onSwipeMove = (e: React.PointerEvent<HTMLLIElement>) => {
    const s = swipe.current;
    if (!s) return;
    const dx = e.clientX - s.x; const dy = e.clientY - s.y;
    if (s.lock === null && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) s.lock = Math.abs(dx) > Math.abs(dy);
    if (!s.lock) return;
    s.dx = dx;
    s.row.style.transition = 'none';
    s.row.style.transform = `translateX(${dx}px)`;
    e.currentTarget.dataset.swipe = dx > 0 ? 'right' : 'left';
    e.currentTarget.classList.toggle('is-past', Math.abs(dx) > e.currentTarget.offsetWidth * 0.35);
  };
  const onSwipeEnd = (e: React.PointerEvent<HTMLLIElement>, m: Message) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s || !s.lock) return;
    const li = e.currentTarget;
    const past = Math.abs(s.dx) > li.offsetWidth * 0.35;
    swallowClick.current = true;
    s.row.style.transition = '';
    s.row.style.transform = past ? `translateX(${s.dx > 0 ? 110 : -110}%)` : '';
    li.classList.remove('is-past');
    if (past) setTimeout(() => { swipeAction(m); s.row.style.transform = ''; delete li.dataset.swipe; }, 220);
    else delete li.dataset.swipe;
  };

  const pickFolder = (id: Folder) => { setFolder(id); setDrawer(false); setParams((p) => { const n = new URLSearchParams(p); n.delete('folder'); return n; }, { replace: true }); };
  const ago = (t: Date | null) => {
    if (!t) return '';
    const s = (Date.now() - t.getTime()) / 1000;
    if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m`;
    if (s < 86400) return `${Math.round(s / 3600)}h`;
    if (s < 86400 * 7) return `${Math.round(s / 86400)}d`;
    return t.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  };

  return (
    <section aria-labelledby="msgTitle" className="mx">
      <div className="admin-head">
        <h1 id="msgTitle">Messages {list && <span className="count-pill">{unreadInbox.length} unread</span>}</h1>
        <div className="admin-head-actions">
          <span className="live-dot mono" title="Updates arrive automatically"><span aria-hidden="true" />Live</span>
          <button type="button" className="btn btn-ghost" onClick={(e) => modal.open(<ShortcutsHelp />, { narrow: true, origin: e.currentTarget })}><Icon id="keyboard" /><span>Shortcuts</span></button>
          {inTrash ? (
            <button type="button" className="btn btn-ghost btn-danger-ghost" disabled={!counts.trash}
              onClick={(e) => destroyMany((list ?? []).filter((m) => m.trashedAt), e.currentTarget, true)}><Icon id="trash" /><span>Empty trash</span></button>
          ) : (
            <button type="button" className="btn btn-ghost" onClick={(e) => {
              if (!unreadInbox.length) { toast('info', 'Nothing to mark', 'All inbox messages are already read.'); return; }
              const origin = e.currentTarget;
              confirm({ title: 'Mark all as read?', text: `${unreadInbox.length} unread message${unreadInbox.length === 1 ? '' : 's'} will be marked as read.`, confirmLabel: 'Mark all read', origin })
                .then((ok) => { if (ok) patchMany(unreadInbox, { read: true }, 'All messages marked as read'); });
            }}><Icon id="check" /><span>Mark all read</span></button>
          )}
        </div>
      </div>

      {/* Phone header, Gmail-style: drawer button + search pill */}
      <div className="mx-mhead" role="search">
        <button type="button" className="mx-burger" onClick={() => setDrawer(true)} aria-label="Folders and filters" aria-expanded={drawer}><Icon id="menu" /></button>
        <input type="search" placeholder={`Search in ${(FOLDERS.find(([f]) => f === folder)?.[1] ?? 'mail').toLowerCase()}`} value={q}
          onChange={(e) => setQ(e.target.value)} aria-label="Search messages" />
        <ProfileMark className="mx-me" />
      </div>
      <p className="mx-mlabel mono">{FOLDERS.find(([f]) => f === folder)?.[1]}{list ? ` · ${filtered.length}` : ''}{cat !== 'all' ? ` · ${cat}` : ''}{status !== 'any' ? ` · ${status}` : ''}</p>

      <div className={`mx-studio${reading ? ' is-reading' : ''}`}>
        <div className={`mx-drawer-backdrop${drawer ? ' is-open' : ''}`} onClick={() => setDrawer(false)} aria-hidden="true" />
        {/* ---------- rail: folders + filters (a slide-in drawer on phones) ---------- */}
        <aside className={`mx-rail${drawer ? ' is-open' : ''}`} aria-label="Folders and filters">
          <p className="mx-drawer-title">Messages <span className="live-dot mono"><span aria-hidden="true" />Live</span></p>
          <nav className="mx-folders" role="tablist" aria-label="Folders" aria-orientation="vertical">
            {FOLDERS.map(([id, label, icon]) => (
              <button key={id} type="button" role="tab" aria-selected={folder === id} className={`mx-folder${folder === id ? ' is-active' : ''}`} onClick={() => pickFolder(id)}>
                <Icon id={icon ?? (id === 'inbox' ? 'mail' : 'grid')} />
                <span className="mx-folder-k">{label}</span>
                {id === 'followup' && dueCount > 0 && <span className="folder-due" title={`${dueCount} due`}>{dueCount}</span>}
                <span className="mx-folder-n mono">{counts[id]}</span>
              </button>
            ))}
          </nav>
          <div className="mx-filter">
            <p className="mx-filter-h mono">Category</p>
            <div className="mx-chips">
              <button type="button" className={`mx-chip${cat === 'all' ? ' is-on' : ''}`} onClick={() => setCat('all')}>All<span>{(list ?? []).filter(isLive).length}</span></button>
              {CATEGORIES.map((c) => (
                <button key={c} type="button" className={`mx-chip${cat === c ? ' is-on' : ''}`} style={{ '--c': catVar(c) } as React.CSSProperties}
                  aria-pressed={cat === c} onClick={() => setCat(cat === c ? 'all' : c)}>
                  <i aria-hidden="true" />{c}<span>{catCounts[c] ?? 0}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="mx-filter">
            <p className="mx-filter-h mono">Status</p>
            <div className="mx-chips">
              {([['any', 'Any'], ['unread', 'Unread'], ['pending', 'Needs reply'], ['replied', 'Replied'], ['read', 'Read']] as [Status, string][]).map(([v, l]) => (
                <button key={v} type="button" className={`mx-chip${status === v ? ' is-on' : ''}`} aria-pressed={status === v} onClick={() => setStatus(v)}>{l}</button>
              ))}
            </div>
          </div>
          {inTrash && <p className="muted folder-note">Trash empties itself after {TRASH_DAYS} days.</p>}
          {inSpam && <p className="muted folder-note">Blocked senders live in Settings.</p>}
          {/* phone drawer only: actions that sit in the page header on wider screens */}
          <div className="mx-drawer-actions">
            <button type="button" className="mx-folder" onClick={() => { setSort(sort === 'new' ? 'old' : 'new'); setDrawer(false); }} disabled={folder === 'followup'}>
              <Icon id="refresh" /><span className="mx-folder-k">{sort === 'new' ? 'Show oldest first' : 'Show newest first'}</span>
            </button>
            {inTrash ? (
              <button type="button" className="mx-folder" disabled={!counts.trash} onClick={(e) => { setDrawer(false); destroyMany((list ?? []).filter((m) => m.trashedAt), e.currentTarget, true); }}>
                <Icon id="trash" /><span className="mx-folder-k">Empty trash</span>
              </button>
            ) : (
              <button type="button" className="mx-folder" disabled={!unreadInbox.length} onClick={() => { setDrawer(false); patchMany(unreadInbox, { read: true }, 'All messages marked as read'); }}>
                <Icon id="check" /><span className="mx-folder-k">Mark all read</span><span className="mx-folder-n mono">{unreadInbox.length}</span>
              </button>
            )}
          </div>
        </aside>

        {/* ---------- list ---------- */}
        <div className="mx-listcol">
          <div className="mx-search" role="search">
            <label className="search">
              <Icon id="search" />
              <span className="visually-hidden">Search messages</span>
              <input ref={searchRef} type="search" placeholder="Search…  ( / )" value={q}
                onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') (e.target as HTMLInputElement).blur(); }} />
            </label>
            <button type="button" className="icon-btn mx-sort" disabled={folder === 'followup'} onClick={() => setSort(sort === 'new' ? 'old' : 'new')}
              title={sort === 'new' ? 'Newest first (click for oldest)' : 'Oldest first (click for newest)'} aria-label={sort === 'new' ? 'Sorted newest first' : 'Sorted oldest first'}>
              <span aria-hidden="true">{sort === 'new' ? '↓' : '↑'}</span>
            </button>
          </div>

          <div className={`bulk-bar mx-bulk${sel.length ? ' is-on' : ''}`} role="toolbar" aria-label="Bulk actions">
            <label className="check-row">
              <input type="checkbox" checked={allChecked} disabled={!visible.length}
                ref={(el) => { if (el) el.indeterminate = !allChecked && visible.some((m) => selected.has(m.id)); }}
                onChange={() => setSelected(allChecked ? new Set() : new Set(visible.map((m) => m.id)))} />
              <span>{sel.length ? `${sel.length} selected` : list ? `${filtered.length} of ${counts[folder]}` : 'Loading…'}</span>
            </label>
            {sel.length > 0 && (
              <div className="bulk-actions">
                {inTrash ? (
                  <>
                    <button type="button" className="icon-btn" title="Restore" aria-label="Restore selected" onClick={() => restoreMany(sel)}><Icon id="refresh" /></button>
                    <button type="button" className="icon-btn is-danger" title="Delete forever" aria-label="Delete selected forever" onClick={(e) => destroyMany(sel, e.currentTarget)}><Icon id="trash" /></button>
                  </>
                ) : (
                  <>
                    <button type="button" className="icon-btn" title="Mark read" aria-label="Mark selected read" onClick={() => patchMany(sel, { read: true }, `${sel.length} marked read`)}><Icon id="check" /></button>
                    <button type="button" className="icon-btn" title="Mark unread" aria-label="Mark selected unread" onClick={() => patchMany(sel, { read: false }, `${sel.length} marked unread`)}><Icon id="mail" /></button>
                    <button type="button" className="icon-btn" title="Star" aria-label="Star selected" onClick={() => patchMany(sel, { starred: !sel.every((m) => m.starred) }, '')}><Icon id="star" /></button>
                    <button type="button" className="icon-btn" title="Archive" aria-label="Archive selected" onClick={() => { const arch = !sel.every((m) => m.archived); patchMany(sel, { archived: arch }, arch ? `${sel.length} archived` : `${sel.length} moved to inbox`); setSelected(new Set()); }}><Icon id="archive" /></button>
                    {inSpam
                      ? <button type="button" className="icon-btn" title="Not spam" aria-label="Not spam" onClick={() => { patchMany(sel, { spam: false }, 'Moved back to inbox'); setSelected(new Set()); }}><Icon id="check" /></button>
                      : <button type="button" className="icon-btn" title="Spam" aria-label="Mark selected as spam" onClick={(e) => spamMany(sel, e.currentTarget)}><Icon id="ban" /></button>}
                    <button type="button" className="icon-btn" title="Export CSV" aria-label="Export selected as CSV" onClick={exportSel}><Icon id="download" /></button>
                    <button type="button" className="icon-btn is-danger" title="Move to Trash" aria-label="Move selected to Trash" onClick={() => trashMany(sel)}><Icon id="trash" /></button>
                  </>
                )}
              </div>
            )}
          </div>

          {error && <p className="panel-error">{error}</p>}
          <ul className="mx-list" ref={listRef} aria-label="Messages">
            {visible.map((m, i) => {
              const fu = followUpState(m);
              const t = msgDate(m);
              return (
                <li key={m.id} tabIndex={-1} onFocus={() => setActive(i)}
                  onClick={() => { if (swallowClick.current) { swallowClick.current = false; return; } open(i); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') open(i); }}
                  onPointerDown={onSwipeDown} onPointerMove={onSwipeMove} onPointerUp={(e) => onSwipeEnd(e, m)} onPointerCancel={(e) => onSwipeEnd(e, m)}
                  style={{ '--c': catVar(m.category), '--h': hue(m.email) } as React.CSSProperties}
                  className={`mx-item${m.read ? '' : ' is-unread'}${i === active ? ' is-active' : ''}${selected.has(m.id) ? ' is-selected' : ''}${m.trashedAt ? ' is-trashed' : ''}`}>
                  {/* revealed behind the row while swiping (touch) */}
                  <span className="mx-swipe-bg" aria-hidden="true"><Icon id={m.trashedAt ? 'refresh' : 'archive'} /><span>{m.trashedAt ? 'Restore' : m.archived ? 'Unarchive' : 'Archive'}</span></span>
                  <div className="mx-row">
                    <label className="mx-check" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggleSel(m.id)} aria-label={`Select message from ${m.name}`} />
                    </label>
                    <span className="avatar avatar-sm" aria-hidden="true">{initials(m.name)}</span>
                    <div className="mx-item-body">
                      <p className="mx-item-top">
                        <b className="mx-item-name"><Highlight text={m.name} needle={needle} /></b>
                        <time className="mono" dateTime={t?.toISOString()} title={t?.toLocaleString()}>{ago(t)}</time>
                      </p>
                      <p className="mx-item-sub"><Highlight text={m.subject || m.message} needle={needle} /></p>
                      {m.subject && <p className="mx-item-snip"><Highlight text={m.message} needle={needle} /></p>}
                      <p className="mx-item-icons">
                        <span className="cat-dot" aria-label={m.category ?? 'General'} title={m.category ?? 'General'} />
                        {m.starred && <span className="mx-ic is-star" title="Starred"><Icon id="star" /></span>}
                        {m.replied && <span className="mx-ic is-replied" title={`Replied${m.replyCount ? ` ${m.replyCount}×` : ''}`}><Icon id="check" />{m.replyCount && m.replyCount > 1 ? m.replyCount : ''}</span>}
                        {m.note && <span className="mx-ic" title="Has a note"><Icon id="note" /></span>}
                        {fu && <span className={`mx-ic${fu === 'due' ? ' is-due' : ''}`} title={`Follow up ${prettyDay(m.followUpAt!)}`}><Icon id="bell" /></span>}
                        {m.spam && <span className="mx-ic is-spam" title="Spam"><Icon id="ban" /></span>}
                      </p>
                    </div>
                    {!m.trashedAt && (
                      <button type="button" className={`mx-star${m.starred ? ' is-on' : ''}`} aria-pressed={!!m.starred} aria-label={m.starred ? `Unstar message from ${m.name}` : `Star message from ${m.name}`}
                        onClick={(e) => { e.stopPropagation(); patchMany([m], { starred: !m.starred }, ''); }}><Icon id="star" /></button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {filtered.length > shown && (
            <div className="load-more"><button type="button" className="btn btn-ghost btn-sm" onClick={() => setShown((n) => n + PAGE)}>Show {Math.min(PAGE, filtered.length - shown)} more</button></div>
          )}
          {list && filtered.length === 0 && (
            <div className="mx-empty-list">
              <span aria-hidden="true"><Icon id={folder === 'trash' ? 'trash' : folder === 'spam' ? 'ban' : 'check'} /></span>
              <p>{folder === 'trash' ? 'Trash is empty.'
                : folder === 'spam' ? 'No spam. Nice.'
                  : folder === 'followup' ? 'No reminders. Use “Remind me” (or press f).'
                    : folder === 'inbox' && !needle && status === 'any' && cat === 'all' ? 'Inbox zero.' : 'Nothing matches these filters.'}</p>
            </div>
          )}
        </div>

        {/* ---------- reading pane ---------- */}
        <article className="mx-reader" aria-label={cur ? `Message from ${cur.name}` : 'Reading pane'} style={cur ? { '--c': catVar(cur.category), '--h': hue(cur.email) } as React.CSSProperties : undefined}>
          {!cur ? (
            <div className="mx-reader-empty">
              <div className="mx-orb" aria-hidden="true"><Icon id="mail" /></div>
              <h2>Pick a message</h2>
              <p className="muted">{list ? `${unreadInbox.length} unread · ${counts.inbox} in the inbox` : 'Loading…'}</p>
              <p className="muted small-note">Tip: <kbd>j</kbd> / <kbd>k</kbd> to move, <kbd>r</kbd> to reply, <kbd>?</kbd> for all shortcuts.</p>
            </div>
          ) : (
            <>
              {/* phone app bar, Gmail-style: back on the left, quick actions on the right */}
              <div className="mx-appbar" role="toolbar" aria-label="Message actions">
                <button type="button" className="mx-appbar-btn" onClick={() => setReading(false)} aria-label="Back to the list"><span aria-hidden="true">←</span></button>
                <span className="mx-appbar-gap" />
                {inTrash ? (
                  <button type="button" className="mx-appbar-btn" onClick={() => { restoreMany([cur]); setReading(false); }} aria-label="Restore"><Icon id="refresh" /></button>
                ) : (
                  <>
                    <button type="button" className="mx-appbar-btn" onClick={() => { patchMany([cur], { archived: !cur.archived }, cur.archived ? 'Moved to inbox' : 'Archived'); setReading(false); }} aria-label={cur.archived ? 'Unarchive' : 'Archive'}><Icon id="archive" /></button>
                    <button type="button" className="mx-appbar-btn" onClick={() => { trashMany([cur]); setReading(false); }} aria-label="Move to Trash"><Icon id="trash" /></button>
                    <button type="button" className="mx-appbar-btn" onClick={() => { patchMany([cur], { read: false }, 'Marked unread'); setReading(false); }} aria-label="Mark unread"><Icon id="mail" /></button>
                    <button type="button" className={`mx-appbar-btn${cur.starred ? ' is-star' : ''}`} onClick={() => patchMany([cur], { starred: !cur.starred }, '')} aria-label={cur.starred ? 'Unstar' : 'Star'} aria-pressed={!!cur.starred}><Icon id="star" /></button>
                  </>
                )}
              </div>
              <h2 className="mx-subject-big">{cur.subject || (cur.message.length > 60 ? `${cur.message.slice(0, 60)}…` : cur.message)}
                <span className="cat-tag" style={{ '--c': catVar(cur.category) } as React.CSSProperties}>{cur.category ?? 'General'}</span>
              </h2>
              <header className="mx-reader-head">
                <button type="button" className="icon-btn mx-back" onClick={() => setReading(false)} aria-label="Back to the list"><span aria-hidden="true">←</span></button>
                <span className="avatar mx-reader-avatar" aria-hidden="true">{initials(cur.name)}</span>
                <div className="mx-reader-who">
                  <h2><Highlight text={cur.name} needle={needle} /></h2>
                  <span className="msg-email-row">
                    <a className="msg-email mono" href={`mailto:${cur.email}`}><Highlight text={cur.email} needle={needle} /></a>
                    <button type="button" className="copy-btn" aria-label={`Copy ${cur.email}`} onClick={() => navigator.clipboard?.writeText(cur.email).then(() => toast('success', 'Email copied')).catch(() => {})}><Icon id="copy" /></button>
                  </span>
                </div>
                {!inTrash && (
                  <button type="button" className={`star-btn${cur.starred ? ' is-on' : ''}`} aria-pressed={!!cur.starred} aria-label={cur.starred ? 'Unstar' : 'Star'}
                    onClick={() => patchMany([cur], { starred: !cur.starred }, '')}><Icon id="star" /></button>
                )}
              </header>

              <div className="mx-meta">
                {inTrash ? <span className="cat-tag" style={{ '--c': catVar(cur.category) } as React.CSSProperties}>{cur.category ?? 'General'}</span> : (
                  <Select hideLabel label={`Category of the message from ${cur.name}`} className="dd-chip" value={cur.category ?? 'General'}
                    onChange={(c) => patchMany([cur], { category: c }, `Moved to ${c}`)}
                    options={CATEGORIES.map((c) => ({ value: c as string, label: c }))} />
                )}
                {cur.replied && (
                  <span className="badge-replied" title={cur.replyCount ? `${cur.replyCount} repl${cur.replyCount === 1 ? 'y' : 'ies'} sent` : 'Replied'}>
                    <Icon id="check" />Replied{cur.replyCount ? ` (${cur.replyCount})` : ''}
                  </span>
                )}
                {!cur.read && <span className="badge-unread">Unread</span>}
                {cur.archived && !cur.trashedAt && <span className="badge-archived">Archived</span>}
                {cur.spam && <span className="badge-spam">Spam</span>}
                {followUpState(cur) && !cur.trashedAt && <span className={`badge-follow${followUpState(cur) === 'due' ? ' is-due' : ''}`}><Icon id="bell" />Follow up {prettyDay(cur.followUpAt!)}</span>}
                {cur.trashedAt && <span className="muted trash-when">Deleted {new Date(cur.trashedAt).toLocaleDateString()}</span>}
              </div>

              <div className="mx-thread">
                <p className="mx-stamp mono">{msgDate(cur)?.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) ?? ''}</p>
                <div className="mx-bubble">
                  {cur.subject && <p className="mx-bubble-subject"><Highlight text={cur.subject} needle={needle} /></p>}
                  <p className="mx-bubble-text"><Highlight text={cur.message} needle={needle} /></p>
                </div>
                {thread === null && <p className="muted mx-thread-wait">Loading replies…</p>}
                {thread?.map((r) => (
                  <div key={r.id} className="mx-bubble-wrap is-me">
                    <p className="mx-stamp mono">You · {new Date(r.sentAt).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}{r.via === 'gmail' ? ' · via Gmail' : ''}</p>
                    <div className="mx-bubble is-me">
                      {r.subject && <p className="mx-bubble-subject">{r.subject}</p>}
                      <p className="mx-bubble-text">{r.replyContent}</p>
                    </div>
                  </div>
                ))}
                {cur.replied && thread && thread.length === 0 && <p className="muted mx-thread-wait">Replied, but the reply text wasn't recorded.</p>}
              </div>

              {noteFor === cur.id ? <NoteEditor m={cur} onDone={() => setNoteFor('')} />
                : cur.note ? <button type="button" className="msg-note mx-note" onClick={() => setNoteFor(cur.id)}><Icon id="note" /><span><Highlight text={cur.note} needle={needle} /></span></button> : null}

              <div className="mx-dock" role="toolbar" aria-label="Message actions">
                {inTrash ? (
                  <>
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => restoreMany([cur])}><Icon id="refresh" /><span>Restore</span></button>
                    <button type="button" className="btn btn-ghost btn-sm btn-danger-ghost" onClick={(e) => destroyMany([cur], e.currentTarget)}><Icon id="trash" /><span>Delete forever</span></button>
                  </>
                ) : (
                  <>
                    <button type="button" className="btn btn-primary mx-reply" onClick={(e) => reply(cur, e.currentTarget)} aria-haspopup="dialog"><Icon id="spark" /><span>{cur.replied ? 'AI Reply again' : 'AI Reply'}</span></button>
                    <div className="mx-dock-tools">
                      <button type="button" className="icon-btn" title={`Mark ${cur.read ? 'unread' : 'read'} (u)`} aria-label={`Mark ${cur.read ? 'unread' : 'read'}`} onClick={() => patchMany([cur], { read: !cur.read }, '')}><Icon id={cur.read ? 'mail' : 'check'} /></button>
                      <button type="button" className="icon-btn" title={`${cur.archived ? 'Unarchive' : 'Archive'} (e)`} aria-label={cur.archived ? 'Unarchive' : 'Archive'} onClick={() => patchMany([cur], { archived: !cur.archived }, cur.archived ? 'Moved to inbox' : 'Archived')}><Icon id="archive" /></button>
                      {noteFor !== cur.id && <button type="button" className="icon-btn" title={`${cur.note ? 'Edit note' : 'Add a note'} (n)`} aria-label={cur.note ? 'Edit note' : 'Add a note'} onClick={() => setNoteFor(cur.id)}><Icon id="note" /></button>}
                      {cur.spam
                        ? <button type="button" className="icon-btn" title="Not spam" aria-label="Not spam" onClick={() => patchMany([cur], { spam: false }, 'Moved back to inbox')}><Icon id="check" /></button>
                        : <button type="button" className="icon-btn" title="Spam (!)" aria-label="Mark as spam" onClick={(e) => spamMany([cur], e.currentTarget)}><Icon id="ban" /></button>}
                      <button type="button" className="icon-btn is-danger" title="Move to Trash (#)" aria-label={`Move the message from ${cur.name} to Trash`} onClick={() => trashMany([cur])}><Icon id="trash" /></button>
                    </div>
                    <Select hideLabel label={`Follow-up reminder for ${cur.name}`} className="dd-btn-sm" value={null} placeholder={cur.followUpAt ? 'Reminder…' : 'Remind me'}
                      onChange={(v) => patchMany([cur], { followUpAt: v === 'clear' ? null : inDays(Number(v)) }, v === 'clear' ? 'Reminder cleared' : `Reminder set for ${prettyDay(inDays(Number(v)))}`)}
                      options={[{ value: '1', label: 'Tomorrow' }, { value: '3', label: 'In 3 days' }, { value: '7', label: 'Next week' }, { value: '14', label: 'In 2 weeks' },
                        ...(cur.followUpAt ? [{ value: 'clear', label: 'Clear reminder' }] : [])]} />
                  </>
                )}
              </div>
            </>
          )}
        </article>
      </div>
    </section>
  );
}
