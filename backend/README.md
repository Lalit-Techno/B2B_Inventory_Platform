# Backend

NestJS 11 REST API + Mongoose + **MongoDB** (Atlas free tier or a local replica set — no Docker). Runs on http://localhost:4000, Swagger at `/api/docs`, health at `/api/v1/healthz`.

**One-time database setup:** see [../doc/TechStack.md §5.1](../doc/TechStack.md#51-mongodb-setup-one-time-no-docker).

```bash
npm install
cp .env.example .env          # set MONGODB_URI and TEST_MONGODB_URI
npm run start:dev
npm test                      # unit tests (no database needed)
npm run db:reset              # drops the dev database
```

- Structure: [../doc/Architecture.md](../doc/Architecture.md#3-folder-structure)
- Stack: [../doc/TechStack.md](../doc/TechStack.md)
- Rules: [../doc/Rules.md](../doc/Rules.md)
- Work list: `P0-*` in [../doc/Tasks.md](../doc/Tasks.md)
