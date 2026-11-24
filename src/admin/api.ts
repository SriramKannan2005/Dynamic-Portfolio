/**
 * Admin data layer: Firestore reads/writes (allowed by rules only for admin == true)
 * and authenticated calls to the Netlify Functions.
 */
import {
  collection, doc, getDocs, getDoc, setDoc, addDoc, updateDoc, deleteDoc, query, orderBy, where, limit,
  writeBatch, getCountFromServer, serverTimestamp, Timestamp, onSnapshot, deleteField, type Firestore,
} from 'firebase/firestore';
import type { SiteOverrides } from '../shared/siteContent';
import { getDb, getAuthInstance } from '../shared/firebase';
import { demo, demoActive, demoAnalytics, demoCountBy } from './demo';

export interface Message {
  id: string;
  name: string;
  email: string;
  subject?: string;
  message: string;
  category?: string;
  timestamp?: string;
  createdAt?: Timestamp;
  date?: string;
  read?: boolean;
  replied?: boolean;
  repliedAt?: Timestamp;
  starred?: boolean;
  archived?: boolean;
  note?: string;
  /** Spam folder (and optionally the sender is blocked) */
  spam?: boolean;
  /** ISO time it was moved to Trash; purged after TRASH_DAYS */
  trashedAt?: string;
  /** YYYY-MM-DD follow-up reminder */
  followUpAt?: string;
  /** Number of replies sent (derived live from the replies collection) */
  replyCount?: number;
}
export const TRASH_DAYS = 30;
export type MessagePatch = {
  read?: boolean; starred?: boolean; archived?: boolean; spam?: boolean; category?: string;
  /** null removes the field */
  trashedAt?: string | null; followUpAt?: string | null;
};
export interface Reply {
  id: string;
  messageId: string;
  to: string;
  subject: string;
  replyContent: string;
  sentAt: string;
  via?: string;
}

export { MESSAGE_CATEGORIES as CATEGORIES } from '../shared/categories';
export const msgDate = (m: Message): Date | null => {
  if (m.createdAt?.toDate) return m.createdAt.toDate();
  if (m.timestamp) { const d = new Date(m.timestamp); if (!isNaN(+d)) return d; }
  if (m.date) { const d = new Date(m.date); if (!isNaN(+d)) return d; }
  return null;
};

const db = (): Promise<Firestore> => getDb();

/* ---------------- messages ---------------- */
export async function fetchMessages(): Promise<Message[]> {
  if (demoActive()) return demo.fetchMessages();
  const d = await db();
  const [snap, replied] = await Promise.all([
    getDocs(query(collection(d, 'messages'), orderBy('timestamp', 'desc'), limit(1000))),
    // The previous admin recorded replies only in the "replies" collection (never on the
    // message), so derive "replied" from it to keep that history visible.
    getDocs(collection(d, 'replies'))
      .then((r) => new Set(r.docs.map((x) => String(x.data().messageId ?? ''))))
      .catch(() => new Set<string>()),
  ]);
  return snap.docs.map((x) => {
    const m = { id: x.id, ...(x.data() as Omit<Message, 'id'>) };
    return replied.has(m.id) ? { ...m, replied: true } : m;
  });
}
/**
 * Live inbox: one listener for the whole dashboard. `onNew` fires for messages that
 * arrive after the first snapshot (used for alerts). Returns the unsubscribe.
 */
export function subscribeMessages(
  onData: (list: Message[]) => void,
  onError: (e: Error) => void,
  onNew: (m: Message[]) => void,
): () => void {
  if (demoActive()) return demo.subscribeMessages(onData, onError, onNew);
  let unsub = () => {};
  let cancelled = false;
  let unsubReplies = () => {};
  (async () => {
    const d = await db();
    if (cancelled) return;
    // Both collections are live: a reply sent from any tab bumps the count at once.
    // replyCounts comes from the "replies" collection (the old admin only recorded
    // replies there, never on the message), so old replies are counted too.
    let replyCounts = new Map<string, number>();
    let raw: Message[] | null = null;
    const emit = () => {
      if (!raw) return;
      onData(raw.map((m) => {
        const n = replyCounts.get(m.id) ?? 0;
        return n ? { ...m, replied: true, replyCount: n } : m;
      }));
    };
    unsubReplies = onSnapshot(collection(d, 'replies'), (snap) => {
      const next = new Map<string, number>();
      snap.docs.forEach((x) => { const id = String(x.data().messageId ?? ''); if (id) next.set(id, (next.get(id) ?? 0) + 1); });
      replyCounts = next;
      emit();
    }, () => { /* counts are optional; the inbox still works without them */ });
    let first = true;
    unsub = onSnapshot(query(collection(d, 'messages'), orderBy('timestamp', 'desc'), limit(1000)), (snap) => {
      raw = snap.docs.map((x) => ({ id: x.id, ...(x.data() as Omit<Message, 'id'>) }));
      if (!first) {
        const added = snap.docChanges().filter((c) => c.type === 'added' && !c.doc.metadata.hasPendingWrites).map((c) => raw!.find((m) => m.id === c.doc.id)!).filter(Boolean);
        if (added.length) onNew(added);
      }
      first = false;
      emit();
    }, (e) => onError(e));
  })().catch(onError);
  return () => { cancelled = true; unsub(); unsubReplies(); };
}

/** Batched field updates (read / starred / archived) on many messages. */
export async function updateMessages(ids: string[], patch: MessagePatch) {
  if (demoActive()) return demo.updateMessages(ids, patch);
  const d = await db();
  const data = Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, v === null ? deleteField() : v]));
  for (let i = 0; i < ids.length; i += 450) {
    const batch = writeBatch(d);
    ids.slice(i, i + 450).forEach((id) => batch.update(doc(d, 'messages', id), data));
    await batch.commit();
  }
}
export async function deleteMessages(ids: string[]) {
  if (demoActive()) return demo.deleteMessages(ids);
  const d = await db();
  for (let i = 0; i < ids.length; i += 450) {
    const batch = writeBatch(d);
    ids.slice(i, i + 450).forEach((id) => batch.delete(doc(d, 'messages', id)));
    await batch.commit();
  }
}
export async function setNote(id: string, note: string) {
  if (demoActive()) return demo.setNote(id, note);
  const v = note.trim().slice(0, 2000);
  await updateDoc(doc(await db(), 'messages', id), { note: v ? v : deleteField() });
}

export async function setRead(id: string, read: boolean) {
  if (demoActive()) return demo.updateMessages([id], { read });
  await updateDoc(doc(await db(), 'messages', id), { read });
}
export async function markAllRead(ids: string[]) {
  if (demoActive()) return demo.updateMessages(ids, { read: true });
  const d = await db();
  for (let i = 0; i < ids.length; i += 450) {
    const batch = writeBatch(d);
    ids.slice(i, i + 450).forEach((id) => batch.update(doc(d, 'messages', id), { read: true }));
    await batch.commit();
  }
}
export async function deleteMessage(id: string) {
  if (demoActive()) return demo.deleteMessages([id]);
  await deleteDoc(doc(await db(), 'messages', id));
}

/* ---------------- replies ---------------- */
export async function fetchReplies(messageId: string): Promise<Reply[]> {
  if (demoActive()) return demo.fetchReplies(messageId);
  const snap = await getDocs(query(collection(await db(), 'replies'), where('messageId', '==', messageId)));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Reply, 'id'>) }))
    .sort((a, b) => String(a.sentAt).localeCompare(String(b.sentAt)));
}
export async function recordReply(m: Message, subject: string, body: string, via: 'apps-script' | 'gmail') {
  if (demoActive()) return demo.recordReply(m, subject, body, via);
  const d = await db();
  await addDoc(collection(d, 'replies'), {
    messageId: m.id, to: m.email, toName: m.name, subject, replyContent: body,
    sentAt: new Date().toISOString(), sentAtTimestamp: serverTimestamp(), sentBy: 'Sriram Kannan', via,
  });
  await updateDoc(doc(d, 'messages', m.id), { replied: true, read: true, repliedAt: serverTimestamp() });
}

/* ---------------- analytics ---------------- */
const startOfDay = (offsetDays = 0) => { const t = new Date(); t.setHours(0, 0, 0, 0); t.setDate(t.getDate() - offsetDays); return t; };
export const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export interface AnalyticsData {
  totalViews: number;
  todayViews: number;
  totalMessages: number;
  unreadMessages: number;
  days: { key: string; label: string; views: number; visitors: number }[];
  categories: Record<string, number>;
}

export async function fetchAnalytics(): Promise<AnalyticsData> {
  if (demoActive()) return demoAnalytics();
  const d = await db();
  const LEGACY_TYPES = ['pageview', 'page_view'];
  const since = Timestamp.fromDate(startOfDay(6));
  const today = startOfDay(0);
  const [legacyTotal, newTotal, msgTotal, unread, recentNew, recentLegacy, msgs] = await Promise.all([
    getCountFromServer(query(collection(d, 'analytics'), where('type', 'in', LEGACY_TYPES))).then((s) => s.data().count).catch(() => 0),
    getCountFromServer(collection(d, 'pageViews')).then((s) => s.data().count),
    getCountFromServer(collection(d, 'messages')).then((s) => s.data().count),
    getCountFromServer(query(collection(d, 'messages'), where('read', '==', false))).then((s) => s.data().count),
    getDocs(query(collection(d, 'pageViews'), where('createdAt', '>=', since))),
    getDocs(query(collection(d, 'analytics'), where('timestamp', '>=', since))).catch(() => null),
    getDocs(query(collection(d, 'messages'), limit(2000))),
  ]);

  const days = Array.from({ length: 7 }, (_, i) => {
    const date = startOfDay(6 - i);
    return { key: dayKey(date), label: date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' }), views: 0, visitors: 0, ids: new Set<string>() };
  });
  const byKey = new Map(days.map((x) => [x.key, x]));
  let todayViews = 0;
  recentNew.docs.forEach((s) => {
    const v = s.data() as { createdAt?: Timestamp; visitorId?: string };
    const t = v.createdAt?.toDate?.();
    if (!t) return;
    const bucket = byKey.get(dayKey(t));
    if (bucket) { bucket.views += 1; if (v.visitorId) bucket.ids.add(v.visitorId); }
    if (t >= today) todayViews += 1;
  });
  recentLegacy?.docs.forEach((s) => {
    const v = s.data() as { type?: string; timestamp?: Timestamp };
    if (!LEGACY_TYPES.includes(v.type ?? '')) return;
    const t = v.timestamp?.toDate?.();
    if (!t) return;
    const bucket = byKey.get(dayKey(t));
    if (bucket) { bucket.views += 1; bucket.ids.add(`legacy-${s.id}`); }
    if (t >= today) todayViews += 1;
  });

  const categories: Record<string, number> = {};
  msgs.docs.forEach((s) => { const c = (s.data().category as string) || 'General'; categories[c] = (categories[c] ?? 0) + 1; });

  return {
    totalViews: legacyTotal + newTotal,
    todayViews,
    totalMessages: msgTotal,
    unreadMessages: unread,
    days: days.map(({ ids, ...rest }) => ({ ...rest, visitors: ids.size })),
    categories,
  };
}

export async function countBy(collectionName: 'projectLikes' | 'projectViews' | 'resumeDownloads', field: 'projectId' | 'resumeId', ids: string[]): Promise<Record<string, number>> {
  if (demoActive()) return demoCountBy(collectionName, field, ids);
  const d = await db();
  const entries = await Promise.all(ids.map(async (id) => {
    const s = await getCountFromServer(query(collection(d, collectionName), where(field, '==', id)));
    return [id, s.data().count] as const;
  }));
  return Object.fromEntries(entries);
}

/* ---------------- sheets sync state ---------------- */
export interface SyncState { lastSync?: string; lastCount?: number; autoSync?: boolean }
export async function getSyncState(): Promise<SyncState> {
  if (demoActive()) return demo.getSyncState();
  const s = await getDoc(doc(await db(), 'admin', 'sheetsSync'));
  return (s.data() as SyncState) ?? {};
}
export async function saveSyncState(patch: SyncState) {
  if (demoActive()) return demo.saveSyncState(patch);
  await setDoc(doc(await db(), 'admin', 'sheetsSync'), patch, { merge: true });
}

/* ---------------- Netlify Functions ---------------- */
export async function callFunction<T>(name: 'ai-draft' | 'send-reply' | 'sheets-sync' | 'status', init: { method?: 'GET' | 'POST'; body?: unknown } = {}): Promise<T> {
  if (demoActive()) return demo.callFunction(name, init) as Promise<T>;
  const auth = await getAuthInstance();
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in.');
  const token = await user.getIdToken();
  const res = await fetch(`/.netlify/functions/${name}`, {
    method: init.method ?? 'POST',
    headers: { authorization: `Bearer ${token}`, ...(init.body ? { 'content-type': 'application/json' } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  let data: unknown = null;
  try { data = await res.json(); } catch { /* not JSON */ }
  if (!res.ok) {
    const msg = (data as { error?: string } | null)?.error;
    throw new Error(msg || (res.status === 404 ? 'Function not deployed (404).' : `Request failed (${res.status}).`));
  }
  return data as T;
}

/* ---------------- export rows ---------------- */
export const toRows = (list: Message[]) => list.map((m) => ({
  Date: msgDate(m)?.toLocaleString() ?? '',
  Name: m.name ?? '',
  Email: m.email ?? '',
  Subject: m.subject ?? '',
  Category: m.category ?? 'General',
  Message: m.message ?? '',
  Read: m.read ? 'Yes' : 'No',
  Replied: m.replied ? 'Yes' : 'No',
  Starred: m.starred ? 'Yes' : 'No',
  Archived: m.archived ? 'Yes' : 'No',
  Note: m.note ?? '',
}));

/* ---------------- audit log (append-only, see firestore.rules) ---------------- */
export interface AuditEntry { id: string; action: string; detail: string; at?: Timestamp; by: string; email?: string }
export async function logAction(action: string, detail: string): Promise<void> {
  if (demoActive()) return demo.logAction(action, detail);
  try {
    const auth = await getAuthInstance();
    const u = auth.currentUser;
    if (!u) return;
    const entry: Record<string, unknown> = { action: action.slice(0, 60), detail: detail.slice(0, 500), at: serverTimestamp(), by: u.uid };
    if (u.email) entry.email = u.email.slice(0, 254);
    await addDoc(collection(await db(), 'auditLog'), entry);
  } catch { /* the action itself already succeeded; never block on the log */ }
}
export async function fetchAudit(n = 100): Promise<AuditEntry[]> {
  if (demoActive()) return demo.fetchAudit(n);
  const snap = await getDocs(query(collection(await db(), 'auditLog'), orderBy('at', 'desc'), limit(n)));
  return snap.docs.map((x) => ({ id: x.id, ...(x.data() as Omit<AuditEntry, 'id'>) }));
}

/* ---------------- reply templates (admin/templates) ---------------- */
export interface Template { id: string; name: string; body: string }
export const DEFAULT_TEMPLATES: Template[] = [
  { id: 'thanks', name: 'Thanks, will follow up', body: `Hi {firstName},

Thank you for reaching out through my portfolio. I have read your message and will get back to you with a detailed reply shortly.

Best regards,
Sriram Kannan` },
  { id: 'role', name: 'Interested in the role', body: `Hi {firstName},

Thank you for considering me. I am very interested in this opportunity and would be glad to talk further. Please let me know a time that works for you, and I can share my resume and any other details you need.

Best regards,
Sriram Kannan` },
  { id: 'collab', name: 'Open to collaborate', body: `Hi {firstName},

Thanks for the idea, it sounds interesting. I would be happy to explore a collaboration. Could you share a bit more about the scope and timeline?

Best regards,
Sriram Kannan` },
];
export async function getTemplates(): Promise<Template[]> {
  if (demoActive()) return demo.getTemplates(DEFAULT_TEMPLATES);
  const s = await getDoc(doc(await db(), 'admin', 'templates'));
  const items = (s.data()?.items as Template[] | undefined);
  return Array.isArray(items) ? items : DEFAULT_TEMPLATES;
}
export async function saveTemplates(items: Template[]) {
  if (demoActive()) return demo.saveTemplates(items);
  const clean = items.slice(0, 50).map((t) => ({ id: t.id.slice(0, 40), name: t.name.trim().slice(0, 80) || 'Untitled', body: t.body.slice(0, 5000) }));
  await setDoc(doc(await db(), 'admin', 'templates'), { items: clean });
}
export const fillTemplate = (body: string, m: Pick<Message, 'name' | 'email'>) => {
  const name = (m.name ?? '').trim();
  return body.replace(/\{firstName\}/g, name.split(/\s+/)[0] || 'there').replace(/\{name\}/g, name || 'there').replace(/\{email\}/g, m.email ?? '');
};

/* ---------------- site content overrides (siteContent/live) ---------------- */
export async function getOverrides(): Promise<SiteOverrides | null> {
  if (demoActive()) return demo.getOverrides();
  const s = await getDoc(doc(await db(), 'siteContent', 'live'));
  return s.exists() ? (s.data() as SiteOverrides) : null;
}
export async function saveOverrides(o: Omit<SiteOverrides, 'updatedAt' | 'updatedBy'>): Promise<SiteOverrides> {
  if (demoActive()) return demo.saveOverrides(o);
  const auth = await getAuthInstance();
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Not signed in.');
  const data: SiteOverrides = { ...o, updatedAt: new Date().toISOString(), updatedBy: uid };
  await setDoc(doc(await db(), 'siteContent', 'live'), JSON.parse(JSON.stringify(data)));
  return data;
}
export async function resetOverrides() {
  if (demoActive()) return demo.resetOverrides();
  await deleteDoc(doc(await db(), 'siteContent', 'live'));
}

/* ---------------- blocked senders (enforced by firestore.rules) ---------------- */
export interface Blocked { id: string; email: string; reason?: string; at?: string }
/** Doc id is the lowercased address: the rules check exists(blockedSenders/<email.lower()>). */
export const blockKey = (email: string) => email.trim().toLowerCase();
export async function blockSender(email: string, reason = '') {
  if (demoActive()) return demo.blockSender(email, reason);
  const key = blockKey(email);
  await setDoc(doc(await db(), 'blockedSenders', key), { email: key, reason: reason.slice(0, 200), at: new Date().toISOString() });
  logAction('sender.block', `Blocked ${key}${reason ? `: ${reason}` : ''}`);
}
export async function unblockSender(email: string) {
  if (demoActive()) return demo.unblockSender(email);
  const key = blockKey(email);
  await deleteDoc(doc(await db(), 'blockedSenders', key));
  logAction('sender.unblock', `Unblocked ${key}`);
}
export async function fetchBlocked(): Promise<Blocked[]> {
  if (demoActive()) return demo.fetchBlocked();
  const snap = await getDocs(collection(await db(), 'blockedSenders'));
  return snap.docs.map((x) => ({ id: x.id, ...(x.data() as Omit<Blocked, 'id'>) })).sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

/* ---------------- full backup ---------------- */
export async function fetchBackup() {
  if (demoActive()) return demo.fetchBackup();
  const d = await db();
  const all = async (name: string) => getDocs(collection(d, name)).then((s) => s.docs.map((x) => ({ id: x.id, ...x.data() }))).catch(() => null);
  const one = async (c: string, id: string) => getDoc(doc(d, c, id)).then((s) => (s.exists() ? s.data() : null)).catch(() => null);
  const [messages, replies, auditLog, blockedSenders, templates, sheetsSync, siteContent] = await Promise.all([
    all('messages'), all('replies'), all('auditLog'), all('blockedSenders'),
    one('admin', 'templates'), one('admin', 'sheetsSync'), one('siteContent', 'live'),
  ]);
  return { exportedAt: new Date().toISOString(), project: 'portfolio-admin', messages, replies, auditLog, blockedSenders, templates, sheetsSync, siteContent };
}
