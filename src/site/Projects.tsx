import { useEffect, useRef, useState } from 'react';
import { Icon } from '../shared/Icon';
import { useModal } from '../shared/Modal';
import { linksOf, CAT_LABEL, fmt, type Project } from './content';
import { initTilt } from './lib/tilt.js';
import { finePointer, prefersReduced, initCounters, initReveals } from './lib/ui.js';

const tracking = () => import('./tracking');

function Poster({ p }: { p: Project }) {
  const po = p.poster ?? { hueA: 245, hueB: 190, shape: 'cubes' };
  return (
    <div className="poster" data-shape={po.shape} style={{ '--ha': po.hueA, '--hb': po.hueB } as React.CSSProperties} aria-hidden="true">
      <div className="poster-obj">{Array.from({ length: 6 }, (_, k) => <i key={k} style={{ '--k': k } as React.CSSProperties} />)}</div>
      <span className="poster-label">{p.title}</span>
    </div>
  );
}

function LikeButton({ p, large = false }: { p: Project; large?: boolean }) {
  const [liked, setLiked] = useState(false);
  useEffect(() => { tracking().then((t) => setLiked(t.hasLiked(p.id))).catch(() => {}); }, [p.id]);
  return (
    <button
      type="button"
      className={`like-btn${liked ? ' is-liked' : ''}${large ? ' btn btn-ghost' : ''}`}
      aria-pressed={liked}
      aria-label={liked ? `You liked ${p.title}` : `Like ${p.title}`}
      disabled={liked}
      onClick={(e) => {
        e.stopPropagation();
        setLiked(true);
        tracking().then((t) => t.likeProject(p.id)).catch(() => {});
      }}
    >
      <Icon id="heart" />{large && <span>{liked ? 'Liked' : 'Like'}</span>}
    </button>
  );
}

function CaseStudyView({ p }: { p: Project }) {
  const cs = p.caseStudy!;
  const [lit, setLit] = useState(prefersReduced() ? cs.pipeline.length : 0);
  const resultsRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (prefersReduced()) return;
    let i = 0;
    let t = 0;
    const step = () => {
      if (i < cs.pipeline.length) { i += 1; setLit(i); t = window.setTimeout(step, 650); }
      else t = window.setTimeout(() => { i = 0; setLit(0); t = window.setTimeout(step, 500); }, 1800);
    };
    t = window.setTimeout(step, 450);
    return () => clearTimeout(t);
  }, [cs.pipeline.length]);
  useEffect(() => {
    if (resultsRef.current) initCounters(resultsRef.current.querySelectorAll('[data-count-to]'), { reduced: prefersReduced() });
  }, []);
  return (
    <>
      <section className="m-section"><h3>Problem</h3><p className="problem">{cs.problem}</p></section>
      <section className="m-section"><h3>Pipeline</h3>
        <ol className="pipeline">
          {cs.pipeline.map((s, i) => (
            <li key={s.title} className={`stage${i < lit ? ' is-lit' : ''}`}><strong>{s.title}</strong><span>{s.detail}</span></li>
          ))}
        </ol>
      </section>
      <section className="m-section"><h3>Results</h3>
        <ul className="results" ref={resultsRef}>
          {cs.results.map((r) => (
            <li className="result" key={r.label}>
              <b data-count-to={r.value} data-count-decimals={r.decimals ?? 0} data-count-suffix={r.suffix ?? ''}>{fmt(r.value, r.decimals ?? 0) + (r.suffix ?? '')}</b>
              <span>{r.label}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function ProjectDetail({ p }: { p: Project }) {
  const links = linksOf(p);
  useEffect(() => { tracking().then((t) => t.trackProjectView(p.id)).catch(() => {}); }, [p.id]);
  return (
    <>
      <div className="m-media">
        {p.video
          // Mounted only when the modal opens, so the video is lazy by construction.
          ? <video controls playsInline preload="metadata" poster={p.image || undefined} src={p.video} aria-label={`${p.title} demo video`} />
          : p.image ? <img src={p.image} alt={`Screenshot of ${p.title}`} decoding="async" /> : <Poster p={p} />}
      </div>
      <div className="m-content">
        <p className="m-cat">{CAT_LABEL[p.category] ?? p.category}{p.badge ? ` · ${p.badge}` : ''}{p.caseStudy ? ' · Case study' : ''}</p>
        <h2 className="m-title" id="modalTitle">{p.title}</h2>
        <p className="m-hook">{p.hook}</p>
        <p className="m-desc">{p.description}</p>
        <ul className="chips" aria-label="Tech stack">{(p.techStack ?? []).map((t) => <li key={t}>{t}</li>)}</ul>
        {p.caseStudy && <CaseStudyView p={p} />}
        <div className="m-actions">
          {links.github && <a className="btn btn-primary" href={links.github} target="_blank" rel="noopener"><Icon id="github" /><span>View on GitHub</span></a>}
          {links.demo && <a className="btn btn-ghost" href={links.demo} target="_blank" rel="noopener"><Icon id="ext" /><span>Live demo</span></a>}
          <LikeButton p={p} large />
        </div>
      </div>
    </>
  );
}

function ProjectCard({ p, i, hidden, onOpen }: { p: Project; i: number; hidden: boolean; onOpen: (p: Project, origin: HTMLElement) => void }) {
  const links = linksOf(p);
  const badge = p.badge ?? (p.caseStudy ? 'Case study' : '');
  const openLabel = p.caseStudy ? 'Read case study' : p.video ? 'Watch demo' : 'View details';
  const chips = (p.techStack ?? []).slice(0, p.featured ? 7 : 4);
  return (
    <article
      className="pcard" data-category={p.category} data-id={p.id} hidden={hidden} style={{ '--i': i } as React.CSSProperties}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('a, .like-btn')) return;
        onOpen(p, e.currentTarget.querySelector('.pcard-inner') as HTMLElement);
      }}
    >
      <div className="pcard-inner">
        <div className="pcard-media">
          {badge && <span className="pcard-badge">{badge}</span>}
          {p.image ? <img src={p.image} alt={`Screenshot of ${p.title}`} loading="lazy" decoding="async" width={1280} height={720} /> : <Poster p={p} />}
          {p.video && <span className="pcard-play" aria-hidden="true"><Icon id="play" /></span>}
        </div>
        <div className="pcard-body">
          <span className="pcard-cat">{CAT_LABEL[p.category] ?? p.category}</span>
          <h3 className="pcard-title">{p.title}</h3>
          <p className="pcard-hook">{p.hook}</p>
          <p className="pcard-desc">{p.description}</p>
          <ul className="chips" aria-label="Tech stack">{chips.map((t) => <li key={t}>{t}</li>)}</ul>
          <div className="pcard-actions">
            <button type="button" className="pcard-open" aria-haspopup="dialog">
              {openLabel}<span className="visually-hidden">: {p.title}</span><Icon id="arrow" />
            </button>
            <span className="pcard-links">
              <LikeButton p={p} />
              {links.demo && <a href={links.demo} target="_blank" rel="noopener" aria-label={`${p.title} live demo`}><Icon id="ext" /></a>}
              {links.github && <a href={links.github} target="_blank" rel="noopener" aria-label={`${p.title} on GitHub`}><Icon id="github" /></a>}
            </span>
          </div>
        </div>
        <div className="pcard-glare" aria-hidden="true" />
      </div>
    </article>
  );
}

const FILTERS = [['all', 'All'], ['ai', 'AI'], ['ml', 'ML'], ['web', 'Web']] as const;

/**
 * `list` is data/projects.json with the admin's live overrides applied. When fresh
 * overrides arrive after first paint, Site remounts this section (new `key`) with
 * `revealNow`, so tilt and reveal are bound to the new cards.
 */
export function Projects({ list: projects, onLayoutChange, revealNow = false }: { list: Project[]; onLayoutChange?: () => void; revealNow?: boolean }) {
  const [filter, setFilter] = useState<string>('all');
  const sectionRef = useRef<HTMLElement>(null);
  const modal = useModal();
  const featured = projects.filter((p) => p.featured);
  const more = projects.filter((p) => !p.featured);
  const show = (p: Project) => filter === 'all' || p.category === filter;
  const shownMore = more.filter(show).length;
  const shownAll = projects.filter(show).length;

  useEffect(() => {
    const cards = [...(sectionRef.current?.querySelectorAll<HTMLElement>('.pcard') ?? [])];
    initTilt(cards, { max: 12, enabled: !prefersReduced() && finePointer() });
    if (revealNow && sectionRef.current) { initReveals(sectionRef.current as unknown as Document); onLayoutChange?.(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-run the 3D entrance on the visible cards after a filter change
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    onLayoutChange?.();
    if (prefersReduced()) return;
    let k = 0;
    sectionRef.current?.querySelectorAll<HTMLElement>('.pcard').forEach((c) => {
      c.classList.remove('is-entering');
      if (c.hidden) return;
      c.style.setProperty('--i', String(k++));
      void c.offsetWidth;
      c.classList.add('is-entering');
    });
  }, [filter, onLayoutChange]);

  const open = (p: Project, origin: HTMLElement) => modal.open(<ProjectDetail p={p} />, { origin });

  return (
    <section className="section" id="projects" aria-labelledby="projectsTitle" ref={sectionRef}>
      <div className="container">
        <header className="section-head" data-reveal>
          <p className="kicker mono">03 · Projects</p>
          <h2 id="projectsTitle">Selected work</h2>
        </header>
        <div className="tabs" role="group" aria-label="Filter projects" data-reveal>
          {FILTERS.map(([id, label]) => (
            <button key={id} type="button" className={`tab${filter === id ? ' is-active' : ''}`} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>
          ))}
        </div>
        <div className="featured-grid" data-reveal-group>
          {featured.map((p, i) => <ProjectCard key={p.id} p={p} i={i} hidden={!show(p)} onOpen={open} />)}
        </div>
        <h3 className="subhead" data-reveal hidden={shownMore === 0}>More builds</h3>
        <div className="more-grid" data-reveal-group>
          {more.map((p, i) => <ProjectCard key={p.id} p={p} i={i} hidden={!show(p)} onOpen={open} />)}
        </div>
        {shownAll === 0 && <p className="empty-note">No projects in this category yet.</p>}
      </div>
    </section>
  );
}
