/**
 * People: everyone who has written in, grouped by email address. Shows how often
 * they've written, when last, whether anything is still unanswered, and whether
 * they're blocked. Built from the live inbox; blocked list read once.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../shared/Icon';
import { Select } from '../shared/Select';
import { blockKey, blockSender, fetchBlocked, logAction, msgDate, unblockSender } from './api';
import { useConfirm, useToast } from './feedback';
import { useInbox } from './inbox';
import { csvCell, download, safeCell, stamp } from './Export';

interface Person {
  email: string;
  name: string;
  count: number;
  unreplied: number;
  first: Date | null;
  last: Date | null;
  categories: string[];
  spam: number;
}
type Sort = 'recent' | 'count' | 'name' | 'waiting';

const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';
const hue = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

export function People() {
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const { list } = useInbox();
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('recent');

  const loadBlocked = useCallback(() => {
    fetchBlocked().then((b) => setBlocked(new Set(b.map((x) => x.id)))).catch(() => setBlocked(new Set()));
  }, []);
  useEffect(() => { loadBlocked(); }, [loadBlocked]);

  const people = useMemo(() => {
    const map = new Map<string, Person>();
    for (const m of list ?? []) {
      if (m.trashedAt) continue;
      const key = blockKey(m.email ?? '');
      if (!key) continue;
      const t = msgDate(m);
      const p = map.get(key) ?? { email: key, name: m.name, count: 0, unreplied: 0, first: null, last: null, categories: [], spam: 0 };
      p.count++;
      if (!m.replied && !m.spam) p.unreplied++;
      if (m.spam) p.spam++;
      if (t && (!p.last || t > p.last)) { p.last = t; p.name = m.name || p.name; }
      if (t && (!p.first || t < p.first)) p.first = t;
      const c = m.category ?? 'General';
      if (!p.categories.includes(c)) p.categories.push(c);
      map.set(key, p);
    }
    return [...map.values()];
  }, [list]);

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    const out = people.filter((p) => !n || p.name.toLowerCase().includes(n) || p.email.includes(n));
    const by: Record<Sort, (a: Person, b: Person) => number> = {
      recent: (a, b) => +(b.last ?? 0) - +(a.last ?? 0),
      count: (a, b) => b.count - a.count || +(b.last ?? 0) - +(a.last ?? 0),
      name: (a, b) => a.name.localeCompare(b.name),
      waiting: (a, b) => b.unreplied - a.unreplied || +(b.last ?? 0) - +(a.last ?? 0),
    };
    return out.sort(by[sort]);
  }, [people, q, sort]);

  const toggleBlock = async (p: Person, origin: HTMLElement) => {
    const isBlocked = blocked.has(p.email);
    if (!isBlocked) {
      const ok = await confirm({ title: `Block ${p.email}?`, text: 'New messages from this address will be refused by the database. Existing messages stay where they are.', confirmLabel: 'Block', danger: true, origin });
      if (!ok) return;
    }
    try {
      if (isBlocked) await unblockSender(p.email); else await blockSender(p.email, 'Blocked from People');
      toast('success', isBlocked ? 'Unblocked' : 'Blocked', p.email);
      loadBlocked();
    } catch (e) {
      toast('error', 'Could not update the block list', (e as { code?: string }).code === 'permission-denied' ? 'Deploy the latest firestore.rules to enable blocking.' : (e as Error).message);
    }
  };

  const exportCsv = () => {
    const head = ['Name', 'Email', 'Messages', 'Awaiting reply', 'First contact', 'Last contact', 'Categories', 'Blocked'];
    const rows = shown.map((p) => [p.name, p.email, String(p.count), String(p.unreplied), p.first?.toLocaleString() ?? '', p.last?.toLocaleString() ?? '', p.categories.join('; '), blocked.has(p.email) ? 'Yes' : 'No']);
    const csv = String.fromCharCode(0xfeff) + [head, ...rows].map((r) => r.map((c) => csvCell(safeCell(c))).join(',')).join(String.fromCharCode(13, 10));
    download(`contacts-${stamp()}.csv`, csv, 'text/csv;charset=utf-8');
    logAction('contacts.export', `Exported ${rows.length} contacts as CSV`);
    toast('success', `Exported ${rows.length} contacts`, 'CSV');
  };

  const repeat = people.filter((p) => p.count > 1).length;
  const waiting = people.filter((p) => p.unreplied > 0).length;

  return (
    <section aria-labelledby="ppTitle">
      <div className="admin-head">
        <h1 id="ppTitle">People {list && <span className="count-pill">{people.length}</span>}</h1>
        <div className="admin-head-actions">
          <button type="button" className="btn btn-ghost" onClick={exportCsv} disabled={!shown.length}><Icon id="download" /><span>Export CSV</span></button>
        </div>
      </div>
      <ul className="kpis">
        <li className="kpi glass"><span className="kpi-label">Contacts</span><b className="kpi-value">{list ? people.length : '–'}</b><span className="kpi-sub">unique email addresses</span></li>
        <li className="kpi glass"><span className="kpi-label">Wrote more than once</span><b className="kpi-value">{list ? repeat : '–'}</b><span className="kpi-sub">returning contacts</span></li>
        <li className="kpi glass"><span className="kpi-label">Waiting on you</span><b className="kpi-value">{list ? waiting : '–'}</b><span className="kpi-sub">have an unanswered message</span></li>
        <li className="kpi glass"><span className="kpi-label">Blocked</span><b className="kpi-value">{blocked.size}</b><span className="kpi-sub">refused by the database</span></li>
      </ul>
      <div className="msg-toolbar glass" role="search">
        <label className="search">
          <Icon id="search" />
          <span className="visually-hidden">Search people</span>
          <input type="search" placeholder="Search name or email" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <Select<Sort> label="Sort" value={sort} onChange={setSort}
          options={[{ value: 'recent', label: 'Most recent' }, { value: 'waiting', label: 'Waiting on you' }, { value: 'count', label: 'Most messages' }, { value: 'name', label: 'Name A–Z' }]} />
      </div>
      <p className="muted" aria-live="polite">{list ? `${shown.length} of ${people.length} people` : 'Loading…'}</p>
      <ul className="people">
        {shown.map((p) => {
          const isBlocked = blocked.has(p.email);
          return (
            <li key={p.email} className={`person glass${isBlocked ? ' is-blocked' : ''}`}>
              <span className="avatar" aria-hidden="true" style={{ '--h': hue(p.email) } as React.CSSProperties}>{initials(p.name)}</span>
              <div className="person-main">
                <h2>{p.name}
                  {p.unreplied > 0 && <span className="badge-unread">{p.unreplied} waiting</span>}
                  {isBlocked && <span className="badge-spam">Blocked</span>}
                </h2>
                <a className="msg-email mono" href={`mailto:${p.email}`}>{p.email}</a>
                <div className="person-tags">{p.categories.map((c) => <span key={c} className="chip">{c}</span>)}</div>
              </div>
              <dl className="person-stats">
                <div><dt>Messages</dt><dd>{p.count}</dd></div>
                <div><dt>Last</dt><dd>{p.last?.toLocaleDateString() ?? '–'}</dd></div>
                <div><dt>First</dt><dd>{p.first?.toLocaleDateString() ?? '–'}</dd></div>
              </dl>
              <div className="person-actions">
                <button type="button" className="btn btn-primary btn-sm" onClick={() => navigate(`/admin/messages?folder=all&q=${encodeURIComponent(p.email)}`)}><Icon id="mail" /><span>Messages</span></button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard?.writeText(p.email).then(() => toast('success', 'Email copied')).catch(() => {})} aria-label={`Copy ${p.email}`}><Icon id="copy" /></button>
                <button type="button" className={`btn btn-ghost btn-sm${isBlocked ? '' : ' btn-danger-ghost'}`} onClick={(e) => toggleBlock(p, e.currentTarget)}>
                  <Icon id={isBlocked ? 'check' : 'ban'} /><span>{isBlocked ? 'Unblock' : 'Block'}</span>
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {list && shown.length === 0 && <p className="empty-note">{people.length ? 'Nobody matches that search.' : 'No messages yet, so no people yet.'}</p>}
    </section>
  );
}
