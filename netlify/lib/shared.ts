/**
 * Shared helpers for admin-only Netlify Functions.
 * Every function calls requireAdmin() first: it verifies the Firebase ID token
 * (RS256, Google securetoken JWKS, issuer/audience = project), then requires
 * BOTH the custom claim admin == true AND the uid in the ADMIN_UIDS allow-list.
 */
import { createRemoteJWKSet, jwtVerify, decodeJwt, type JWTVerifyGetKey } from 'jose';

const GOOGLE_JWKS = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
let remoteJwks: JWTVerifyGetKey | null = null;

export function json(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra },
  });
}

export type AdminCheck = { ok: true; uid: string } | { ok: false; response: Response };

export interface VerifyOptions {
  projectId?: string;
  allowList?: string[];
  /** Injected in tests; production always uses Google's JWKS. */
  jwks?: JWTVerifyGetKey;
}

export async function requireAdmin(req: Request, opts: VerifyOptions = {}): Promise<AdminCheck> {
  const projectId = opts.projectId ?? process.env.FIREBASE_PROJECT_ID ?? '';
  const allowList = opts.allowList ?? (process.env.ADMIN_UIDS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!projectId || allowList.length === 0) {
    return { ok: false, response: json(500, { error: 'Server is not configured (FIREBASE_PROJECT_ID / ADMIN_UIDS).' }) };
  }
  const match = /^Bearer\s+([A-Za-z0-9._-]+)$/.exec(req.headers.get('authorization') ?? '');
  if (!match) return { ok: false, response: json(401, { error: 'Missing bearer token.' }) };
  const token = match[1];

  let payload: Record<string, unknown>;
  try {
    if ((globalThis as Record<string, unknown>).__SK_DEV_EMULATOR__ === true) {
      // Local `vite --mode emulator` only: Auth-emulator tokens are unsigned.
      payload = decodeJwt(token) as Record<string, unknown>;
    } else {
      remoteJwks ??= createRemoteJWKSet(new URL(GOOGLE_JWKS));
      const verified = await jwtVerify(token, opts.jwks ?? remoteJwks, {
        issuer: `https://securetoken.google.com/${projectId}`,
        audience: projectId,
        algorithms: ['RS256'],
      });
      payload = verified.payload as Record<string, unknown>;
    }
  } catch {
    return { ok: false, response: json(401, { error: 'Invalid or expired token.' }) };
  }

  const uid = typeof payload.sub === 'string' ? payload.sub : '';
  const authTime = typeof payload.auth_time === 'number' ? payload.auth_time : 0;
  if (!uid || authTime * 1000 > Date.now() + 60_000) return { ok: false, response: json(401, { error: 'Invalid token subject.' }) };
  if (payload.admin !== true || !allowList.includes(uid)) return { ok: false, response: json(403, { error: 'Not an admin.' }) };
  return { ok: true, uid };
}

export async function readJson<T>(req: Request, maxBytes = 200_000): Promise<T | null> {
  const text = await req.text();
  if (!text || text.length > maxBytes) return null;
  try { return JSON.parse(text) as T; } catch { return null; }
}

export const isEmail = (v: unknown): v is string => typeof v === 'string' && v.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(v);
export const clip = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '');

/** Spreadsheet formula-injection guard: prefix cells that a sheet would evaluate. */
export const sheetSafe = (v: string): string => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v);
