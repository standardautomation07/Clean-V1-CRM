# Clean V1 CRM

A focused CRM for managing owner-scoped leads, follow-ups, activity history, and converted customers.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run test` — API tests: product knowledge, AI extraction validation, quotation maths/numbering/PDF (no network). With `DATABASE_URL` set, also runs the end-to-end workflow integration test (lead → quotation → PDF → follow-up, owner scoping).
- `pnpm --filter @workspace/crm run test` — frontend unit tests (follow-up date parser, review-state helpers)
- Required env: `DATABASE_URL` — Postgres connection string
- Local (non-Replit) development only: `LOCAL_DEV_AUTH=true` on the API server replaces the Replit OIDC `/api/login` with a fixed local user (ignored when `NODE_ENV=production`); `API_PROXY_TARGET=http://127.0.0.1:8080` on the Vite dev server forwards `/api` to the API. Neither is set on Replit.
- Required env for New Enquiry AI extraction: `ANTHROPIC_API_KEY` (server-side only). Optional: `ANTHROPIC_MODEL` (defaults to `claude-opus-5`). Without the key, `/api/enquiries/extract` returns 503 and the rest of the CRM works normally.
- Optional env for quotation PDFs (printed as clearly marked placeholders when unset — never invented): `ROLLVENTO_COMPANY_ADDRESS`, `ROLLVENTO_GSTIN`, `ROLLVENTO_PHONE`, `ROLLVENTO_EMAIL`, `ROLLVENTO_WEBSITE`, `ROLLVENTO_BANK_DETAILS`. Optional `ROLLVENTO_PRODUCTS_PATH` overrides the product knowledge file location.

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
- `artifacts/api-server/src/routes/enquiries.ts` + `src/lib/ai/extract-enquiry.ts` — `POST /enquiries/extract`: AI structuring of a New Enquiry (Anthropic SDK, JSON-schema output, validated with the generated Zod schema). Extraction only; the lead is created by the existing `POST /leads` after the user confirms.
- `data/rollvento-products.json` — the ONLY Rollvento product/specification source for the AI Sales Agent. Loaded by `artifacts/api-server/src/lib/knowledge/products.ts` (deterministic matching, no vector search); internal `commercial` fields are never exposed.
- `artifacts/api-server/src/routes/products.ts` — `GET /products`, `POST /products/match`.
- `artifacts/api-server/src/routes/quotations.ts` + `src/lib/quotations/{calc,pdf}.ts` — quotations (server-calculated totals, `RV-YYYY-NNNN` numbering, PDFKit PDF). `pdfkit` is externalised in `build.mjs` because it reads font files at runtime.
- `lib/db/src/schema/quotations.ts` — `quotations` + `quotation_items` tables.
- `artifacts/crm/src/pages/enquiry.tsx` + `src/components/sales-agent/*` — the guided AI Sales Agent workflow: Enquiry → Product (AI review + Rollvento matches) → Lead → Pricing → Quotation (PDF) → Follow-up. `/enquiry?leadId=N` starts at pricing for an existing lead.
- `lib/api-spec/openapi.yaml` — source of truth for the generated API client and Zod schemas.
- `lib/db/src/schema` — Drizzle tables for auth, leads, activities, and customers.
- `lib/replit-auth-web` — browser auth hook for the Replit OIDC session.

## Architecture decisions

- Replit Auth uses an HTTP-only session cookie and every CRM query is scoped by the authenticated user ID.
- Customers are a projection of Won leads and are synchronized when a lead changes stage.
- Follow-up dates use PostgreSQL calendar dates rather than timestamps to avoid timezone shifts.
- The frontend consumes generated OpenAPI hooks; auth state and redirects use the dedicated browser auth package.
- AI never writes to the database. The New Enquiry flow extracts → the user reviews/edits → the existing lead API creates the lead; the original enquiry text and an "AI extraction performed" record are stored as ordinary `Note` activities on that lead.
- The AI only interprets wording (category, stated weight, literally named model). Product selection is deterministic from the JSON catalogue; the AI cannot introduce a model that is not in the file. Null catalogue specs are shown as "To be confirmed".
- Prices come from the user only. Quotation totals (line, discount, GST, grand total) are computed by the server in `lib/quotations/calc.ts` on every create/update; client totals are a preview. Quotation numbers are allocated server-side. Generating a quotation adds a `Quotation` activity to the lead; nothing is sent to the customer.
- Calendar dates (`nextFollowUp`, `validUntil`) travel as plain `YYYY-MM-DD` strings end to end (`CalendarDate` schemas) and are rendered as local dates, so they never shift with timezones. Follow-up phrases ("3 days", "next Monday", "25 September") are parsed by `artifacts/crm/src/lib/follow-up-date.ts` with date-fns, not by AI.

## Product

Clean V1 CRM includes a responsive login flow, dashboard, searchable and filterable lead pipeline, lead detail/activity history, follow-up buckets, converted customer list, and account settings.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Run API codegen after changing `lib/api-spec/openapi.yaml`.
- Do not modify product specifications in `data/rollvento-products.json` unless explicitly instructed; the file is authoritative.
- Development sample leads are inserted for the first authenticated user only when that user has no leads.
- The database schema is pushed with `pnpm --filter @workspace/db run push`; production schema changes are handled by Publish.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
