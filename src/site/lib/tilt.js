/**
 * tilt.js: CSS 3D tilt that follows the pointer.
 * Writes --rx / --ry (rotation), --gx / --gy (specular glare position) on the
 * card's inner element; layered children sit at different translateZ in CSS.
 * Keyboard users get a fixed "lifted" tilt via :focus-within in CSS.
 */
export function initTilt(cards, { max = 12, enabled = true } = {}) {
  if (!enabled) return;
  cards.forEach((card) => {
    const inner = card.querySelector('.pcard-inner') || card;
    let rect = null, raf = 0, px = 0.5, py = 0.5;

    const apply = () => {
      raf = 0;
      inner.style.setProperty('--ry', `${((px - 0.5) * 2 * max).toFixed(2)}deg`);
      inner.style.setProperty('--rx', `${(-(py - 0.5) * 2 * max).toFixed(2)}deg`);
      inner.style.setProperty('--gx', `${(px * 100).toFixed(1)}%`);
      inner.style.setProperty('--gy', `${(py * 100).toFixed(1)}%`);
    };
    card.addEventListener('pointerenter', (e) => {
      if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
      rect = card.getBoundingClientRect();
      card.classList.add('is-tilting');
    });
    card.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
      if (!rect) rect = card.getBoundingClientRect();
      px = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      py = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
      if (!raf) raf = requestAnimationFrame(apply);
    });
    card.addEventListener('pointerleave', () => {
      rect = null;
      cancelAnimationFrame(raf); raf = 0;
      card.classList.remove('is-tilting');
      ['--rx', '--ry'].forEach((p) => inner.style.removeProperty(p));
      inner.style.setProperty('--gx', '50%');
      inner.style.setProperty('--gy', '0%');
    });
    // Rect changes on scroll; drop the cache so the next move re-measures.
    window.addEventListener('scroll', () => { rect = null; }, { passive: true });
  });
}
