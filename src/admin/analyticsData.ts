/**
 * Range analytics. Each source is read once for 2 x range (current + previous period)
 * and bucketed client-side, so "vs previous period" needs no extra queries and only
 * single-field indexes (createdAt / firstSeen / timestamp) are used.
 * A source that fails (e.g. old rules still deployed) is reported in `failed`
 * instead of blanking the page.
 */
import { collection, getDocs, query, where, limit, Timestamp } from 'firebase/firestore';
import { getDb } from '../shared/firebase';
import { dayKey } from './api';

export type RangeDays = 7 | 30 | 90;
export interface Kpis { views: number; visitors: number; newVisitors: number; likes: number; projectViews: number; downloads: number }
export interface RangeData {
  days: { key: string; label: string; views: number; visitors: number }[];
  cur: Kpis;
  prev: Kpis;
  topPaths: [string, number][];
  topReferrers: [string, number][];
  devices: [string, number][];
  languages: [string, number][];
  hours: number[];
  projects: Record<string, { likes: number; views: number }>;
  downloads: Record<string, number>;
  failed: string[];
}

const startOfDay = (offsetDays = 0) => { const t = new Date(); t.setHours(0, 0, 0, 0); t.setDate(t.getDate() - offsetDays); return t; };
const emptyKpis = (): Kpis => ({ views: 0, visitors: 0, newVisitors: 0, likes: 0, projectViews: 0, downloads: 0 });
const top = (m: Map<string, number>, n = 8): [string, number][] => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
const inc = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

export const deviceOf = (screen?: string): string => {
  const w = Number(String(screen ?? '').split('x')[0]);
  if (!w) return 'Unknown';
  return w < 768 ? 'Mobile' : w < 1100 ? 'Tablet' : 'Desktop';
};
export const referrerLabel = (r?: string) => {
  if (!r) return 'Direct / none';
  try { return new URL(r).hostname.replace(/^www\./, ''); } catch { return r.slice(0, 60); }
};

type Row = Record<string, unknown>;
export async function fetchRange(range: RangeDays): Promise<RangeData> {
  const d = await getDb();
  const curStart = startOfDay(range - 1);
  const prevStart = startOfDay(range * 2 - 1);
  const since = Timestamp.fromDate(prevStart);
  const failed: string[] = [];
  const get = (name: string, field: string, cap = 50000) =>
    getDocs(query(collection(d, name), where(field, '>=', since), limit(cap)))
      .then((s) => s.docs.map((x) => ({ _id: x.id, ...x.data() }) as Row))
      .catch(() => { failed.push(name); return [] as Row[]; });

  const [views, legacy, visitors, likes, pviews, downloads] = await Promise.all([
    get('pageViews', 'createdAt'),
    get('analytics', 'timestamp').then((rows) => rows.filter((r) => r.type === 'pageview' || r.type === 'page_view')),
    get('visitors', 'firstSeen'),
    get('projectLikes', 'createdAt'),
    get('projectViews', 'createdAt'),
    get('resumeDownloads', 'createdAt'),
  ]);
  // legacy analytics is optional history; don't report it as a failure
  const fi = failed.indexOf('analytics');
  if (fi >= 0) failed.splice(fi, 1);

  const time = (r: Row, f: string) => (r[f] as Timestamp | undefined)?.toDate?.() ?? null;
  const days = Array.from({ length: range }, (_, i) => {
    const date = startOfDay(range - 1 - i);
    return {
      key: dayKey(date),
      label: date.toLocaleDateString(undefined, range <= 7 ? { weekday: 'short', day: 'numeric' } : { month: 'short', day: 'numeric' }),
      views: 0, visitors: 0, ids: new Set<string>(),
    };
  });
  const byKey = new Map(days.map((x) => [x.key, x]));
  const cur = emptyKpis();
  const prev = emptyKpis();
  const curIds = new Set<string>();
  const prevIds = new Set<string>();
  const paths = new Map<string, number>();
  const refs = new Map<string, number>();
  const hours = Array.from({ length: 24 }, () => 0);

  const viewRows: { t: Date; vid: string; path?: string; ref?: string }[] = [
    ...views.map((r) => ({ t: time(r, 'createdAt')!, vid: String(r.visitorId ?? r._id), path: r.path as string, ref: r.referrer as string })),
    ...legacy.map((r) => ({ t: time(r, 'timestamp')!, vid: `legacy-${r._id}` })),
  ].filter((r) => r.t);
  for (const v of viewRows) {
    if (v.t >= curStart) {
      cur.views++; curIds.add(v.vid);
      hours[v.t.getHours()]++;
      if (v.path) inc(paths, v.path);
      if (v.path !== undefined) inc(refs, referrerLabel(v.ref));
      const b = byKey.get(dayKey(v.t));
      if (b) { b.views++; b.ids.add(v.vid); }
    } else { prev.views++; prevIds.add(v.vid); }
  }
  cur.visitors = curIds.size;
  prev.visitors = prevIds.size;

  const devices = new Map<string, number>();
  const langs = new Map<string, number>();
  for (const r of visitors) {
    const t = time(r, 'firstSeen');
    if (!t) continue;
    if (t >= curStart) {
      cur.newVisitors++;
      inc(devices, deviceOf(r.screen as string));
      inc(langs, String(r.lang || 'unknown').split('-')[0].toLowerCase());
    } else prev.newVisitors++;
  }

  const projects: Record<string, { likes: number; views: number }> = {};
  const bump = (rows: Row[], key: 'likes' | 'views', k: keyof Kpis) => {
    for (const r of rows) {
      const t = time(r, 'createdAt');
      if (!t) continue;
      if (t >= curStart) {
        cur[k]++;
        const id = String(r.projectId ?? '');
        projects[id] ??= { likes: 0, views: 0 };
        projects[id][key]++;
      } else prev[k]++;
    }
  };
  bump(likes, 'likes', 'likes');
  bump(pviews, 'views', 'projectViews');

  const dl: Record<string, number> = {};
  for (const r of downloads) {
    const t = time(r, 'createdAt');
    if (!t) continue;
    if (t >= curStart) { cur.downloads++; const id = String(r.resumeId ?? ''); dl[id] = (dl[id] ?? 0) + 1; } else prev.downloads++;
  }

  return {
    days: days.map(({ ids, ...rest }) => ({ ...rest, visitors: ids.size })),
    cur, prev,
    topPaths: top(paths), topReferrers: top(refs), devices: top(devices), languages: top(langs, 6),
    hours, projects, downloads: dl, failed,
  };
}

/** Percentage change, or null when there is no previous data to compare with. */
export const delta = (cur: number, prev: number): number | null => (prev === 0 ? (cur === 0 ? 0 : null) : Math.round(((cur - prev) / prev) * 100));
