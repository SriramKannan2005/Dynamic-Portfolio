/**
 * The lower analytics boards: project leaderboard (podium + ranked rows), the resume
 * shelf, language bubbles and traffic-source chips. Project colours come from each
 * project's own 3D poster hues, so a card here matches its card on the site.
 */
import { useState } from 'react';
import { Icon } from '../shared/Icon';
import type { Project, Resume } from '../site/content';

const pct = (v: number, total: number) => Math.round((v / (total || 1)) * 100);

/* ------------------------------------------------------- project leaderboard */
export interface ProjectStat { id: string; title: string; views: number; likes: number; allViews: number; allLikes: number }
type Metric = 'views' | 'likes';

export function ProjectBoard({ rows, projects, isAll, rangeLabel }: { rows: ProjectStat[]; projects: Project[]; isAll: boolean; rangeLabel: string }) {
  const [metric, setMetric] = useState<Metric>('views');
  const hues = new Map(projects.map((p) => [p.id, p.poster ?? { hueA: 245, hueB: 190 }]));
  // In a range view rank by the range, fall back to all-time so the board is never empty
  const val = (r: ProjectStat, m: Metric) => (isAll ? (m === 'views' ? r.allViews : r.allLikes) : (m === 'views' ? r.views : r.likes));
  const rangeEmpty = !isAll && rows.every((r) => !r.views && !r.likes);
  const useAll = isAll || rangeEmpty;
  const get = (r: ProjectStat, m: Metric) => (useAll ? (m === 'views' ? r.allViews : r.allLikes) : val(r, m));
  const sorted = [...rows].sort((a, b) => get(b, metric) - get(a, metric) || get(b, metric === 'views' ? 'likes' : 'views') - get(a, metric === 'views' ? 'likes' : 'views'));
  const total = sorted.reduce((n, r) => n + get(r, metric), 0);
  const max = Math.max(1, ...sorted.map((r) => get(r, metric)));
  const podium = sorted.slice(0, 3).filter((r) => get(r, metric) > 0);
  const rest = sorted.slice(podium.length);
  const scope = useAll ? 'all time' : rangeLabel;
  const hueStyle = (id: string) => { const h = hues.get(id)!; return { '--ha': h.hueA, '--hb': h.hueB } as React.CSSProperties; };

  return (
    <div className="pboard">
      <div className="pboard-head">
        <p className="viz-summary">Ranked by {metric}, {scope}{rangeEmpty && ' (nothing in this range yet)'}</p>
        <div className="seg seg-sm" role="group" aria-label="Rank projects by">
          {(['views', 'likes'] as Metric[]).map((m) => (
            <button key={m} type="button" className={`seg-btn${metric === m ? ' is-active' : ''}`} aria-pressed={metric === m} onClick={() => setMetric(m)}>
              <Icon id={m === 'views' ? 'eye' : 'heart'} />{m === 'views' ? 'Views' : 'Likes'}
            </button>
          ))}
        </div>
      </div>
      {podium.length > 0 ? (
        <ol className="podium">
          {podium.map((r, i) => {
            const v = get(r, 'views'); const l = get(r, 'likes');
            return (
              <li key={r.id} className={`podium-card place-${i + 1}`} style={hueStyle(r.id)}>
                <span className="podium-rank mono" aria-label={`Rank ${i + 1}`}>{i === 0 ? <Icon id="trophy" /> : `#${i + 1}`}</span>
                <h3>{r.title}</h3>
                <p className="podium-big"><b>{get(r, metric)}</b><span>{metric}</span></p>
                <dl className="podium-stats">
                  <div><dt><Icon id="eye" /><span className="visually-hidden">Views</span></dt><dd>{v}</dd></div>
                  <div><dt><Icon id="heart" /><span className="visually-hidden">Likes</span></dt><dd>{l}</dd></div>
                  <div title="Likes per view"><dt className="mono">rate</dt><dd>{v ? `${pct(l, v)}%` : '–'}</dd></div>
                </dl>
                <span className="podium-share" aria-hidden="true"><span style={{ width: `${pct(get(r, metric), total)}%` }} /></span>
                <small className="mono">{pct(get(r, metric), total)}% of all {metric}</small>
              </li>
            );
          })}
        </ol>
      ) : <p className="muted">No project {metric} yet.</p>}
      {rest.length > 0 && (
        <ol className="pboard-rest" start={podium.length + 1}>
          {rest.map((r, i) => (
            <li key={r.id} style={hueStyle(r.id)}>
              <span className="mono pboard-n">{podium.length + i + 1}</span>
              <span className="pboard-swatch" aria-hidden="true" />
              <span className="pboard-title">{r.title}</span>
              <span className="pboard-bar" aria-hidden="true"><span style={{ width: `${(get(r, metric) / max) * 100}%` }} /></span>
              <span className="pboard-v"><Icon id="eye" />{get(r, 'views')}</span>
              <span className="pboard-v"><Icon id="heart" />{get(r, 'likes')}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- resume shelf */
export function ResumeShelf({ resumes, range, all, isAll, rangeLabel }: { resumes: Resume[]; range: Record<string, number>; all: Record<string, number>; isAll: boolean; rangeLabel: string }) {
  const totalAll = resumes.reduce((n, r) => n + (all[r.id] ?? 0), 0);
  const best = totalAll ? resumes.reduce((a, b) => ((all[b.id] ?? 0) > (all[a.id] ?? 0) ? b : a)) : null;
  return (
    <div className="shelf">
      <p className="viz-summary"><b>{totalAll}</b> download{totalAll === 1 ? '' : 's'} all time{best && <> · most wanted <b>{best.label}</b></>}</p>
      <ul className="shelf-row">
        {resumes.map((r, i) => {
          const n = all[r.id] ?? 0;
          return (
            <li key={r.id} className={`paper${best?.id === r.id ? ' is-best' : ''}`} style={{ '--tilt': `${(i - 1) * 2.5}deg` } as React.CSSProperties}>
              {best?.id === r.id && <span className="paper-ribbon mono">Top pick</span>}
              <span className="paper-lines" aria-hidden="true"><i /><i /><i /><i /></span>
              <b className="paper-count">{n}</b>
              <span className="paper-label">{r.label}</span>
              <span className="paper-meta mono">{isAll ? `${pct(n, totalAll)}% of downloads` : `${range[r.id] ?? 0} in ${rangeLabel}`}</span>
            </li>
          );
        })}
      </ul>
      <p className="muted small-note">Unique per visitor: one person downloading twice counts once.</p>
    </div>
  );
}

/* --------------------------------------------------------- language bubbles */
/** Bubbles sized by share (area ∝ count), one hue; the label is always written. */
export function LanguageBubbles({ rows, format, empty }: { rows: [string, number][]; format: (k: string) => string; empty: string }) {
  if (!rows.length) return <p className="muted">{empty}</p>;
  const total = rows.reduce((n, [, v]) => n + v, 0);
  const max = Math.max(...rows.map(([, v]) => v));
  return (
    <ul className="bubbles" aria-label="Visitors by browser language">
      {rows.map(([k, v], i) => {
        const size = 56 + 74 * Math.sqrt(v / max);
        return (
          <li key={k} className="bubble" title={`${format(k)}: ${v} (${pct(v, total)}%)`}
            style={{ '--s': `${size.toFixed(0)}px`, '--o': Math.max(0.3, 1 - i * 0.15).toFixed(2), '--i': i } as React.CSSProperties}>
            <b>{pct(v, total)}%</b>
            <span>{format(k)}</span>
          </li>
        );
      })}
    </ul>
  );
}

/* ---------------------------------------------------------- traffic sources */
const sourceIcon = (k: string) => {
  const s = k.toLowerCase();
  if (s.startsWith('direct')) return 'arrow';
  if (s.includes('linkedin')) return 'linkedin';
  if (s.includes('github')) return 'github';
  if (/google|bing|duckduckgo|yahoo/.test(s)) return 'search';
  return 'ext';
};
export function SourceChips({ rows, empty }: { rows: [string, number][]; empty: string }) {
  if (!rows.length) return <p className="muted">{empty}</p>;
  const total = rows.reduce((n, [, v]) => n + v, 0);
  return (
    <ul className="sources" aria-label="Traffic sources">
      {rows.map(([k, v], i) => (
        <li key={k} className={`source${i === 0 ? ' is-top' : ''}`} style={{ '--p': `${pct(v, total)}%` } as React.CSSProperties} title={`${k}: ${v} (${pct(v, total)}%)`}>
          <span className="source-icon" aria-hidden="true"><Icon id={sourceIcon(k)} /></span>
          <span className="source-k">{k}</span>
          <b className="source-p">{pct(v, total)}%</b>
          <span className="source-v mono">{v} visit{v === 1 ? '' : 's'}</span>
        </li>
      ))}
    </ul>
  );
}
