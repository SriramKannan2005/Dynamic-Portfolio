/**
 * POST /.netlify/functions/send-reply
 * Body: { to, subject, body }
 * Forwards to the existing Google Apps Script email endpoint (SEND_EMAIL_URL),
 * which expects { to, subject, body, senderName } and replies { success, error? }.
 */
import { requireAdmin, json, readJson, isEmail, clip } from '../lib/shared.ts';

interface Body { to?: string; subject?: string; body?: string }

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' }, { allow: 'POST' });
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;

  const url = process.env.SEND_EMAIL_URL;
  if (!url) return json(503, { error: 'Email sending is not configured (SEND_EMAIL_URL).' });
  const b = await readJson<Body>(req);
  if (!b || !isEmail(b.to)) return json(400, { error: 'A valid recipient is required.' });
  const subject = clip(b.subject, 200).replace(/[\r\n]+/g, ' ').trim();
  const text = clip(b.body, 10_000).trim();
  if (!subject || text.length < 2) return json(400, { error: 'Subject and body are required.' });

  try {
    // Apps Script answers POST with a 302 to script.googleusercontent.com; fetch follows it.
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ to: b.to, subject, body: text, senderName: 'Sriram Kannan' }),
      redirect: 'follow',
      signal: AbortSignal.timeout(25_000),
    });
    const raw = await res.text();
    let result: { success?: boolean; error?: string } = {};
    try { result = JSON.parse(raw); } catch { /* non-JSON */ }
    if (!res.ok || result.success !== true) return json(502, { error: result.error || `Email service error (${res.status}).` });
    return json(200, { success: true, sentAt: new Date().toISOString() });
  } catch {
    return json(504, { error: 'Email service did not respond in time.' });
  }
};
