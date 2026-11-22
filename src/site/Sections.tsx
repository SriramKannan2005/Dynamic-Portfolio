import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../shared/Icon';
import { useModal } from '../shared/Modal';
import { computeStat, fmt } from './content';
import { useContent, useLive } from './liveContent';
import { createTagSphere } from './lib/tagsphere.js';
import { finePointer, prefersReduced } from './lib/ui.js';
import { ResumeButton } from './Resume';

/* ---------------- Nav ---------------- */
const NAV = ['about', 'skills', 'projects', 'experience', 'achievements', 'education', 'contact'];
export function Nav() {
  return (
    <header className="nav" id="nav">
      <div className="nav-inner container">
        <a className="nav-logo" href="#hero" aria-label="Sriram Kannan, back to top">
          <span className="logo-mark">SK</span><span className="logo-text">Sriram Kannan</span>
        </a>
        <nav className="nav-links" id="navLinks" aria-label="Primary">
          {NAV.map((id) => <a key={id} href={`#${id}`}>{id[0].toUpperCase() + id.slice(1)}</a>)}
        </nav>
        <div className="nav-actions">
          <button className="icon-btn" id="motionToggle" type="button" aria-pressed="true" aria-label="Animations on: turn off">
            <Icon id="spark" className="ic ic-motion-on" /><Icon id="pause" className="ic ic-motion-off" />
          </button>
          <button className="icon-btn" id="themeToggle" type="button" aria-label="Switch to light theme">
            <Icon id="sun" className="ic ic-sun" /><Icon id="moon" className="ic ic-moon" />
          </button>
          <button className="icon-btn nav-menu-btn" id="menuBtn" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="navLinks">
            <Icon id="menu" />
          </button>
        </div>
      </div>
    </header>
  );
}

/* ---------------- Hero ---------------- */
const SOCIAL: [string, string, string][] = [
  ['github', 'GitHub', 'github'], ['linkedin', 'LinkedIn', 'linkedin'], ['leetcode', 'LeetCode', 'code'], ['hackerrank', 'HackerRank', 'hex'],
];
export function Hero({ availability }: { availability: { open: boolean; text: string } }) {
  const content = useContent();
  const words = content.profile.name.split(/\s+/);
  const total = words.join('').length;
  let idx = 0;
  return (
    <section className="hero" id="hero" aria-labelledby="heroName">
      <div className="hero-pin">
        <div className="hero-inner container">
          <p className="eyebrow mono">{availability.open && <span className="pulse-dot" aria-hidden="true" />} {availability.text}</p>
          <h1 className="hero-name is-split" id="heroName" aria-label={content.profile.name}>
            {words.map((w) => (
              <span className="word" aria-hidden="true" key={w}>
                {[...w].map((ch) => {
                  const i = idx++;
                  return (
                    <span className="ch" key={i} style={{ '--i': i, '--bw': `${total * 100}%`, '--bx': `${total > 1 ? (i / (total - 1)) * 100 : 0}%` } as React.CSSProperties}>{ch}</span>
                  );
                })}
              </span>
            ))}
          </h1>
          <div className="role-rotator" aria-hidden="true">
            <span className="role-prefix mono">&gt;</span>
            <span className="role-viewport"><span className="role-text" id="roleText">{content.profile.roles[0]}</span></span>
            <span className="caret" />
          </div>
          <p className="hero-title">{content.profile.title}</p>
          <div className="hero-cta">
            <a className="btn btn-primary magnetic" href="#projects"><span>View projects</span><Icon id="arrow" /></a>
            <ResumeButton className="btn btn-ghost magnetic"><Icon id="download" /><span>Resume</span></ResumeButton>
          </div>
          <ul className="hero-social" aria-label="Profiles">
            {SOCIAL.map(([key, label, icon]) => (
              <li key={key}><a className="icon-btn magnetic" href={content.profile.links[key]} target="_blank" rel="noopener" aria-label={label}><Icon id={icon} /></a></li>
            ))}
          </ul>
        </div>
        <p className="hero-hint mono" aria-hidden="true">move · click · scroll</p>
      </div>
    </section>
  );
}

/* ---------------- About ---------------- */
export function About() {
  const { content, projectCount } = useLive();
  return (
    <section className="section" id="about" aria-labelledby="aboutTitle">
      <div className="container">
        <header className="section-head" data-reveal>
          <p className="kicker mono">01 · About</p>
          <h2 id="aboutTitle">I turn models into products.</h2>
        </header>
        <div className="about-grid">
          <figure className="about-photo" data-reveal>
            <div className="photo-ring">
              <img src="/assets/images/profile/profile.png" alt="Portrait of Sriram Kannan" width={420} height={420} loading="lazy" decoding="async" />
            </div>
            <figcaption className="mono"><Icon id="pin" /> {content.profile.location}</figcaption>
          </figure>
          <div className="about-copy" data-reveal>
            <div>{content.about.map((t, i) => <p key={i}>{t}</p>)}</div>
            <ul className="stats" data-reveal-group>
              {content.stats.map((s) => {
                const v = computeStat(s, content, projectCount);
                if (!v || !(v.value > 0)) return null;
                return (
                  <li className="stat glass" key={s.id + v.value}>
                    <span className="stat-num" data-stat={s.id} data-count-to={v.value} data-count-decimals={v.decimals} data-count-suffix={v.suffix}>
                      {fmt(v.value, v.decimals) + v.suffix}
                    </span>
                    <span className="stat-label">{s.label}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------- Skills ---------------- */
export function Skills() {
  const content = useContent();
  const groups = content.skills;
  const [filter, setFilter] = useState('all');
  const [readout, setReadout] = useState(finePointer() ? 'drag to spin' : 'drag to spin · tap a tag');
  const sphereEl = useRef<HTMLDivElement>(null);
  const sphere = useRef<{ setFilter(c: string): void; destroy(): void } | null>(null);
  const tags = useMemo(() => groups.flatMap((g) => g.items.map((label) => ({ label, cat: g.id, catName: g.name }))), [groups]);

  useEffect(() => {
    if (!sphereEl.current) return;
    const idle = finePointer() ? 'drag to spin' : 'drag to spin · tap a tag';
    sphere.current = createTagSphere(sphereEl.current, tags, {
      reduced: prefersReduced(),
      onHover: (t: { label: string; catName: string } | null) => setReadout(t ? `${t.label} · ${t.catName}` : idle),
    });
    return () => { sphere.current?.destroy(); sphere.current = null; };
  }, [tags]);
  useEffect(() => { sphere.current?.setFilter(filter); }, [filter]);

  return (
    <section className="section" id="skills" aria-labelledby="skillsTitle">
      <div className="container">
        <header className="section-head" data-reveal>
          <p className="kicker mono">02 · Skills</p>
          <h2 id="skillsTitle">The toolkit</h2>
          <p className="section-sub">Drag the sphere to spin it. Hover a tag to see its category.</p>
        </header>
        <div className="skill-filters" role="group" aria-label="Filter skills by category" data-reveal>
          {[{ id: 'all', name: 'All' }, ...groups].map((g) => (
            <button key={g.id} type="button" className="chip-btn" aria-pressed={filter === g.id} onClick={() => setFilter(g.id)}>{g.name}</button>
          ))}
        </div>
        <div className="skills-grid">
          <div className="sphere-wrap" data-reveal>
            <div className="sphere-fx" aria-hidden="true"><span className="orbit o1" /><span className="orbit o2" /><span className="orbit o3" /><span className="core" /></div>
            <div className="tag-sphere" ref={sphereEl} role="img" aria-label="Rotating 3D sphere of skill tags. The same skills are listed by category alongside." />
            <p className="sphere-readout mono" aria-hidden="true">{readout}</p>
          </div>
          <div className="skill-groups" data-reveal-group>
            {groups.map((g) => (
              <section key={g.id} className={`skill-group glass spot${filter !== 'all' && filter !== g.id ? ' is-dim' : ''}${filter === g.id ? ' is-match' : ''}`} data-cat={g.id} aria-label={g.name}
                onClick={() => setFilter(filter === g.id ? 'all' : g.id)}>
                <h3>{g.name}<span className="skill-count mono" aria-label={`${g.items.length} skills`}>{g.items.length}</span></h3>
                <ul>{g.items.map((s, k) => <li key={s} style={{ '--k': k } as React.CSSProperties}>{s}</li>)}</ul>
              </section>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------- Experience ---------------- */
export function ExperienceSection() {
  const content = useContent();
  return (
    <section className="section" id="experience" aria-labelledby="experienceTitle">
      <div className="container">
        <header className="section-head" data-reveal>
          <p className="kicker mono">04 · Experience</p>
          <h2 id="experienceTitle">Where I've worked</h2>
        </header>
        <div className="timeline-wrap" id="timelineWrap">
          <div className="timeline-track" aria-hidden="true"><span className="timeline-progress" id="timelineProgress" /></div>
          <ol className="timeline">
            {content.experience.map((e, i) => (
              <li className="tl-item" key={i + e.role + e.org}>
                <span className="tl-dot" aria-hidden="true" />
                <article className="tl-card glass spot">
                  <p className="tl-period">{e.period}</p>
                  <h3 className="tl-role">{e.role}</h3>
                  <p className="tl-org">{e.org}</p>
                  {e.summary && <p className="tl-summary">{e.summary}</p>}
                  {!!e.points?.length && <ul className="tl-points">{e.points.map((p, j) => <li key={j}>{p}</li>)}</ul>}
                  {!!e.tags?.length && <ul className="chips" aria-label="Skills used">{e.tags.map((t, j) => <li key={j}>{t}</li>)}</ul>}
                </article>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

/* ---------------- Achievements + certifications ---------------- */
const KIND_LABEL: Record<string, string> = { hackathon: 'Hackathon', grant: 'Grant', assessment: 'Assessment', coding: 'Coding practice' };
const LEVEL_LABEL: Record<string, string> = { national: 'National', state: 'State', college: 'College', international: 'International' };
/** "2nd Prize · HackSphere 2025" -> ["2nd Prize", "HackSphere 2025"] */
const splitTitle = (t: string): [string, string] => { const i = t.indexOf(' · '); return i < 0 ? [t, ''] : [t.slice(0, i), t.slice(i + 3)]; };
const endYear = (period: string) => Number((period.match(/(\d{4})\s*$/) ?? [])[1] ?? 0);

export function Achievements() {
  const modal = useModal();
  const content = useContent();
  return (
    <section className="section" id="achievements" aria-labelledby="achievementsTitle">
      <div className="container">
        <header className="section-head" data-reveal>
          <p className="kicker mono">05 · Achievements</p>
          <h2 id="achievementsTitle">Wins &amp; milestones</h2>
        </header>
        {/* Bento: the first win is the hero tile, the rest fill a 2 x 2 */}
        <ul className="ach-grid" data-reveal-group>
          {content.achievements.map((a, i) => {
            const [head, event] = splitTitle(a.title);
            const tag = [KIND_LABEL[a.kind] ?? a.kind, a.level ? LEVEL_LABEL[a.level] ?? a.level : ''].filter(Boolean).join(' · ');
            return (
              <li key={i + a.id} className={`ach spot ach-${a.kind}${i === 0 ? ' is-hero' : ''}`}>
                <span className="ach-watermark" aria-hidden="true"><Icon id={a.icon ?? 'trophy'} /></span>
                <div className="ach-top">
                  <span className="ach-tag mono">{tag}</span>
                  <span className="ach-icon" aria-hidden="true"><Icon id={a.icon ?? 'trophy'} /></span>
                </div>
                <h3 className="ach-head">{head}</h3>
                {event && <p className="ach-event mono">{event}</p>}
                {a.detail && <p className="ach-detail">{a.detail}</p>}
                {a.metric && (
                  <div className="ach-metric">
                    <b key={a.metric.value} data-count-to={a.metric.value} data-count-decimals={a.metric.decimals ?? 0} data-count-suffix={a.metric.suffix ?? ''}>
                      {fmt(a.metric.value, a.metric.decimals ?? 0) + (a.metric.suffix ?? '')}
                    </b>
                    <small>{a.metric.label}</small>
                  </div>
                )}
                {a.link && <a className="ach-link" href={a.link} target="_blank" rel="noopener" aria-label={`${a.title}: open profile`}><Icon id="ext" /></a>}
              </li>
            );
          })}
        </ul>

        <h3 className="subhead" data-reveal>Certifications</h3>
        <ul className="certs" data-reveal-group>
          {content.certifications.map((c, i) => (
            <li key={i + c.title}>
              <button
                type="button" className="cert spot" aria-haspopup="dialog" style={{ '--tilt': `${i % 2 ? 2.2 : -2.2}deg` } as React.CSSProperties}
                onClick={(e) => modal.open(
                  <>
                    <div className="cert-view"><img src={c.image} alt={`${c.title} certificate issued by ${c.issuer}`} decoding="async" /></div>
                    <div className="m-content"><p className="m-cat">{c.issuer}</p><h2 className="m-title" id="modalTitle">{c.title}</h2></div>
                  </>,
                  { origin: e.currentTarget },
                )}
              >
                <span className="cert-paper">
                  <span className="cert-pin" aria-hidden="true" />
                  <img src={c.image} alt="" loading="lazy" decoding="async" width={320} height={240} />
                  <span className="cert-shine" aria-hidden="true" />
                </span>
                <span className="cert-seal mono" aria-hidden="true"><Icon id="check" />Verified</span>
                <span className="cert-meta">
                  <small className="mono">{c.issuer}</small>
                  <b>{c.title}</b>
                  <span className="cert-cta">View certificate <Icon id="arrow" /></span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function Education() {
  const content = useContent();
  // Oldest -> newest along the line; a period ending after this year is "in progress"
  const items = [...content.education].reverse();
  const thisYear = new Date().getFullYear();
  return (
    <section className="section" id="education" aria-labelledby="educationTitle">
      <div className="container">
        <header className="section-head" data-reveal>
          <p className="kicker mono">06 · Education</p>
          <h2 id="educationTitle">Education</h2>
        </header>
        <ol className="edu-line" data-reveal-group style={{ '--n': items.length } as React.CSSProperties}>
          {items.map((e, i) => {
            const live = endYear(e.period) > thisYear;
            return (
              <li className={`edu-step${live ? ' is-live' : ''}`} key={i + e.degree}>
                <div className="edu-node" aria-hidden="true"><span /></div>
                <p className="edu-when mono">{e.period}{live && <span className="edu-live">In progress</span>}</p>
                <article className="edu-card spot">
                  <span className="edu-icon" aria-hidden="true"><Icon id="cap" /></span>
                  <h3>{e.degree}</h3>
                  <p className="edu-school">{e.school}</p>
                  {e.note && <p className="edu-note mono">{e.note}</p>}
                  {e.score && <span className="edu-score">{e.score}</span>}
                </article>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

export function Footer() {
  const content = useContent();
  const l = content.profile.links;
  return (
    <footer className="footer" id="footer">
      <canvas className="footer-field" id="footerField" aria-hidden="true" />
      <div className="container footer-inner">
        <div>
          <p className="footer-name">{content.profile.name}</p>
          <p className="footer-meta">AI &amp; ML Developer · <span>{new Date().getFullYear()}</span></p>
        </div>
        <ul className="footer-links" aria-label="Profiles">
          <li><a href={l.github} target="_blank" rel="noopener">GitHub</a></li>
          <li><a href={l.linkedin} target="_blank" rel="noopener">LinkedIn</a></li>
          <li><a href={l.leetcode} target="_blank" rel="noopener">LeetCode</a></li>
          <li><a href={l.hackerrank} target="_blank" rel="noopener">HackerRank</a></li>
        </ul>
      </div>
    </footer>
  );
}
