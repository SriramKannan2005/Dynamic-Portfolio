/** Admin home: what needs attention now, recent activity and quick actions. */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ChartConfiguration } from 'chart.js';
import { Icon } from '../shared/Icon';
import { useModal } from '../shared/Modal';
import { fetchAudit, msgDate, updateMessages, type AuditEntry, type Message } from './api';
import { fetchRange, type RangeData } from './analyticsData';
import { ChartCanvas, Delta, useThemeName } from './Analytics';
import { useInbox } from './inbox';
import { ReplyModal } from './ReplyModal';
import { syncNow } from './Export';
import { useToast } from './feedback';

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
};
export const actionLabel = (a: string) => ACTION_LABEL[a] ?? a;

export function Overview({ name }: { name: string }) {
  const toast = useToast();
  const modal = useModal();
  const theme = useThemeName();
  const { list } = useInbox();
  const [week, setWeek] = useState<RangeData | null>(null);
  const [audit, setAudit] = useState<AuditEntry[] | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    fetchRange(7).then(setWeek).catch(() => setWeek(null));
    fetchAudit(12).then(setAudit).catch(() => setAudit([]));
  }, []);

  const unread = (list ?? []).filter((m) => !m.read && !m.archived);
  const pending = (list ?? []).filter((m) => !m.replied && !m.archived);
  const today = week?.days[week.days.length - 1];

  const feed = useMemo(() => {
    const items: { t: Date; icon: string; text: string; sub?: string; msg?: Message }[] = [];
    (list ?? []).slice(0, 10).forEach((m) => { const t = msgDate(m); if (t) items.push({ t, icon: 'mail', text: `Message from ${m.name}`, sub: m.subject || m.message.slice(0, 80), msg: m }); });
    (audit ?? []).forEach((a) => { const t = a.at?.toDate?.(); if (t) items.push({ t, icon: a.action.startsWith('reply') ? 'reply' : a.action.includes('delete') ? 'trash' : 'activity', text: actionLabel(a.action), sub: a.detail }); });
    return items.sort((a, b) => +b.t - +a.t).slice(0, 12);
  }, [list, audit]);

  const spark = useMemo<ChartConfiguration | null>(() => week && ({
    type: 'line',
    data: { labels: week.days.map((d) => d.label), datasets: [{ label: 'Views', data: week.days.map((d) => d.views), borderColor: '#818cf8', backgroundColor: 'rgba(129,140,248,.18)', fill: true, tension: 0.4, pointRadius: 0 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { display: false, beginAtZero: true } } },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [week, theme]);

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
      <div className="admin-head">
        <div>
          <h1 id="ovTitle">{greeting()}{first ? `, ${first.charAt(0).toUpperCase()}${first.slice(1)}` : ''}</h1>
          <p className="muted">{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · press <kbd>Ctrl</kbd> + <kbd>K</kbd> for commands</p>
        </div>
      </div>

      <ul className="kpis">
        <li className="kpi glass"><Link className="kpi-link" to="/admin/messages"><span className="kpi-label">Unread</span><b className="kpi-value">{list ? unread.length : '–'}</b><span className="kpi-sub">open the inbox →</span></Link></li>
        <li className="kpi glass"><span className="kpi-label">Waiting for a reply</span><b className="kpi-value">{list ? pending.length : '–'}</b><span className="kpi-sub">not archived</span></li>
        <li className="kpi glass"><span className="kpi-label">Views today</span><b className="kpi-value">{today?.views ?? '–'}</b><span className="kpi-sub">{today ? `${today.visitors} unique visitors` : ' '}</span></li>
        <li className="kpi glass kpi-spark">
          <span className="kpi-label">Visitors, 7 days</span><b className="kpi-value">{week?.cur.visitors ?? '–'}</b>
          {week && <span className="kpi-sub"><Delta cur={week.cur.visitors} prev={week.prev.visitors} /> vs last week</span>}
          {spark && <ChartCanvas config={spark} label="Sparkline of page views over the last 7 days" height={44} />}
        </li>
      </ul>

      <div className="chart-grid">
        <div className="panel glass">
          <div className="panel-head"><h2>Needs a reply</h2><Link to="/admin/messages" className="panel-link">All messages →</Link></div>
          {!list ? <p className="muted">Loading…</p> : pending.length === 0 ? <p className="muted">You're all caught up.</p> : (
            <ul className="queue">
              {pending.slice(0, 5).map((m) => (
                <li key={m.id} className={m.read ? '' : 'is-unread'}>
                  <div className="queue-main">
                    <b>{m.name}</b> <span className="chip">{m.category ?? 'General'}</span>
                    <p>{(m.subject ? `${m.subject}: ` : '') + m.message.slice(0, 140)}</p>
                    <time className="mono muted">{msgDate(m) ? ago(msgDate(m)!) : ''}</time>
                  </div>
                  <button type="button" className="btn btn-primary btn-sm" onClick={(e) => reply(m, e.currentTarget)} aria-haspopup="dialog"><Icon id="spark" /><span>AI Reply</span></button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="panel glass">
          <h2>Quick actions</h2>
          <div className="quick-grid">
            <Link className="quick" to="/admin/messages"><Icon id="mail" /><span>Inbox</span></Link>
            <Link className="quick" to="/admin/content"><Icon id="edit" /><span>Edit site content</span></Link>
            <Link className="quick" to="/admin/analytics"><Icon id="chart" /><span>Analytics</span></Link>
            <button type="button" className="quick" onClick={doSync} disabled={syncing}><Icon id="refresh" /><span>{syncing ? 'Syncing…' : 'Sync to Sheets'}</span></button>
            <a className="quick" href="/" target="_blank" rel="noopener"><Icon id="ext" /><span>View portfolio</span></a>
            <Link className="quick" to="/admin/settings"><Icon id="gear" /><span>Settings</span></Link>
          </div>
        </div>
      </div>

      <div className="panel glass">
        <div className="panel-head"><h2>Recent activity</h2><Link to="/admin/settings#activity" className="panel-link">Full activity log →</Link></div>
        {feed.length === 0 ? <p className="muted">{list && audit ? 'Nothing yet.' : 'Loading…'}</p> : (
          <ol className="feed">
            {feed.map((f, i) => (
              <li key={i}>
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
