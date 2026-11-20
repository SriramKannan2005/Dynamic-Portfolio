// Unit tests for the Netlify Functions' auth gate and upstream forwarding.
// Run: npm run test:functions
// Tokens are signed with a locally generated RS256 key and verified against a
// local JWKS, exercising exactly the same jwtVerify path production uses.
import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet } from 'jose';
import { requireAdmin } from '../netlify/lib/shared.ts';
import { buildPrompt } from '../netlify/functions/ai-draft.mts';
import { classifyMessage, MESSAGE_CATEGORIES } from '../src/shared/categories.ts';

const PROJECT = 'demo-portfolio';
const { publicKey, privateKey } = await generateKeyPair('RS256');
const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
const jwks = createLocalJWKSet({ keys: [jwk] });
const other = await generateKeyPair('RS256');

async function token(claims: Record<string, unknown>, opts: { sub?: string; iss?: string; aud?: string; key?: Parameters<SignJWT["sign"]>[0]; exp?: string } = {}) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ auth_time: now, ...claims })
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setSubject(opts.sub ?? 'admin-uid-1')
    .setIssuer(opts.iss ?? `https://securetoken.google.com/${PROJECT}`)
    .setAudience(opts.aud ?? PROJECT)
    .setIssuedAt(now)
    .setExpirationTime(opts.exp ?? '1h')
    .sign(opts.key ?? privateKey);
}
const req = (t?: string) => new Request('http://x/fn', { method: 'POST', headers: t ? { authorization: `Bearer ${t}` } : {} });
const check = (t?: string) => requireAdmin(req(t), { projectId: PROJECT, allowList: ['admin-uid-1'], jwks });

const results: [string, string][] = [];
async function test(name: string, fn: () => Promise<boolean>) {
  try { results.push([(await fn()) ? 'PASS' : 'FAIL', name]); } catch (e) { results.push(['FAIL', `${name} (${(e as Error).message})`]); }
}
const status = async (t?: string) => { const r = await check(t); return r.ok ? 200 : r.response.status; };

await test('valid admin token accepted', async () => (await status(await token({ admin: true }))) === 200);
await test('no token -> 401', async () => (await status()) === 401);
await test('garbage token -> 401', async () => (await status('abc.def.ghi')) === 401);
await test('token signed by another key -> 401', async () => (await status(await token({ admin: true }, { key: other.privateKey }))) === 401);
await test('wrong audience (other project) -> 401', async () => (await status(await token({ admin: true }, { aud: 'evil-project' }))) === 401);
await test('wrong issuer -> 401', async () => (await status(await token({ admin: true }, { iss: 'https://evil.example' }))) === 401);
await test('expired token -> 401', async () => (await status(await token({ admin: true }, { exp: '-10s' }))) === 401);
await test('uid in allow-list but no admin claim -> 403', async () => (await status(await token({}))) === 403);
await test('admin claim but uid not allow-listed -> 403', async () => (await status(await token({ admin: true }, { sub: 'someone-else' }))) === 403);
await test('missing server config -> 500', async () => {
  const r = await requireAdmin(req(await token({ admin: true })), { projectId: '', allowList: [], jwks });
  return !r.ok && r.response.status === 500;
});
await test('prompt clips oversized input', async () => buildPrompt({ message: { message: 'x'.repeat(20_000) } }).length < 7000);

// Contact form: keyword categorisation (replaces the topic dropdown)
const CLASSIFY: [string, string, string][] = [
  ['Internship opening', 'Hi, we have an ML internship. Interested?', 'Job Inquiry'],
  ['', 'We are hiring a junior AI engineer, can you share your resume?', 'Job Inquiry'],
  ['Role at Acme', 'Loved your portfolio! We have a full-time role for you.', 'Job Inquiry'],
  ['Hackathon team', 'Want to team up for the next hackathon?', 'Collaboration'],
  ['Partnership', 'Our startup would like to partner with you on an open source project.', 'Collaboration'],
  ['', 'How did you train the ResNet18 model in ForensiX? I get an error with the dataset loader.', 'Technical Question'],
  ['', 'Great portfolio, love the animations!', 'Feedback'],
  ['Hello', 'Just wanted to say hi from Chennai.', 'General'],
  ['', 'I sat on a chair', 'General'],
];
for (const [s, m, want] of CLASSIFY) {
  await test(`classify "${(s || m).slice(0, 32)}" -> ${want}`, async () => classifyMessage(s, m) === want);
}
await test('classifier only returns categories the rules allow', async () =>
  ['', 'x', 'job collab bug love', 'Ω ☃'].every((t) => (MESSAGE_CATEGORIES as readonly string[]).includes(classifyMessage(t, t))));

// Functions end to end with mocked upstreams (auth rejected before any upstream call)
const realFetch = globalThis.fetch;
let upstreamCalls = 0;
globalThis.fetch = (async () => { upstreamCalls++; return new Response(JSON.stringify({ success: true }), { status: 200 }); }) as typeof fetch;
process.env.FIREBASE_PROJECT_ID = PROJECT;
process.env.ADMIN_UIDS = 'admin-uid-1';
process.env.SEND_EMAIL_URL = 'https://script.example/send';
const send = (await import('../netlify/functions/send-reply.mts')).default;
await test('send-reply without token never calls upstream', async () => {
  const r = await send(new Request('http://x', { method: 'POST', body: JSON.stringify({ to: 'a@b.co', subject: 's', body: 'hello' }) }));
  return r.status === 401 && upstreamCalls === 0;
});
await test('send-reply rejects GET', async () => (await send(new Request('http://x'))).status === 405);

// sheets-sync neutralises formulas before forwarding (authorised call, upstream captured)
let forwarded = '';
globalThis.fetch = (async (_u: unknown, init?: RequestInit) => { forwarded = String(init?.body ?? ''); return new Response('{}', { status: 200 }); }) as typeof fetch;
process.env.SHEETS_SYNC_URL = 'https://script.example/sheets';
const sheets = (await import('../netlify/functions/sheets-sync.mts')).default;
(globalThis as Record<string, unknown>).__SK_DEV_EMULATOR__ = true; // decode-only path, still checks claim + allow-list
const unsigned = `e30.${Buffer.from(JSON.stringify({ sub: 'admin-uid-1', admin: true, auth_time: 1 })).toString('base64url')}.x`;
await test('sheets-sync escapes formula cells', async () => {
  const r = await sheets(new Request('http://x', { method: 'POST', headers: { authorization: `Bearer ${unsigned}` },
    body: JSON.stringify({ messages: [{ name: '=IMPORTXML("http://evil")', email: 'a@b.co', message: '+cmd', subject: '@SUM(1)', category: 'General' }] }) }));
  const row = JSON.parse(forwarded).data[0];
  return r.status === 200 && row.name.startsWith("'=") && row.message === "'+cmd" && row.subject === "'@SUM(1)" && row.email === 'a@b.co';
});

// ai-draft: model fallback chain (404 retired -> 503 busy -> success), bad key stops, all busy -> 503
process.env.GEMINI_API_KEY = 'test-key';
process.env.GEMINI_MODEL = 'gemini-2.5-flash';
const draft = (await import('../netlify/functions/ai-draft.mts')).default;
const draftReq = () => new Request('http://x', { method: 'POST', headers: { authorization: `Bearer ${unsigned}` }, body: JSON.stringify({ message: { name: 'A', email: 'a@b.co', message: 'Hello there, interested in a role.' } }) });
const mockGemini = (byModel: Record<string, number>, delayMs: Record<string, number> = {}) => {
  const seen: string[] = [];
  globalThis.fetch = (async (u: unknown, init?: RequestInit) => {
    const model = String(u).match(/models\/([^:]+):/)?.[1] ?? '';
    seen.push(model);
    if (delayMs[model]) {
      await new Promise<void>((res, rej) => {
        const t = setTimeout(res, delayMs[model]);
        init?.signal?.addEventListener('abort', () => { clearTimeout(t); rej(new Error('aborted')); });
      });
    }
    const status = byModel[model] ?? 200;
    return status === 200
      ? new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: `draft from ${model}` }] } }] }), { status })
      : new Response(JSON.stringify({ error: { message: 'x' } }), { status });
  }) as typeof fetch;
  return seen;
};
await test('ai-draft falls back past retired + busy models', async () => {
  const seen = mockGemini({ 'gemini-2.5-flash': 404, 'gemini-flash-latest': 503 });
  const r = await draft(draftReq()); const j = await r.json() as { model?: string };
  return r.status === 200 && j.model === 'gemini-flash-lite-latest' && seen.join(',') === 'gemini-2.5-flash,gemini-flash-latest,gemini-flash-lite-latest';
});
await test('ai-draft stops on an invalid key (400)', async () => {
  const seen = mockGemini({ 'gemini-2.5-flash': 400 });
  const r = await draft(draftReq());
  return r.status === 502 && seen.length === 1;
});
await test('ai-draft hedges: a slow overloaded model does not starve the fallback', async () => {
  // Real-world case: gemini-flash-latest took ~7 s to return 503
  const seen = mockGemini({ 'gemini-2.5-flash': 503, 'gemini-flash-latest': 503 }, { 'gemini-2.5-flash': 8000, 'gemini-flash-latest': 8000 });
  const t0 = Date.now();
  const r = await draft(draftReq()); const j = await r.json() as { model?: string };
  return r.status === 200 && j.model === 'gemini-flash-lite-latest' && seen.length === 3 && Date.now() - t0 < 4000;
});
await test('ai-draft reports busy when every model is overloaded', async () => {
  mockGemini({ 'gemini-2.5-flash': 503, 'gemini-flash-latest': 503, 'gemini-flash-lite-latest': 429 });
  const r = await draft(draftReq()); const j = await r.json() as { error?: string };
  return r.status === 503 && /busy/i.test(j.error ?? '');
});
(globalThis as Record<string, unknown>).__SK_DEV_EMULATOR__ = false;
globalThis.fetch = realFetch;

const failed = results.filter((r) => r[0] === 'FAIL');
for (const r of results) console.log(r.join('  '));
console.log(`\n${results.length - failed.length}/${results.length} function tests passed`);
process.exit(failed.length ? 1 : 0);
