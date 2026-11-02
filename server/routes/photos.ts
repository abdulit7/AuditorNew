import { Router } from 'express';
import type { Knex } from 'knex';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import type { AppConfig } from '../config';
import { can } from '../access';
import { logActivity } from '../audit';
import { newId, sqlTime } from '../security';

/** Detect the real image type from its bytes — never trust the client's Content-Type or filename. */
function sniff(buf: Buffer): { mime: string; ext: string } | null {
  if (buf.length > 12 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: 'png' };
  if (buf.length > 12 && buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  return null;
}

export function photoRoutes(db: Knex, cfg: AppConfig) {
  const r = Router();
  fs.mkdirSync(cfg.uploadDir, { recursive: true });
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: cfg.MAX_UPLOAD_MB * 1024 * 1024, files: 1 } });

  r.post('/photos', upload.single('photo'), async (req, res) => {
    const a = req.auth!;
    if (!can(a, 'mobile.audit.distributor', 'mobile.audit.retailer')) return res.status(403).json({ error: 'You are not allowed to upload photos.' });
    if (!req.file) return res.status(400).json({ error: 'No photo received.' });
    const kind = sniff(req.file.buffer);
    if (!kind) return res.status(400).json({ error: 'Only JPEG, PNG or WebP photos are accepted.' });
    const id = newId('pho');
    const rel = `${id}.${kind.ext}`; // server-generated name: no path traversal possible
    await fs.promises.writeFile(path.join(cfg.uploadDir, rel), req.file.buffer, { mode: 0o600 });
    await db('photos').insert({ id, owner_id: a.user.id, mime: kind.mime, size: req.file.size, rel_path: rel, created_at: sqlTime() });
    await logActivity(db, req, 'photo.upload', 'photos', id);
    res.status(201).json({ id, url: `/api/photos/${id}` });
  });

  // Private: only the uploader or a manager may view. Requires the Authorization header, so <img src> needs a fetch->blob on the client.
  r.get('/photos/:id', async (req, res) => {
    const a = req.auth!;
    const row = await db('photos').where({ id: req.params.id }).first();
    if (!row) return res.status(404).json({ error: 'Not found.' });
    const manager = can(a, 'web.geography.manage', 'web.users.manage', 'web.shops.manage', 'web.products.manage');
    if (row.owner_id !== a.user.id && !manager) return res.status(403).json({ error: 'Not allowed.' });
    res.setHeader('Content-Type', row.mime);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(path.join(cfg.uploadDir, row.rel_path));
  });

  return r;
}
