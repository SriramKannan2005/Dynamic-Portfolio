/**
 * Public-site analytics + message storage. All writes are create-only and match
 * firestore.rules exactly. Failures are swallowed: tracking must never break the page.
 * No IPs, no fingerprinting: a random visitor id in localStorage is the only identifier.
 * Analytics (not messages) are skipped when the browser sends Do Not Track / GPC.
 */
import { getDb, firebaseConfigured, safeId } from '../shared/firebase';
import type { MessageCategory } from '../shared/categories';

const ls = {
  get(k: string) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* blocked */ } },
};
const ss = {
  get(k: string) { try { return sessionStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { sessionStorage.setItem(k, v); } catch { /* blocked */ } },
};

const analyticsAllowed = () => {
  const n = navigator as Navigator & { globalPrivacyControl?: boolean };
  return firebaseConfigured && n.doNotTrack !== '1' && n.globalPrivacyControl !== true;
};

export function visitorId(): string {
  let id = ls.get('sk-vid');
  if (!id || !/^[A-Za-z0-9-]{8,64}$/.test(id)) {
    id = (crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`).replace(/[^A-Za-z0-9-]/g, '');
    ls.set('sk-vid', id);
  }
  return id;
}

async function fs() {
  const db = await getDb();
  const m = await import('firebase/firestore');
  return { db, ...m };
}

/** One page view per tab session + a create-only visitor doc. */
export async function trackVisit(): Promise<void> {
  if (!analyticsAllowed() || ss.get('sk-pv')) return;
  ss.set('sk-pv', '1');
  try {
    const { db, addDoc, setDoc, doc, collection, serverTimestamp } = await fs();
    const vid = visitorId();
    let referrer = '';
    try { referrer = document.referrer ? new URL(document.referrer).origin : ''; } catch { /* ignore */ }
    await addDoc(collection(db, 'pageViews'), { path: location.pathname.slice(0, 200) || '/', visitorId: vid, referrer: referrer.slice(0, 300), createdAt: serverTimestamp() });
    if (!ls.get('sk-visitor')) {
      ls.set('sk-visitor', '1');
      await setDoc(doc(db, 'visitors', vid), {
        visitorId: vid, firstSeen: serverTimestamp(),
        lang: (navigator.language || '').slice(0, 20), screen: `${screen.width}x${screen.height}`.slice(0, 20),
      });
    }
  } catch { /* ignore */ }
}

/** Deterministic "<item>__<visitor>" ids: the rules reject a second create. */
async function counterOnce(collectionName: 'projectLikes' | 'projectViews' | 'resumeDownloads', field: 'projectId' | 'resumeId', itemId: string, respectDnt = true): Promise<boolean> {
  if (respectDnt ? !analyticsAllowed() : !firebaseConfigured) return false;
  const vid = visitorId();
  const id = safeId(itemId);
  const flag = `sk-${collectionName}-${id}`;
  if (ls.get(flag)) return true;
  try {
    const { db, setDoc, doc, serverTimestamp } = await fs();
    await setDoc(doc(db, collectionName, `${id}__${vid}`), { [field]: id, visitorId: vid, createdAt: serverTimestamp() });
    ls.set(flag, '1');
    return true;
  } catch {
    // permission-denied here usually means "already counted" for this visitor
    ls.set(flag, '1');
    return false;
  }
}

export const trackProjectView = (projectId: string) => counterOnce('projectViews', 'projectId', projectId);
export const trackResumeDownload = (resumeId: string) => counterOnce('resumeDownloads', 'resumeId', resumeId);
/** A like is an explicit user action, so it is recorded even with DNT on. */
export const likeProject = (projectId: string) => counterOnce('projectLikes', 'projectId', projectId, false);
export const hasLiked = (projectId: string) => !!ls.get(`sk-projectLikes-${safeId(projectId)}`);


export async function saveMessage(m: { name: string; email: string; subject: string; message: string; category: MessageCategory }): Promise<void> {
  const { db, addDoc, collection, serverTimestamp } = await fs();
  const data: Record<string, unknown> = {
    name: m.name.slice(0, 100), email: m.email.slice(0, 254), message: m.message.slice(0, 5000),
    category: m.category, timestamp: new Date().toISOString(), createdAt: serverTimestamp(), read: false, source: 'portfolio',
  };
  if (m.subject) data.subject = m.subject.slice(0, 150);
  await addDoc(collection(db, 'messages'), data);
}
