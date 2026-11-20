/**
 * Live content overrides edited from /admin -> Content and stored in Firestore
 * (siteContent/live, public read, admin write). data/*.json stays the source of
 * truth; this is a thin layer on top (hide, reorder, re-badge, retext, banner).
 * Deleting the document restores the site exactly to what is in the repo.
 */
import type { Project } from '../site/content';
import { getDb, firebaseConfigured } from './firebase';

export interface ProjectOverride {
  hidden?: boolean;
  featured?: boolean;
  order?: number;
  badge?: string;
  hook?: string;
  description?: string;
  demo?: string;
  video?: string;
}
export interface SiteOverrides {
  availability?: { open: boolean; text: string };
  announcement?: { enabled: boolean; text: string; link?: string };
  projects?: Record<string, ProjectOverride>;
  updatedAt?: string;
  updatedBy?: string;
}

export const DEFAULT_AVAILABILITY = 'Final-year AI & DS · open to opportunities';
export const LIMITS = { availability: 80, announcement: 160, badge: 20, hook: 160, description: 600, url: 400 };

/** Only https links or site-relative paths: never javascript:, data:, etc. */
export const safeUrl = (u?: string): string => {
  const v = (u ?? '').trim();
  return /^https:\/\/[^\s"'<>]+$/i.test(v) || /^\/(?!\/)[^\s"'<>]*$/.test(v) ? v : '';
};
const clip = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : '');

export function applyProjectOverrides(base: Project[], o?: SiteOverrides | null): Project[] {
  const map = o?.projects ?? {};
  return base
    .filter((p) => !map[p.id]?.hidden)
    .map((p) => {
      const x = map[p.id];
      if (!x) return p;
      const out: Project = { ...p };
      if (typeof x.featured === 'boolean') out.featured = x.featured;
      if (typeof x.order === 'number' && Number.isFinite(x.order)) out.order = x.order;
      if (typeof x.badge === 'string') out.badge = clip(x.badge, LIMITS.badge) || undefined;
      if (x.hook) out.hook = clip(x.hook, LIMITS.hook);
      if (x.description) out.description = clip(x.description, LIMITS.description);
      if (typeof x.video === 'string') out.video = safeUrl(x.video);
      if (typeof x.demo === 'string') out.links = { ...p.links, demo: safeUrl(x.demo) || undefined };
      return out;
    })
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
}

export const availabilityOf = (o?: SiteOverrides | null) => ({
  open: o?.availability ? !!o.availability.open : true,
  text: clip(o?.availability?.text, LIMITS.availability) || DEFAULT_AVAILABILITY,
});
export const announcementOf = (o?: SiteOverrides | null) => {
  const a = o?.announcement;
  if (!a?.enabled || !a.text) return null;
  return { text: clip(a.text, LIMITS.announcement), link: safeUrl(a.link) };
};

const CACHE_KEY = 'sk-overrides';
/** Last seen overrides, so repeat visits render the right content on first paint. */
export function cachedOverrides(): SiteOverrides | null {
  try { const v = localStorage.getItem(CACHE_KEY); return v ? (JSON.parse(v) as SiteOverrides) : null; } catch { return null; }
}
export async function fetchOverrides(): Promise<SiteOverrides | null> {
  if (!firebaseConfigured) return null;
  const db = await getDb();
  const { doc, getDoc } = await import('firebase/firestore');
  const snap = await getDoc(doc(db, 'siteContent', 'live'));
  const data = snap.exists() ? (snap.data() as SiteOverrides) : null;
  try { if (data) localStorage.setItem(CACHE_KEY, JSON.stringify(data)); else localStorage.removeItem(CACHE_KEY); } catch { /* blocked */ }
  return data;
}
