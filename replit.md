# Clean V1 CRM

A focused CRM for managing owner-scoped leads, follow-ups, activity history, and converted customers.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/crm` — React + Vite frontend and the shared CRM shell/pages.
- `artifacts/api-server/src/routes/crm.ts` — authenticated CRM API routes and development seed.
- `lib/api-spec/openapi.yaml` — source of truth for the generated API client and Zod schemas.
- `lib/db/src/schema` — Drizzle tables for auth, leads, activities, and customers.
- `lib/replit-auth-web` — browser auth hook for the Replit OIDC session.

## Architecture decisions

- Replit Auth uses an HTTP-only session cookie and every CRM query is scoped by the authenticated user ID.
- Customers are a projection of Won leads and are synchronized when a lead changes stage.
- Follow-up dates use PostgreSQL calendar dates rather than timestamps to avoid timezone shifts.
- The frontend consumes generated OpenAPI hooks; auth state and redirects use the dedicated browser auth package.

## Product

Clean V1 CRM includes a responsive login flow, dashboard, searchable and filterable lead pipeline, lead detail/activity history, follow-up buckets, converted customer list, and account settings.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Run API codegen after changing `lib/api-spec/openapi.yaml`.
- Development sample leads are inserted for the first authenticated user only when that user has no leads.
- The database schema is pushed with `pnpm --filter @workspace/db run push`; production schema changes are handled by Publish.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
