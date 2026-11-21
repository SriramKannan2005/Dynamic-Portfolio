# Sriram Kannan · 3D Portfolio + Admin

React + TypeScript (Vite) site with a Three.js hero, a guarded `/admin` panel, Netlify Functions for anything secret, and Firebase (Auth, Firestore, App Check).

```
index.html                     Vite entry: SEO, JSON-LD, icon sprite, loader, scene canvas
src/main.tsx                   router: "/" site, "/admin/*" lazy admin chunk
src/site/                      public site (React sections + imperative 3D engines in lib/)
src/site/lib/scene.js          Three.js network + morphing core + scroll camera
src/site/tracking.ts           page views, likes, project views, resume downloads, messages
src/admin/                     admin panel (Analytics, Messages + Reply, Export)
src/shared/                    Firebase bootstrap (+ App Check), modal, icons, categories
netlify/functions/             ai-draft, send-reply, sheets-sync (admin-token verified)
netlify/lib/shared.ts          ID-token verification + admin allow-list check
firestore.rules                security rules (tests: tests/rules.test.mjs)
data/content.json, projects.json   all copy, edit these, not the code
public/                        static assets, manifest, service worker, robots, sitemap
```

## Local development

```bash
npm install
cp .env.example .env.local      # fill in the VITE_FIREBASE_* values
npm run dev                     # http://localhost:5173  (functions served at /.netlify/functions/*)
```

**Safe local admin testing (no production data):**

```bash
npm run dev:emulators                    # terminal 1: Auth + Firestore emulators (needs Java 11+)
node scripts/seed-emulator.mjs           # admin@test.dev / admin-pass-123, user@test.dev / user-pass-123
npx vite --mode emulator                 # terminal 2: open /admin
```

Tests and checks:

```bash
npm run test:rules        # 39 Firestore rules tests against the emulator
npm run test:functions    # 14 tests: token verification + admin gate of the Functions
npm run build && npm run check:secrets   # scans dist/ for keys, Apps Script URLs, env names
```

## Deploy (Netlify)

`netlify.toml` already sets build `npm run build`, publish `dist`, functions `netlify/functions`, the SPA fallback (`/* -> /index.html 200`) and `X-Robots-Tag: noindex` on `/admin`.

### One-time manual steps

1. **Rotate the old secrets.** The previous admin committed the Apps Script email URL and the spreadsheet link to git, and loaded the Gemini key in the browser. Create a new Gemini API key (and delete the old one), and redeploy the Apps Script as a **new deployment** so the old URL stops working. A local copy of the old `admin/env.js` was kept at `.local-secrets/old-admin-env.js` (gitignored); delete it once you've migrated.
2. **Create the admin user.** Firebase console > Authentication > Users > Add user (email + strong password). Copy its **UID**.
3. **Set the admin custom claim.** Firebase console > Project settings > Service accounts > *Generate new private key*. Save it **outside the repo**, then:
   ```powershell
   $env:GOOGLE_APPLICATION_CREDENTIALS="C:\keys\sriram-kannan-admin.json"
   npm run admin:claim -- <UID>
   ```
   Sign out of `/admin` and back in so the token carries `admin: true`. Delete the key file afterwards.
4. **App Check.** Firebase console > App Check > register the web app with **reCAPTCHA v3** (create the key at google.com/recaptcha/admin with your Netlify domain). Put the *site key* in `VITE_RECAPTCHA_SITE_KEY`. After a day of "Unverified requests: 0" in the App Check metrics, click **Enforce** for Cloud Firestore.
5. **Netlify environment variables** (Site configuration > Environment variables):

   | Variable | Scope | Value |
   | --- | --- | --- |
   | `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID` | Builds | Firebase web config (public identifiers) |
   | `VITE_RECAPTCHA_SITE_KEY` | Builds | reCAPTCHA v3 site key |
   | `VITE_ADMIN_UIDS` | Builds | admin UID(s), comma-separated |
   | `FIREBASE_PROJECT_ID` | Functions | `sriram-kannan` |
   | `ADMIN_UIDS` | Functions | same UID(s) |
   | `GEMINI_API_KEY` | Functions | **secret**, the new Gemini key |
   | `GEMINI_MODEL` | Functions | optional; falls back to `gemini-flash-latest`, then `gemini-flash-lite-latest` |
   | `SEND_EMAIL_URL` | Functions | **secret**, Apps Script email web-app URL |
   | `SHEETS_SYNC_URL` | Functions | **secret**, Apps Script sheet web-app URL |
   | `SHEETS_VIEW_URL` | Functions | link for "View spreadsheet" |

   Mark the secret ones "Contains secret values" so they're hidden in the UI and logs.
6. **Deploy the rules:** `npx firebase login`, then `npx firebase deploy --only firestore:rules --project sriram-kannan`.
7. **Videos** stay in `public/assets/videos` (Git LFS) but are no longer shown on the site, and the build removes them from `dist`, so deploys stay small. To bring one back, show it in `ProjectDetail` and drop the `dropVideosFromBuild` plugin in `vite.config.ts`.

## Editing content

- `data/content.json`: profile, about, stats (computed from the data), skills, experience, achievements, certifications, education, **resumes**.
- `data/projects.json`: projects keyed by id (`featured`, `order`, `hook`, `badge`, `links`, `poster`, `caseStudy`).
- **Add a resume:** drop the PDF in `public/assets/docs/` and add `{ "id": "data-analytics", "label": "...", "description": "...", "file": "/assets/docs/<file>.pdf", "filename": "..." }` to `resumes`. Ids may only contain letters, digits and `-` (the Firestore rules enforce this).

- **Live edits without a deploy:** `/admin` → **Content** can hide, reorder, feature or re-badge projects, override their hook / description / demo / video, change the hero availability line and show an announcement. Edits live in Firestore (`siteContent/live`) as a thin layer over the JSON; **Reset all** deletes that document and the site goes back to exactly what is in the repo.

## Admin panel

| Tab | What it does |
| --- | --- |
| Overview | Unread / waiting-for-reply counts, today's views, 7-day visitors with sparkline, reply queue, recent activity, quick actions |
| Analytics | 7 / 30 / 90-day range with change vs the previous period, traffic, devices, busiest hours, messages by category, top pages / referrers / languages, per-project and resume stats, CSV export |
| Messages | Live inbox (no refresh needed); Inbox / Follow-up / Starred / Archived / Spam / Trash folders; search with highlighting; filters (incl. "needs reply"); re-categorise a message; follow-up reminders; bulk read / star / archive / spam / export / trash; Delete moves to Trash with Undo (purged after 30 days); spam with optional sender blocking; private notes; AI Reply with saved templates |
| People | Everyone who has written in, grouped by email: message count, first / last contact, waiting-on-you count, categories, block / unblock, jump to their messages, CSV export |
| Content | Live site edits (above) |
| Export | XLSX / CSV / JSON (optionally excluding archived), Google Sheets sync |
| Settings | System status (admin claim, rules version, Functions reachable, which server settings are configured, App Check), idle auto sign-out, desktop notification + chime, reply-template editor, blocked senders, full JSON backup, append-only activity log |

Anywhere in the admin, **Ctrl/Cmd + K** opens a command palette (pages, actions, find a person and reply). In Messages: `j`/`k` move, `x` select, `r` reply, `s` star, `e` archive, `u` read/unread, `n` note, `f` follow up tomorrow, `!` spam, `#` move to Trash, `/` search, `?` help.

These features need the current `firestore.rules` deployed (`auditLog`, `siteContent`, `blockedSenders` and the message triage fields). Sender blocking is enforced by the rules themselves: a message whose lowercased email has a `blockedSenders/<email>` document is refused. Analytics → **Report** prints a clean page (or saves a PDF). With the old rules deployed, the affected panels say so instead of failing silently.

## Privacy and security notes

- The public site stores no IPs or fingerprints: a random visitor id in localStorage, path, referrer origin. Page-view analytics are skipped when the browser sends Do Not Track / Global Privacy Control; likes are explicit actions and are still recorded.
- Likes, project views and resume downloads use the id `<item>__<visitor>`, so the rules reject duplicates; nobody but the admin can read them.
- Every Function verifies the Firebase ID token (RS256 against Google's keys, issuer and audience = project), then requires **both** the `admin == true` claim and a UID in `ADMIN_UIDS` before calling Gemini, Apps Script or Sheets.
- Spreadsheet exports neutralise cells that start with `= + - @` (formula injection).
- `auditLog` is append-only in the rules: entries must carry the caller's UID and server time and can never be edited or deleted. `siteContent/live` is world-readable but admin-writable only, and the site accepts only `https://` or site-relative links from it.
- Reduced motion: follows the OS setting by default; visitors can opt in via the nav toggle or the one-time notice.
