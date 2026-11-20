#!/usr/bin/env node
/**
 * Grant (or revoke) the Firestore admin custom claim.
 *
 *   npm run admin:claim -- <uid>            # grant admin == true
 *   npm run admin:claim -- <uid> --revoke   # remove it
 *
 * Needs a service-account key for the Firebase project:
 *   Firebase console > Project settings > Service accounts > Generate new private key
 * Save it OUTSIDE the repo and point GOOGLE_APPLICATION_CREDENTIALS at it, e.g.
 *   set GOOGLE_APPLICATION_CREDENTIALS=C:\keys\sriram-kannan-admin.json   (cmd)
 *   $env:GOOGLE_APPLICATION_CREDENTIALS="C:\keys\sriram-kannan-admin.json" (PowerShell)
 * Never commit that file or put it in Netlify.
 */
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const [uid, flag] = process.argv.slice(2);
if (!uid) {
  console.error('Usage: npm run admin:claim -- <uid> [--revoke]');
  process.exit(1);
}
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  console.error('Set GOOGLE_APPLICATION_CREDENTIALS to your service-account JSON first (see the header of this file).');
  process.exit(1);
}

initializeApp({ credential: applicationDefault(), projectId: process.env.FIREBASE_PROJECT_ID || 'sriram-kannan' });
const auth = getAuth();
const user = await auth.getUser(uid);
const claims = { ...(user.customClaims ?? {}) };
if (flag === '--revoke') delete claims.admin; else claims.admin = true;
await auth.setCustomUserClaims(uid, claims);
console.log(`${flag === '--revoke' ? 'Revoked' : 'Granted'} admin for ${user.email ?? uid}. Claims now: ${JSON.stringify(claims)}`);
console.log('Sign out of /admin and sign in again so the new ID token carries the claim.');
