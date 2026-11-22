// Seeds the LOCAL emulators (never production) with:
//   admin@test.dev / admin-pass-123  (uid admin-uid-1, claim admin: true)
//   user@test.dev  / user-pass-123   (uid user-uid-2, no claim: must be locked out)
// plus messages/analytics shaped like the old site's data.
// Usage: npm run dev:emulators   (terminal 1)
//        node scripts/seed-emulator.mjs
//        npx vite --mode emulator  (terminal 2) -> http://localhost:5173/admin
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
const { initializeApp } = await import('firebase-admin/app');
const { getAuth } = await import('firebase-admin/auth');
const { getFirestore, Timestamp } = await import('firebase-admin/firestore');

initializeApp({ projectId: 'demo-portfolio' });
const auth = getAuth();
const db = getFirestore();

for (const u of [
  { uid: 'admin-uid-1', email: 'admin@test.dev', password: 'admin-pass-123', claims: { admin: true } },
  { uid: 'user-uid-2', email: 'user@test.dev', password: 'user-pass-123', claims: {} },
]) {
  try { await auth.deleteUser(u.uid); } catch { /* not there yet */ }
  await auth.createUser({ uid: u.uid, email: u.email, password: u.password });
  await auth.setCustomUserClaims(u.uid, u.claims);
}

await db.collection('messages').doc('legacy1').set({ name: 'Old Visitor', email: 'old@example.com', message: 'Great portfolio, love the projects!', category: 'Feedback', timestamp: '2026-03-01T10:00:00.000Z', date: '3/1/2026, 10:00:00 AM', read: false });
await db.collection('messages').doc('legacy2').set({ name: '=HYPERLINK("x")', email: 'csv@example.com', message: 'Testing formula escaping in exports.', category: 'General', timestamp: '2026-03-02T10:00:00.000Z', read: true });
await db.collection('analytics').add({ type: 'pageview', timestamp: Timestamp.fromDate(new Date(Date.now() - 2 * 86400000)), path: '/' });
await db.collection('projectLikes').add({ projectId: 'forensix', timestamp: Timestamp.now() });
console.log('Seeded emulator data.');
process.exit(0);
