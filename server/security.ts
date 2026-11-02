import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { AppConfig } from './config';

const BCRYPT_COST = 12;
export const hashPassword = (plain: string) => bcrypt.hash(plain, BCRYPT_COST);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);
/** Compared against when the username does not exist, so timing does not reveal valid usernames. */
export const DUMMY_HASH = bcrypt.hashSync('not-a-real-password-for-timing', BCRYPT_COST);

export function passwordPolicyError(pw: string): string | null {
  if (pw.length < 8) return 'Password must be at least 8 characters.';
  if (pw.length > 128) return 'Password is too long.';
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw) || !/\d/.test(pw)) {
    return 'Password must include an uppercase letter, a lowercase letter and a number.';
  }
  return null;
}

export const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
export const newRefreshToken = () => crypto.randomBytes(48).toString('base64url');
export const newId = (prefix: string) => `${prefix}-${crypto.randomBytes(6).toString('hex')}`;

export interface AccessClaims {
  sub: string; // user id
  sid: string; // session id
  surface: 'web' | 'mobile';
}

export function signAccess(cfg: AppConfig, c: AccessClaims): string {
  return jwt.sign(c, cfg.JWT_ACCESS_SECRET, {
    algorithm: 'HS256',
    expiresIn: cfg.ACCESS_TOKEN_TTL_SEC,
    issuer: 'auditgrid',
  });
}

export function verifyAccess(cfg: AppConfig, token: string): AccessClaims | null {
  try {
    const p = jwt.verify(token, cfg.JWT_ACCESS_SECRET, { algorithms: ['HS256'], issuer: 'auditgrid' }) as any;
    if (!p?.sub || !p?.sid || (p.surface !== 'web' && p.surface !== 'mobile')) return null;
    return { sub: p.sub, sid: p.sid, surface: p.surface };
  } catch {
    return null;
  }
}

export const sqlTime = (d: Date = new Date()) => d.toISOString().slice(0, 19).replace('T', ' ');
export const parseSqlTime = (s: string) => new Date(s.replace(' ', 'T') + 'Z');
