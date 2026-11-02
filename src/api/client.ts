// Single gateway to the AuditGrid API.
// - Access token lives in memory only (never localStorage): a stolen disk/XSS dump has nothing to reuse.
// - The refresh token is an httpOnly, SameSite=Strict cookie the page cannot read.
// - A 401 triggers ONE shared refresh, then the request is retried once.
import type { AppUser, UserRole } from '../types/infrastructure';

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string, public issues?: unknown) {
    super(message);
  }
  get isNetwork() {
    return this.status === 0;
  }
}

export interface Session {
  user: AppUser;
  role: UserRole | null;
  surface: 'web' | 'mobile';
  isGlobal: boolean;
}

let accessToken: string | null = null;
let refreshing: Promise<Session | null> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let onSessionEnded: (() => void) | null = null;

export const setSessionEndedHandler = (fn: (() => void) | null) => {
  onSessionEnded = fn;
};

function scheduleRefresh(expiresInSec: number) {
  if (timer) clearTimeout(timer);
  const ms = Math.max(30, expiresInSec - 60) * 1000;
  timer = setTimeout(() => {
    void refreshSession();
  }, ms);
}

// Non-secret hint ("a session may exist") so a signed-out visitor does not trigger a pointless refresh call.
const HINT = 'ag.signedIn';
const setHint = (on: boolean) => {
  try {
    if (on) localStorage.setItem(HINT, '1');
    else localStorage.removeItem(HINT);
  } catch {
    /* storage blocked */
  }
};
const hasHint = () => {
  try {
    return localStorage.getItem(HINT) === '1';
  } catch {
    return true;
  }
};

function applySession(p: any): Session {
  setHint(true);
  accessToken = p.accessToken;
  scheduleRefresh(p.expiresIn);
  return { user: p.user, role: p.role, surface: p.surface, isGlobal: !!p.isGlobal };
}

async function send(path: string, init: RequestInit & { json?: unknown }) {
  const headers = new Headers(init.headers);
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  let body = init.body;
  if (init.json !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(init.json);
  }
  try {
    return await fetch(path, { ...init, headers, body, credentials: 'same-origin' });
  } catch {
    throw new ApiError('Cannot reach the server. Check your connection and try again.', 0);
  }
}

async function readError(res: Response): Promise<ApiError> {
  let j: any = null;
  try {
    j = await res.json();
  } catch {
    /* non-JSON error */
  }
  return new ApiError(j?.error || `Request failed (${res.status}).`, res.status, j?.code, j?.issues);
}

export async function refreshSession(): Promise<Session | null> {
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const res = await send('/api/auth/refresh', { method: 'POST' });
        if (!res.ok) {
          accessToken = null;
          setHint(false);
          return null;
        }
        return applySession(await res.json());
      } catch (e) {
        // Network trouble is not a logout: keep the current token and try again later.
        if (e instanceof ApiError && e.isNetwork) throw e;
        return null;
      } finally {
        setTimeout(() => (refreshing = null), 0);
      }
    })();
  }
  return refreshing;
}

export async function api<T = any>(
  path: string,
  opts: { method?: string; json?: unknown; form?: FormData } = {}
): Promise<T> {
  const init: RequestInit & { json?: unknown } = { method: opts.method || 'GET', json: opts.json, body: opts.form };
  let res = await send(path, init);
  if (res.status === 401 && !path.startsWith('/api/auth/')) {
    const s = await refreshSession().catch(() => null);
    if (s) res = await send(path, init);
    else {
      accessToken = null;
      setHint(false);
      onSessionEnded?.();
      throw new ApiError('Your session has ended. Please sign in again.', 401, 'unauthenticated');
    }
  }
  if (!res.ok) throw await readError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function login(username: string, password: string, surface: 'web' | 'mobile'): Promise<Session> {
  const res = await send('/api/auth/login', { method: 'POST', json: { username, password, surface } });
  if (!res.ok) throw await readError(res);
  return applySession(await res.json());
}

/** Called once on page load: if the refresh cookie is still valid the user stays signed in. */
export async function restoreSession(): Promise<Session | null> {
  if (!hasHint()) return null;
  try {
    return await refreshSession();
  } catch {
    return null;
  }
}

export async function logout(): Promise<void> {
  try {
    await send('/api/auth/logout', { method: 'POST' });
  } catch {
    /* offline: the cookie still expires server-side */
  }
  accessToken = null;
  setHint(false);
  if (timer) clearTimeout(timer);
  photoCache.forEach((u) => URL.revokeObjectURL(u));
  photoCache.clear();
}

// ---------- Photos (private, need the auth header) ----------
const photoCache = new Map<string, string>();

export function dataUrlToBlob(dataUrl: string): Blob {
  const [head, b64] = dataUrl.split(',');
  const mime = /data:([^;]+)/.exec(head)?.[1] || 'image/jpeg';
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

export async function uploadPhoto(blob: Blob): Promise<{ id: string; url: string }> {
  const form = new FormData();
  form.append('photo', blob, 'photo');
  return api('/api/photos', { method: 'POST', form });
}

export async function photoObjectUrl(url: string): Promise<string> {
  const hit = photoCache.get(url);
  if (hit) return hit;
  let res = await send(url, {});
  if (res.status === 401) {
    await refreshSession().catch(() => null);
    res = await send(url, {});
  }
  if (!res.ok) throw await readError(res);
  const obj = URL.createObjectURL(await res.blob());
  photoCache.set(url, obj);
  return obj;
}
