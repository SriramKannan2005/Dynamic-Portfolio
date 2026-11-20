/** Per-device admin preferences (localStorage). Nothing here is security-relevant. */
import { useCallback, useEffect, useState } from 'react';

export interface Prefs { idleMinutes: 0 | 15 | 30 | 60; desktopNotify: boolean; sound: boolean }
const DEFAULTS: Prefs = { idleMinutes: 30, desktopNotify: false, sound: false };
const KEY = 'sk-admin-prefs';

export function readPrefs(): Prefs {
  try { return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) || '{}') as Partial<Prefs>) }; } catch { return DEFAULTS; }
}
export function usePrefs(): [Prefs, (p: Partial<Prefs>) => void] {
  const [prefs, setPrefs] = useState(readPrefs);
  useEffect(() => {
    const on = () => setPrefs(readPrefs());
    window.addEventListener('sk-prefs', on);
    return () => window.removeEventListener('sk-prefs', on);
  }, []);
  const update = useCallback((p: Partial<Prefs>) => {
    const next = { ...readPrefs(), ...p };
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* blocked */ }
    window.dispatchEvent(new Event('sk-prefs'));
  }, []);
  return [prefs, update];
}

/** Short two-tone chime via WebAudio (no audio file to ship). */
export function chime() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [660, 880].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      o.type = 'sine';
      const t = ctx.currentTime + i * 0.14;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.25);
    });
    setTimeout(() => ctx.close(), 800);
  } catch { /* audio unavailable */ }
}
