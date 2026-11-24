/**
 * Range analytics. Each source is read once for 2 x range (current + previous period),
 * or everything for "all time" (no previous period; weekly/monthly buckets when long),
 * and bucketed client-side, so "vs previous period" needs no extra queries and only
 * single-field indexes (createdAt / firstSeen / timestamp) are used.
 * A source that fails (e.g. old rules still deployed) is reported in `failed`
 * instead of blanking the page.
 */
import { collection, getDocs, query, where, orderBy, startAfter, limit, Timestamp, type QueryDocumentSnapshot, type Query, type QuerySnapshot } from 'firebase/firestore';
import { getDb } from '../shared/firebase';
import { demoActive, demoRows } from './demo';
import { dayKey } from './api';

/** A number of days, or every record since the first one. */
export type RangeDays = 7 | 30 | 90 | 'all';
export type Granularity = 'day' | 'week' | 'month';
export interface Kpis { views: number; visitors: number; newVisitors: number; likes: number; projectViews: number; downloads: number }
export interface RangeData {
  /** Chart buckets: days, or weeks / months for long all-time spans */
  days: { key: string; label: string; views: number; visitors: number; newVisitors: number; downloads: number; likes: number }[];
  /** True when the period includes old-site records, whose visitors are estimated */
  estimated: boolean;
  granularity: Granularity;
  /** First moment of the current period (for all-time: the first record) */
  start: Date;
  /** False for all-time: there is no earlier period to compare with */
  hasPrev: boolean;
  bucketOf: (d: Date) => string;
  cur: Kpis;
  prev: Kpis;
  topPaths: [string, number][];
  topReferrers: [string, number][];
  devices: [string, number][];
  languages: [string, number][];
  hours: number[];
  /** Page views by weekday (0 = Monday) x hour, in the admin's time zone */
  heat: number[][];
  projects: Record<string, { likes: number; views: number }>;
  downloads: Record<string, number>;
  failed: string[];
  /** Firestore error codes behind `failed`, e.g. permission-denied */
  failedReasons: string[];
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
  // Demo mode never touches Firebase: rows come from the generated sample data
  const demoMode = demoActive();
  const d = demoMode ? null : await getDb();
  const all = range === 'all';
  const since = all ? Timestamp.fromMillis(0) : Timestamp.fromDate(startOfDay(range * 2 - 1));
  const failed: string[] = [];
  const reasons = new Set<string>();
  // Firestore rejects any query limit above 10,000 (the emulator doesn't enforce this),
  // so read in pages of 10,000 ordered by the same field (single-field index only).
  const PAGE = 10000;
  const pages = async (name: string, field: string): Promise<Row[]> => {
    const out: Row[] = [];
    let last: QueryDocumentSnapshot | null = null;
    for (let i = 0; i < 20; i++) {
      const q: Query = last
        ? query(collection(d!, name), where(field, '>=', since), orderBy(field), startAfter(last), limit(PAGE))
        : query(collection(d!, name), where(field, '>=', since), orderBy(field), limit(PAGE));
      const snap: QuerySnapshot = await getDocs(q);
      snap.docs.forEach((x) => out.push({ _id: x.id, ...x.data() }));
      if (snap.size < PAGE) break;
      last = snap.docs[snap.docs.length - 1];
    }
    return out;
  };
  // The previous site stored the time as `timestamp` (and lang/screen under other names);
  // those rows are read too and renamed, so totals go back to the very first visit.
  const OPTIONAL = new Set(['analytics', 'visitors~old', 'projectLikes~old', 'projectViews~old']);
  const get = (name: string, field: string) =>
    (demoMode ? Promise.resolve(demoRows(name, field, since.toMillis())) : pages(name.replace('~old', ''), field))
      .catch((e: { code?: string }) => {
        failed.push(name);
        if (!OPTIONAL.has(name)) reasons.add(e?.code ?? 'unknown');
        return [] as Row[];
      });

  const time0 = (r: Row) => (r.timestamp as Timestamp | undefined)?.toMillis?.() ?? null;
  const asCreated = (rows: Row[]) => rows.map((r) => ({ ...r, createdAt: r.timestamp }));
  const [views, legacy, visitorsNew, visitorsOld, likesNew, likesOld, pviewsNew, pviewsOld, downloads] = await Promise.all([
    get('pageViews', 'createdAt'),
    get('analytics', 'timestamp').then((rows) => rows.filter((r) => r.type === 'pageview' || r.type === 'page_view')),
    get('visitors', 'firstSeen'),
    get('visitors~old', 'timestamp').then((rows) => rows.map((r): Row => ({ ...r, firstSeen: r.timestamp, lang: r.language, screen: r.screenResolution }))),
    get('projectLikes', 'createdAt'),
    get('projectLikes~old', 'timestamp').then(asCreated),
    get('projectViews', 'createdAt'),
    get('projectViews~old', 'timestamp').then(asCreated),
    get('resumeDownloads', 'createdAt'),
  ]);
  // The old site wrote one visitor record per visit and its page views carry no visitor id.
  // Old visitors are de-duplicated by their stored network address (kept on its earliest record);
  // old page views without one are counted as views but never as extra unique visitors.
  const oldKey = (r: Row) => (typeof r.ip === 'string' && r.ip ? `old-${r.ip}` : null);
  const firstOld = new Map<string, Row>();
  for (const r of visitorsOld) {
    const k = oldKey(r) ?? `old-doc-${r._id}`;
    const prevRow = firstOld.get(k);
    if (!prevRow || (time0(r) ?? Infinity) < (time0(prevRow) ?? Infinity)) firstOld.set(k, r);
  }
  const visitors = [...visitorsNew, ...firstOld.values()];
  const likes = [...likesNew, ...likesOld];
  const pviews = [...pviewsNew, ...pviewsOld];
  // Old-format history is optional; don't report it as a failure
  for (let i = failed.length - 1; i >= 0; i--) if (OPTIONAL.has(failed[i])) failed.splice(i, 1);

  const time = (r: Row, f: string) => (r[f] as Timestamp | undefined)?.toDate?.() ?? null;
  let estimated = false;

  // Current period: the last N days, or (all time) from the day of the first record
  let curStart: Date;
  if (all) {
    const firsts = [...views.map((r) => time(r, 'createdAt')), ...legacy.map((r) => time(r, 'timestamp')), ...visitors.map((r) => time(r, 'firstSeen')),
      ...likes.map((r) => time(r, 'createdAt')), ...pviews.map((r) => time(r, 'createdAt')), ...downloads.map((r) => time(r, 'createdAt'))]
      .filter((t): t is Date => !!t).map((t) => t.getTime());
    curStart = firsts.length ? new Date(Math.min(...firsts)) : startOfDay(0);
    curStart.setHours(0, 0, 0, 0);
  } else curStart = startOfDay(range - 1);
  const spanDays = Math.round((startOfDay(0).getTime() - curStart.getTime()) / 864e5) + 1;
  const granularity: Granularity = spanDays <= 120 ? 'day' : spanDays <= 730 ? 'week' : 'month';
  const weekStart = (t: Date) => { const x = new Date(t); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
  const bucketOf = (t: Date) => granularity === 'day' ? dayKey(t)
    : granularity === 'week' ? dayKey(weekStart(t))
    : `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`;
  const days: { key: string; label: string; views: number; visitors: number; newVisitors: number; downloads: number; likes: number; ids: Set<string> }[] = [];
  const cursor = granularity === 'week' ? weekStart(curStart) : new Date(curStart);
  if (granularity === 'month') cursor.setDate(1);
  const end = startOfDay(0);
  while (cursor <= end) {
    days.push({
      key: bucketOf(cursor),
      label: granularity === 'month' ? cursor.toLocaleDateString(undefined, { month: 'short', year: '2-digit' })
        : granularity === 'week' ? cursor.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
        : cursor.toLocaleDateString(undefined, spanDays <= 7 ? { weekday: 'short', day: 'numeric' } : { month: 'short', day: 'numeric' }),
      views: 0, visitors: 0, newVisitors: 0, downloads: 0, likes: 0, ids: new Set<string>(),
    });
    if (granularity === 'day') cursor.setDate(cursor.getDate() + 1);
    else if (granularity === 'week') cursor.setDate(cursor.getDate() + 7);
    else cursor.setMonth(cursor.getMonth() + 1);
  }
  const byKey = new Map(days.map((x) => [x.key, x]));
  const cur = emptyKpis();
  const prev = emptyKpis();
  const curIds = new Set<string>();
  const prevIds = new Set<string>();
  const paths = new Map<string, number>();
  const refs = new Map<string, number>();
  const hours = Array.from({ length: 24 }, () => 0);
  const heat = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));

  const viewRows: { t: Date; vid: string | null; path?: string; ref?: string }[] = [
    ...views.map((r) => ({ t: time(r, 'createdAt')!, vid: String(r.visitorId ?? r._id), path: r.path as string, ref: r.referrer as string })),
    ...legacy.map((r) => ({ t: time(r, 'timestamp')!, vid: oldKey(r) })),
  ].filter((r) => r.t);
  for (const v of viewRows) {
    if (v.t >= curStart) {
      cur.views++; if (v.vid) curIds.add(v.vid); else estimated = true;
      hours[v.t.getHours()]++;
      heat[(v.t.getDay() + 6) % 7][v.t.getHours()]++;
      if (v.path) inc(paths, v.path);
      // Visits from your own dev server are not real referrers
      if (v.path !== undefined) { const ref = referrerLabel(v.ref); if (ref !== 'localhost' && ref !== '127.0.0.1') inc(refs, ref); }
      const b = byKey.get(bucketOf(v.t));
      if (b) { b.views++; if (v.vid) b.ids.add(v.vid); }
    } else { prev.views++; if (v.vid) prevIds.add(v.vid); }
  }
  // Every old visitor record is a visit by that address: count it towards unique visitors
  for (const r of visitorsOld) {
    const t = time(r, 'firstSeen'); const k = oldKey(r) ?? `old-doc-${r._id}`;
    if (!t) continue;
    if (t >= curStart) { curIds.add(k); estimated = true; byKey.get(bucketOf(t))?.ids.add(k); } else prevIds.add(k);
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
      const nb = byKey.get(bucketOf(t)); if (nb) nb.newVisitors++;
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
        if (key === 'likes') { const lb = byKey.get(bucketOf(t)); if (lb) lb.likes++; }
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
    if (t >= curStart) { const db = byKey.get(bucketOf(t)); if (db) db.downloads++; cur.downloads++; const id = String(r.resumeId ?? ''); dl[id] = (dl[id] ?? 0) + 1; } else prev.downloads++;
  }

  return {
    days: days.map(({ ids, ...rest }) => ({ ...rest, visitors: ids.size })),
    granularity, start: curStart, hasPrev: !all, bucketOf, estimated,
    cur, prev,
    topPaths: top(paths), topReferrers: top(refs), devices: top(devices), languages: top(langs, 6),
    hours, heat, projects, downloads: dl, failed, failedReasons: [...reasons],
  };
}

/** Percentage change, or null when there is no previous data to compare with. */
export const delta = (cur: number, prev: number): number | null => (prev === 0 ? (cur === 0 ? 0 : null) : Math.round(((cur - prev) / prev) * 100));
