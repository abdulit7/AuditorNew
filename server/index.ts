import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { createApp } from './app';
import { loadConfig } from './config';
import { createDb } from './db';
import { migrate } from './schema';
import { seedIfEmpty } from './seed';

function resolvePort(isDev: boolean): string {
  const portArgIdx = process.argv.indexOf('--port');
  if (portArgIdx !== -1 && process.argv[portArgIdx + 1]) {
    return process.argv[portArgIdx + 1];
  }
  const eqArg = process.argv.find((a) => a.startsWith('--port='));
  if (eqArg) return eqArg.split('=')[1];
  if (process.env.DEFAULT_APP_PORT) return process.env.DEFAULT_APP_PORT;
  if (isDev) return '3000';
  return process.env.PORT || '3000';
}

export async function startServer() {
  const isDev = (process.env.NODE_ENV || 'development') === 'development';
  const envInput: NodeJS.ProcessEnv = {
    ...process.env,
    PORT: resolvePort(isDev),
    SEED_DEMO: isDev ? 'true' : process.env.SEED_DEMO,
    COOKIE_SECURE: isDev ? 'false' : process.env.COOKIE_SECURE,
  };

  let cfg = loadConfig({ ...envInput, DB_CLIENT: isDev ? 'better-sqlite3' : envInput.DB_CLIENT });
  let db = createDb(cfg);

  const express = (await import('express')).default;
  const rootApp = express();

  let readyApp: any = null;
  const initPromise = (async () => {
    if (cfg.DB_CLIENT === 'mysql2') {
      try {
        await db.raw('SELECT 1');
      } catch (err: any) {
        if (cfg.isProd) {
          // Never fall back to a throwaway SQLite file in production: data would silently split from the real database.
          console.error(`[db] MySQL unavailable (${err?.code || err?.message}). Refusing to start in production.`);
          process.exit(1);
        }
        console.warn(`[db] MySQL unavailable (${err?.code || err?.message}); development fallback to SQLite (${cfg.SQLITE_FILE}).`);
        await db.destroy().catch(() => {});
        cfg = loadConfig({ ...envInput, DB_CLIENT: 'better-sqlite3' });
        db = createDb(cfg);
      }
    }

    await migrate(db);
    await seedIfEmpty(db, cfg, (m) => console.log(`[seed] ${m}`));
    const innerApp = createApp(db, cfg);

    if (!cfg.isProd) {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      innerApp.use(vite.middlewares);
    }
    readyApp = innerApp;
  })();

  rootApp.use(async (req, res, next) => {
    try {
      if (!readyApp) await initPromise;
      return readyApp(req, res, next);
    } catch (err) {
      next(err);
    }
  });

  const server = rootApp.listen(cfg.PORT, cfg.HOST);
  server.on('listening', () => {
    // Printed after the database is chosen, so the banner shows the real engine.
    void initPromise.then(() => console.log(`AuditGrid listening on http://${cfg.HOST}:${cfg.PORT} (${cfg.NODE_ENV}, ${cfg.DB_CLIENT})`));
  });
  const stop = () => server.close(() => db.destroy().then(() => process.exit(0)));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  await initPromise;
  return server;
}

// pathToFileURL makes the entry-file check work on Windows too (file:///C:/...).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
