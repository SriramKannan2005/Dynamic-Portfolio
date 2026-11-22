// Firestore security-rules tests. Run with: npm run test:rules
// (starts the Firestore emulator, runs this file, shuts it down)
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, collection, serverTimestamp } from 'firebase/firestore';

const env = await initializeTestEnvironment({
  projectId: 'demo-portfolio',
  firestore: { rules: readFileSync('firestore.rules', 'utf8') },
});

const results = [];
async function test(name, fn) {
  try { await fn(); results.push(['PASS', name]); }
  catch (e) { results.push(['FAIL', name, e.message.split('\n')[0]]); }
}

const anon = env.unauthenticatedContext().firestore();
const stranger = env.authenticatedContext('random-user', { email: 'x@y.com' }).firestore();
const admin = env.authenticatedContext('admin-uid-1', { admin: true }).firestore();

const msg = (o = {}) => ({
  name: 'Ada Lovelace', email: 'ada@example.com', subject: 'Hello', message: 'I would like to talk about a role.',
  category: 'Job Inquiry', timestamp: new Date().toISOString(), createdAt: serverTimestamp(), read: false, source: 'portfolio', ...o,
});

// Seed one message with rules disabled
await env.withSecurityRulesDisabled(async (ctx) => {
  await setDoc(doc(ctx.firestore(), 'messages', 'm1'), { name: 'Seed', email: 's@e.com', message: 'seed message text', category: 'General', timestamp: '2026-01-01T00:00:00.000Z', read: false });
  await setDoc(doc(ctx.firestore(), 'analytics', 'a1'), { type: 'pageview' });
});

// ---- messages ----
await test('public can create a valid message', () => assertSucceeds(addDoc(collection(anon, 'messages'), msg())));
await test('message without optional subject is ok', () => { const m = msg(); delete m.subject; return assertSucceeds(addDoc(collection(anon, 'messages'), m)); });
await test('message rejects extra fields', () => assertFails(addDoc(collection(anon, 'messages'), msg({ admin: true }))));
await test('message rejects read:true', () => assertFails(addDoc(collection(anon, 'messages'), msg({ read: true }))));
await test('message rejects client-chosen createdAt', () => assertFails(addDoc(collection(anon, 'messages'), msg({ createdAt: new Date(0) }))));
await test('message rejects overlong text', () => assertFails(addDoc(collection(anon, 'messages'), msg({ message: 'x'.repeat(5001) }))));
await test('message rejects bad email', () => assertFails(addDoc(collection(anon, 'messages'), msg({ email: 'not-an-email' }))));
await test('message rejects unknown category', () => assertFails(addDoc(collection(anon, 'messages'), msg({ category: 'Spam' }))));
// Temporary compatibility with the previous (still live) site's contact form
const legacy = (o = {}) => ({ name: 'Old Form', email: 'old@example.com', message: 'Sent from the old site.', category: 'General', timestamp: new Date().toISOString(), date: new Date().toLocaleString(), read: false, ...o });
await test('legacy site message shape accepted', () => assertSucceeds(addDoc(collection(anon, 'messages'), legacy())));
await test('legacy shape still rejects read:true', () => assertFails(addDoc(collection(anon, 'messages'), legacy({ read: true }))));
await test('legacy shape still rejects extra fields', () => assertFails(addDoc(collection(anon, 'messages'), legacy({ replied: true }))));
await test('legacy shape still rejects bad email', () => assertFails(addDoc(collection(anon, 'messages'), legacy({ email: 'nope' }))));
await test('legacy shape still rejects unknown category', () => assertFails(addDoc(collection(anon, 'messages'), legacy({ category: 'Spam' }))));
await test('legacy shape still rejects overlong message', () => assertFails(addDoc(collection(anon, 'messages'), legacy({ message: 'x'.repeat(5001) }))));
await test('anonymous cannot read messages', () => assertFails(getDocs(collection(anon, 'messages'))));
await test('non-admin signed-in user cannot read messages', () => assertFails(getDocs(collection(stranger, 'messages'))));
await test('non-admin cannot read a single message', () => assertFails(getDoc(doc(stranger, 'messages', 'm1'))));
await test('non-admin cannot update a message', () => assertFails(updateDoc(doc(stranger, 'messages', 'm1'), { read: true })));
await test('non-admin cannot delete a message', () => assertFails(deleteDoc(doc(stranger, 'messages', 'm1'))));
await test('admin can read messages', () => assertSucceeds(getDocs(collection(admin, 'messages'))));
await test('admin can mark read', () => assertSucceeds(updateDoc(doc(admin, 'messages', 'm1'), { read: true })));

// ---- replies / admin / legacy ----
await test('admin can write replies', () => assertSucceeds(addDoc(collection(admin, 'replies'), { messageId: 'm1', replyContent: 'Thanks' })));
await test('non-admin cannot read replies', () => assertFails(getDocs(collection(stranger, 'replies'))));
await test('public cannot create replies', () => assertFails(addDoc(collection(anon, 'replies'), { messageId: 'm1' })));
await test('admin can write admin/sheetsSync', () => assertSucceeds(setDoc(doc(admin, 'admin', 'sheetsSync'), { autoSync: true })));
await test('non-admin cannot read admin docs', () => assertFails(getDoc(doc(stranger, 'admin', 'sheetsSync'))));
await test('public cannot write legacy analytics', () => assertFails(addDoc(collection(anon, 'analytics'), { type: 'pageview' })));
await test('admin can read legacy analytics', () => assertSucceeds(getDocs(collection(admin, 'analytics'))));

// ---- page views / visitors ----
const vid = 'v-1234abcd';
await test('public can log a page view', () => assertSucceeds(addDoc(collection(anon, 'pageViews'), { path: '/', visitorId: vid, referrer: 'https://google.com', createdAt: serverTimestamp() })));
await test('page view rejects extra fields', () => assertFails(addDoc(collection(anon, 'pageViews'), { path: '/', visitorId: vid, createdAt: serverTimestamp(), ip: '1.2.3.4' })));
await test('public cannot read page views', () => assertFails(getDocs(collection(anon, 'pageViews'))));
await test('visitor doc create (id = visitorId)', () => assertSucceeds(setDoc(doc(anon, 'visitors', vid), { visitorId: vid, firstSeen: serverTimestamp(), lang: 'en-IN' })));
await test('visitor doc duplicate rejected', () => assertFails(setDoc(doc(anon, 'visitors', vid), { visitorId: vid, firstSeen: serverTimestamp() })));
await test('visitor doc id mismatch rejected', () => assertFails(setDoc(doc(anon, 'visitors', 'v-other999'), { visitorId: vid, firstSeen: serverTimestamp() })));

// ---- likes / views / resume downloads (one per visitor per item) ----
const like = (pid, v = vid) => setDoc(doc(anon, 'projectLikes', `${pid}__${v}`), { projectId: pid, visitorId: v, createdAt: serverTimestamp() });
await test('like with deterministic id succeeds', () => assertSucceeds(like('forensix')));
await test('duplicate like rejected', () => assertFails(like('forensix')));
await test('like with mismatched id rejected', () => assertFails(setDoc(doc(anon, 'projectLikes', 'forensix__someone-else'), { projectId: 'forensix', visitorId: vid, createdAt: serverTimestamp() })));
await test('like via random addDoc id rejected', () => assertFails(addDoc(collection(anon, 'projectLikes'), { projectId: 'forensix', visitorId: vid, createdAt: serverTimestamp() })));
await test('public cannot read likes', () => assertFails(getDocs(collection(anon, 'projectLikes'))));
await test('public cannot delete own like', () => assertFails(deleteDoc(doc(anon, 'projectLikes', `forensix__${vid}`))));
await test('project view once per visitor', async () => {
  await assertSucceeds(setDoc(doc(anon, 'projectViews', `cardioscreen__${vid}`), { projectId: 'cardioscreen', visitorId: vid, createdAt: serverTimestamp() }));
  await assertFails(setDoc(doc(anon, 'projectViews', `cardioscreen__${vid}`), { projectId: 'cardioscreen', visitorId: vid, createdAt: serverTimestamp() }));
});
await test('resume download once per visitor per resume', async () => {
  await assertSucceeds(setDoc(doc(anon, 'resumeDownloads', `general__${vid}`), { resumeId: 'general', visitorId: vid, createdAt: serverTimestamp() }));
  await assertFails(setDoc(doc(anon, 'resumeDownloads', `general__${vid}`), { resumeId: 'general', visitorId: vid, createdAt: serverTimestamp() }));
});
await test('admin can count likes', () => assertSucceeds(getDocs(collection(admin, 'projectLikes'))));

// ---- message triage fields (star / archive / note) ----
await test('admin can star, archive and annotate', () => assertSucceeds(updateDoc(doc(admin, 'messages', 'm1'), { starred: true, archived: true, note: 'call back' })));
await test('non-admin cannot star a message', () => assertFails(updateDoc(doc(stranger, 'messages', 'm1'), { starred: true })));

// ---- audit log (append-only) ----
const entry = (o = {}) => ({ action: 'message.delete', detail: 'Deleted 1 message', at: serverTimestamp(), by: 'admin-uid-1', ...o });
await test('admin can append an audit entry', () => assertSucceeds(setDoc(doc(admin, 'auditLog', 'e1'), entry())));
await test('audit entry must carry the caller uid', () => assertFails(addDoc(collection(admin, 'auditLog'), entry({ by: 'someone-else' }))));
await test('audit entry rejects client time', () => assertFails(addDoc(collection(admin, 'auditLog'), entry({ at: new Date(0) }))));
await test('audit entry rejects extra fields', () => assertFails(addDoc(collection(admin, 'auditLog'), entry({ ip: '1.2.3.4' }))));
await test('audit entries cannot be edited', () => assertFails(updateDoc(doc(admin, 'auditLog', 'e1'), { detail: 'nothing happened' })));
await test('audit entries cannot be deleted', () => assertFails(deleteDoc(doc(admin, 'auditLog', 'e1'))));
await test('non-admin cannot read the audit log', () => assertFails(getDocs(collection(stranger, 'auditLog'))));
await test('non-admin cannot write the audit log', () => assertFails(addDoc(collection(stranger, 'auditLog'), entry({ by: 'random-user' }))));

// ---- site content overrides ----
const live = (o = {}) => ({ availability: { open: true, text: 'Open to roles' }, projects: { forensix: { hidden: true } }, updatedAt: new Date().toISOString(), updatedBy: 'admin-uid-1', ...o });
await test('admin can publish site content', () => assertSucceeds(setDoc(doc(admin, 'siteContent', 'live'), live())));
await test('anyone can read site content', () => assertSucceeds(getDoc(doc(anon, 'siteContent', 'live'))));
await test('public cannot write site content', () => assertFails(setDoc(doc(anon, 'siteContent', 'live'), live({ updatedBy: 'x' }))));
await test('non-admin cannot write site content', () => assertFails(setDoc(doc(stranger, 'siteContent', 'live'), live({ updatedBy: 'random-user' }))));
await test('site content rejects unknown keys', () => assertFails(setDoc(doc(admin, 'siteContent', 'live'), live({ script: '<x>' }))));
await test('site content only in the fixed doc', () => assertFails(setDoc(doc(admin, 'siteContent', 'other'), live())));
await test('site content projects must be a map', () => assertFails(setDoc(doc(admin, 'siteContent', 'live'), live({ projects: 'all' }))));
await test('admin can publish section edits', () => assertSucceeds(setDoc(doc(admin, 'siteContent', 'live'), live({ sections: { roles: ['AI Engineer'], about: ['Hi'] } }))));
await test('site content sections must be a map', () => assertFails(setDoc(doc(admin, 'siteContent', 'live'), live({ sections: ['about'] }))));

// ---- blocked senders ----
const block = (email, o = {}) => ({ email, reason: 'spam', at: new Date().toISOString(), ...o });
await test('admin can block a sender', () => assertSucceeds(setDoc(doc(admin, 'blockedSenders', 'spammer@bad.com'), block('spammer@bad.com'))));
await test('message from a blocked sender is refused', () => assertFails(addDoc(collection(anon, 'messages'), msg({ email: 'spammer@bad.com' }))));
await test('block is case-insensitive', () => assertFails(addDoc(collection(anon, 'messages'), msg({ email: 'Spammer@BAD.com' }))));
await test('legacy form also respects the block list', () => assertFails(addDoc(collection(anon, 'messages'), legacy({ email: 'spammer@bad.com' }))));
await test('other senders still get through', () => assertSucceeds(addDoc(collection(anon, 'messages'), msg({ email: 'friend@good.com' }))));
await test('block doc id must equal the lowercased email', () => assertFails(setDoc(doc(admin, 'blockedSenders', 'Mixed@Case.com'), block('Mixed@Case.com'))));
await test('block doc rejects extra fields', () => assertFails(setDoc(doc(admin, 'blockedSenders', 'x@y.co'), block('x@y.co', { ip: '1.1.1.1' }))));
await test('public cannot read the block list', () => assertFails(getDocs(collection(anon, 'blockedSenders'))));
await test('non-admin cannot block', () => assertFails(setDoc(doc(stranger, 'blockedSenders', 'a@b.co'), block('a@b.co'))));
await test('admin can unblock', () => assertSucceeds(deleteDoc(doc(admin, 'blockedSenders', 'spammer@bad.com'))));
await test('unblocked sender can write again', () => assertSucceeds(addDoc(collection(anon, 'messages'), msg({ email: 'spammer@bad.com' }))));

// ---- default deny ----
await test('unknown collection denied for public', () => assertFails(addDoc(collection(anon, 'whatever'), { a: 1 })));
await test('unknown collection denied for non-admin read', () => assertFails(getDocs(collection(stranger, 'whatever'))));

await env.cleanup();
const failed = results.filter((r) => r[0] === 'FAIL');
for (const r of results) console.log(r.join('  '));
console.log(`\n${results.length - failed.length}/${results.length} rules tests passed`);
process.exit(failed.length ? 1 : 0);
