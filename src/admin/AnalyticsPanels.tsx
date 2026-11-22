/**
 * Analytics panels drawn as plain HTML/SVG: an insights strip, the 24-hour visit
 * clock, the message-category ring, share bars and ranked lists. They read well with
 * little data (a time series of 3 messages over a year is mostly empty space).
 *
 * Colour rules: categories use a fixed categorical order validated for colour-blind
 * separation (dataviz validator, both themes: --cat-1..5 in admin-v3.css), so a
 * category keeps its colour whatever the filter. Magnitude uses one hue.
 */
import { MESSAGE_CATEGORIES } from '../shared/categories';
import type { RangeData } from './analyticsData';
import { Icon } from '../shared/Icon';

const pct = (v: number, total: number) => Math.round((v / (total || 1)) * 100);
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const hourLabel = (h: number) => `${String(h).padStart(2, '0')}:00`;
const hour12 = (h: number) => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;

let langNames: Intl.DisplayNames | null = null;
try { langNames = new Intl.DisplayNames(undefined, { type: 'language' }); } catch { /* old browser */ }
/** "en" -> "English"; missing -> "Not reported" */
export const languageName = (code: string) => {
  if (!code || code === 'unknown') return 'Not reported';
  try { return langNames?.of(code) ?? code; } catch { return code; }
};
/** "/" -> "Home"; "/admin" -> "admin" */
export const pageName = (p: string) => (p === '/' ? 'Home' : p.replace(/^\/#?/, '').replace(/\/$/, '') || p);

/* ------------------------------------------------------------------ insights */
export interface Insight { icon: string; tone: 'up' | 'down' | 'info'; text: React.ReactNode }

/** A few plain-language takeaways computed from the range data (never invented). */
export function buildInsights(d: RangeData, msgs: { cur: number; prev: number; cats: [string, number][] } | null, periodLabel: string): Insight[] {
  const out: Insight[] = [];
  if (d.hasPrev && (d.cur.views || d.prev.views)) {
    if (!d.prev.views) out.push({ icon: 'activity', tone: 'up', text: <>First recorded visits: <b>{d.cur.views}</b> views {periodLabel}</> });
    else {
      const ch = Math.round(((d.cur.views - d.prev.views) / d.prev.views) * 100);
      out.push(ch === 0
        ? { icon: 'activity', tone: 'info', text: <>Traffic is <b>flat</b> vs the previous period</> }
        : { icon: 'activity', tone: ch > 0 ? 'up' : 'down', text: <>Views {ch > 0 ? 'up' : 'down'} <b>{Math.abs(ch)}%</b> vs the previous period</> });
    }
  } else if (d.cur.views) out.push({ icon: 'activity', tone: 'info', text: <><b>{d.cur.views.toLocaleString()}</b> page views {periodLabel}</> });

  const byDay = d.heat.map((r) => r.reduce((a, b) => a + b, 0));
  const total = byDay.reduce((a, b) => a + b, 0);
  if (total >= 5) {
    const best = byDay.indexOf(Math.max(...byDay));
    out.push({ icon: 'star', tone: 'info', text: <><b>{DAY_NAMES[best]}</b> is your busiest day ({pct(byDay[best], total)}% of views)</> });
    const byHour = Array.from({ length: 24 }, (_, h) => d.heat.reduce((n, r) => n + r[h], 0));
    const night = [22, 23, 0, 1, 2, 3, 4, 5].reduce((n, h) => n + byHour[h], 0);
    if (pct(night, total) >= 25) out.push({ icon: 'moon', tone: 'info', text: <><b>{pct(night, total)}%</b> of visits happen late at night (10 PM–6 AM)</> });
    else { const h = byHour.indexOf(Math.max(...byHour)); out.push({ icon: 'sun', tone: 'info', text: <>Most visits land around <b>{hour12(h)}</b></> }); }
  }
  const mobile = d.devices.find(([k]) => k === 'Mobile')?.[1] ?? 0;
  const devTotal = d.devices.reduce((n, [, v]) => n + v, 0);
  if (devTotal >= 5) out.push({ icon: 'grid', tone: 'info', text: <><b>{pct(mobile, devTotal)}%</b> of new visitors are on a phone</> });
  if (msgs?.cur && msgs.cats[0]) out.push({ icon: 'mail', tone: 'info', text: <><b>{msgs.cats[0][0]}</b> is the most common message type ({pct(msgs.cats[0][1], msgs.cur)}%)</> });
  return out.slice(0, 4);
}

export function InsightStrip({ items }: { items: Insight[] }) {
  if (!items.length) return null;
  return (
    <ul className="insights" aria-label="Insights">
      {items.map((x, i) => (
        <li key={i} className={`insight is-${x.tone}`} style={{ '--i': i } as React.CSSProperties}>
          <span className="insight-icon" aria-hidden="true"><Icon id={x.icon} /></span>
          <span>{x.text}</span>
        </li>
      ))}
    </ul>
  );
}

/* --------------------------------------------------------------- visit clock */
const polar = (r: number, a: number) => [r * Math.cos(a), r * Math.sin(a)] as const;
/** Annular wedge from angle a0 to a1 between radii r0 and r1 (SVG path). */
function wedge(r0: number, r1: number, a0: number, a1: number) {
  const [x0, y0] = polar(r1, a0); const [x1, y1] = polar(r1, a1);
  const [x2, y2] = polar(r0, a1); const [x3, y3] = polar(r0, a0);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${x0.toFixed(2)},${y0.toFixed(2)}A${r1},${r1} 0 ${large} 1 ${x1.toFixed(2)},${y1.toFixed(2)}L${x2.toFixed(2)},${y2.toFixed(2)}A${r0},${r0} 0 ${large} 0 ${x3.toFixed(2)},${y3.toFixed(2)}Z`;
}
const angleOf = (h: number) => (h / 24) * Math.PI * 2 - Math.PI / 2; // 00:00 at the top

/** 24-hour radial bars (night shaded) + a weekday strip. Times are in your time zone. */
export function VisitClock({ heat }: { heat: number[][] }) {
  const byHour = Array.from({ length: 24 }, (_, h) => heat.reduce((n, r) => n + r[h], 0));
  const byDay = heat.map((r) => r.reduce((a, b) => a + b, 0));
  const total = byHour.reduce((a, b) => a + b, 0);
  if (!total) return <p className="muted">No views in this range.</p>;
  const max = Math.max(...byHour);
  const peak = byHour.indexOf(max);
  const bestDay = byDay.indexOf(Math.max(...byDay));
  const R0 = 52; const R1 = 122; const GAP = 0.018;
  return (
    <div className="clock">
      <svg className="clock-svg" viewBox="-150 -150 300 300" role="img" aria-label={`Visits by hour of day. Busiest hour ${hourLabel(peak)} with ${max} views.`}>
        <defs>
          <linearGradient id="clockPeak" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="var(--cat-1)" /><stop offset="1" stopColor="var(--cat-2)" /></linearGradient>
        </defs>
        {/* night (18:00-06:00) and day halves of the dial */}
        <path className="clock-night" d={wedge(R0 - 8, R1 + 6, angleOf(18), angleOf(30))} />
        <path className="clock-day" d={wedge(R0 - 8, R1 + 6, angleOf(6), angleOf(18))} />
        {[0.33, 0.66, 1].map((k) => <circle key={k} className="clock-ring" r={R0 + (R1 - R0) * k} />)}
        {byHour.map((v, h) => {
          const r = R0 + (R1 - R0) * Math.sqrt(v / max);
          return (
            <path key={h} className={`clock-bar${h === peak ? ' is-peak' : ''}${v ? '' : ' is-zero'}`} d={wedge(R0, Math.max(R0 + 2, r), angleOf(h) + GAP, angleOf(h + 1) - GAP)}>
              <title>{`${hourLabel(h)}–${hourLabel((h + 1) % 24)}: ${v} view${v === 1 ? '' : 's'} (${pct(v, total)}%)`}</title>
            </path>
          );
        })}
        {[0, 6, 12, 18].map((h) => { const [x, y] = polar(R1 + 20, angleOf(h)); return <text key={h} className="clock-tick" x={x} y={y} textAnchor="middle" dominantBaseline="central">{String(h).padStart(2, '0')}</text>; })}
        <g className="clock-icons" aria-hidden="true">
          <circle className="clock-sun" cx={polar(R1 + 20, angleOf(9))[0]} cy={polar(R1 + 20, angleOf(9))[1]} r="5" />
          <circle className="clock-moon" cx={polar(R1 + 20, angleOf(21))[0]} cy={polar(R1 + 20, angleOf(21))[1]} r="5" />
        </g>
        <text className="clock-center-k" y="-10" textAnchor="middle">{hourLabel(peak)}</text>
        <text className="clock-center-l" y="12" textAnchor="middle">peak hour</text>
      </svg>
      <div className="clock-side">
        <p className="viz-summary">Busiest hour <b>{hour12(peak)}</b> · {pct(max, total)}% of views</p>
        <ul className="weekbars" aria-label="Views by weekday">
          {byDay.map((v, d) => (
            <li key={d} className={d === bestDay ? 'is-best' : ''} title={`${DAY_NAMES[d]}: ${v} view${v === 1 ? '' : 's'} (${pct(v, total)}%)`}>
              <span className="weekbar-v mono">{v}</span>
              <span className="weekbar-track" aria-hidden="true"><span style={{ height: `${Math.max(4, (v / Math.max(1, ...byDay)) * 100)}%` }} /></span>
              <span className="weekbar-k mono">{DAYS[d]}</span>
            </li>
          ))}
        </ul>
        <p className="muted small-note">Your time zone. Hover a bar for exact numbers.</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ category ring */
const CAT_INDEX = new Map<string, number>(MESSAGE_CATEGORIES.map((c, i) => [c, i]));
const catColor = (c: string) => `var(--cat-${((CAT_INDEX.get(c) ?? 4) % 5) + 1})`;

/** Donut with the total in the middle; every category keeps its own colour. */
export function CategoryRing({ counts, total, empty }: { counts: [string, number][]; total: number; empty: string }) {
  if (!total) return <p className="muted">{empty}</p>;
  const map = new Map(counts);
  const rows = MESSAGE_CATEGORIES.map((c) => [c, map.get(c) ?? 0] as [string, number])
    .concat(counts.filter(([c]) => !CAT_INDEX.has(c)))
    .sort((a, b) => b[1] - a[1]);
  // Concentric "activity rings": one ring per category (outermost = most messages),
  // each filled to its share of all messages. Rounded caps, a faint track underneath.
  const SW = 11; const GAPR = 4; const R0 = 92;
  const lead = rows[0];
  return (
    <div className="ring">
      <svg className="ring-svg" viewBox="-100 -100 200 200" role="img" aria-label={`Messages by category: ${rows.filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(', ')}`}>
        {rows.map(([k, v], i) => {
          const r = R0 - i * (SW + GAPR);
          if (r < SW) return null;
          const C = 2 * Math.PI * r;
          const len = (v / total) * C;
          return (
            <g key={k} className={`ring-lane${v ? '' : ' is-zero'}`} style={{ '--c': catColor(k), '--i': i } as React.CSSProperties}>
              <circle className="ring-track" r={r} strokeWidth={SW} />
              {v > 0 && (
                <circle className="ring-seg" r={r} strokeWidth={SW} strokeDasharray={`${Math.max(0.1, len)} ${C}`} transform="rotate(-90)"
                  style={{ '--len': len, '--circ': C } as React.CSSProperties}>
                  <title>{`${k}: ${v} (${pct(v, total)}%)`}</title>
                </circle>
              )}
            </g>
          );
        })}
        <text className="ring-total" y="2" textAnchor="middle" dominantBaseline="middle">{total}</text>
      </svg>
      <div className="ring-side">
        <p className="viz-summary"><b>{total}</b> message{total === 1 ? '' : 's'}{lead?.[1] ? <> · most often <b>{lead[0]}</b></> : null}</p>
        <ul className="ring-legend" aria-label="Messages by category">
          {rows.map(([k, v]) => (
            <li key={k} className={v ? '' : 'is-zero'}>
              <span className="ring-dot" style={{ background: catColor(k) }} aria-hidden="true" />
              <span className="ring-k">{k}</span>
              <span className="ring-mini" aria-hidden="true"><span style={{ width: `${pct(v, total)}%`, background: catColor(k) }} /></span>
              <b>{v}</b>
              <span className="rank-pct mono">{pct(v, total)}%</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- share bar */
/** One 100% bar split by share (single hue, stronger = larger) with a labelled legend. */
export function ShareBar({ rows, empty, label, format = (k: string) => k }: { rows: [string, number][]; empty: string; label: string; format?: (k: string) => string }) {
  if (!rows.length) return <p className="muted">{empty}</p>;
  const total = rows.reduce((n, [, v]) => n + v, 0);
  const shade = (i: number) => Math.max(0.28, 1 - i * 0.16).toFixed(2);
  return (
    <div className="share">
      <p className="share-head"><b>{format(rows[0][0])}</b><span className="mono">{pct(rows[0][1], total)}%</span></p>
      <div className="share-bar" role="img" aria-label={`${label}: ${rows.map(([k, v]) => `${format(k)} ${pct(v, total)}%`).join(', ')}`}>
        {rows.map(([k, v], i) => <span key={k} style={{ flexGrow: v, '--o': shade(i) } as React.CSSProperties} title={`${format(k)}: ${v} (${pct(v, total)}%)`} />)}
      </div>
      <ul className="share-legend">
        {rows.map(([k, v], i) => (
          <li key={k}>
            <span className="share-dot" style={{ '--o': shade(i) } as React.CSSProperties} aria-hidden="true" />
            <span className="share-k">{format(k)}</span>
            <b>{v}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* --------------------------------------------------------------- ranked list */
/** Ranked rows: rank, label, value and share, with a thin share bar under each label. */
export function TopList({ rows, empty, label, format = (k: string) => k }: { rows: [string, number][]; empty: string; label: string; format?: (k: string) => string }) {
  if (!rows.length) return <p className="muted">{empty}</p>;
  const total = rows.reduce((n, [, v]) => n + v, 0);
  const max = Math.max(1, ...rows.map(([, v]) => v));
  if (rows.length === 1) {
    // One-page site: a spotlight reads better than a one-row ranking
    return (
      <div className="spotlight" aria-label={label}>
        <span className="spotlight-icon" aria-hidden="true"><Icon id="eye" /></span>
        <b className="spotlight-v">{rows[0][1].toLocaleString()}</b>
        <span className="spotlight-k">views on <b>{format(rows[0][0])}</b></span>
        <p className="muted small-note">The portfolio is a single page, so every view lands here. Sections are not tracked separately.</p>
      </div>
    );
  }
  return (
    <ol className="rank" aria-label={label}>
      {rows.map(([k, v], i) => (
        <li key={k} title={`${format(k)}: ${v} (${pct(v, total)}%)`}>
          <span className="rank-n mono">{i + 1}</span>
          <span className="rank-body">
            <span className="rank-row">
              <span className="rank-k">{format(k)}</span>
              <b className="rank-v">{v}</b>
              <span className="rank-pct mono">{pct(v, total)}%</span>
            </span>
            <span className="rank-track" aria-hidden="true"><span style={{ width: `${(v / max) * 100}%` }} /></span>
          </span>
        </li>
      ))}
    </ol>
  );
}
