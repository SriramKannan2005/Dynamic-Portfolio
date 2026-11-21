import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import type { IncomingMessage } from 'node:http';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Demo videos stay in public/assets/videos (kept in the repo) but are not shipped:
 * the site no longer shows them and they made deploys heavy.
 */
function dropVideosFromBuild(): Plugin {
  let outDir = 'dist';
  return {
    name: 'drop-videos-from-build',
    apply: 'build',
    configResolved(c) { outDir = c.build.outDir; },
    closeBundle() { rmSync(resolve(outDir, 'assets/videos'), { recursive: true, force: true }); },
  };
}

/**
 * Dev-only: serve netlify/functions/<name>.mts at /.netlify/functions/<name>
 * so the admin panel works under `npm run dev` without the Netlify CLI.
 * Server-side env vars (GEMINI_API_KEY, SEND_EMAIL_URL, ...) are loaded into
 * this Node process only; they are never exposed to the client bundle.
 */
function netlifyFunctionsDev(env: Record<string, string>): Plugin {
  const readBody = (req: IncomingMessage) => new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
  return {
    name: 'netlify-functions-dev',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      for (const [k, v] of Object.entries(env)) if (!k.startsWith('VITE_') && process.env[k] === undefined) process.env[k] = v;
      server.middlewares.use(async (req, res, next) => {
        const m = req.url?.match(/^\/\.netlify\/functions\/([a-z0-9-]+)(?:[/?].*)?$/);
        if (!m) return next();
        try {
          // Accept unsigned Auth-emulator tokens only inside this local dev process.
          (globalThis as Record<string, unknown>).__SK_DEV_EMULATOR__ = env.VITE_USE_EMULATORS === 'true';
          const mod = await server.ssrLoadModule(`/netlify/functions/${m[1]}.mts`);
          const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await readBody(req);
          const headers = new Headers();
          for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
          const response: Response = await mod.default(new Request(`http://localhost${req.url}`, { method: req.method, headers, body }));
          res.statusCode = response.status;
          response.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (err) {
          res.statusCode = 500;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), netlifyFunctionsDev(env), dropVideosFromBuild()],
    build: {
      target: 'es2020',
      sourcemap: false,
      chunkSizeWarningLimit: 900,
    },
  };
});
