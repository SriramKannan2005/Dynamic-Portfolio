import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Chart, LineController, LineElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip, Legend,
  DoughnutController, ArcElement, type ChartConfiguration,
} from 'chart.js';
import { Icon } from '../shared/Icon';
import { content, projects } from '../site/content';
import { countBy, fetchAnalytics, msgDate, type AnalyticsData } from './api';
import { CategoryRing, InsightStrip, TopList, VisitClock, buildInsights, languageName, pageName } from './AnalyticsPanels';
import { LanguageBubbles, ProjectBoard, ResumeShelf, SourceChips } from './AnalyticsBoards';
import { DeviceSplit, KpiTiles, TrafficChart, type KpiTileData } from './AnalyticsHero';
import { fetchRange, delta, type RangeData, type RangeDays, type Kpis } from './analyticsData';
import { useInbox } from './inbox';
import { useToast } from './feedback';
import { download, stamp } from './Export';

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip, Legend, DoughnutController, ArcElement);

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

const RANGES: RangeDays[] = [7, 30, 90, 'all'];
const rangeName = (r: RangeDays) => (r === 'all' ? 'All time' : `${r} days`);
const why = (reason: unknown) => {
  const err = reason as { code?: string; message?: string };
  return err?.code === 'permission-denied'
    ? 'Blocked by the Firestore rules currently deployed. Deploy the new firestore.rules to enable this.'
    : err?.message || 'Could not load.';
};


export function Analytics() {
  const toast = useToast();
  const { list: messages } = useInbox();
  const [range, setRange] = useState<RangeDays>(() => {
    const raw = sessionStorage.getItem('sk-admin-range');
    const v = raw === 'all' ? 'all' : Number(raw);
    return (RANGES as (number | string)[]).includes(v) ? (v as RangeDays) : 30;
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
      track(fetchRange(r), (d) => { setData(d); if (d.failed.length) setErrors((prev) => ({ ...prev, range: d.failedReasons.includes('permission-denied')
        ? `Some sources were refused: ${d.failed.join(', ')}. Deploy the new firestore.rules to include them.`
        : `Some sources couldn't load: ${d.failed.join(', ')} (${d.failedReasons.join(', ')}). Try Refresh.` })); }, 'range'),
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
    const all = range === 'all';
    const first = all ? new Date(0) : new Date(data.start);
    const prevFirst = new Date(first);
    if (!all) prevFirst.setDate(prevFirst.getDate() - range);
    let cur = 0; let prev = 0;
    const byCat = new Map<string, number>();
    const perBucket = new Map<string, number>();
    for (const m of messages) {
      const t = msgDate(m);
      if (!t) continue;
      if (t >= first) {
        cur++;
        const c = m.category ?? 'General';
        byCat.set(c, (byCat.get(c) ?? 0) + 1);
        const k = data.bucketOf(t);
        perBucket.set(k, (perBucket.get(k) ?? 0) + 1);
      } else if (t >= prevFirst) prev++;
    }
    return { cur, prev, cats: [...byCat.entries()].sort((a, b) => b[1] - a[1]), series: data.days.map((d) => perBucket.get(d.key) ?? 0) };
  }, [messages, data, range]);

  const isAll = range === 'all';
  const sinceText = data ? data.start.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const period = isAll ? (sinceText ? `since ${sinceText}` : 'all time') : `last ${range} days`;
  const per = data && data.granularity !== 'day' ? ` (per ${data.granularity})` : '';
  const series = (k: 'views' | 'visitors' | 'newVisitors' | 'downloads' | 'likes') => data?.days.map((d) => d[k]) ?? [];
  const kpi = (key: string, label: string, icon: string, k: keyof Kpis, s: number[], hint?: string): KpiTileData =>
    ({ key, label, icon, value: data?.cur[k], prev: data?.prev[k] ?? 0, series: s, hint });
  const kpis: KpiTileData[] = [
    kpi('views', 'Page views', 'eye', 'views', series('views')),
    kpi('visitors', 'Unique visitors', 'users', 'visitors', series('visitors'), data?.estimated ? 'old-site visits estimated' : undefined),
    kpi('new', 'New visitors', 'spark', 'newVisitors', series('newVisitors')),
    { key: 'messages', label: 'Messages', icon: 'mail', value: msgStats?.cur, prev: msgStats?.prev ?? 0, series: msgStats?.series ?? [] },
    kpi('downloads', 'Resume downloads', 'download', 'downloads', series('downloads')),
    kpi('likes', 'Project likes', 'heart', 'likes', series('likes')),
  ];

  const projRows = projects.map((p) => ({
    id: p.id, title: p.title,
    likes: data?.projects[p.id]?.likes ?? 0, views: data?.projects[p.id]?.views ?? 0,
    allLikes: allLikes[p.id] ?? 0, allViews: allViews[p.id] ?? 0,
  })).sort((a, b) => b.views - a.views || b.likes - a.likes || b.allViews - a.allViews);

  const exportCsv = () => {
    if (!data) return;
    const lines = [`${data.granularity === 'day' ? 'Date' : data.granularity === 'week' ? 'Week starting' : 'Month'},Page views,Unique visitors`, ...data.days.map((d) => `${d.key},${d.views},${d.visitors}`)];
    download(`analytics-${range === 'all' ? 'all-time' : `${range}d`}-${stamp()}.csv`, lines.join('\r\n'), 'text/csv;charset=utf-8');
  };

  return (
    <section aria-labelledby="anTitle">
      <p className="print-only print-head">Portfolio analytics · {period} · generated {new Date().toLocaleString()}</p>
      <div className="admin-head">
        <h1 id="anTitle">Analytics</h1>
        <div className="admin-head-actions">
          <div className="seg" role="group" aria-label="Date range">
            {RANGES.map((r) => <button key={r} type="button" className={`seg-btn${range === r ? ' is-active' : ''}`} aria-pressed={range === r} onClick={() => setRange(r)}>{rangeName(r)}</button>)}
          </div>
          <button type="button" className="btn btn-ghost" onClick={exportCsv} disabled={!data}><Icon id="download" /><span>CSV</span></button>
          <button type="button" className="btn btn-ghost" onClick={() => window.print()} disabled={!data} title="Print or save as PDF"><Icon id="printer" /><span>Report</span></button>
          <button type="button" className="btn btn-ghost" onClick={() => load(range)} disabled={loading}><Icon id="refresh" /><span>{loading ? 'Loading…' : 'Refresh'}</span></button>
        </div>
      </div>
      {errors.range && <p className="panel-error">{errors.range}</p>}
      <KpiTiles items={kpis} compare={isAll ? null : `previous ${range} days`} since={sinceText ? `since ${sinceText}` : 'all records'} />
      <p className="muted alltime">
        All time: <b>{totals?.totalViews ?? '–'}</b> page views · <b>{totals?.totalMessages ?? '–'}</b> messages
        {errors.totals && <span className="panel-error"> ({errors.totals})</span>}
      </p>
      {data && <InsightStrip items={buildInsights(data, msgStats, period)} />}

      <div className="chart-grid">
        <div className="panel glass"><h2>Traffic, {period}{per}</h2>{data ? <TrafficChart points={data.days} unit={data.granularity} /> : <p className="muted">{errors.range ?? 'Loading…'}</p>}</div>
        <div className="panel glass"><h2>Devices (new visitors)</h2>
          {data ? <DeviceSplit rows={data.devices} /> : <p className="muted">{loading ? 'Loading…' : 'No new visitors in this range.'}</p>}
        </div>
      </div>
      <div className="chart-grid chart-grid-even">
        <div className="panel glass"><h2>Messages by category</h2>
          {msgStats ? <CategoryRing counts={msgStats.cats} total={msgStats.cur} empty={`No messages, ${period}.`} /> : <p className="muted">Loading…</p>}
        </div>
        <div className="panel glass"><h2>When people visit</h2>
          {data ? <VisitClock heat={data.heat} /> : <p className="muted">{loading ? 'Loading…' : 'No views in this range.'}</p>}
        </div>
      </div>
      <div className="chart-grid chart-grid-3">
        <div className="panel glass"><h2>Top pages</h2><TopList rows={data?.topPaths ?? []} format={pageName} empty={loading ? 'Loading…' : 'No data yet.'} label="Top pages by views" /></div>
        <div className="panel glass"><h2>Where visitors come from</h2><SourceChips rows={data?.topReferrers ?? []} empty={loading ? 'Loading…' : 'No data yet.'} /></div>
        <div className="panel glass"><h2>Visitor languages</h2><LanguageBubbles rows={data?.languages ?? []} format={languageName} empty={loading ? 'Loading…' : 'No new visitors.'} /></div>
      </div>
      <div className="chart-grid">
        <div className="panel glass">
          <h2>Project leaderboard</h2>
          {errors.projects && <p className="panel-error">{errors.projects}</p>}
          <ProjectBoard rows={projRows} projects={projects} isAll={isAll} rangeLabel={period} />
        </div>
        <div className="panel glass">
          <h2>Resume downloads</h2>
          {errors.resumes && <p className="panel-error">{errors.resumes}</p>}
          <ResumeShelf resumes={content.resumes} range={data?.downloads ?? {}} all={allDl} isAll={isAll} rangeLabel={period} />
        </div>
      </div>
    </section>
  );
}
