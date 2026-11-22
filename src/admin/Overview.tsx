/** Admin home: what needs attention now, recent activity and quick actions. */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../shared/Icon';
import { useModal } from '../shared/Modal';
import { fetchAudit, msgDate, updateMessages, type AuditEntry, type Message } from './api';
import { fetchRange, type RangeData } from './analyticsData';
import { KpiTiles, type KpiTileData } from './AnalyticsHero';
import { catVar, hue, initials } from './look';
import { useInbox } from './inbox';
import { ReplyModal } from './ReplyModal';
import { syncNow } from './Export';
import { useToast } from './feedback';
import { followUpState, isLive, today as todayKey } from './Messages';

const ago = (t: Date) => {
  const s = Math.round((Date.now() - t.getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const d = Math.floor(s / 86400);
  return d < 30 ? `${d} d ago` : t.toLocaleDateString();
};
const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };
const ACTION_LABEL: Record<string, string> = {
  'auth.signin': 'Signed in', 'message.delete': 'Deleted', 'messages.export': 'Exported', 'sheets.sync': 'Synced',
  'reply.send': 'Replied', 'reply.gmail': 'Replied (Gmail)', 'content.save': 'Site content', 'content.reset': 'Site content', 'templates.save': 'Templates',
  'message.purge': 'Trash emptied', 'sender.block': 'Blocked', 'sender.unblock': 'Unblocked', 'backup.download': 'Backup', 'contacts.export': 'Exported',
};
export const actionLabel = (a: string) => ACTION_LABEL[a] ?? a;

export function Overview({ name }: { name: string }) {
  const toast = useToast();
  const modal = useModal();
  const { list } = useInbox();
  const [week, setWeek] = useState<RangeData | null>(null);
  const [audit, setAudit] = useState<AuditEntry[] | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    fetchRange(7).then(setWeek).catch(() => setWeek(null));
    fetchAudit(12).then(setAudit).catch(() => setAudit([]));
  }, []);

  const live = (list ?? []).filter(isLive);
  const unread = live.filter((m) => !m.read && !m.archived);
  const pending = live.filter((m) => !m.replied && !m.archived);
  const due = live.filter((m) => followUpState(m) === 'due').sort((a, b) => String(a.followUpAt).localeCompare(String(b.followUpAt)));
  const doneFollowUp = (m: Message) => updateMessages([m.id], { followUpAt: null })
    .then(() => toast('success', 'Reminder done', m.name)).catch((e) => toast('error', 'Update failed', (e as Error).message));
  const today = week?.days[week.days.length - 1];

  const feed = useMemo(() => {
    const items: { t: Date; icon: string; text: string; sub?: string; msg?: Message }[] = [];
    (list ?? []).filter(isLive).slice(0, 10).forEach((m) => { const t = msgDate(m); if (t) items.push({ t, icon: 'mail', text: `Message from ${m.name}`, sub: m.subject || m.message.slice(0, 80), msg: m }); });
    (audit ?? []).forEach((a) => { const t = a.at?.toDate?.(); if (t) items.push({ t, icon: a.action.startsWith('reply') ? 'reply' : a.action.includes('delete') ? 'trash' : 'activity', text: actionLabel(a.action), sub: a.detail }); });
    return items.sort((a, b) => +b.t - +a.t).slice(0, 12);
  }, [list, audit]);

  // Inbox health: share of live, non-archived messages that already have a reply
  const answerable = live.filter((m) => !m.archived);
  const repliedShare = answerable.length ? Math.round(((answerable.length - pending.length) / answerable.length) * 100) : 100;
  const views7 = week?.cur.views ?? 0;
  const summary = !list ? 'Loading your inbox…'
    : unread.length ? `${unread.length} unread message${unread.length === 1 ? '' : 's'} waiting${due.length ? ` and ${due.length} follow-up${due.length === 1 ? '' : 's'} due` : ''}.`
    : due.length ? `${due.length} follow-up${due.length === 1 ? '' : 's'} due today.`
    : 'Inbox zero. Nothing needs you right now.';
  const tiles: KpiTileData[] = [
    { key: 'messages', label: 'Unread', icon: 'mail', value: list ? unread.length : undefined, prev: 0, series: [], hint: 'in the inbox' },
    { key: 'downloads', label: 'Waiting for a reply', icon: 'reply', value: list ? pending.length : undefined, prev: 0, series: [], hint: 'not archived' },
    { key: 'views', label: 'Views today', icon: 'eye', value: today?.views, prev: 0, series: week?.days.map((d) => d.views) ?? [], hint: today ? `${today.visitors} unique visitors` : ' ' },
    { key: 'visitors', label: 'Visitors, 7 days', icon: 'users', value: week?.cur.visitors, prev: week?.prev.visitors ?? 0, series: week?.days.map((d) => d.visitors) ?? [] },
  ];

  const reply = (m: Message, origin: HTMLElement) => {
    if (!m.read) updateMessages([m.id], { read: true }).catch(() => {});
    modal.open(<ReplyModal message={m} onReplied={() => {}} />, { origin });
  };
  const doSync = async () => {
    setSyncing(true);
    try { const r = await syncNow(list ?? undefined); toast('success', 'Synced to Google Sheets', `${r.count} rows`); }
    catch (e) { toast('error', 'Sync failed', (e as Error).message); }
    finally { setSyncing(false); }
  };

  const first = name.split(/[\s@.]/)[0];
  return (
    <section aria-labelledby="ovTitle">
      <div className="ov-hero">
        <div className="ov-hero-text">
          <p className="ov-date mono">{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
          <h1 id="ovTitle">{greeting()}{first ? <>, <span className="grad-text">{first.charAt(0).toUpperCase()}{first.slice(1)}</span></> : ''}</h1>
          <p className="ov-summary">{summary}</p>
          <p className="ov-hint muted">{week ? `${views7.toLocaleString()} portfolio views this week · ` : ''}press <kbd>Ctrl</kbd> + <kbd>K</kbd> for commands</p>
        </div>
        <div className="ov-health" role="img" aria-label={`${repliedShare}% of messages replied`}>
          <svg viewBox="0 0 120 120" aria-hidden="true">
            <defs><linearGradient id="ovRing" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="var(--cat-2)" /><stop offset="1" stopColor="var(--cat-1)" /></linearGradient></defs>
            <circle cx="60" cy="60" r="50" className="ov-health-track" />
            <circle cx="60" cy="60" r="50" className="ov-health-bar" strokeDasharray={`${(repliedShare / 100) * 314.16} 314.16`} transform="rotate(-90 60 60)" />
          </svg>
          <span className="ov-health-v"><b>{list ? `${repliedShare}%` : '–'}</b><small>replied</small></span>
        </div>
      </div>

      <KpiTiles items={tiles} compare={null} since="" />

      <div className="chart-grid">
        <div className="panel glass">
          <div className="panel-head"><h2><Icon id="reply" /> Needs a reply {list && pending.length > 0 && <span className="count-pill">{pending.length}</span>}</h2><Link to="/admin/messages" className="panel-link">All messages →</Link></div>
          {!list ? <p className="muted">Loading…</p> : pending.length === 0 ? (
            <div className="ov-zero"><span aria-hidden="true"><Icon id="check" /></span><b>All caught up</b><p className="muted">Every message has a reply.</p></div>
          ) : (
            <ul className="ov-queue">
              {pending.slice(0, 5).map((m) => (
                <li key={m.id} className={m.read ? '' : 'is-unread'} style={{ '--c': catVar(m.category) } as React.CSSProperties}>
                  <span className="avatar" aria-hidden="true" style={{ '--h': hue(m.email) } as React.CSSProperties}>{initials(m.name)}</span>
                  <div className="ov-queue-main">
                    <p className="ov-queue-top"><b>{m.name}</b><span className="cat-tag">{m.category ?? 'General'}</span><time className="mono muted">{msgDate(m) ? ago(msgDate(m)!) : ''}</time></p>
                    <p className="ov-queue-text">{(m.subject ? `${m.subject}: ` : '') + m.message.slice(0, 140)}</p>
                  </div>
                  <button type="button" className="btn btn-primary btn-sm" onClick={(e) => reply(m, e.currentTarget)} aria-haspopup="dialog"><Icon id="spark" /><span>AI Reply</span></button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="panel glass">
          <h2><Icon id="grid" /> Quick actions</h2>
          <div className="ov-actions">
            <Link className="ov-action" to="/admin/messages" style={{ '--c': 'var(--cat-1)' } as React.CSSProperties}><span><Icon id="mail" /></span><b>Inbox</b><small>{list ? `${unread.length} unread` : ' '}</small></Link>
            <Link className="ov-action" to="/admin/content" style={{ '--c': 'var(--cat-3)' } as React.CSSProperties}><span><Icon id="edit" /></span><b>Site content</b><small>edit live</small></Link>
            <Link className="ov-action" to="/admin/analytics" style={{ '--c': 'var(--cat-2)' } as React.CSSProperties}><span><Icon id="chart" /></span><b>Analytics</b><small>{week ? `${views7} views / 7d` : ' '}</small></Link>
            <button type="button" className="ov-action" onClick={doSync} disabled={syncing} style={{ '--c': 'var(--cat-5)' } as React.CSSProperties}><span><Icon id="refresh" /></span><b>{syncing ? 'Syncing…' : 'Sync Sheets'}</b><small>Google Sheets</small></button>
            <a className="ov-action" href="/" target="_blank" rel="noopener" style={{ '--c': 'var(--cat-4)' } as React.CSSProperties}><span><Icon id="ext" /></span><b>Portfolio</b><small>open the site</small></a>
            <Link className="ov-action" to="/admin/settings" style={{ '--c': 'var(--cat-1)' } as React.CSSProperties}><span><Icon id="gear" /></span><b>Settings</b><small>status &amp; backup</small></Link>
          </div>
        </div>
      </div>

      {due.length > 0 && (
        <div className="panel glass panel-due">
          <div className="panel-head"><h2><Icon id="bell" /> Follow-ups due <span className="count-pill">{due.length}</span></h2><Link to="/admin/messages?folder=followup" className="panel-link">All reminders →</Link></div>
          <ul className="queue">
            {due.slice(0, 6).map((m) => (
              <li key={m.id}>
                <div className="queue-main">
                  <b>{m.name}</b> <span className="chip">{m.category ?? 'General'}</span>
                  <p>{m.note ? `Note: ${m.note}` : (m.subject ? `${m.subject}: ` : '') + m.message.slice(0, 120)}</p>
                  <time className="mono muted">{m.followUpAt! < todayKey() ? 'overdue since ' : 'due '}{new Date(`${m.followUpAt}T00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</time>
                </div>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => doneFollowUp(m)}><Icon id="check" /><span>Done</span></button>
                <button type="button" className="btn btn-primary btn-sm" onClick={(e) => reply(m, e.currentTarget)} aria-haspopup="dialog"><Icon id="spark" /><span>AI Reply</span></button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="panel glass">
        <div className="panel-head"><h2>Recent activity</h2><Link to="/admin/settings#activity" className="panel-link">Full activity log →</Link></div>
        {feed.length === 0 ? <p className="muted">{list && audit ? 'Nothing yet.' : 'Loading…'}</p> : (
          <ol className="feed feed-timeline">
            {feed.map((f, i) => (
              <li key={i} data-kind={f.icon}>
                <span className="feed-ic"><Icon id={f.icon} /></span>
                <div><b>{f.text}</b>{f.sub && <p>{f.sub}</p>}</div>
                <time className="mono muted" dateTime={f.t.toISOString()} title={f.t.toLocaleString()}>{ago(f.t)}</time>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
