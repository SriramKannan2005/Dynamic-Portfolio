import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ModalProvider } from '../shared/Modal';
import { Icon } from '../shared/Icon';
import { content, projects } from './content';
import { applyProjectOverrides, availabilityOf, announcementOf, cachedOverrides, fetchOverrides, type SiteOverrides } from '../shared/siteContent';
import { Nav, Hero, About, Skills, ExperienceSection, Achievements, Education, Footer } from './Sections';
import { Projects } from './Projects';
import { Contact } from './Contact';
import {
  Loader, initReveals, initCounters, initCursor, initMagnetic, initTheme, initNav, initToTop,
  initFooterField, initTimeline, initRoleRotator, initMotionToggle, prefersReduced,
} from './lib/ui.js';
import './styles.css';

type SceneApi = { intro(): void; setTheme(t: string): void; refresh(): void };

const lowPower = () => {
  try {
    const n = navigator as Navigator & { deviceMemory?: number };
    return window.innerWidth < 768 || (n.hardwareConcurrency > 0 && n.hardwareConcurrency <= 4) || (!!n.deviceMemory && n.deviceMemory <= 4) || matchMedia('(pointer: coarse)').matches;
  } catch { return true; }
};
const webglAvailable = () => {
  if (/[?&]nowebgl\b/.test(location.search)) return false;
  try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch { return false; }
};
const idle = (fn: () => void) => ('requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 700 }) : setTimeout(fn, 120));

function AnnouncementBar({ text, link }: { text: string; link: string }) {
  const key = `sk-ann-${text.length}-${text.slice(0, 24)}`;
  const [hidden, setHidden] = useState(() => { try { return sessionStorage.getItem(key) === '1'; } catch { return false; } });
  if (hidden) return null;
  return (
    <div className="announce" role="region" aria-label="Announcement">
      <p>{link ? <a href={link} target={link.startsWith('/') ? undefined : '_blank'} rel="noopener">{text} <Icon id="arrow" /></a> : text}</p>
      <button type="button" className="announce-x" aria-label="Dismiss announcement" onClick={() => { try { sessionStorage.setItem(key, '1'); } catch { /* blocked */ } setHidden(true); }}><Icon id="close" /></button>
    </div>
  );
}

export default function Site() {
  const scene = useRef<SceneApi | null>(null);
  const refreshScene = useCallback(() => scene.current?.refresh(), []);
  // Admin overrides: last-seen copy renders immediately; the fresh copy is fetched
  // after first paint and, if it changed, the Projects section remounts with it.
  const [overrides, setOverrides] = useState<SiteOverrides | null>(() => cachedOverrides());
  const firstSig = useRef(overrides?.updatedAt ?? 'base');
  const sig = overrides?.updatedAt ?? 'base';
  const projectList = useMemo(() => applyProjectOverrides(projects, overrides), [overrides]);
  const announcement = announcementOf(overrides);

  useEffect(() => {
    const html = document.documentElement;
    const reduced = prefersReduced();
    html.classList.remove('route-admin');

    const loader = new Loader({ reduced });
    loader.track(document.fonts ? document.fonts.ready : Promise.resolve(), 1);
    initTheme((t: string) => scene.current?.setTheme(t));
    initMotionToggle();
    initCursor({ reduced });
    initFooterField({ reduced });
    const nav = initNav();
    const toTop = initToTop({ reduced });
    initReveals();
    initCounters(document.querySelectorAll('#main [data-count-to]'), { reduced });
    initMagnetic(document.querySelectorAll('.magnetic'), { reduced });
    const timeline = initTimeline();

    // Scene module downloads now; it is created after the loader reveals the hero.
    const sceneMod = webglAvailable() ? import('./lib/scene.js') : null;
    if (!sceneMod) html.classList.add('no-webgl');
    loader.onExit(() => {
      document.body.classList.add('hero-in');
      initRoleRotator(document.getElementById('roleText'), content.profile.roles, { reduced });
      sceneMod
        ?.then(({ createScene }) => new Promise<void>((r) => idle(r)).then(() => createScene(document.getElementById('scene') as HTMLCanvasElement, {
          mobile: lowPower(), reduced, theme: html.getAttribute('data-theme') || 'dark',
        })))
        .then((s) => {
          scene.current = s as SceneApi;
          scene.current.setTheme(html.getAttribute('data-theme') === 'light' ? 'light' : 'dark');
          html.classList.add('scene-ready');
          scene.current.intro();
        })
        .catch(() => html.classList.add('no-webgl'));
      // Analytics after everything visual has settled
      idle(() => { import('./tracking').then((t) => t.trackVisit()).catch(() => {}); });
      idle(() => {
        fetchOverrides()
          .then((o) => setOverrides((prev) => ((prev?.updatedAt ?? '') === (o?.updatedAt ?? '') ? prev : o)))
          .catch(() => { /* keep the repo content */ });
      });
    });

    const heroEl = document.getElementById('hero') as HTMLElement;
    const heroInner = document.querySelector('.hero-inner') as HTMLElement;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const y = window.scrollY;
        if (!reduced) {
          const range = Math.max(1, heroEl.offsetHeight - window.innerHeight);
          heroInner.style.setProperty('--hp', Math.min(1, Math.max(0, y / range)).toFixed(4));
        }
        nav.update(y);
        toTop.update(y);
        timeline.update();
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    onScroll();

    // Hidden admin shortcuts (same as the previous site):
    //  - triple-click the "SK" logo within 500 ms
    //  - Ctrl+Shift+A (Windows/Linux) or Cmd+Shift+A (macOS)
    // Full navigation so the 3D scene stops instead of running behind the admin.
    const goAdmin = () => window.location.assign('/admin');
    const logo = document.querySelector<HTMLElement>('.nav-logo');
    let clicks = 0;
    let clickTimer = 0;
    const onLogoClick = (e: MouseEvent) => {
      clicks += 1;
      if (clicks === 1) clickTimer = window.setTimeout(() => { clicks = 0; }, 500);
      if (clicks === 3) { e.preventDefault(); clearTimeout(clickTimer); clicks = 0; goAdmin(); }
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'a') { e.preventDefault(); goAdmin(); }
    };
    logo?.addEventListener('click', onLogoClick);
    document.addEventListener('keydown', onKey);
    (window as unknown as Record<string, unknown>).__skReady = true;
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      logo?.removeEventListener('click', onLogoClick);
      document.removeEventListener('keydown', onKey);
      clearTimeout(clickTimer);
    };
  }, []);

  return (
    <ModalProvider reduced={prefersReduced()}>
      <a className="skip-link" href="#main">Skip to content</a>
      {announcement && <AnnouncementBar text={announcement.text} link={announcement.link} />}
      <Nav />
      <main id="main" tabIndex={-1}>
        <Hero availability={availabilityOf(overrides)} />
        <About />
        <Skills />
        <Projects key={sig} list={projectList} onLayoutChange={refreshScene} revealNow={sig !== firstSig.current} />
        <ExperienceSection />
        <Achievements />
        <Education />
        <Contact />
      </main>
      <Footer />
      <button className="to-top" id="toTop" type="button" aria-label="Back to top">
        <svg className="to-top-ring" viewBox="0 0 48 48" aria-hidden="true"><circle className="ring-bg" cx="24" cy="24" r="21" /><circle className="ring-fg" id="toTopRing" cx="24" cy="24" r="21" /></svg>
        <Icon id="up" />
      </button>
      <div className="motion-note" id="motionNote" role="region" aria-label="Animation notice" hidden>
        <p>Animations are reduced by your device's motion setting.</p>
        <button className="btn btn-primary" type="button" id="motionEnable">Enable animations</button>
        <button className="icon-btn" type="button" id="motionDismiss" aria-label="Dismiss"><Icon id="close" /></button>
      </div>
    </ModalProvider>
  );
}
