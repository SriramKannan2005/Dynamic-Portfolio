/**
 * POST /.netlify/functions/ai-draft
 * Body: { message: {name, email, subject?, message, category?}, previousReplies?: string[], tone?: string }
 * Returns: { draft }
 * Calls the Gemini API server-side with GEMINI_API_KEY (never sent to the browser).
 */
import { requireAdmin, json, readJson, clip } from '../lib/shared.ts';

interface Body {
  message?: { name?: string; email?: string; subject?: string; message?: string; category?: string };
  previousReplies?: string[];
  tone?: string;
}

export const FALLBACK_MODELS = ['gemini-flash-latest', 'gemini-flash-lite-latest'];
const TIME_BUDGET_MS = 9_000;
const STAGGER_MS = 1_500;

export function buildPrompt(b: Body): string {
  const m = b.message ?? {};
  const prev = (b.previousReplies ?? []).slice(0, 5).map((r, i) => `Reply ${i + 1}:\n${clip(r, 2000)}`).join('\n\n');
  return [
    'You are drafting an email reply on behalf of Sriram Kannan, a final-year B.Tech AI & Data Science student and AI/ML developer.',
    'Write a concise, warm, professional reply (80-160 words). Plain text only, no markdown, no subject line.',
    'Do not invent facts, commitments, dates, links or phone numbers. Sign off as "Sriram Kannan".',
    `Tone: ${clip(b.tone, 40) || 'friendly and professional'}.`,
    '',
    `Sender: ${clip(m.name, 100)} <${clip(m.email, 254)}>`,
    `Category: ${clip(m.category, 40) || 'General'}`,
    m.subject ? `Subject: ${clip(m.subject, 150)}` : '',
    'Their message:',
    clip(m.message, 5000),
    prev ? `\nPrevious replies already sent in this thread (do not repeat them):\n${prev}` : '',
  ].filter(Boolean).join('\n');
}

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' }, { allow: 'POST' });
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;

  const key = process.env.GEMINI_API_KEY;
  if (!key) return json(503, { error: 'AI drafting is not configured (GEMINI_API_KEY).' });
  const body = await readJson<Body>(req);
  if (!body?.message?.message) return json(400, { error: 'Missing message text.' });

  // Models retire (404 "no longer available") and get overloaded (503/429), so try a
  // short chain: the configured model, then Google's rolling "latest" aliases.
  const clean = (m: string) => m.replace(/[^a-z0-9.-]/gi, '');
  const models = [...new Set([clean(process.env.GEMINI_MODEL || ''), ...FALLBACK_MODELS].filter(Boolean))];
  const base = process.env.GEMINI_API_BASE || 'https://generativelanguage.googleapis.com';
  const prompt = buildPrompt(body);
  const tried: string[] = [];
  // One controller for every attempt: aborted when a draft wins or the budget runs out,
  // so no request outlives the Function (Netlify's limit is 10 s).
  const ctrl = new AbortController();

  const attempt = async (model: string): Promise<{ draft?: string; status: string }> => {
    try {
      const res = await fetch(`${base}/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.6, maxOutputTokens: 600 },
        }),
        signal: ctrl.signal,
      });
      if (!res.ok) return { status: String(res.status) };
      const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const draft = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('').trim();
      return draft ? { draft, status: '200' } : { status: 'empty' };
    } catch {
      return { status: 'timeout' };
    }
  };

  // Hedged requests: start the preferred model; if it hasn't answered within STAGGER_MS
  // (an overloaded model can take 7 s just to say 503), also start the next one.
  // A failure starts the next model immediately. First draft wins.
  return new Promise<Response>((resolve) => {
    let next = 0;
    let pending = 0;
    let done = false;
    let stagger: ReturnType<typeof setTimeout> | undefined;
    const budget = setTimeout(() => ctrl.abort(), TIME_BUDGET_MS);
    const finish = (r: Response) => {
      if (done) return;
      done = true;
      clearTimeout(budget);
      clearTimeout(stagger);
      ctrl.abort();
      resolve(r);
    };
    const launch = () => {
      clearTimeout(stagger);
      if (done) return;
      if (next >= models.length) {
        if (pending === 0) {
          const busy = tried.some((t) => /: (429|5\d\d|timeout)$/.test(t));
          finish(json(busy ? 503 : 502, {
            error: busy ? 'Gemini is busy right now. Wait a moment and try again, or write the reply yourself.' : 'No available Gemini model answered.',
            tried,
          }));
        }
        return;
      }
      const model = models[next++];
      pending++;
      stagger = setTimeout(launch, STAGGER_MS);
      attempt(model).then((r) => {
        pending--;
        if (r.draft) return finish(json(200, { draft: r.draft, model }));
        tried.push(`${model}: ${r.status}`);
        if (r.status === '400' || r.status === '401' || r.status === '403') {
          // Key problems won't be fixed by another model
          return finish(json(502, { error: r.status === '400' ? 'Gemini rejected the request: check that GEMINI_API_KEY is valid.' : `Gemini refused the API key (${r.status}).` }));
        }
        launch(); // 404 retired, 429 rate limit, 5xx overload, timeout: move on now
      });
    };
    launch();
  });
};
