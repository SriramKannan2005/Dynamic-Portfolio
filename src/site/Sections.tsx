import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../shared/Icon';
import { useModal } from '../shared/Modal';
import { content, computeStat, fmt } from './content';
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
            <div>{content.about.map((t) => <p key={t}>{t}</p>)}</div>
            <ul className="stats" data-reveal-group>
              {content.stats.map((s) => {
                const v = computeStat(s);
                if (!v || !(v.value > 0)) return null;
                return (
                  <li className="stat glass" key={s.id}>
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
            <div className="tag-sphere" ref={sphereEl} role="img" aria-label="Rotating 3D sphere of skill tags. The same skills are listed by category alongside." />
            <p className="sphere-readout mono" aria-hidden="true">{readout}</p>
          </div>
          <div className="skill-groups" data-reveal-group>
            {groups.map((g) => (
              <section key={g.id} className={`skill-group glass${filter !== 'all' && filter !== g.id ? ' is-dim' : ''}${filter === g.id ? ' is-match' : ''}`} data-cat={g.id} aria-label={g.name}>
                <h3>{g.name}</h3>
                <ul>{g.items.map((s) => <li key={s}>{s}</li>)}</ul>
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
            {content.experience.map((e) => (
              <li className="tl-item" key={e.role + e.org}>
                <span className="tl-dot" aria-hidden="true" />
                <article className="tl-card glass">
                  <p className="tl-period">{e.period}</p>
                  <h3 className="tl-role">{e.role}</h3>
                  <p className="tl-org">{e.org}</p>
                  {e.summary && <p className="tl-summary">{e.summary}</p>}
                  {!!e.points?.length && <ul className="tl-points">{e.points.map((p) => <li key={p}>{p}</li>)}</ul>}
                  {!!e.tags?.length && <ul className="chips" aria-label="Skills used">{e.tags.map((t) => <li key={t}>{t}</li>)}</ul>}
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
export function Achievements() {
  const modal = useModal();
  return (
    <section className="section" id="achievements" aria-labelledby="achievementsTitle">
      <div className="container">
        <header className="section-head" data-reveal>
          <p className="kicker mono">05 · Achievements</p>
          <h2 id="achievementsTitle">Wins &amp; milestones</h2>
        </header>
        <ul className="badges" data-reveal-group>
          {content.achievements.map((a, i) => (
            <li key={a.id}>
              <div className="badge" style={{ '--i': i } as React.CSSProperties}>
                <div className="badge-card">
                  <span className="badge-icon" aria-hidden="true"><Icon id={a.icon ?? 'trophy'} /></span>
                  <h3>{a.title}</h3>
                  <p>{a.detail}</p>
                  {a.metric && (
                    <div className="badge-metric">
                      <b data-count-to={a.metric.value} data-count-decimals={a.metric.decimals ?? 0} data-count-suffix={a.metric.suffix ?? ''}>
                        {fmt(a.metric.value, a.metric.decimals ?? 0) + (a.metric.suffix ?? '')}
                      </b>
                      <small>{a.metric.label}</small>
                    </div>
                  )}
                  {a.link && <a className="badge-link" href={a.link} target="_blank" rel="noopener" aria-label={`${a.title}: open profile`} />}
                </div>
              </div>
            </li>
          ))}
        </ul>
        <h3 className="subhead" data-reveal>Certifications</h3>
        <ul className="certs" data-reveal-group>
          {content.certifications.map((c) => (
            <li key={c.title}>
              <button
                type="button" className="cert glass" aria-haspopup="dialog"
                onClick={(e) => modal.open(
                  <>
                    <div className="cert-view"><img src={c.image} alt={`${c.title} certificate issued by ${c.issuer}`} decoding="async" /></div>
                    <div className="m-content"><p className="m-cat">{c.issuer}</p><h2 className="m-title" id="modalTitle">{c.title}</h2></div>
                  </>,
                  { origin: e.currentTarget },
                )}
              >
                <span className="cert-thumb"><img src={c.image} alt="" loading="lazy" decoding="async" width={160} height={120} /></span>
                <span><b>{c.title}</b><small>{c.issuer} · view certificate</small></span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ---------------- Education ---------------- */
export function Education() {
  return (
    <section className="section" id="education" aria-labelledby="educationTitle">
      <div className="container">
        <header className="section-head" data-reveal>
          <p className="kicker mono">06 · Education</p>
          <h2 id="educationTitle">Education</h2>
        </header>
        <ul className="edu" data-reveal-group>
          {content.education.map((e) => (
            <li className="edu-item glass" key={e.degree}>
              <span className="edu-icon" aria-hidden="true"><Icon id="cap" /></span>
              <div><h3>{e.degree}</h3><p>{e.school}{e.note ? ` · ${e.note}` : ''}</p></div>
              <div className="edu-side"><span className="edu-period">{e.period}</span>{e.score && <span className="edu-score">{e.score}</span>}</div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ---------------- Footer ---------------- */
export function Footer() {
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
