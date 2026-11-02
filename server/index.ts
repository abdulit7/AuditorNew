import 'dotenv/config';
import { createApp } from './app';
import { loadConfig } from './config';
import { createDb } from './db';
import { migrate } from './schema';
import { seedIfEmpty } from './seed';

async function main() {
  const cfg = loadConfig();
  const db = createDb(cfg);
  await migrate(db);
  await seedIfEmpty(db, cfg, (m) => console.log(`[seed] ${m}`));
  const app = createApp(db, cfg);
  const server = app.listen(cfg.PORT, cfg.HOST, () => console.log(`AuditGrid API listening on ${cfg.HOST}:${cfg.PORT} (${cfg.NODE_ENV}, ${cfg.DB_CLIENT})`));
  const stop = () => server.close(() => db.destroy().then(() => process.exit(0)));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
main().catch((e) => { console.error(e); process.exit(1); });
