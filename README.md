# AuditGrid
Distributor stock audit + retail shop audit platform (web portal for managers, mobile browser app for field auditors).

```bash
npm ci
SEED_DEMO=true npm run server:dev   # API :3001 (SQLite, demo data)
npm run dev                         # app :3000
npm test                            # API tests
```
Production deployment (Docker, MySQL 8, HTTPS): see [DEPLOY.md](DEPLOY.md). Developer notes: [CLAUDE.md](CLAUDE.md).
