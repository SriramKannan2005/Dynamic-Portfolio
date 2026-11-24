/**
 * Admin demo mode ("Try the demo" on the login screen).
 *
 * Everything the admin would read or write goes to this in-memory sample dataset
 * instead of Firebase or the Netlify Functions: no sign-in, no network calls, no
 * emails, no Sheets rows, no site changes. It lives only in this browser tab and is
 * rebuilt fresh on every visit, so it's safe to share with anyone.
 *
 * Real data stays protected by Firebase Auth + Firestore rules regardless: the demo
 * flag only swaps the data source, it never grants access to anything real.
 */
import type { Timestamp } from 'firebase/firestore';
import type { AuditEntry, Blocked, Message, MessagePatch, Reply, SyncState, Template } from './api';
import type { SiteOverrides } from '../shared/siteContent';
import { projects, content } from '../site/content';

const FLAG = 'sk-admin-demo';
export const isDemo = (): boolean => { try { return sessionStorage.getItem(FLAG) === '1'; } catch { return false; } };
export const startDemo = () => { try { sessionStorage.setItem(FLAG, '1'); } catch { /* private mode: demo still works for this page */ } demoForced = true; };
export const endDemo = () => { try { sessionStorage.removeItem(FLAG); } catch { /* ignore */ } demoForced = false; };
let demoForced = false;
export const demoActive = () => demoForced || isDemo();

export const DEMO_USER = { uid: 'demo-guest', email: 'guest@demo.local', displayName: 'Guest' };

/* ---------- helpers ---------- */
const ts = (d: Date) => ({ toDate: () => d, toMillis: () => +d, seconds: Math.floor(+d / 1000), nanoseconds: 0 }) as unknown as Timestamp;
const ago = (days: number, hour = 10, min = 0) => { const d = new Date(); d.setDate(d.getDate() - days); d.setHours(hour, min, 0, 0); return d; };
const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const inDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return dayKey(d); };
/** Small seeded PRNG so the sample analytics look the same on every visit. */
const rng = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ---------- sample inbox ---------- */
type Seed = [name: string, email: string, subject: string, body: string, category: string, daysAgo: number, extra?: Partial<Message>];
const SEED: Seed[] = [
  ['Priya Raman', 'priya.raman@example.com', 'Internship opportunity at our applied ML team',
    'Hi Sriram,\n\nI lead hiring for an applied ML team and your ForensiX AI project stood out. We have a 6-month internship starting in January focused on computer vision. Would you be open to a 30-minute call next week?\n\nBest,\nPriya', 'Job Inquiry', 0, { starred: true }],
  ['Arjun Mehta', 'arjun.mehta@example.com', 'Collaboration on an open-source RAG toolkit',
    'Hey! I maintain a small open-source retrieval toolkit and your Info-Nexus work looks like a great fit. Would you like to co-build an evaluation module with me?', 'Collaboration', 1],
  ['Lena Fischer', 'lena.fischer@example.com', 'Loved the CardioScreen write-up',
    'Really clear explanation of how you handled class imbalance. The case study format made it easy to follow. Keep it up!', 'Feedback', 2, { read: true }],
  ['Karthik S', 'karthik.s@example.com', 'Question about your churn model',
    'How did you choose the decision threshold for the churn model? Did you optimise for recall or for cost?', 'Technical Question', 3, { read: true, followUpAt: inDays(0), note: 'Send the threshold notebook link.' }],
  ['Maya Chen', 'maya.chen@example.com', 'Freelance dashboard project',
    'We need an analytics dashboard for our sales team (about 20 users). Are you taking freelance work this month? Budget is flexible.', 'Job Inquiry', 4, { read: true }],
  ['Rahul Nair', 'rahul.nair@example.com', 'Hello!', 'Just wanted to say your portfolio is one of the nicest I have seen this year.', 'General', 6, { read: true, archived: true }],
  ['Sofia Alvarez', 'sofia.alvarez@example.com', 'Guest talk at our student AI club',
    'Would you be interested in giving a 20-minute talk on building agentic AI projects to our student club? It can be online.', 'Collaboration', 8, { read: true }],
  ['Daniel Okafor', 'daniel.okafor@example.com', 'Junior data scientist role',
    'Hi Sriram, we have a junior data scientist opening in Bengaluru. Your Smart Exam Evaluator project is very relevant. Could you share your resume?', 'Job Inquiry', 11, { read: true }],
  ['Ananya Iyer', 'ananya.iyer@example.com', 'Bug report: resume viewer on iPad',
    'Small thing: on my iPad the resume viewer zoom buttons overlap the title in landscape. Otherwise great!', 'Feedback', 15, { read: true }],
  ['Tom Becker', 'tom.becker@example.com', 'Which vector database do you recommend?',
    'For a small RAG prototype with around 50k documents, would you pick FAISS or a hosted vector DB?', 'Technical Question', 20, { read: true, starred: true }],
  ['Win Big Prize', 'promo@lucky-winner.example', 'You have been selected!!!', 'Click here to claim your prize before it expires.', 'General', 22, { read: true, spam: true }],
  ['Meera Pillai', 'meera.pillai@example.com', 'Hackathon team invite',
    'We are forming a team for a national hackathon next month and need someone strong in ML. Interested?', 'Collaboration', 27, { read: true }],
  ['Old test message', 'test@example.com', 'test', 'test', 'General', 33, { read: true, trashedAt: ago(2).toISOString() }],
];
const REPLIES: [msgIndex: number, daysAgo: number, subject: string, body: string][] = [
  [2, 1, 'Re: Loved the CardioScreen write-up', 'Hi Lena,\n\nThank you so much, that means a lot! I tried hard to make the case studies readable.\n\nBest regards,\nSriram Kannan'],
  [5, 5, 'Re: Hello!', 'Hi Rahul,\n\nThanks for the kind words!\n\nBest,\nSriram'],
  [7, 10, 'Re: Junior data scientist role', 'Hi Daniel,\n\nThank you for reaching out. I am very interested and have attached my Data Science resume. Happy to talk this week.\n\nBest regards,\nSriram Kannan'],
  [9, 19, 'Re: Which vector database do you recommend?', 'Hi Tom,\n\nAt 50k documents FAISS on a single machine is plenty and free. Move to a hosted DB when you need filtering, multi-tenancy or live updates at scale.\n\nBest,\nSriram'],
];

interface Store {
  messages: Message[];
  replies: Reply[];
  audit: AuditEntry[];
  blocked: Blocked[];
  templates: Template[] | null;
  overrides: SiteOverrides | null;
  sync: SyncState;
}
let store: Store | null = null;
const listeners = new Set<() => void>();

function build(): Store {
  const messages: Message[] = SEED.map(([name, email, subject, message, category, days, extra], i) => {
    const d = ago(days, 9 + (i * 3) % 10, (i * 17) % 60);
    return { id: `demo-${i + 1}`, name, email, subject, message, category, createdAt: ts(d), timestamp: d.toISOString(), read: false, ...extra };
  });
  const replies: Reply[] = REPLIES.map(([mi, days, subject, body], i) => ({
    id: `demo-r${i + 1}`, messageId: messages[mi].id, to: messages[mi].email, subject, replyContent: body, sentAt: ago(days, 18, 5).toISOString(), via: i === 1 ? 'gmail' : 'apps-script',
  }));
  const audit: AuditEntry[] = [
    { id: 'a1', action: 'reply.send', detail: 'Replied to Lena Fischer <lena.fischer@example.com>: Re: Loved the CardioScreen write-up', at: ts(ago(1, 18, 5)), by: DEMO_USER.uid },
    { id: 'a2', action: 'sheets.sync', detail: 'Synced 12 rows to Google Sheets', at: ts(ago(2, 9, 30)), by: DEMO_USER.uid },
    { id: 'a3', action: 'content.save', detail: 'Published site content: availability', at: ts(ago(4, 21, 10)), by: DEMO_USER.uid },
    { id: 'a4', action: 'sender.block', detail: 'Blocked promo@lucky-winner.example: Marked as spam', at: ts(ago(22, 11, 0)), by: DEMO_USER.uid },
  ];
  return {
    messages, replies, audit,
    blocked: [{ id: 'promo@lucky-winner.example', email: 'promo@lucky-winner.example', reason: 'Marked as spam', at: ago(22, 11).toISOString() }],
    templates: null, overrides: null,
    sync: { lastSync: ago(2, 9, 30).toISOString(), lastCount: 12, autoSync: false },
  };
}
const S = () => (store ??= build());
const emit = () => listeners.forEach((fn) => fn());
const withReplies = (list: Message[]) => {
  const counts = new Map<string, number>();
  S().replies.forEach((r) => counts.set(r.messageId, (counts.get(r.messageId) ?? 0) + 1));
  return [...list]
    .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)))
    .map((m) => { const n = counts.get(m.id) ?? 0; return n ? { ...m, replied: true, replyCount: n } : m; });
};
const log = (action: string, detail: string) => {
  S().audit.unshift({ id: `a${Date.now()}`, action, detail, at: ts(new Date()), by: DEMO_USER.uid });
};

/* ---------- api.ts equivalents ---------- */
export const demo = {
  fetchMessages: async () => withReplies(S().messages),
  subscribeMessages(onData: (l: Message[]) => void, _onError: (e: Error) => void, onNew: (m: Message[]) => void) {
    const push = () => onData(withReplies(S().messages));
    listeners.add(push);
    setTimeout(push, 150);
    // One "new" message arrives a little later, to show live updates + notifications
    const t = window.setTimeout(() => {
      const d = new Date();
      const m: Message = { id: `demo-live-${+d}`, name: 'Kavya Reddy', email: 'kavya.reddy@example.com', subject: 'Quick question about your resume',
        message: 'Hi! Is the AI/ML resume the most recent one? I would like to forward it to our hiring manager.', category: 'Job Inquiry', createdAt: ts(d), timestamp: d.toISOString(), read: false };
      if (!S().messages.some((x) => x.email === m.email)) { S().messages.unshift(m); onNew([m]); push(); }
    }, 25000);
    return () => { listeners.delete(push); clearTimeout(t); };
  },
  async updateMessages(ids: string[], patch: MessagePatch) {
    await wait(120);
    S().messages = S().messages.map((m) => {
      if (!ids.includes(m.id)) return m;
      const next: Message = { ...m };
      for (const [k, v] of Object.entries(patch)) {
        if (v === null) delete (next as unknown as Record<string, unknown>)[k];
        else (next as unknown as Record<string, unknown>)[k] = v;
      }
      return next;
    });
    emit();
  },
  async deleteMessages(ids: string[]) { await wait(120); S().messages = S().messages.filter((m) => !ids.includes(m.id)); emit(); },
  async setNote(id: string, note: string) {
    const v = note.trim().slice(0, 2000);
    S().messages = S().messages.map((m) => { if (m.id !== id) return m; const n = { ...m }; if (v) n.note = v; else delete n.note; return n; });
    emit();
  },
  async fetchReplies(messageId: string) { await wait(150); return S().replies.filter((r) => r.messageId === messageId).sort((a, b) => a.sentAt.localeCompare(b.sentAt)); },
  async recordReply(m: Message, subject: string, body: string, via: 'apps-script' | 'gmail') {
    S().replies.push({ id: `demo-r${Date.now()}`, messageId: m.id, to: m.email, subject, replyContent: body, sentAt: new Date().toISOString(), via });
    S().messages = S().messages.map((x) => (x.id === m.id ? { ...x, replied: true, read: true } : x));
    emit();
  },
  async logAction(action: string, detail: string) { log(action, detail); },
  async fetchAudit(n = 100) { return S().audit.slice(0, n); },
  async getTemplates(defaults: Template[]) { return S().templates ?? defaults; },
  async saveTemplates(items: Template[]) { await wait(200); S().templates = items; },
  async getOverrides() { return S().overrides; },
  async saveOverrides(o: Omit<SiteOverrides, 'updatedAt' | 'updatedBy'>) {
    await wait(300);
    const data: SiteOverrides = { ...JSON.parse(JSON.stringify(o)), updatedAt: new Date().toISOString(), updatedBy: DEMO_USER.uid };
    S().overrides = data;
    return data;
  },
  async resetOverrides() { S().overrides = null; },
  async blockSender(email: string, reason = '') {
    const key = email.trim().toLowerCase();
    S().blocked = [{ id: key, email: key, reason, at: new Date().toISOString() }, ...S().blocked.filter((b) => b.id !== key)];
    log('sender.block', `Blocked ${key}${reason ? `: ${reason}` : ''}`);
  },
  async unblockSender(email: string) { const key = email.trim().toLowerCase(); S().blocked = S().blocked.filter((b) => b.id !== key); log('sender.unblock', `Unblocked ${key}`); },
  async fetchBlocked() { return [...S().blocked]; },
  async getSyncState() { return { ...S().sync }; },
  async saveSyncState(patch: SyncState) { S().sync = { ...S().sync, ...patch }; },
  async fetchBackup() {
    const s = S();
    return { exportedAt: new Date().toISOString(), project: 'portfolio-admin-DEMO', note: 'Sample data from the admin demo. Not real.', messages: s.messages, replies: s.replies, auditLog: s.audit, blockedSenders: s.blocked, templates: s.templates, sheetsSync: s.sync, siteContent: s.overrides };
  },

  /** Stand-ins for the Netlify Functions: nothing leaves the browser. */
  async callFunction(name: string, init: { method?: string; body?: unknown }): Promise<unknown> {
    await wait(name === 'ai-draft' ? 1100 : 500);
    if (name === 'status') {
      return { configured: { ai: true, email: true, sheets: true, sheetsView: false }, geminiModel: 'demo', adminUidCount: 1, runtime: 'demo', checkedAt: new Date().toISOString() };
    }
    if (name === 'sheets-sync') {
      if ((init.method ?? 'POST') === 'GET') return { configured: true, viewUrl: null };
      const count = S().messages.filter((m) => !m.trashedAt && !m.spam).length;
      const syncedAt = new Date().toISOString();
      S().sync = { ...S().sync, lastSync: syncedAt, lastCount: count };
      return { count, syncedAt };
    }
    if (name === 'send-reply') return { ok: true, demo: true };
    if (name === 'ai-draft') {
      const m = (init.body as { message?: { name?: string; subject?: string; category?: string } })?.message ?? {};
      const first = (m.name ?? 'there').split(/\s+/)[0];
      const topic = m.subject ? `about "${m.subject}"` : '';
      const body = m.category === 'Job Inquiry'
        ? `Thank you for reaching out ${topic}. I am very interested and would be glad to talk further. I have attached my resume and I am available for a call any weekday this week.`
        : m.category === 'Technical Question'
          ? `Thanks for the great question ${topic}. Short answer: it depends on the cost of each kind of error, so I tuned the threshold on a validation set against that cost. Happy to share the notebook.`
          : m.category === 'Collaboration'
            ? `Thanks for thinking of me ${topic}. It sounds like a great fit and I would love to explore it. Could you share a bit more about the scope and timeline?`
            : `Thank you so much for your message ${topic}. I really appreciate you taking the time to write.`;
      return { draft: `Hi ${first},\n\n${body.replace(/\s+\./g, '.')}\n\nBest regards,\nSriram Kannan`, model: 'demo draft' };
    }
    throw new Error('Not available in the demo.');
  },
};

/* ---------- analytics rows (same shapes as Firestore, generated once) ---------- */
type Row = Record<string, unknown>;
let rows: Record<string, Row[]> | null = null;
function buildRows() {
  const r = rng(20251029);
  const pageViews: Row[] = []; const visitors: Row[] = []; const likes: Row[] = []; const pviews: Row[] = []; const downloads: Row[] = [];
  const langs = ['en', 'en', 'en', 'en', 'ta', 'hi', 'en', 'de', 'fr', 'ta'];
  const refs = ['', '', '', 'https://www.linkedin.com/', 'https://www.google.com/', 'https://github.com/', 'https://www.linkedin.com/', ''];
  const hours = [9, 10, 11, 11, 12, 14, 15, 17, 19, 20, 21, 21, 22, 23];
  const ids = projects.map((p) => p.id);
  const resumeIds = content.resumes.map((x) => x.id);
  let v = 0;
  for (let day = 150; day >= 0; day--) {
    // gentle growth + weekday rhythm + a couple of launch spikes
    const base = 2 + (150 - day) / 22 + ((new Date(Date.now() - day * 864e5).getDay() + 1) % 7 < 2 ? -1 : 1);
    const spike = day === 60 ? 26 : day === 12 ? 18 : 0;
    const n = Math.max(0, Math.round(base + spike + r() * 4));
    for (let i = 0; i < n; i++) {
      const d = ago(day, hours[Math.floor(r() * hours.length)], Math.floor(r() * 60));
      const returning = r() < 0.35 && v > 5;
      const vid = returning ? `demo-v${Math.floor(r() * v)}` : `demo-v${v++}`;
      pageViews.push({ createdAt: ts(d), visitorId: vid, path: '/', referrer: refs[Math.floor(r() * refs.length)] || null });
      if (!returning) visitors.push({ firstSeen: ts(d), visitorId: vid, lang: langs[Math.floor(r() * langs.length)], screen: r() < 0.42 ? '390x844' : r() < 0.1 ? '820x1180' : '1536x864' });
      if (r() < 0.55) pviews.push({ createdAt: ts(d), projectId: ids[Math.min(ids.length - 1, Math.floor(Math.pow(r(), 1.7) * ids.length))], visitorId: vid });
      if (r() < 0.06) likes.push({ createdAt: ts(d), projectId: ids[Math.min(ids.length - 1, Math.floor(Math.pow(r(), 2) * ids.length))], visitorId: vid });
      if (r() < 0.04 && resumeIds.length) downloads.push({ createdAt: ts(d), resumeId: resumeIds[Math.floor(Math.pow(r(), 1.4) * resumeIds.length)], visitorId: vid });
    }
  }
  return { pageViews, visitors, projectLikes: likes, projectViews: pviews, resumeDownloads: downloads, analytics: [] as Row[] };
}
const allRows = () => (rows ??= buildRows());
const ms = (v: unknown) => (v as { toMillis?: () => number })?.toMillis?.() ?? 0;

/** fetchRange's per-collection reader: old-site ("~old") sources are empty in the demo. */
export function demoRows(name: string, field: string, sinceMs: number): Row[] {
  if (name.includes('~old')) return [];
  const list = (allRows() as Record<string, Row[]>)[name] ?? [];
  return list.filter((x) => ms(x[field]) >= sinceMs).map((x, i) => ({ _id: `${name}-${i}`, ...x }));
}
export function demoCountBy(collectionName: string, field: string, ids: string[]): Record<string, number> {
  const list = (allRows() as Record<string, Row[]>)[collectionName] ?? [];
  return Object.fromEntries(ids.map((id) => [id, list.filter((x) => x[field] === id).length]));
}
export function demoAnalytics() {
  const { pageViews } = allRows();
  const startOf = (o: number) => { const t = new Date(); t.setHours(0, 0, 0, 0); t.setDate(t.getDate() - o); return t; };
  const days = Array.from({ length: 7 }, (_, i) => { const date = startOf(6 - i); return { key: dayKey(date), label: date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' }), views: 0, visitors: 0, ids: new Set<string>() }; });
  const byKey = new Map(days.map((x) => [x.key, x]));
  const today = +startOf(0);
  let todayViews = 0;
  pageViews.forEach((p) => { const t = new Date(ms(p.createdAt)); const b = byKey.get(dayKey(t)); if (b) { b.views++; b.ids.add(String(p.visitorId)); } if (+t >= today) todayViews++; });
  const categories: Record<string, number> = {};
  S().messages.forEach((m) => { const c = m.category || 'General'; categories[c] = (categories[c] ?? 0) + 1; });
  return {
    totalViews: pageViews.length, todayViews, totalMessages: S().messages.length, unreadMessages: S().messages.filter((m) => !m.read).length,
    days: days.map(({ ids, ...rest }) => ({ ...rest, visitors: ids.size })), categories,
  };
}
