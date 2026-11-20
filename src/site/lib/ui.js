/**
 * ui.js: imperative effects used by the React site: loader, reveals, cursor, magnetic buttons,
 * counters, theme, nav, back-to-top, footer particles, timeline, hero text.
 */

// Single source of truth: the head script resolves OS preference + the visitor's
// motion toggle into html.reduced-motion before any CSS or JS runs.
export const prefersReduced = () => document.documentElement.classList.contains('reduced-motion');

/** Motion toggle in the nav + one-time notice when the OS asks for reduced motion. */
export function initMotionToggle() {
  const html = document.documentElement;
  const btn = document.getElementById('motionToggle');
  const note = document.getElementById('motionNote');
  const reduced = html.classList.contains('reduced-motion');
  const store = (v) => { try { localStorage.setItem('sk-motion', v); } catch (e) { /* storage blocked */ } };
  if (btn) {
    btn.setAttribute('aria-pressed', String(!reduced));
    btn.setAttribute('aria-label', reduced ? 'Animations off: turn on' : 'Animations on: turn off');
    btn.title = btn.getAttribute('aria-label');
    // The scene, sphere and cursor are configured at start-up, so apply by reloading.
    btn.addEventListener('click', () => { store(reduced ? 'on' : 'off'); location.reload(); });
  }
  if (!note || !html.classList.contains('os-reduced')) return;
  let dismissed = false;
  try { dismissed = sessionStorage.getItem('sk-motion-note') === '1'; } catch (e) { /* ignore */ }
  if (dismissed) return;
  note.hidden = false;
  document.getElementById('motionEnable').addEventListener('click', () => { store('on'); location.reload(); });
  document.getElementById('motionDismiss').addEventListener('click', () => {
    note.hidden = true;
    try { sessionStorage.setItem('sk-motion-note', '1'); } catch (e) { /* ignore */ }
  });
}
export const finePointer = () => {
  try { return window.matchMedia('(hover: hover) and (pointer: fine)').matches; } catch (e) { return false; }
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* =========================================================
   Loader: wireframe icosahedron assembling from points
   ========================================================= */
export class Loader {
  constructor({ reduced }) {
    this.el = document.getElementById('loader');
    this.canvas = document.getElementById('loaderCanvas');
    this.pctEl = document.getElementById('loaderPct');
    this.reduced = reduced;
    this.target = 0;
    this.shown = 0;
    this.tasks = [];
    this.start = performance.now();
    this.minTime = reduced ? 150 : 650;
    this.done = false;
    this.listeners = [];
    if (!this.el || !this.canvas) { this.done = true; return; }

    const phi = (1 + Math.sqrt(5)) / 2;
    const raw = [[-1, phi, 0], [1, phi, 0], [-1, -phi, 0], [1, -phi, 0], [0, -1, phi], [0, 1, phi], [0, -1, -phi], [0, 1, -phi], [phi, 0, -1], [phi, 0, 1], [-phi, 0, -1], [-phi, 0, 1]];
    const len = Math.hypot(1, phi);
    this.verts = raw.map((v) => v.map((c) => c / len));
    this.edges = [];
    for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) {
      const d = Math.hypot(raw[i][0] - raw[j][0], raw[i][1] - raw[j][1], raw[i][2] - raw[j][2]);
      if (Math.abs(d - 2) < 0.01) this.edges.push([i, j]);
    }
    // Scattered start positions for the "assembling" effect
    this.starts = this.verts.map(() => [(Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 3]);
    this.dust = Array.from({ length: 50 }, () => [(Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3]);

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = 240 * dpr; this.canvas.height = 240 * dpr;
    this.ctx = this.canvas.getContext('2d');
    this.ctx.scale(dpr, dpr);
    this.raf = requestAnimationFrame((t) => this.tick(t));
    this.failsafe = setTimeout(() => { this.target = 1; }, 5500);
  }
  track(promise, weight = 1) {
    const task = { weight, done: false };
    this.tasks.push(task);
    Promise.resolve(promise).catch(() => {}).finally(() => { task.done = true; this.recompute(); });
    return promise;
  }
  recompute() {
    const total = this.tasks.reduce((s, t) => s + t.weight, 0) || 1;
    this.target = this.tasks.reduce((s, t) => s + (t.done ? t.weight : 0), 0) / total;
  }
  onExit(fn) { this.listeners.push(fn); }
  tick(t) {
    if (this.done) return;
    const elapsed = t - this.start;
    // Displayed progress eases toward the real progress but is paced by time.
    const timeCap = clamp(elapsed / this.minTime, 0, 1);
    const goal = Math.min(this.target, timeCap * 0.999 + (this.target >= 1 && timeCap >= 1 ? 0.001 : 0));
    this.shown += (goal - this.shown) * (this.reduced ? 1 : 0.12);
    if (goal - this.shown < 0.002) this.shown = goal;
    this.draw(this.shown, t / 1000);
    const pct = Math.round(this.shown * 100);
    if (this.pctEl.textContent !== String(pct)) this.pctEl.textContent = String(pct);
    if (this.shown >= 0.999 && this.target >= 1 && elapsed >= this.minTime) { this.exit(); return; }
    this.raf = requestAnimationFrame((tt) => this.tick(tt));
  }
  draw(p, time) {
    const ctx = this.ctx, S = 240, c = S / 2, scale = 78;
    ctx.clearRect(0, 0, S, S);
    const ay = this.reduced ? 0.6 : time * 0.9, ax = this.reduced ? 0.4 : time * 0.45;
    const cy = Math.cos(ay), sy = Math.sin(ay), cx = Math.cos(ax), sx = Math.sin(ax);
    const project = ([x, y, z]) => {
      const x1 = x * cy - z * sy, z1 = x * sy + z * cy;
      const y1 = y * cx - z1 * sx, z2 = y * sx + z1 * cx;
      const persp = 3.2 / (3.2 - z2);
      return [c + x1 * scale * persp, c + y1 * scale * persp, z2];
    };
    const ease = (v) => 1 - Math.pow(1 - clamp(v, 0, 1), 3);
    const pts = this.verts.map((v, i) => {
      const k = ease(p * 1.8 - (i / 12) * 0.7);
      const s = this.starts[i];
      return project([s[0] + (v[0] - s[0]) * k, s[1] + (v[1] - s[1]) * k, s[2] + (v[2] - s[2]) * k]);
    });
    const light = document.documentElement.getAttribute('data-theme') === 'light';
    // Edges draw in once both endpoints have nearly arrived
    this.edges.forEach(([a, b], e) => {
      const k = clamp((p - 0.3 - (e / this.edges.length) * 0.5) / 0.2, 0, 1);
      if (k <= 0) return;
      const A = pts[a], B = pts[b];
      const depth = ((A[2] + B[2]) / 2 + 1) / 2;
      ctx.strokeStyle = light ? `rgba(79,70,229,${0.25 + depth * 0.6})` : `rgba(129,140,248,${0.25 + depth * 0.65})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(A[0], A[1]);
      ctx.lineTo(A[0] + (B[0] - A[0]) * k, A[1] + (B[1] - A[1]) * k);
      ctx.stroke();
    });
    this.dust.forEach((d) => {
      const q = project(d.map((v) => v * (1 - p * 0.6)));
      ctx.fillStyle = light ? 'rgba(99,102,241,.35)' : 'rgba(167,139,250,.45)';
      ctx.fillRect(q[0], q[1], 1.4, 1.4);
    });
    pts.forEach((q) => {
      const g = ctx.createRadialGradient(q[0], q[1], 0, q[0], q[1], 7);
      g.addColorStop(0, light ? 'rgba(8,145,178,1)' : 'rgba(103,232,249,1)');
      g.addColorStop(1, 'rgba(34,211,238,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(q[0], q[1], 7, 0, Math.PI * 2); ctx.fill();
    });
  }
  exit() {
    if (this.done) return;
    this.done = true;
    clearTimeout(this.failsafe);
    cancelAnimationFrame(this.raf);
    if (this.pctEl) this.pctEl.textContent = '100';
    this.listeners.forEach((fn) => { try { fn(); } catch (e) { /* keep going */ } });
    if (!this.el) return;
    this.el.classList.add('is-exit');
    setTimeout(() => this.el.remove(), this.reduced ? 50 : 950);
  }
}

/* =========================================================
   Reveals: IntersectionObserver, staggered, 3D entrance
   ========================================================= */
export function initReveals(root = document) {
  const els = [...root.querySelectorAll('[data-reveal]:not(.is-visible), [data-reveal-group]:not(.is-visible)')];
  els.forEach((el) => {
    if (el.hasAttribute('data-reveal-group')) [...el.children].forEach((c, i) => c.style.setProperty('--i', i));
  });
  if (!('IntersectionObserver' in window)) { els.forEach((el) => el.classList.add('is-visible')); return; }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add('is-visible'); io.unobserve(e.target); }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
  els.forEach((el) => io.observe(el));
}

/* =========================================================
   Counters: final value always rendered first; animation
   counts from 0 only when visible; "+" appended at the end
   so "0+" can never be displayed.
   ========================================================= */
export function formatNumber(value, decimals = 0) {
  return decimals ? value.toFixed(decimals) : String(Math.round(value));
}
export function setCounter(el, value, { decimals = 0, suffix = '' } = {}) {
  el.dataset.countTo = value;
  el.dataset.countDecimals = decimals;
  el.dataset.countSuffix = suffix;
  el.textContent = formatNumber(value, decimals) + suffix;
}
export function initCounters(els, { reduced }) {
  const list = [...els].filter((el) => el.dataset.countTo !== undefined && !el.dataset.counted);
  if (reduced || !('IntersectionObserver' in window)) return; // final values already shown
  const run = (el) => {
    el.dataset.counted = '1';
    const to = parseFloat(el.dataset.countTo);
    const dec = parseInt(el.dataset.countDecimals || '0', 10);
    const suffix = el.dataset.countSuffix || '';
    const finalText = formatNumber(to, dec) + suffix;
    if (!isFinite(to) || to <= 0) { el.textContent = finalText; return; }
    const dur = 1400 + Math.min(800, to * 2);
    const t0 = performance.now();
    try {
      const step = (t) => {
        const k = clamp((t - t0) / dur, 0, 1);
        const e = 1 - Math.pow(1 - k, 4);
        if (k < 1) {
          // No suffix while counting: never "0+" or partial "+".
          el.textContent = formatNumber(to * e, dec);
          requestAnimationFrame(step);
        } else {
          el.textContent = finalText;
        }
      };
      requestAnimationFrame(step);
      // Failsafe: whatever happens, land on the final value.
      setTimeout(() => { el.textContent = finalText; }, dur + 400);
    } catch (err) {
      el.textContent = finalText;
    }
  };
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { io.unobserve(e.target); run(e.target); } });
  }, { threshold: 0.5 });
  list.forEach((el) => io.observe(el));
}

/* =========================================================
   Custom cursor (fine pointers only, off for reduced motion)
   ========================================================= */
export function initCursor({ reduced }) {
  if (reduced || !finePointer()) return;
  const dot = document.querySelector('.cursor-dot');
  const ring = document.querySelector('.cursor-ring');
  if (!dot || !ring) return;
  const html = document.documentElement;
  let x = -100, y = -100, rx = -100, ry = -100, raf = 0, active = false;
  const interactive = 'a, button, [role="button"], input, textarea, select, label, .tag, .pcard, .cert, [data-cursor]';
  const loop = () => {
    rx += (x - rx) * 0.2; ry += (y - ry) * 0.2;
    dot.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    ring.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
    raf = Math.abs(x - rx) + Math.abs(y - ry) > 0.1 ? requestAnimationFrame(loop) : 0;
  };
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    if (!active) { active = true; html.classList.add('has-cursor'); rx = e.clientX; ry = e.clientY; }
    x = e.clientX; y = e.clientY;
    html.classList.remove('cursor-out');
    if (!raf) raf = requestAnimationFrame(loop);
    const hit = e.target.closest && e.target.closest(interactive);
    ring.classList.toggle('is-hover', !!hit);
  }, { passive: true });
  document.addEventListener('pointerleave', () => html.classList.add('cursor-out'));
  document.documentElement.addEventListener('mouseleave', () => html.classList.add('cursor-out'));
  window.addEventListener('pointerdown', () => ring.classList.add('is-down'), { passive: true });
  window.addEventListener('pointerup', () => ring.classList.remove('is-down'), { passive: true });
}

/* =========================================================
   Magnetic buttons
   ========================================================= */
export function initMagnetic(els, { reduced }) {
  if (reduced || !finePointer()) return;
  els.forEach((el) => {
    if (el.dataset.magnetic) return;
    el.dataset.magnetic = '1';
    const strength = el.classList.contains('icon-btn') ? 0.4 : 0.28;
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      el.style.transform = `translate3d(${dx * strength}px, ${dy * strength}px, 0)`;
    });
    el.addEventListener('pointerleave', () => { el.style.transform = ''; });
  });
}

/* =========================================================
   Theme toggle (persisted, try/catch wrapped)
   ========================================================= */
export function initTheme(onChange) {
  const html = document.documentElement;
  const btn = document.getElementById('themeToggle');
  const meta = document.querySelector('meta[name="theme-color"]');
  const sync = () => {
    const t = html.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    if (btn) btn.setAttribute('aria-label', t === 'light' ? 'Switch to dark theme' : 'Switch to light theme');
    if (meta) meta.setAttribute('content', t === 'light' ? '#f5f5fb' : '#07070d');
    return t;
  };
  sync();
  if (btn) btn.addEventListener('click', () => {
    const next = html.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    html.setAttribute('data-theme', next);
    try { localStorage.setItem('sk-theme', next); } catch (e) { /* storage blocked */ }
    onChange && onChange(sync());
  });
  return sync();
}

/* =========================================================
   Nav: scrolled state, active link, mobile menu
   ========================================================= */
export function initNav() {
  const nav = document.getElementById('nav');
  const links = [...document.querySelectorAll('#navLinks a')];
  const menu = document.getElementById('navLinks');
  const btn = document.getElementById('menuBtn');
  const setOpen = (open) => {
    menu.classList.toggle('is-open', open);
    btn.setAttribute('aria-expanded', String(open));
    btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  };
  btn.addEventListener('click', () => setOpen(!menu.classList.contains('is-open')));
  links.forEach((a) => a.addEventListener('click', () => setOpen(false)));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && menu.classList.contains('is-open')) { setOpen(false); btn.focus(); } });
  document.addEventListener('click', (e) => { if (menu.classList.contains('is-open') && !nav.contains(e.target)) setOpen(false); });

  if ('IntersectionObserver' in window) {
    const map = new Map(links.map((a) => [a.getAttribute('href').slice(1), a]));
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        links.forEach((a) => { a.classList.remove('is-active'); a.removeAttribute('aria-current'); });
        const a = map.get(e.target.id);
        if (a) { a.classList.add('is-active'); a.setAttribute('aria-current', 'true'); }
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    document.querySelectorAll('main > section').forEach((s) => io.observe(s));
  }
  return { update(y) { nav.classList.toggle('is-scrolled', y > 20); } };
}

/* =========================================================
   Back-to-top with scroll-progress ring
   ========================================================= */
export function initToTop({ reduced }) {
  const btn = document.getElementById('toTop');
  const ring = document.getElementById('toTopRing');
  const C = 2 * Math.PI * 21;
  ring.style.strokeDasharray = C.toFixed(2);
  btn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
    document.getElementById('main').focus({ preventScroll: true });
  });
  return {
    update(y) {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? clamp(y / max, 0, 1) : 0;
      ring.style.strokeDashoffset = (C * (1 - p)).toFixed(2);
      btn.classList.toggle('is-visible', y > 500);
    },
  };
}

/* =========================================================
   Footer mini particle field (2D canvas, only while visible)
   ========================================================= */
export function initFooterField({ reduced }) {
  const canvas = document.getElementById('footerField');
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext('2d');
  let w = 0, h = 0, raf = 0, parts = [];
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const size = () => {
    w = canvas.clientWidth; h = canvas.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.round(clamp(w / 22, 24, 70));
    parts = Array.from({ length: n }, () => ({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - 0.5) * 0.25, vy: (Math.random() - 0.5) * 0.25, r: Math.random() * 1.6 + 0.4 }));
  };
  const draw = () => {
    ctx.clearRect(0, 0, w, h);
    const light = document.documentElement.getAttribute('data-theme') === 'light';
    for (const p of parts) {
      if (!reduced) { p.x += p.vx; p.y += p.vy; }
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;
      ctx.fillStyle = light ? 'rgba(79,70,229,.45)' : 'rgba(165,180,252,.65)';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.lineWidth = 0.6;
    for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
      const a = parts[i], b = parts[j];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < 90) {
        ctx.strokeStyle = light ? `rgba(99,102,241,${(1 - d / 90) * 0.25})` : `rgba(34,211,238,${(1 - d / 90) * 0.22})`;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    }
  };
  const loop = () => { draw(); raf = requestAnimationFrame(loop); };
  size();
  draw();
  window.addEventListener('resize', () => { size(); draw(); }, { passive: true });
  if (reduced || !('IntersectionObserver' in window)) return;
  new IntersectionObserver(([e]) => {
    if (e.isIntersecting && !document.hidden) { if (!raf) loop(); }
    else { cancelAnimationFrame(raf); raf = 0; }
  }).observe(canvas);
}

/* =========================================================
   Experience timeline: line draws with scroll, cards swing in,
   active card highlighted
   ========================================================= */
export function initTimeline() {
  const wrap = document.getElementById('timelineWrap');
  const prog = document.getElementById('timelineProgress');
  const items = [...document.querySelectorAll('.tl-item')];
  if (!wrap || !items.length) return { update() {} };
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } });
    }, { threshold: 0.25 });
    items.forEach((i) => io.observe(i));
  } else items.forEach((i) => i.classList.add('is-in'));
  return {
    update() {
      const r = wrap.getBoundingClientRect();
      const vh = window.innerHeight;
      if (r.bottom < -100 || r.top > vh + 100) return;
      const p = clamp((vh * 0.6 - r.top) / r.height, 0, 1);
      prog.style.setProperty('--tp', p.toFixed(4));
      let best = null, bestD = Infinity;
      items.forEach((it) => {
        const ir = it.getBoundingClientRect();
        const d = Math.abs(ir.top + ir.height / 2 - vh * 0.5);
        if (d < bestD) { bestD = d; best = it; }
      });
      items.forEach((it) => it.classList.toggle('is-active', it === best));
    },
  };
}

/* =========================================================
   Hero: rotating role line
   ========================================================= */
export function initRoleRotator(el, roles, { reduced }) {
  if (!el || !roles || roles.length < 2 || reduced) { if (el && roles && roles[0]) el.textContent = roles[0]; return; }
  let i = 0;
  el.textContent = roles[0];
  setInterval(() => {
    if (document.hidden) return;
    el.classList.add('is-out');
    setTimeout(() => {
      i = (i + 1) % roles.length;
      el.textContent = roles[i];
      el.classList.remove('is-out');
      el.classList.add('is-in-start');
      void el.offsetWidth;
      el.classList.remove('is-in-start');
    }, 480);
  }, 2800);
}
