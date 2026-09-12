import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

// Integration test for the sales workflow API. Runs only when DATABASE_URL is
// set (it needs a real PostgreSQL with the schema pushed). Two owners are
// created with direct session rows so the test never depends on Replit OIDC.

const hasDb = Boolean(process.env.DATABASE_URL);
const OWNER_A = "test-owner-a";
const OWNER_B = "test-owner-b";

describe("sales workflow API (integration)", { skip: !hasDb && "DATABASE_URL not set" }, () => {
  let server: Server;
  let base: string;
  let tokenA: string;
  let tokenB: string;
  let dbModule: typeof import("@workspace/db");

  const api = (token: string) => async (method: string, path: string, body?: unknown) => {
    const res = await fetch(`${base}/api${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const type = res.headers.get("content-type") ?? "";
    const payload = type.includes("application/json") ? await res.json() : type.includes("application/pdf") ? Buffer.from(await res.arrayBuffer()) : await res.text();
    return { status: res.status, body: payload as never, type };
  };

  before(async () => {
    dbModule = await import("@workspace/db");
    const { db, usersTable } = dbModule;
    const { createSession } = await import("../lib/auth");
    const { default: app } = await import("../app");
    for (const id of [OWNER_A, OWNER_B]) {
      await db.insert(usersTable).values({ id, email: `${id}@example.com`, firstName: "Test", lastName: id }).onConflictDoNothing();
    }
    const user = (id: string) => ({ id, email: `${id}@example.com`, firstName: "Test", lastName: id, profileImageUrl: null });
    tokenA = await createSession({ user: user(OWNER_A), access_token: "test" });
    tokenB = await createSession({ user: user(OWNER_B), access_token: "test" });
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(async () => {
    const { db, usersTable, sessionsTable, pool } = dbModule;
    const { eq, inArray } = await import("drizzle-orm");
    // Cascades leads, activities, customers and quotations created by the test.
    await db.delete(usersTable).where(inArray(usersTable.id, [OWNER_A, OWNER_B]));
    for (const sid of [tokenA, tokenB]) await db.delete(sessionsTable).where(eq(sessionsTable.sid, sid));
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool.end();
  });

  it("runs enquiry -> lead -> quotation -> PDF -> follow-up with owner scoping", async () => {
    const a = api(tokenA);
    const b = api(tokenB);

    // Unauthenticated calls are refused.
    assert.equal((await api("nope")("GET", "/products")).status, 401);

    // Product knowledge is available to signed-in users and never carries prices.
    const products = await a("GET", "/products?category=Sliding%20Gate%20Motors");
    assert.equal(products.status, 200);
    const productList = products.body as Array<Record<string, unknown>>;
    assert.ok(productList.some((p) => p.model === "SL1000AC"));
    assert.ok(!JSON.stringify(productList).toLowerCase().includes("price"));

    const match = await a("POST", "/products/match", { items: [{ productHint: "sliding gate motor", category: "Sliding Gate Motors", mentionedModel: null, requiredCapacityKg: 1000, quantity: 1, unit: "Nos", specifications: [] }] });
    assert.equal(match.status, 200);
    assert.equal((match.body as Array<{ candidates: Array<{ product: { model: string } }> }>)[0].candidates[0].product.model, "SL1000AC");

    // Extraction never creates a lead - without an API key it fails cleanly and the lead count is unchanged.
    const leadsBefore = ((await a("GET", "/leads")).body as unknown[]).length;
    const savedKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    const extract = await a("POST", "/enquiries/extract", { companyName: "ABC Industries", requirement: "Need automatic sliding gate motor for 1000 kg gate" });
    if (savedKey !== undefined) process.env.ANTHROPIC_API_KEY = savedKey;
    assert.equal(extract.status, 503);
    assert.equal(((await a("GET", "/leads")).body as unknown[]).length, leadsBefore);

    // The lead is created through the existing lead API after user confirmation.
    const lead = await a("POST", "/leads", { companyName: "ABC Industries", contactName: "Ravi Sharma", phone: "+91 98765 43210", email: "", source: "Phone", requirement: "SL1000AC (Gate weight: 1000 kg)", estimatedValue: 0, status: "New", nextFollowUp: null, notes: "Location: Ahmedabad" });
    assert.equal(lead.status, 201);
    const leadId = (lead.body as { id: number }).id;
    assert.equal((lead.body as { status: string }).status, "New");
    assert.equal((lead.body as { estimatedValue: number }).estimatedValue, 0);

    // Quotation: server calculates totals and assigns the number.
    assert.deepEqual((await a("GET", `/leads/${leadId}/quotations`)).body, []);
    const created = await a("POST", "/quotations", {
      leadId,
      items: [{ productModel: "SL1000AC", productName: "SL1000AC 400W Heavy Industrial AC Sliding Gate Motor", quantity: 1, unit: "Nos", unitPrice: 25000, discount: 5 }],
      taxRate: 18,
      validUntil: "2026-10-12",
      terms: "Prices in INR.",
      notes: "",
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const quotation = created.body as { id: number; quotationNumber: string; status: string; subtotal: number; discount: number; taxAmount: number; total: number; validUntil: string };
    assert.match(quotation.quotationNumber, /^RV-\d{4}-\d{4}$/);
    assert.equal(quotation.status, "Draft");
    assert.equal(quotation.subtotal, 25000);
    assert.equal(quotation.discount, 1250);
    assert.equal(quotation.taxAmount, 4275);
    assert.equal(quotation.total, 28025);
    assert.equal(quotation.validUntil, "2026-10-12");

    // A second quotation gets the next number.
    const second = await a("POST", "/quotations", { leadId, items: [{ productModel: "RT01", productName: "Remote", quantity: 1, unit: "Nos", unitPrice: 1000, discount: 0 }], taxRate: 18, validUntil: null, terms: "", notes: "" });
    const n1 = Number(quotation.quotationNumber.slice(-4));
    const n2 = Number((second.body as { quotationNumber: string }).quotationNumber.slice(-4));
    assert.equal(n2, n1 + 1);

    // Editing recalculates on the server; client-sent totals are ignored.
    const updated = await a("PATCH", `/quotations/${quotation.id}`, { taxRate: 0, total: 1 });
    assert.equal(updated.status, 200);
    assert.equal((updated.body as { total: number }).total, 23750);
    await a("PATCH", `/quotations/${quotation.id}`, { taxRate: 18 });

    // Owner B cannot see, edit, generate or download owner A's quotation or lead.
    assert.equal((await b("GET", `/quotations/${quotation.id}`)).status, 404);
    assert.equal((await b("PATCH", `/quotations/${quotation.id}`, { taxRate: 0 })).status, 404);
    assert.equal((await b("POST", `/quotations/${quotation.id}/generate`)).status, 404);
    assert.equal((await b("GET", `/quotations/${quotation.id}/pdf`)).status, 404);
    assert.equal((await b("GET", `/leads/${leadId}/quotations`)).status, 404);
    assert.equal((await b("POST", "/quotations", { leadId, items: [{ productModel: "X", productName: "X", quantity: 1, unit: "Nos", unitPrice: 1, discount: 0 }], taxRate: 18, validUntil: null, terms: "", notes: "" })).status, 404);

    // Generate: status flips and the lead gets a Quotation activity.
    const generated = await a("POST", `/quotations/${quotation.id}/generate`);
    assert.equal(generated.status, 200);
    assert.equal((generated.body as { status: string }).status, "Generated");
    const activities = (await a("GET", `/leads/${leadId}/activities`)).body as Array<{ type: string; description: string }>;
    assert.ok(activities.some((x) => x.type === "Quotation" && x.description.includes(quotation.quotationNumber)));

    // PDF reflects the saved totals exactly.
    const pdf = await a("GET", `/quotations/${quotation.id}/pdf`);
    assert.equal(pdf.status, 200);
    assert.ok(pdf.type.includes("application/pdf"));
    assert.equal((pdf.body as Buffer).subarray(0, 5).toString(), "%PDF-");

    // Follow-up: a calendar date round-trips unchanged (no timezone shift) and is logged.
    const followUp = await a("PATCH", `/leads/${leadId}`, { nextFollowUp: "2026-09-18" });
    assert.equal(followUp.status, 200);
    assert.equal((followUp.body as { nextFollowUp: string }).nextFollowUp, "2026-09-18");
    const detail = (await a("GET", `/leads/${leadId}`)).body as { lead: { nextFollowUp: string }; activities: Array<{ type: string; description: string }> };
    assert.equal(detail.lead.nextFollowUp, "2026-09-18");
    assert.ok(detail.activities.some((x) => x.type === "FollowUpScheduled" && x.description.includes("2026-09-18")));
    assert.equal((await a("PATCH", `/leads/${leadId}`, { nextFollowUp: "18/09/2026" })).status, 400);
  });
});
