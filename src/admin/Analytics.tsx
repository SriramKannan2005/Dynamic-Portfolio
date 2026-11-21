import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Chart, LineController, LineElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip, Legend,
  DoughnutController, ArcElement, BarController, BarElement, type ChartConfiguration,
} from 'chart.js';
import { Icon } from '../shared/Icon';
import { content, projects } from '../site/content';
import { countBy, dayKey, fetchAnalytics, msgDate, CATEGORIES, type AnalyticsData } from './api';
import { fetchRange, delta, type RangeData, type RangeDays, type Kpis } from './analyticsData';
import { useInbox } from './inbox';
import { useToast } from './feedback';
import { download, stamp } from './Export';

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip, Legend, DoughnutController, ArcElement, BarController, BarElement);

export const PALETTE = ['#818cf8', '#22d3ee', '#a78bfa', '#f472b6', '#34d399', '#fbbf24'];

export function useThemeName() {
  const [t, setT] = useState(() => document.documentElement.getAttribute('data-theme') ?? 'dark');
  useEffect(() => {
    const on = (e: Event) => setT((e as CustomEvent<string>).detail);
    window.addEventListener('sk-theme', on);
    return () => window.removeEventListener('sk-theme', on);
  }, []);
  return t;
}

export function ChartCanvas({ config, label, height }: { config: ChartConfiguration; label: string; height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const chart = new Chart(ref.current, config);
    return () => chart.destroy();
  }, [config]);
  return <div className="chart-box" style={height ? { height } : undefined}><canvas ref={ref} role="img" aria-label={label} /></div>;
}

export function Delta({ cur, prev }: { cur: number; prev: number }) {
  const d = delta(cur, prev);
  if (d === null) return <span className="delta is-new">new</span>;
  if (d === 0) return <span className="delta">±0%</span>;
  return <span className={`delta ${d > 0 ? 'is-up' : 'is-down'}`}>{d > 0 ? '▲' : '▼'} {Math.abs(d)}%</span>;
}

const RANGES: RangeDays[] = [7, 30, 90];
const why = (reason: unknown) => {
  const err = reason as { code?: string; message?: string };
  return err?.code === 'permission-denied'
    ? 'Blocked by the Firestore rules currently deployed. Deploy the new firestore.rules to enable this.'
    : err?.message || 'Could not load.';
};

function TopList({ rows, empty, label }: { rows: [string, number][]; empty: string; label: string }) {
  const max = Math.max(1, ...rows.map(([, v]) => v));
  if (!rows.length) return <p className="muted">{empty}</p>;
  return (
    <ul className="toplist" aria-label={label}>
      {rows.map(([k, v]) => (
        <li key={k}><span className="toplist-bar" style={{ width: `${(v / max) * 100}%` }} aria-hidden="true" /><span className="toplist-k">{k}</span><b>{v}</b></li>
      ))}
    </ul>
  );
}

export function Analytics() {
  const toast = useToast();
  const theme = useThemeName();
  const { list: messages } = useInbox();
  const [range, setRange] = useState<RangeDays>(() => {
    const v = Number(sessionStorage.getItem('sk-admin-range'));
    return (RANGES as number[]).includes(v) ? (v as RangeDays) : 30;
  });
  const [data, setData] = useState<RangeData | null>(null);
  const [totals, setTotals] = useState<AnalyticsData | null>(null);
  const [allLikes, setAllLikes] = useState<Record<string, number>>({});
  const [allViews, setAllViews] = useState<Record<string, number>>({});
  const [allDl, setAllDl] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<Partial<Record<'range' | 'totals' | 'projects' | 'resumes', string>>>({});

  const load = useCallback(async (r: RangeDays) => {
    setLoading(true);
    setErrors({});
    const failed: string[] = [];
    const track = <T,>(p: Promise<T>, ok: (v: T) => void, key: 'range' | 'totals' | 'projects' | 'resumes') =>
      p.then(ok).catch((e) => { failed.push(key); setErrors((prev) => ({ ...prev, [key]: prev[key] ?? why(e) })); });
    const ids = projects.map((p) => p.id);
    await Promise.all([
      track(fetchRange(r), (d) => { setData(d); if (d.failed.length) setErrors((prev) => ({ ...prev, range: `Some sources were refused: ${d.failed.join(', ')}. Deploy the new firestore.rules to include them.` })); }, 'range'),
      track(fetchAnalytics(), setTotals, 'totals'),
      track(countBy('projectLikes', 'projectId', ids), setAllLikes, 'projects'),
      track(countBy('projectViews', 'projectId', ids), setAllViews, 'projects'),
      track(countBy('resumeDownloads', 'resumeId', content.resumes.map((x) => x.id)), setAllDl, 'resumes'),
    ]);
    const uniq = [...new Set(failed)];
    if (uniq.length) toast('error', `Some analytics couldn't load: ${uniq.join(', ')}`, 'Details are shown in each panel.');
    setLoading(false);
  }, [toast]);
  useEffect(() => { load(range); try { sessionStorage.setItem('sk-admin-range', String(range)); } catch { /* ignore */ } }, [load, range]);

  // Messages per day by category, from the live inbox (no extra reads)
  const msgStats = useMemo(() => {
    if (!messages || !data) return null;
    const keys = new Set(data.days.map((d) => d.key));
    const first = new Date(); first.setHours(0, 0, 0, 0); first.setDate(first.getDate() - (range - 1));
    const prevFirst = new Date(first); prevFirst.setDate(prevFirst.getDate() - range);
    const grid: Record<string, Record<string, number>> = {};
    let cur = 0; let prev = 0;
    for (const m of messages) {
      const t = msgDate(m);
      if (!t) continue;
      if (t >= first) {
        cur++;
        const k = dayKey(t);
        if (!keys.has(k)) continue;
        const c = m.category ?? 'General';
        grid[c] ??= {};
        grid[c][k] = (grid[c][k] ?? 0) + 1;
      } else if (t >= prevFirst) prev++;
    }
    return { grid, cur, prev };
  }, [messages, data, range]);

  const ink = theme === 'light' ? '#3d3d55' : '#b4b4cc';
  const grid = theme === 'light' ? 'rgba(79,70,229,.1)' : 'rgba(148,152,255,.12)';
  const axes = { x: { ticks: { color: ink, maxRotation: 0, autoSkipPadding: 12 }, grid: { color: grid } }, y: { beginAtZero: true, ticks: { color: ink, precision: 0 }, grid: { color: grid } } };

  const charts = useMemo(() => {
    if (!data) return null;
    const trend: ChartConfiguration = {
      type: 'line',
      data: {
        labels: data.days.map((d) => d.label),
        datasets: [
          { label: 'Page views', data: data.days.map((d) => d.views), borderColor: '#818cf8', backgroundColor: 'rgba(129,140,248,.18)', fill: true, tension: 0.35, pointRadius: range > 30 ? 0 : 3 },
          { label: 'Unique visitors', data: data.days.map((d) => d.visitors), borderColor: '#22d3ee', backgroundColor: 'transparent', tension: 0.35, pointRadius: range > 30 ? 0 : 3 },
        ],
      },
      options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { labels: { color: ink } } }, scales: axes },
    };
    const hours: ChartConfiguration = {
      type: 'bar',
      data: { labels: data.hours.map((_, h) => `${String(h).padStart(2, '0')}`), datasets: [{ label: 'Views by hour (your time zone)', data: data.hours, backgroundColor: '#a78bfa', borderRadius: 4 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: axes },
    };
    const devices: ChartConfiguration = {
      type: 'doughnut',
      data: { labels: data.devices.map(([k]) => k), datasets: [{ data: data.devices.map(([, v]) => v), backgroundColor: PALETTE, borderWidth: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: ink } } } },
    };
    return { trend, hours, devices };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, theme, range]);

  const msgChart = useMemo<ChartConfiguration | null>(() => {
    if (!data || !msgStats) return null;
    const cats = CATEGORIES.filter((c) => msgStats.grid[c]);
    return {
      type: 'bar',
      data: {
        labels: data.days.map((d) => d.label),
        datasets: cats.map((c, i) => ({ label: c, data: data.days.map((d) => msgStats.grid[c]?.[d.key] ?? 0), backgroundColor: PALETTE[i % PALETTE.length], borderRadius: 3, stack: 'm' })),
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: ink } } }, scales: { x: { ...axes.x, stacked: true }, y: { ...axes.y, stacked: true } } },
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, msgStats, theme]);

  const kpi = (label: string, k: keyof Kpis) => ({ label, cur: data?.cur[k], prev: data?.prev[k] ?? 0 });
  const kpis = [
    kpi('Page views', 'views'),
    kpi('Unique visitors', 'visitors'),
    kpi('New visitors', 'newVisitors'),
    { label: 'Messages', cur: msgStats?.cur, prev: msgStats?.prev ?? 0 },
    kpi('Resume downloads', 'downloads'),
    kpi('Project likes', 'likes'),
  ];

  const projRows = projects.map((p) => ({
    id: p.id, title: p.title,
    likes: data?.projects[p.id]?.likes ?? 0, views: data?.projects[p.id]?.views ?? 0,
    allLikes: allLikes[p.id] ?? 0, allViews: allViews[p.id] ?? 0,
  })).sort((a, b) => b.views - a.views || b.likes - a.likes || b.allViews - a.allViews);

  const exportCsv = () => {
    if (!data) return;
    const lines = ['Date,Page views,Unique visitors', ...data.days.map((d) => `${d.key},${d.views},${d.visitors}`)];
    download(`analytics-${range}d-${stamp()}.csv`, lines.join('\r\n'), 'text/csv;charset=utf-8');
  };

  return (
    <section aria-labelledby="anTitle">
      <p className="print-only print-head">Portfolio analytics · last {range} days · generated {new Date().toLocaleString()}</p>
      <div className="admin-head">
        <h1 id="anTitle">Analytics</h1>
        <div className="admin-head-actions">
          <div className="seg" role="group" aria-label="Date range">
            {RANGES.map((r) => <button key={r} type="button" className={`seg-btn${range === r ? ' is-active' : ''}`} aria-pressed={range === r} onClick={() => setRange(r)}>{r} days</button>)}
          </div>
          <button type="button" className="btn btn-ghost" onClick={exportCsv} disabled={!data}><Icon id="download" /><span>CSV</span></button>
          <button type="button" className="btn btn-ghost" onClick={() => window.print()} disabled={!data} title="Print or save as PDF"><Icon id="printer" /><span>Report</span></button>
          <button type="button" className="btn btn-ghost" onClick={() => load(range)} disabled={loading}><Icon id="refresh" /><span>{loading ? 'Loading…' : 'Refresh'}</span></button>
        </div>
      </div>
      {errors.range && <p className="panel-error">{errors.range}</p>}
      <ul className="kpis kpis-6">
        {kpis.map((k) => (
          <li key={k.label} className="kpi glass">
            <span className="kpi-label">{k.label}</span>
            <b className="kpi-value">{k.cur ?? '–'}</b>
            {k.cur != null && <span className="kpi-sub"><Delta cur={k.cur} prev={k.prev} /> vs previous {range} days</span>}
          </li>
        ))}
      </ul>
      <p className="muted alltime">
        All time: <b>{totals?.totalViews ?? '–'}</b> page views · <b>{totals?.totalMessages ?? '–'}</b> messages
        {errors.totals && <span className="panel-error"> ({errors.totals})</span>}
      </p>

      <div className="chart-grid">
        <div className="panel glass"><h2>Traffic, last {range} days</h2>{charts ? <ChartCanvas config={charts.trend} label={`Line chart of page views and unique visitors over the last ${range} days`} /> : <p className="muted">{errors.range ?? 'Loading…'}</p>}</div>
        <div className="panel glass"><h2>Devices (new visitors)</h2>
          {charts && data?.devices.length ? <ChartCanvas config={charts.devices} label="Doughnut chart of new visitors by device type" /> : <p className="muted">{loading ? 'Loading…' : 'No new visitors in this range.'}</p>}
        </div>
      </div>
      <div className="chart-grid chart-grid-even">
        <div className="panel glass"><h2>Messages by category</h2>
          {msgChart && msgStats?.cur ? <ChartCanvas config={msgChart} label={`Stacked bar chart of messages per day by category over the last ${range} days`} /> : <p className="muted">{messages ? `No messages in the last ${range} days.` : 'Loading…'}</p>}
        </div>
        <div className="panel glass"><h2>Busiest hours</h2>
          {charts && data?.cur.views ? <ChartCanvas config={charts.hours} label="Bar chart of page views by hour of day" /> : <p className="muted">{loading ? 'Loading…' : 'No views in this range.'}</p>}
        </div>
      </div>
      <div className="chart-grid chart-grid-3">
        <div className="panel glass"><h2>Top pages</h2><TopList rows={data?.topPaths ?? []} empty={loading ? 'Loading…' : 'No data yet.'} label="Top pages by views" /></div>
        <div className="panel glass"><h2>Top referrers</h2><TopList rows={data?.topReferrers ?? []} empty={loading ? 'Loading…' : 'No data yet.'} label="Top referrers by views" /></div>
        <div className="panel glass"><h2>Visitor languages</h2><TopList rows={data?.languages ?? []} empty={loading ? 'Loading…' : 'No new visitors.'} label="New visitors by browser language" /></div>
      </div>
      <div className="chart-grid">
        <div className="panel glass">
          <h2>Projects</h2>
          {errors.projects && <p className="panel-error">{errors.projects}</p>}
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th scope="col">Project</th><th scope="col">Views ({range}d)</th><th scope="col">Likes ({range}d)</th><th scope="col">Views (all)</th><th scope="col">Likes (all)</th></tr></thead>
              <tbody>{projRows.map((r) => <tr key={r.id}><td>{r.title}</td><td>{r.views}</td><td>{r.likes}</td><td>{r.allViews}</td><td>{r.allLikes}</td></tr>)}</tbody>
            </table>
          </div>
        </div>
        <div className="panel glass">
          <h2>Resume downloads</h2>
          {errors.resumes && <p className="panel-error">{errors.resumes}</p>}
          <table className="data-table"><thead><tr><th scope="col">Resume</th><th scope="col">{range} days</th><th scope="col">All time</th></tr></thead>
            <tbody>{content.resumes.map((r) => <tr key={r.id}><td>{r.label}</td><td>{data?.downloads[r.id] ?? 0}</td><td>{allDl[r.id] ?? 0}</td></tr>)}</tbody>
          </table>
          <p className="muted small-note">Counts are unique per visitor: one person downloading twice counts once.</p>
        </div>
      </div>
    </section>
  );
}
