/**
 * Live content overrides edited from /admin -> Content and stored in Firestore
 * (siteContent/live, public read, admin write). data/*.json stays the source of
 * truth; this is a thin layer on top (hide, reorder, re-badge, retext, banner).
 * Deleting the document restores the site exactly to what is in the repo.
 */
import type { Achievement, Content, Experience, Project, SkillGroup } from '../site/content';
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
/** Whole-section replacements edited in /admin -> Content. A missing key keeps data/content.json. */
export interface SectionOverrides {
  roles?: string[];
  about?: string[];
  skills?: SkillGroup[];
  experience?: Experience[];
  education?: Content['education'];
  achievements?: Achievement[];
  certifications?: Content['certifications'];
}
export type SectionKey = keyof SectionOverrides;
export const SECTION_KEYS: SectionKey[] = ['roles', 'about', 'skills', 'experience', 'education', 'achievements', 'certifications'];

export interface SiteOverrides {
  availability?: { open: boolean; text: string };
  announcement?: { enabled: boolean; text: string; link?: string };
  projects?: Record<string, ProjectOverride>;
  sections?: SectionOverrides;
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

/* ---------------- section overrides ---------------- */
const str = (v: unknown, n = 300) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const strs = (v: unknown, n = 300, max = 40) => (Array.isArray(v) ? v.map((x) => str(x, n)).filter(Boolean).slice(0, max) : []);
const list = <T,>(v: unknown, map: (x: Record<string, unknown>, i: number) => T | null, max = 40): T[] | null =>
  Array.isArray(v) ? v.slice(0, max).map((x, i) => (x && typeof x === 'object' ? map(x as Record<string, unknown>, i) : null)).filter((x): x is T => !!x) : null;
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'item';

/**
 * Clean one section coming from Firestore (or the admin draft). Everything is
 * rendered as React text, links go through safeUrl, and empty items are dropped,
 * so a bad edit can never break the page; null means "keep the repo version".
 */
export function cleanSection<K extends SectionKey>(key: K, v: unknown): SectionOverrides[K] | null {
  switch (key) {
    case 'roles': { const r = strs(v, 60, 10); return (r.length ? r : null) as SectionOverrides[K]; }
    case 'about': { const r = strs(v, 1200, 8); return (r.length ? r : null) as SectionOverrides[K]; }
    case 'skills': return list(v, (x, i) => {
      const name = str(x.name, 40); const items = strs(x.items, 40, 30);
      return name && items.length ? { id: str(x.id, 40) || `${slug(name)}-${i}`, name, items } : null;
    }, 12) as SectionOverrides[K];
    case 'experience': return list(v, (x) => {
      const role = str(x.role, 100); const org = str(x.org, 120);
      return role && org ? { role, org, period: str(x.period, 60), type: str(x.type, 30) || 'internship', summary: str(x.summary, 600) || undefined, points: strs(x.points, 400, 12), tags: strs(x.tags, 40, 16) } : null;
    }, 20) as SectionOverrides[K];
    case 'education': return list(v, (x) => {
      const degree = str(x.degree, 120); const school = str(x.school, 120);
      return degree && school ? { degree, school, period: str(x.period, 60), note: str(x.note, 160) || undefined, score: str(x.score, 60) || undefined } : null;
    }, 10) as SectionOverrides[K];
    case 'achievements': return list(v, (x, i) => {
      const title = str(x.title, 160); if (!title) return null;
      const m = x.metric as Record<string, unknown> | undefined; const value = num(m?.value);
      const a: Achievement = { id: str(x.id, 40) || `${slug(title)}-${i}`, kind: str(x.kind, 30) || 'other', title };
      const level = str(x.level, 30); if (level) a.level = level;
      const detail = str(x.detail, 400); if (detail) a.detail = detail;
      const icon = str(x.icon, 30); if (icon) a.icon = icon;
      const link = safeUrl(str(x.link, 400)); if (link) a.link = link;
      if (value !== null && value > 0) a.metric = { value, suffix: str(m?.suffix, 4) || undefined, decimals: Math.min(3, Math.max(0, num(m?.decimals) ?? 0)) || undefined, label: str(m?.label, 60) || undefined };
      return a;
    }, 16) as SectionOverrides[K];
    case 'certifications': return list(v, (x) => {
      const title = str(x.title, 120); const image = safeUrl(str(x.image, 400));
      return title && image ? { title, issuer: str(x.issuer, 80), image } : null;
    }, 20) as SectionOverrides[K];
    default: return null;
  }
}

/** data/content.json with the admin's section edits applied. */
export function applyContentOverrides(base: Content, o?: SiteOverrides | null): Content {
  const s = o?.sections;
  if (!s) return base;
  const out: Content = { ...base };
  const pick = <K extends SectionKey>(k: K) => { const v = cleanSection(k, s[k]); return v && (v as unknown[]).length ? v : null; };
  const roles = pick('roles'); if (roles) out.profile = { ...base.profile, roles: roles as string[] };
  const about = pick('about'); if (about) out.about = about as string[];
  const skills = pick('skills'); if (skills) out.skills = skills as SkillGroup[];
  const exp = pick('experience'); if (exp) out.experience = exp as Experience[];
  const edu = pick('education'); if (edu) out.education = edu as Content['education'];
  const ach = pick('achievements'); if (ach) out.achievements = ach as Achievement[];
  const cert = pick('certifications'); if (cert) out.certifications = cert as Content['certifications'];
  return out;
}

export const availabilityOf =(o?: SiteOverrides | null) => ({
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
