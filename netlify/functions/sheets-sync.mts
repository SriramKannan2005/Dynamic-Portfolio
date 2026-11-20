/**
 * GET  /.netlify/functions/sheets-sync  -> { configured, viewUrl }
 * POST /.netlify/functions/sheets-sync  body { messages: [...] } -> { success, count, syncedAt }
 * Forwards rows to the Google Apps Script sheet endpoint (SHEETS_SYNC_URL),
 * which expects { data: [{ name, email, message, category, date, read }] }.
 */
import { requireAdmin, json, readJson, clip, sheetSafe } from '../lib/shared.ts';

interface Row { name?: string; email?: string; subject?: string; message?: string; category?: string; date?: string; read?: boolean | string; replied?: boolean }

export default async (req: Request): Promise<Response> => {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;
  const url = process.env.SHEETS_SYNC_URL;

  if (req.method === 'GET') {
    return json(200, { configured: !!url, viewUrl: process.env.SHEETS_VIEW_URL || null });
  }
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' }, { allow: 'GET, POST' });
  if (!url) return json(503, { error: 'Sheets sync is not configured (SHEETS_SYNC_URL).' });

  const b = await readJson<{ messages?: Row[] }>(req, 3_000_000);
  if (!b || !Array.isArray(b.messages)) return json(400, { error: 'messages[] is required.' });
  // Visitor-written text: neutralise formulas before it reaches the sheet.
  const data = b.messages.slice(0, 5000).map((m) => ({
    name: sheetSafe(clip(m.name, 100)),
    email: sheetSafe(clip(m.email, 254)),
    subject: sheetSafe(clip(m.subject, 150)),
    message: sheetSafe(clip(m.message, 5000)),
    category: sheetSafe(clip(m.category, 40) || 'General'),
    date: sheetSafe(clip(m.date, 40)),
    read: m.read === true || m.read === 'Yes' ? 'Yes' : 'No',
    replied: m.replied ? 'Yes' : 'No',
  }));

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ data }),
      redirect: 'follow',
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) return json(502, { error: `Sheets endpoint error (${res.status}).` });
    return json(200, { success: true, count: data.length, syncedAt: new Date().toISOString() });
  } catch {
    return json(504, { error: 'Sheets endpoint did not respond in time.' });
  }
};
