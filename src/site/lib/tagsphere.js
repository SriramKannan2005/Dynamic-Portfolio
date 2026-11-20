/**
 * tagsphere.js: DOM tag cloud projected on a rotating sphere.
 * Tags are positioned with translate3d + scale from a JS-maintained rotation matrix,
 * so hover, focus styles and text stay crisp (no WebGL text).
 *  - Idle auto-rotation about both axes (off for reduced motion)
 *  - Pointer drag with inertia; touch-action:none on the sphere only, so page scroll
 *    is only blocked when a touch starts on the sphere
 *  - Hover brings a tag forward, enlarges it and shows its category
 *  - setFilter(categoryId) dims non-matching tags
 */
/**
 * @param {HTMLElement} el
 * @param {{label: string, cat: string, catName: string}[]} tags
 * @param {{reduced?: boolean, onHover?: (t: {label: string, cat: string, catName: string} | null) => void}} [opts]
 */
export function createTagSphere(el, tags, { reduced = false, onHover = (_t) => {} } = {}) {
  const items = tags.map((t, i) => {
    const node = document.createElement('span');
    node.className = 'tag';
    node.dataset.cat = t.cat;
    node.setAttribute('aria-hidden', 'true');
    node.textContent = t.label;
    const cat = document.createElement('span');
    cat.className = 'tag-cat';
    cat.textContent = t.catName;
    node.appendChild(cat);
    el.appendChild(node);
    // Fibonacci distribution on the unit sphere
    const n = tags.length;
    const y = 1 - (i / (n - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const th = Math.PI * (3 - Math.sqrt(5)) * i;
    return { el: node, data: t, x: Math.cos(th) * r, y, z: Math.sin(th) * r, hover: 0, dim: false };
  });

  // Rotation matrix (row-major 3x3)
  let m = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const rotate = (ax, ay) => {
    const cx = Math.cos(ax), sx = Math.sin(ax), cy = Math.cos(ay), sy = Math.sin(ay);
    // R = Ry * Rx, applied on the left of the current matrix
    const r = [cy, sx * sy, cx * sy, 0, cx, -sx, -sy, sx * cy, cx * cy];
    const o = new Array(9);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      o[i * 3 + j] = r[i * 3] * m[j] + r[i * 3 + 1] * m[3 + j] + r[i * 3 + 2] * m[6 + j];
    }
    m = o;
  };

  let radius = 200;
  let vx = reduced ? 0 : 0.0016, vy = reduced ? 0 : 0.0032; // radians per ms-ish frame unit
  const idle = { x: reduced ? 0 : 0.0016, y: reduced ? 0 : 0.0032 };
  let dragging = false, lastX = 0, lastY = 0, lastT = 0, pid = null;
  let hovered = null;
  let visible = false, raf = 0, last = 0;

  function measure() { radius = el.clientWidth * (el.clientWidth < 420 ? 0.34 : 0.39); }

  function layout(dt) {
    if (!dragging) {
      rotate(vx * dt, vy * dt);
      const k = reduced ? 0.85 : 0.965;
      // Inertia decays back toward idle speed
      vx = idle.x + (vx - idle.x) * Math.pow(k, dt / 16);
      vy = idle.y + (vy - idle.y) * Math.pow(k, dt / 16);
      if (hovered && !reduced) { vx *= 0.9; vy *= 0.9; }
    }
    const depth = radius * 2.4;
    for (const it of items) {
      const x = m[0] * it.x + m[1] * it.y + m[2] * it.z;
      const y = m[3] * it.x + m[4] * it.y + m[5] * it.z;
      const z = m[6] * it.x + m[7] * it.y + m[8] * it.z;
      const target = it === hovered ? 1 : 0;
      it.hover += (target - it.hover) * 0.25;
      const s = depth / (depth - z * radius);
      const sc = s * (0.78 + it.hover * 0.75);
      const front = (z + 1) / 2; // 0 back .. 1 front
      let op = 0.22 + front * 0.78;
      if (it.dim) op *= 0.28;
      op = Math.min(1, op + it.hover);
      it.el.style.transform = `translate3d(${(x * radius * s).toFixed(1)}px, ${(y * radius * s).toFixed(1)}px, 0) translate(-50%, -50%) scale(${sc.toFixed(3)})`;
      it.el.style.opacity = op.toFixed(3);
      it.el.style.zIndex = it === hovered ? 999 : String(Math.round(front * 100));
    }
  }

  function loop(t) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(48, t - (last || t));
    last = t;
    layout(dt || 16);
  }
  function start() { if (!raf) { last = 0; raf = requestAnimationFrame(loop); } }
  function stop() { cancelAnimationFrame(raf); raf = 0; }

  /* ---- pointer interaction ---- */
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    // Only start a drag when the pointer is inside the visible circle
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (Math.hypot(e.clientX - cx, e.clientY - cy) > r.width / 2) return;
    dragging = true; pid = e.pointerId;
    lastX = e.clientX; lastY = e.clientY; lastT = performance.now();
    vx = vy = 0;
    el.setPointerCapture(e.pointerId);
    el.classList.add('is-dragging');
    start();
  });
  el.addEventListener('pointermove', (e) => {
    if (dragging && e.pointerId === pid) {
      const now = performance.now();
      const dt = Math.max(1, now - lastT);
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      const ax = -dy / radius, ay = dx / radius;
      rotate(ax, ay);
      vx = ax / dt; vy = ay / dt;
      lastX = e.clientX; lastY = e.clientY; lastT = now;
      if (reduced) layout(0);
      return;
    }
    if (e.pointerType !== 'mouse') return;
    const tag = e.target.closest && e.target.closest('.tag');
    setHover(tag ? items.find((i) => i.el === tag) : null);
  });
  const end = (e) => {
    if (!dragging || e.pointerId !== pid) return;
    dragging = false; pid = null;
    el.classList.remove('is-dragging');
    // Cap the fling speed
    const max = 0.02;
    vx = Math.max(-max, Math.min(max, vx));
    vy = Math.max(-max, Math.min(max, vy));
    if (performance.now() - lastT > 80) { vx = idle.x; vy = idle.y; }
    // A tap (no movement) on a tag shows its category on touch devices
    if (e.pointerType !== 'mouse') {
      const hit = document.elementFromPoint(e.clientX, e.clientY);
      const tag = hit && hit.closest('.tag');
      setHover(tag ? items.find((i) => i.el === tag) : null);
    }
    if (reduced) setTimeout(() => { if (!dragging) stop(); }, 1200);
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !dragging) setHover(null); });

  function setHover(it) {
    if (hovered === it) return;
    if (hovered) hovered.el.classList.remove('is-hover');
    hovered = it || null;
    if (hovered) hovered.el.classList.add('is-hover');
    onHover(hovered ? hovered.data : null);
    if (reduced) { start(); setTimeout(() => { if (!dragging) stop(); }, 600); }
  }

  /* ---- visibility ---- */
  let io = null;
  if ('IntersectionObserver' in window) {
    io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) measure();
      if (visible && !reduced) start(); else if (!visible) stop();
    }, { rootMargin: '100px' });
    io.observe(el);
  } else if (!reduced) start();

  const onResize = () => { measure(); layout(0); };
  window.addEventListener('resize', onResize, { passive: true });
  measure();
  layout(0);

  return {
    destroy() {
      stop();
      if (io) io.disconnect();
      window.removeEventListener('resize', onResize);
      items.forEach((it) => it.el.remove());
    },
    /** @param {string} cat */
    setFilter(cat) {
      items.forEach((it) => {
        it.dim = cat !== 'all' && it.data.cat !== cat;
        it.el.classList.toggle('is-dim', it.dim);
      });
      layout(0);
    },
  };
}
