# B2B Inventory Platform

Multi-tenant white-label B2B supply chain and inventory platform (India, GST, INR).

| Folder | What |
|---|---|
| [doc/](doc/) | PRD, architecture, rules, tasks, decisions |
| [backend/](backend/) | NestJS + Mongoose + MongoDB API, http://localhost:4000 (Swagger `/api/docs`) |
| [frontend/](frontend/) | Next.js web app, http://localhost:3000 |
| [word-doc/](word-doc/) | Original specifications |

## Run locally

Needs Node.js 22+, npm and a MongoDB **replica set** (free MongoDB Atlas cluster, or a local single-node replica set) because checkout and payments use transactions. Details: [doc/TechStack.md §5](doc/TechStack.md#5-run-locally).

```bash
# 1. Database: create a free Atlas M0 cluster (Mumbai), a user b2b_app, allow your IP,
#    and copy the connection string.

# 2. Backend
cd backend
npm install
cp .env.example .env            # set MONGODB_URI and TEST_MONGODB_URI
npm run start:dev               # http://localhost:4000/api/v1/healthz

# 3. Frontend (second terminal)
cd frontend
npm install
cp .env.example .env.local
npm run dev                     # http://localhost:3000
```

Tests: `cd backend && npm test`. Work plan: [doc/Tasks.md](doc/Tasks.md).
