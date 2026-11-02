import 'express-async-errors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import express, { type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import type { Knex } from 'knex';
import fs from 'node:fs';
import path from 'node:path';
import type { AppConfig } from './config';
import { collectionRoutes } from './collections';
import { authRoutes, requireAuth } from './routes/auth';
import { bootstrapRoutes } from './routes/bootstrap';
import { formRoutes } from './routes/forms';
import { photoRoutes } from './routes/photos';
import { reportRoutes } from './routes/reports';
import { planRoutes } from './routes/plans';
import { submissionRoutes } from './routes/submissions';
import { analyticsRoutes } from './routes/analytics';
import { trackingRoutes } from './routes/tracking';
import { userRoutes } from './routes/users';

export function createApp(db: Knex, cfg: AppConfig) {
  const app = express();
  app.disable('x-powered-by');
  if (cfg.TRUST_PROXY > 0) app.set('trust proxy', cfg.TRUST_PROXY);
  app.set('cfg', cfg);

  app.use(
    helmet({
      frameguard: false,
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'default-src': ["'self'"],
          // MapLibre + OpenFreeMap works without any API key; Google Maps is allowed as an optional upgrade when a key is configured.
          'script-src': [
            "'self'",
            'blob:',
            ...(cfg.isProd ? [] : ["'unsafe-inline'", "'unsafe-eval'"]),
            ...(cfg.GOOGLE_MAPS_API_KEY ? ['https://maps.googleapis.com', 'https://maps.gstatic.com'] : []),
          ],
          'worker-src': ["'self'", 'blob:'],
          'child-src': ["'self'", 'blob:'],
          'img-src': [
            "'self'",
            'data:',
            'blob:',
            'https:',
            ...(cfg.GOOGLE_MAPS_API_KEY ? ['https://maps.gstatic.com', 'https://maps.googleapis.com', 'https://*.ggpht.com', 'https://*.googleusercontent.com'] : []),
          ],
          'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          'font-src': ["'self'", 'https://fonts.gstatic.com', 'https://tiles.openfreemap.org', 'https://*.openfreemap.org', 'data:'],
          'connect-src': [
            "'self'",
            'blob:',
            'ws:',
            'wss:',
            'https://tiles.openfreemap.org',
            'https://*.openfreemap.org',
            'https://router.project-osrm.org',
            'https://api.openrouteservice.org',
            'https://tile.openstreetmap.org',
            'https://*.tile.openstreetmap.org',
            'https://*.basemaps.cartocdn.com',
            ...(cfg.GOOGLE_MAPS_API_KEY ? ['https://maps.googleapis.com', 'https://*.googleapis.com', 'https://*.gstatic.com'] : []),
          ],
          'frame-ancestors': null,
          'upgrade-insecure-requests': cfg.isProd ? [] : null,
        },
      },
      hsts: cfg.isProd ? { maxAge: 31_536_000, includeSubDomains: true } : false,
      referrerPolicy: { policy: 'same-origin' },
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: false,
      crossOriginOpenerPolicy: false,
    })
  );
  app.use((_req, res, next) => {
    res.setHeader('Permissions-Policy', 'geolocation=(self), camera=(self), microphone=()');
    next();
  });
  app.use(compression());
  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));

  // CORS only for explicitly configured origins (the SPA is normally same-origin, so none are needed).
  app.use('/api', (req, res, next) => {
    const origin = req.get('origin');
    if (origin && cfg.corsOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      res.setHeader('Vary', 'Origin');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  // CSRF defence in depth: a state-changing request carrying a foreign Origin is refused.
  app.use('/api', (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.get('origin');
    if (!origin) return next();
    let host = '';
    try { host = new URL(origin).host; } catch { /* invalid origin */ }
    const allowedHosts = [req.get('host'), req.get('x-forwarded-host')].filter(Boolean);
    if (host && allowedHosts.includes(host)) return next();
    if (cfg.corsOrigins.includes(origin)) return next();
    res.status(403).json({ error: 'Cross-site request blocked.' });
  });

  if (cfg.NODE_ENV !== 'test') {
    app.use('/api', rateLimit({ windowMs: 60_000, limit: 600, standardHeaders: 'draft-7', legacyHeaders: false }));
    app.use('/api/auth/login', rateLimit({ windowMs: 15 * 60_000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many sign-in attempts. Try again later.' } }));
    app.use('/api/photos', rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false }));
  }

  app.get('/api/health', async (_req, res) => {
    try { await db.raw('select 1'); res.json({ ok: true }); } catch { res.status(503).json({ ok: false }); }
  });

  app.use('/api/auth', authRoutes(db, cfg));
  const guarded = express.Router();
  guarded.use(requireAuth(db, cfg));
  guarded.use(bootstrapRoutes(db));
  guarded.use(collectionRoutes(db));
  guarded.use(userRoutes(db));
  guarded.use(formRoutes(db));
  guarded.use(reportRoutes(db));
  guarded.use(submissionRoutes(db));
  guarded.use(planRoutes(db));
  guarded.use(analyticsRoutes(db));
  guarded.use(trackingRoutes(db));
  guarded.use(photoRoutes(db, cfg));
  app.use('/api', guarded);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));

  // Serve the built SPA in production (in development, Vite middleware serves the frontend).
  const dist = path.resolve(process.cwd(), 'dist');
  if (cfg.isProd && fs.existsSync(path.join(dist, 'index.html'))) {
    app.use(express.static(dist, { index: false, maxAge: '1h', setHeaders: (res, p) => {
      if (/\/assets\//.test(p)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      if (/(sw\.js|manifest\.webmanifest)$/.test(p)) res.setHeader('Cache-Control', 'no-cache');
    } }));
    app.get(/^(?!\/api\/).*/, (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(dist, 'index.html'));
    });
  }

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON.' });
    if (err?.type === 'entity.too.large' || err?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Upload too large.' });
    if (cfg.NODE_ENV !== 'test') console.error(err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  });
  return app;
}
