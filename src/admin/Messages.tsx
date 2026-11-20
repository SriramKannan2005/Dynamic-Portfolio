/**
 * Inbox: live list (shared listener), folders (Inbox / Starred / Archived / All),
 * filters, search with highlighting (?q= so the command palette can deep-link),
 * multi-select bulk actions, private notes, and Gmail-style keyboard shortcuts.
 */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Icon } from '../shared/Icon';
import { Select } from '../shared/Select';
import { useModal } from '../shared/Modal';
import { CATEGORIES, deleteMessages, msgDate, setNote, updateMessages, logAction, type Message } from './api';
import { useConfirm, useToast } from './feedback';
import { useInbox } from './inbox';
import { ReplyModal } from './ReplyModal';
import { download, messagesCsv, stamp } from './Export';

type Folder = 'inbox' | 'starred' | 'archived' | 'all';
type Status = 'any' | 'unread' | 'read' | 'pending' | 'replied';
const PAGE = 40;
const FOLDERS: [Folder, string][] = [['inbox', 'Inbox'], ['starred', 'Starred'], ['archived', 'Archived'], ['all', 'All']];

export const SHORTCUTS: [string, string][] = [
  ['j / k', 'Next / previous message'],
  ['x', 'Select the current message'],
  ['r', 'AI Reply to the current message'],
  ['s', 'Star / unstar'],
  ['e', 'Archive / unarchive'],
  ['u', 'Mark read / unread'],
  ['n', 'Add or edit a note'],
  ['#', 'Delete (asks first)'],
  ['/', 'Search'],
  ['Esc', 'Clear the selection'],
  ['Ctrl + K', 'Command palette (anywhere in admin)'],
  ['?', 'Show these shortcuts'],
];

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

export function Messages() {
  const toast = useToast();
  const confirm = useConfirm();
  const modal = useModal();
  const { list, error } = useInbox();
  const [params, setParams] = useSearchParams();
  const urlQ = params.get('q') ?? '';
  // Local state drives the input; the URL is a mirror (for deep links from the
  // command palette). Driving the input from the URL drops fast keystrokes.
  const [q, setQState] = useState(urlQ);
  const lastPushed = useRef(urlQ);
  useEffect(() => { if (urlQ !== lastPushed.current) { lastPushed.current = urlQ; setQState(urlQ); } }, [urlQ]);
  useEffect(() => {
    const t = setTimeout(() => { if (q !== lastPushed.current) { lastPushed.current = q; setParams(q ? { q } : {}, { replace: true }); } }, 250);
    return () => clearTimeout(t);
  }, [q, setParams]);
  const [folder, setFolder] = useState<Folder>('inbox');
  const [status, setStatus] = useState<Status>('any');
  const [cat, setCat] = useState('all');
  const [sort, setSort] = useState<'new' | 'old'>('new');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [active, setActive] = useState(-1);
  const [shown, setShown] = useState(PAGE);
  const [noteFor, setNoteFor] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const setQ = setQState;
  const needle = q.trim().toLowerCase();

  const counts = useMemo(() => {
    const l = list ?? [];
    return {
      inbox: l.filter((m) => !m.archived).length,
      starred: l.filter((m) => m.starred).length,
      archived: l.filter((m) => m.archived).length,
      all: l.length,
    };
  }, [list]);

  const catCounts = useMemo(() => {
    const c: Record<string, number> = {};
    (list ?? []).forEach((m) => { const k = m.category ?? 'General'; c[k] = (c[k] ?? 0) + 1; });
    return c;
  }, [list]);

  const filtered = useMemo(() => {
    const out = (list ?? []).filter((m) => {
      if (folder === 'inbox' && m.archived) return false;
      if (folder === 'archived' && !m.archived) return false;
      if (folder === 'starred' && !m.starred) return false;
      if (cat !== 'all' && (m.category ?? 'General') !== cat) return false;
      if (status === 'unread' && m.read) return false;
      if (status === 'read' && !m.read) return false;
      if (status === 'replied' && !m.replied) return false;
      if (status === 'pending' && m.replied) return false;
      if (!needle) return true;
      return [m.name, m.email, m.subject, m.message, m.note].some((v) => (v ?? '').toLowerCase().includes(needle));
    });
    return sort === 'old' ? out.reverse() : out;
  }, [list, folder, cat, status, needle, sort]);
  const visible = filtered.slice(0, shown);

  // Selection only ever contains messages that are still visible
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

  const patchMany = (ms: Message[], patch: Parameters<typeof updateMessages>[1], ok: string) =>
    run(() => updateMessages(ms.map((m) => m.id), patch), ok);

  const removeMany = async (ms: Message[], origin?: HTMLElement | null) => {
    if (!ms.length) return;
    const one = ms.length === 1;
    const ok = await confirm({
      title: one ? 'Delete this message?' : `Delete ${ms.length} messages?`,
      text: one ? `The message from ${ms[0].name} will be permanently deleted. This cannot be undone.` : `${ms.length} messages will be permanently deleted. This cannot be undone. Archive keeps them out of the inbox without deleting.`,
      confirmLabel: 'Delete', danger: true, origin,
    });
    if (!ok) return;
    await run(async () => {
      await deleteMessages(ms.map((m) => m.id));
      setSelected(new Set());
      logAction('message.delete', one ? `Deleted message from ${ms[0].name} <${ms[0].email}>` : `Deleted ${ms.length} messages`);
    }, one ? 'Message deleted' : `${ms.length} messages deleted`, 'Delete failed');
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
  const stateRef = useRef({ visible, active, selected });
  stateRef.current = { visible, active, selected };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable="true"], .dd')) return;
      if (document.querySelector('.modal')) return; // a dialog is open
      const { visible: vis, active: act } = stateRef.current;
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
          else if (e.key === '#') { e.preventDefault(); removeMany([cur]); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modal, reply]);

  return (
    <section aria-labelledby="msgTitle">
      <div className="admin-head">
        <h1 id="msgTitle">Messages {list && <span className="count-pill">{(list ?? []).filter((m) => !m.read && !m.archived).length} unread</span>}</h1>
        <div className="admin-head-actions">
          <span className="live-dot mono" title="Updates arrive automatically"><span aria-hidden="true" />Live</span>
          <button type="button" className="btn btn-ghost" onClick={(e) => modal.open(<ShortcutsHelp />, { narrow: true, origin: e.currentTarget })}><Icon id="keyboard" /><span>Shortcuts</span></button>
          <button type="button" className="btn btn-ghost" onClick={(e) => {
            const unread = (list ?? []).filter((m) => !m.read && !m.archived);
            if (!unread.length) { toast('info', 'Nothing to mark', 'All inbox messages are already read.'); return; }
            const origin = e.currentTarget;
            confirm({ title: 'Mark all as read?', text: `${unread.length} unread message${unread.length === 1 ? '' : 's'} will be marked as read.`, confirmLabel: 'Mark all read', origin })
              .then((ok) => { if (ok) patchMany(unread, { read: true }, 'All messages marked as read'); });
          }}><Icon id="check" /><span>Mark all read</span></button>
        </div>
      </div>

      <div className="folder-tabs" role="tablist" aria-label="Folders">
        {FOLDERS.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={folder === id} className={`folder-tab${folder === id ? ' is-active' : ''}`} onClick={() => setFolder(id)}>
            {id === 'starred' && <Icon id="star" />}{id === 'archived' && <Icon id="archive" />}{label}<span className="folder-count">{counts[id]}</span>
          </button>
        ))}
      </div>

      <div className="msg-toolbar glass" role="search">
        <label className="search">
          <Icon id="search" />
          <span className="visually-hidden">Search messages</span>
          <input ref={searchRef} type="search" placeholder="Search name, email, text or notes   ( / )" value={q}
            onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') (e.target as HTMLInputElement).blur(); }} />
        </label>
        <Select label="Category" value={cat} onChange={setCat}
          options={[{ value: 'all', label: 'All categories', hint: String(list?.length ?? '') },
            ...CATEGORIES.map((c) => ({ value: c as string, label: c, hint: String(catCounts[c] ?? 0) }))]} />
        <Select<Status> label="Status" value={status} onChange={setStatus}
          options={[{ value: 'any', label: 'Any status' }, { value: 'unread', label: 'Unread' }, { value: 'read', label: 'Read' },
            { value: 'pending', label: 'Needs reply' }, { value: 'replied', label: 'Replied' }]} />
        <Select<'new' | 'old'> label="Sort" value={sort} onChange={setSort}
          options={[{ value: 'new', label: 'Newest first' }, { value: 'old', label: 'Oldest first' }]} />
      </div>

      <div className={`bulk-bar${sel.length ? ' is-on' : ''}`} role="toolbar" aria-label="Bulk actions">
        <label className="check-row">
          <input type="checkbox" checked={allChecked} disabled={!visible.length}
            ref={(el) => { if (el) el.indeterminate = !allChecked && visible.some((m) => selected.has(m.id)); }}
            onChange={() => setSelected(allChecked ? new Set() : new Set(visible.map((m) => m.id)))} />
          <span>{sel.length ? `${sel.length} selected` : 'Select all'}</span>
        </label>
        {sel.length > 0 && (
          <div className="bulk-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => patchMany(sel, { read: true }, `${sel.length} marked read`)}><Icon id="check" /><span>Read</span></button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => patchMany(sel, { read: false }, `${sel.length} marked unread`)}><Icon id="mail" /><span>Unread</span></button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => patchMany(sel, { starred: !sel.every((m) => m.starred) }, '')}><Icon id="star" /><span>{sel.every((m) => m.starred) ? 'Unstar' : 'Star'}</span></button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { const arch = !sel.every((m) => m.archived); patchMany(sel, { archived: arch }, arch ? `${sel.length} archived` : `${sel.length} moved to inbox`); setSelected(new Set()); }}>
              <Icon id="archive" /><span>{sel.every((m) => m.archived) ? 'Unarchive' : 'Archive'}</span>
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={exportSel}><Icon id="download" /><span>CSV</span></button>
            <button type="button" className="btn btn-ghost btn-sm btn-danger-ghost" onClick={(e) => removeMany(sel, e.currentTarget)}><Icon id="trash" /><span>Delete</span></button>
          </div>
        )}
      </div>

      {error && <p className="panel-error">{error}</p>}
      <p className="muted" aria-live="polite">{list ? `${filtered.length} of ${list.length} messages` : 'Loading…'}</p>
      <ul className="msg-list" ref={listRef}>
        {visible.map((m, i) => (
          <li key={m.id} tabIndex={-1} onFocus={() => setActive(i)}
            className={`msg glass${m.read ? '' : ' is-unread'}${i === active ? ' is-active' : ''}${selected.has(m.id) ? ' is-selected' : ''}`}>
            <div className="msg-head">
              <div className="msg-who">
                <input type="checkbox" className="msg-check" checked={selected.has(m.id)} onChange={() => toggleSel(m.id)} aria-label={`Select message from ${m.name}`} />
                <button type="button" className={`star-btn${m.starred ? ' is-on' : ''}`} aria-pressed={!!m.starred} aria-label={m.starred ? 'Unstar' : 'Star'}
                  onClick={() => patchMany([m], { starred: !m.starred }, '')}><Icon id="star" /></button>
                <div>
                  <h2 className="msg-name"><Highlight text={m.name} needle={needle} />
                    {!m.read && <span className="badge-unread">Unread</span>}
                    {m.replied && <span className="badge-replied">Replied</span>}
                    {m.archived && <span className="badge-archived">Archived</span>}
                  </h2>
                  <span className="msg-email-row">
                    <a className="msg-email mono" href={`mailto:${m.email}`}><Highlight text={m.email} needle={needle} /></a>
                    <button type="button" className="copy-btn" aria-label={`Copy ${m.email}`} onClick={() => navigator.clipboard?.writeText(m.email).then(() => toast('success', 'Email copied')).catch(() => {})}><Icon id="copy" /></button>
                  </span>
                </div>
              </div>
              <div className="msg-meta"><span className="chip">{m.category ?? 'General'}</span><time className="mono">{msgDate(m)?.toLocaleString() ?? ''}</time></div>
            </div>
            {m.subject && <p className="msg-subject"><Highlight text={m.subject} needle={needle} /></p>}
            <p className="msg-text"><Highlight text={m.message} needle={needle} /></p>
            {noteFor === m.id ? <NoteEditor m={m} onDone={() => setNoteFor('')} />
              : m.note ? <button type="button" className="msg-note" onClick={() => setNoteFor(m.id)}><Icon id="note" /><span><Highlight text={m.note} needle={needle} /></span></button> : null}
            <div className="msg-actions">
              <button type="button" className="btn btn-primary btn-sm" onClick={(e) => reply(m, e.currentTarget)} aria-haspopup="dialog"><Icon id="spark" /><span>{m.replied ? 'AI Reply again' : 'AI Reply'}</span></button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => patchMany([m], { read: !m.read }, '')}><Icon id="check" /><span>Mark {m.read ? 'unread' : 'read'}</span></button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => patchMany([m], { archived: !m.archived }, m.archived ? 'Moved to inbox' : 'Archived')}><Icon id="archive" /><span>{m.archived ? 'Unarchive' : 'Archive'}</span></button>
              {noteFor !== m.id && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setNoteFor(m.id)}><Icon id="note" /><span>{m.note ? 'Edit note' : 'Note'}</span></button>}
              <button type="button" className="btn btn-ghost btn-sm btn-danger-ghost" onClick={(e) => removeMany([m], e.currentTarget)} aria-label={`Delete message from ${m.name}`}><Icon id="trash" /><span>Delete</span></button>
            </div>
          </li>
        ))}
      </ul>
      {filtered.length > shown && (
        <div className="load-more"><button type="button" className="btn btn-ghost" onClick={() => setShown((n) => n + PAGE)}>Show {Math.min(PAGE, filtered.length - shown)} more</button></div>
      )}
      {list && filtered.length === 0 && (
        <p className="empty-note">{folder === 'inbox' && !needle && status === 'any' && cat === 'all' ? 'Inbox zero. Nothing waiting for you.' : 'No messages match these filters.'}</p>
      )}
    </section>
  );
}
