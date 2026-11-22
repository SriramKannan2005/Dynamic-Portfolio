/**
 * Top of the analytics tab: KPI tiles with sparklines, the traffic area chart
 * (hover crosshair + tooltip, peak annotated) and the device split. Plain SVG/HTML
 * so it follows the admin theme tokens and needs no chart library.
 */
import { useMemo, useRef, useState } from 'react';
import { Icon } from '../shared/Icon';
import { delta } from './analyticsData';

/* ---------------------------------------------------------------- sparkline */
function Sparkline({ values, id }: { values: number[]; id: string }) {
  if (values.length < 2) return null;
  const W = 120; const H = 34; const max = Math.max(1, ...values);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * W, H - 3 - (v / max) * (H - 6)] as const);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
  const last = pts[pts.length - 1];
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id={`sp-${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="currentColor" stopOpacity=".35" /><stop offset="1" stopColor="currentColor" stopOpacity="0" /></linearGradient></defs>
      <path d={`${line}L${W},${H}L0,${H}Z`} fill={`url(#sp-${id})`} />
      <path d={line} fill="none" stroke="currentColor" strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="2.4" fill="currentColor" />
    </svg>
  );
}

export interface KpiTileData { key: string; label: string; icon: string; value: number | undefined; prev: number; series: number[]; hint?: string }

/** KPI tile: icon, big number, trend chip (or a "since" line) and a sparkline. */
export function KpiTiles({ items, compare, since }: { items: KpiTileData[]; compare: string | null; since: string }) {
  return (
    <ul className="kpx">
      {items.map((k, i) => {
        const d = k.value == null || !compare ? undefined : delta(k.value, k.prev);
        return (
          <li key={k.key} className={`kpx-tile kpx-${k.key}`} style={{ '--i': i } as React.CSSProperties}>
            <div className="kpx-top">
              <span className="kpx-icon" aria-hidden="true"><Icon id={k.icon} /></span>
              <span className="kpx-label">{k.label}</span>
            </div>
            <b className="kpx-value">{k.value == null ? '–' : k.value.toLocaleString()}</b>
            <div className="kpx-foot">
              {compare
                ? <span className={`kpx-chip${d == null ? ' is-new' : d > 0 ? ' is-up' : d < 0 ? ' is-down' : ''}`}>{d == null ? 'new' : d === 0 ? '±0%' : `${d > 0 ? '▲' : '▼'} ${Math.abs(d)}%`}</span>
                : null}
              <span className="kpx-sub">{k.hint ?? (compare ? `vs ${compare}` : since)}</span>
            </div>
            <span className="kpx-spark"><Sparkline values={k.series} id={k.key} /></span>
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------ traffic chart */
interface Point { label: string; views: number; visitors: number }
const niceMax = (v: number) => { if (v <= 5) return 5; const p = 10 ** Math.floor(Math.log10(v)); const n = v / p; return (n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; };

/** Area (views) + line (unique visitors) with a hover crosshair, tooltip and the peak annotated. */
export function TrafficChart({ points, unit }: { points: Point[]; unit: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const W = 720; const H = 260; const L = 40; const R = 12; const T = 26; const B = 28;
  const n = points.length;
  const max = niceMax(Math.max(1, ...points.map((p) => p.views)));
  const x = (i: number) => L + (n < 2 ? (W - L - R) / 2 : (i / (n - 1)) * (W - L - R));
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const path = (key: 'views' | 'visitors') => points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join('');
  const peak = points.reduce((best, p, i) => (p.views > points[best].views ? i : best), 0);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((k) => Math.round(max * k));
  const labelEvery = Math.max(1, Math.ceil(n / 8));
  const total = useMemo(() => points.reduce((a, p) => a + p.views, 0), [points]);

  const onMove = (e: React.PointerEvent) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box || !n) return;
    const px = ((e.clientX - box.left) / box.width) * W;
    const i = Math.round(((px - L) / (W - L - R)) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };
  if (!total) return <p className="muted">No views in this range.</p>;
  const h = hover != null ? points[hover] : null;
  const tipLeft = hover != null ? (x(hover) / W) * 100 : 0;

  return (
    <div className="traffic" ref={ref} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
      <div className="traffic-legend" aria-hidden="true">
        <span><i className="lg-views" />Page views</span>
        <span><i className="lg-visitors" />Unique visitors</span>
        <span className="traffic-total mono">{total.toLocaleString()} views</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="traffic-svg" role="img" aria-label={`Page views and unique visitors per ${unit}. Peak ${points[peak].views} views (${points[peak].label}).`}>
        <defs>
          <linearGradient id="trafficFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--cat-1)" stopOpacity=".45" /><stop offset="1" stopColor="var(--cat-1)" stopOpacity="0" /></linearGradient>
          <filter id="trafficGlow" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="3" /></filter>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line className="traffic-grid" x1={L} x2={W - R} y1={y(t)} y2={y(t)} />
            <text className="traffic-axis" x={L - 8} y={y(t)} textAnchor="end" dominantBaseline="central">{t >= 1000 ? `${t / 1000}k` : t}</text>
          </g>
        ))}
        {points.map((p, i) => ((i % labelEvery === 0 && (n - 1 - i >= labelEvery * 0.7 || i === n - 1)) || i === n - 1) && (
          <text key={i} className="traffic-axis" x={x(i)} y={H - 8} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}>{p.label}</text>
        ))}
        <path d={`${path('views')}L${x(n - 1)},${y(0)}L${x(0)},${y(0)}Z`} fill="url(#trafficFill)" />
        <path d={path('views')} className="traffic-glow" filter="url(#trafficGlow)" />
        <path d={path('views')} className="traffic-line" />
        <path d={path('visitors')} className="traffic-line2" />
        {/* peak marker */}
        <g className="traffic-peak">
          <line x1={x(peak)} x2={x(peak)} y1={y(points[peak].views)} y2={T - 6} />
          <circle cx={x(peak)} cy={y(points[peak].views)} r="5" />
          <text x={Math.min(W - R - 4, Math.max(L + 4, x(peak)))} y={T - 10} textAnchor={x(peak) > W - 140 ? 'end' : x(peak) < L + 100 ? 'start' : 'middle'}>
            Peak {points[peak].views} · {points[peak].label}
          </text>
        </g>
        {h && hover != null && (
          <g className="traffic-hover" aria-hidden="true">
            <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} />
            <circle cx={x(hover)} cy={y(h.views)} r="5" className="dot-views" />
            <circle cx={x(hover)} cy={y(h.visitors)} r="4" className="dot-visitors" />
          </g>
        )}
      </svg>
      {h && (
        <div className="traffic-tip" style={{ left: `${tipLeft}%` }} role="status">
          <b>{h.label}{unit !== 'day' && <small> ({unit})</small>}</b>
          <span><i className="lg-views" />{h.views} views</span>
          <span><i className="lg-visitors" />{h.visitors} visitors</span>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- device split */
const DEVICE_ICON: Record<string, string> = { Mobile: 'phone', Tablet: 'tablet', Desktop: 'desktop' };

/** Three device tiles with share + one split bar; visitors with no screen size are counted separately. */
export function DeviceSplit({ rows }: { rows: [string, number][] }) {
  const map = new Map(rows);
  const unknown = map.get('Unknown') ?? 0;
  const known = (['Desktop', 'Mobile', 'Tablet'] as const).map((k) => [k, map.get(k) ?? 0] as const);
  const total = known.reduce((n, [, v]) => n + v, 0);
  if (!total && !unknown) return <p className="muted">No new visitors in this range.</p>;
  const pct = (v: number) => Math.round((v / (total || 1)) * 100);
  const top = [...known].sort((a, b) => b[1] - a[1])[0];
  return (
    <div className="devices">
      {total > 0 && <p className="viz-summary">Mostly <b>{top[0].toLowerCase()}</b> · {pct(top[1])}% of visitors with a known screen</p>}
      <ul className="device-tiles">
        {known.map(([k, v], i) => (
          <li key={k} className={`device-tile${k === top[0] && total ? ' is-top' : ''}`} style={{ '--c': `var(--cat-${i + 1})` } as React.CSSProperties}>
            <span className="device-icon" aria-hidden="true"><Icon id={DEVICE_ICON[k]} /></span>
            <b>{total ? `${pct(v)}%` : '–'}</b>
            <span className="device-k">{k}</span>
            <span className="device-v mono">{v.toLocaleString()}</span>
          </li>
        ))}
      </ul>
      {total > 0 && (
        <div className="device-bar" role="img" aria-label={known.map(([k, v]) => `${k} ${pct(v)}%`).join(', ')}>
          {known.filter(([, v]) => v).map(([k, v]) => <span key={k} style={{ flexGrow: v, background: `var(--cat-${['Desktop', 'Mobile', 'Tablet'].indexOf(k) + 1})` }} title={`${k}: ${v} (${pct(v)}%)`} />)}
        </div>
      )}
      {unknown > 0 && <p className="muted small-note">{unknown.toLocaleString()} older visit{unknown === 1 ? '' : 's'} didn't record a screen size and {unknown === 1 ? 'is' : 'are'} left out.</p>}
    </div>
  );
}
