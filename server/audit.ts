import type { Request } from 'express';
import type { Knex } from 'knex';
import { sqlTime } from './security';

export const clientIp = (req: Request) => req.ip || req.socket.remoteAddress || '';

export async function logActivity(
  db: Knex,
  req: Request | null,
  action: string,
  entity?: string,
  entityId?: string,
  detail?: unknown,
  userId?: string
) {
  try {
    await db('activity_log').insert({
      user_id: userId ?? req?.auth?.user.id ?? null,
      action,
      entity: entity ?? null,
      entity_id: entityId ?? null,
      ip: req ? clientIp(req).slice(0, 64) : null,
      detail: detail === undefined ? null : JSON.stringify(detail),
      at: sqlTime(),
    });
  } catch {
    /* logging must never break a request */
  }
}
