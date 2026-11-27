# Frontend

One Next.js 15 app with three areas: `/admin` (Super Admin), `/portal` (Wholesaler staff), `/shop/[orgSlug]` (Buyer storefront, mobile-first). Runs on http://localhost:3000.

```bash
npm install
cp .env.example .env.local   # BACKEND_URL (proxy target)
npm run dev
```

- UI/UX: [../doc/Design.md](../doc/Design.md)
- Stack: [../doc/TechStack.md](../doc/TechStack.md#3-frontend-frontend)
- Start with `P0-FE-*` in [../doc/Tasks.md](../doc/Tasks.md)
