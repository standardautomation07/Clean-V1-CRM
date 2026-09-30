# NOVA Business OS

NOVA is the orchestration layer for Clean-V1-CRM. The CRM and deterministic business logic remain the source of truth; AI agents call controlled tools rather than calculating or inventing financial data.

## Current foundation

- Tool contracts with explicit risk levels and approval flags.
- Deterministic Rollvento product search and exact product lookup.
- Deterministic enquiry-to-product matching.
- Authenticated CRM lead search and lookup.
- Server-side quotation preview using the existing quotation calculator.
- Persistent approval queue for write/financial/external actions.
- Commercial document tools for quotation, sales order, delivery challan and invoice.
- HUNTER web research tool backed by Tavily.
- Authenticated /api/nova and /api/nova/execute endpoints.

## Safety boundary

Read operations can run immediately. Financial, write, and external actions pass through the approval layer before execution. Quotation totals are always calculated by lib/quotations/calc.ts. HUNTER web research only reads public sources; it never contacts prospects.

## Business document lifecycle

Lead -> Enquiry -> Quotation -> Sales Order -> Delivery Challan -> Invoice -> Payment

Commercial document creation is approval-gated and server-side. Customer and item data are copied into document snapshots so issued documents remain auditable.

## Agent roadmap

- NOVA: command/orchestration
- HUNTER: lead generation and prospect research
- SALES: enquiry, quotation and follow-up
- OPERATIONS: sales order, delivery, challan and invoice
- MARKETING: Instagram, Facebook, LinkedIn and YouTube content/publishing
- SUPPORT: customer communication and service workflows
- ANALYST: dashboards, pipeline and business reports

## HUNTER workflow

1. Build a research brief from product, customer type, geography, or free-text criteria.
2. Run `hunter_web_research` to discover public candidate companies and retain source URLs/snippets.
3. Run `hunter_qualify_prospect` to check evidence and identify missing signals.
4. Run `hunter_search_prospects` before importing anything into CRM.
5. Request `hunter_create_lead` only after human approval. The tool performs a final duplicate check before writing the lead.
6. HUNTER does not send external outreach; outreach remains a separate approval-gated capability.

### Tavily configuration

The API server needs `TAVILY_API_KEY` in its environment. The key is server-side only and must never be exposed to the CRM frontend.

The current implementation uses Tavily's search API directly from the HUNTER tool. A future hardening step can add a dedicated research adapter, source allow/deny lists, richer contact extraction, and persistent research records.
