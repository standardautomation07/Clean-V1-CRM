# NOVA Business OS

NOVA is the orchestration layer for Clean-V1-CRM. The CRM and deterministic business logic remain the source of truth; AI agents call controlled tools rather than calculating or inventing financial data.

## Current foundation

- Tool contracts with explicit risk levels and approval flags.
- Deterministic Rollvento product search and exact product lookup.
- Deterministic enquiry-to-product matching.
- Authenticated CRM lead search and lookup.
- Server-side quotation preview using the existing quotation calculator.
- Authenticated /api/nova and /api/nova/execute endpoints.

## Safety boundary

Read operations can run immediately. Financial or external actions will pass through the approval layer before execution. Quotation totals are always calculated by lib/quotations/calc.ts.

## Business document lifecycle

Lead -> Enquiry -> Quotation -> Sales Order -> Delivery Challan -> Invoice -> Payment

The next implementation phase adds persistent Sales Order, Delivery Challan, Invoice and approval entities, then exposes them as NOVA tools.

## Agent roadmap

- NOVA: command/orchestration
- HUNTER: lead generation and prospect research
- SALES: enquiry, quotation and follow-up
- OPERATIONS: sales order, delivery, challan and invoice
- MARKETING: Instagram, Facebook, LinkedIn and YouTube content/publishing
- SUPPORT: customer communication and service workflows
- ANALYST: dashboards, pipeline and business reports


## HUNTER workflow

1. Research a prospect using an external research source or browser workflow.
2. Preserve the company/contact/source evidence in the proposed prospect payload.
3. Run `hunter_search_prospects` before creating anything in CRM.
4. Run `hunter_qualify_prospect` to identify missing evidence.
5. Use `hunter_create_lead` only after human approval. The tool performs a final duplicate check before writing the lead.
6. HUNTER does not send external outreach; outreach remains a separate approval-gated capability.
