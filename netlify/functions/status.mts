/**
 * GET /.netlify/functions/status
 * Admin-only health check for Settings -> System status. Reports whether each
 * server-side setting is present (booleans only: never the values themselves).
 */
import { requireAdmin, json } from '../lib/shared.ts';

// Neutral keys in the response so the client bundle never names server env vars.
export const STATUS_KEYS = { ai: 'GEMINI_API_KEY', email: 'SEND_EMAIL_URL', sheets: 'SHEETS_SYNC_URL', sheetsView: 'SHEETS_VIEW_URL' } as const;

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'GET') return json(405, { error: 'Method not allowed' }, { allow: 'GET' });
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;
  const has = (k: string) => !!(process.env[k] ?? '').trim();
  return json(200, {
    configured: Object.fromEntries(Object.entries(STATUS_KEYS).map(([k, env]) => [k, has(env)])),
    geminiModel: (process.env.GEMINI_MODEL || '').replace(/[^a-z0-9.-]/gi, '') || null,
    adminUidCount: (process.env.ADMIN_UIDS ?? '').split(',').map((s) => s.trim()).filter(Boolean).length,
    runtime: typeof process !== 'undefined' ? process.version : 'unknown',
    checkedAt: new Date().toISOString(),
  });
};
