# B2B Inventory Platform — Claude instructions

Multi-tenant white-label B2B supply chain & inventory platform (India, GST, INR).

## Read first
- `doc/Prd.md` (what), `doc/Architecture.md` (how), `doc/Rules.md` (MUST rules), `doc/Tasks.md` (work list, phases), `doc/Memory.md` (decisions/gotchas), `doc/TechStack.md`, `doc/Design.md`.
- Original specs in `word-doc/` win over the docs if they conflict (RBAC v2.1 for permissions, Tech Spec v2.0 for business rules).

## Ponytail (coding work)
Ponytail is installed in `.claude/skills/` and is active for coding tasks (default level `full`). Use `/ponytail lite|full|ultra`, `/ponytail-review`, `/ponytail-audit`, `/ponytail-debt`.

Precedence when Ponytail's "write less" meets this project:
1. The Tasks.md task being worked on is the request; build exactly that, no extras.
2. Everything in `doc/Rules.md` is never trimmed: `TenantDb` scoping, `@Authorize` on every route, decimal.js/Decimal128 money with `PricingService`/`GstCalculator`, idempotency keys, guarded atomic updates inside a Mongo transaction at checkout/payments, insert-only records, audit logs, `StorageService`/`MailService`, DTO validation, role-specific response mappers.
3. Abstractions named in Architecture.md are part of the structure, not over-engineering.
4. The Upgrade Track (TechStack.md §6: Docker, Redis/queues, DB hardening, native apps, etc.) stays deferred unless a task says otherwise.
5. When a shortcut is taken, say so in the reply and note it in `doc/Memory.md` if it is a lasting decision.

## UI/UX (frontend work)
The `ui-ux-pro-max` skill (in `.claude/skills/`) is for frontend design decisions: layout, spacing, typography, accessibility, charts, responsive behaviour. Its search scripts need Python 3 (`python .claude/skills/ui-ux-pro-max/scripts/search.py "<query>" --domain ux`).

It advises; `doc/Design.md` decides. Where they differ, keep:
- shadcn/ui + Tailwind 4 components, lucide icons, TanStack Table and Recharts.
- Tenant branding only through CSS variables (`brandVars()` in `frontend/src/lib/theme.ts`); the skill's palette suggestions are for the neutral platform/admin UI, never a replacement for a tenant's colours.
- Mobile-first buyer pages (360 px), loading / empty / error / forbidden states on every page, `formatINR()` and IST dates.
- Do not generate a full design system or `design-system/` folder unless asked; do not add the skill's brand/logo/slides tools (not installed).

## Conventions
- Backend code only in `backend/`, frontend only in `frontend/`.
- Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`).
- Never commit `.env`, `storage/`, or database dumps.
