import { z } from 'zod';
import path from 'node:path';

const bool = (d: boolean) =>
  z
    .enum(['true', 'false', '1', '0'])
    .optional()
    .transform((v) => (v === undefined ? d : v === 'true' || v === '1'));

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(3001),
  HOST: z.string().default('0.0.0.0'),

  DB_CLIENT: z.enum(['mysql2', 'better-sqlite3']).default('better-sqlite3'),
  DB_HOST: z.string().default('127.0.0.1'),
  DB_PORT: z.coerce.number().int().default(3306),
  DB_USER: z.string().default('auditgrid'),
  DB_PASSWORD: z.string().default(''),
  DB_NAME: z.string().default('auditgrid'),
  SQLITE_FILE: z.string().default('./data/auditgrid.sqlite'),

  JWT_ACCESS_SECRET: z.string().optional(),
  ACCESS_TOKEN_TTL_SEC: z.coerce.number().int().default(15 * 60),
  REFRESH_TTL_WEB_HOURS: z.coerce.number().int().default(12),
  REFRESH_TTL_MOBILE_DAYS: z.coerce.number().int().default(30),

  /** Browser key for Google Maps JavaScript API. Public by design: restrict it by HTTP referrer in Google Cloud. */
  GOOGLE_MAPS_API_KEY: z.string().default(''),
  COOKIE_SECURE: bool(false),
  CORS_ORIGINS: z.string().default(''),
  TRUST_PROXY: z.coerce.number().int().default(0),
  DATA_DIR: z.string().default('./data'),
  MAX_UPLOAD_MB: z.coerce.number().default(6),

  SEED_DEMO: bool(false),
  BOOTSTRAP_ADMIN_USERNAME: z.string().optional(),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().optional(),
  BOOTSTRAP_ADMIN_NAME: z.string().default('System Administrator'),
  BOOTSTRAP_ADMIN_EMAIL: z.string().default(''),

  LOGIN_MAX_FAILURES: z.coerce.number().int().default(5),
  LOGIN_LOCK_MINUTES: z.coerce.number().int().default(15),
});

export type AppConfig = Omit<z.infer<typeof EnvSchema>, 'JWT_ACCESS_SECRET' | 'CORS_ORIGINS'> & {
  JWT_ACCESS_SECRET: string;
  corsOrigins: string[];
  isProd: boolean;
  uploadDir: string;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const e = EnvSchema.parse(env);
  const isProd = e.NODE_ENV === 'production';
  if (isProd) {
    if (!e.JWT_ACCESS_SECRET || e.JWT_ACCESS_SECRET.length < 32) {
      throw new Error('JWT_ACCESS_SECRET must be set (>= 32 chars) in production. Generate: openssl rand -base64 48');
    }
    if (!e.COOKIE_SECURE) {
      throw new Error('COOKIE_SECURE must be true in production (serve the app over HTTPS).');
    }
    if (e.DB_CLIENT === 'mysql2' && !e.DB_PASSWORD) {
      throw new Error('DB_PASSWORD must be set in production.');
    }
    if (e.SEED_DEMO) {
      throw new Error('SEED_DEMO must not be enabled in production (demo accounts have public passwords).');
    }
  }
  const secret = e.JWT_ACCESS_SECRET && e.JWT_ACCESS_SECRET.length >= 32
    ? e.JWT_ACCESS_SECRET
    : 'dev-only-insecure-secret-change-me-0123456789abcdef';
  return {
    ...e,
    JWT_ACCESS_SECRET: secret,
    corsOrigins: e.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
    isProd,
    uploadDir: path.resolve(e.DATA_DIR, 'uploads'),
  };
}
