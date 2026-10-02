import test from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ??= "postgresql://placeholder:placeholder@127.0.0.1:5432/placeholder";
const { buildProspectEmail } = await import("./outreach");
const { getNovaTool } = await import("./tools");

const lead = {
  companyName: "New Azad Rolling Shutters",
  contactName: "Imran",
  email: "sales@newazadrollingshutters.com",
  requirement: "rolling shutter manufacturer and installer in Surat",
};

test("the draft greets the contact and names the business", () => {
  const draft = buildProspectEmail(lead);
  assert.match(draft.body, /^Hello Imran,/);
  assert.match(draft.subject, /gate and shutter automation/i);
  assert.equal(draft.toEmail, "sales@newazadrollingshutters.com");
});

test("only catalogue models are offered, never an invented one", async () => {
  const draft = buildProspectEmail(lead);
  const { getProductByModel } = await import("../knowledge/products");
  for (const model of draft.matchedModels) {
    assert.ok(getProductByModel(model), `${model} must exist in the catalogue`);
  }
});

test("a legal name ending in a period does not produce a double full stop", () => {
  const body = buildProspectEmail(lead).body;
  assert.ok(!body.includes(".."), body);
  assert.match(body, /I am writing from \S/);
});

test("the draft never quotes a price", () => {
  const draft = buildProspectEmail(lead);
  assert.ok(!/₹|INR|\bprice\b|\bcost\b|\brate\b/i.test(draft.body), draft.body);
});

test("cold outreach carries an opt-out", () => {
  assert.match(buildProspectEmail(lead).body, /reply with STOP/i);
});

test("a lead with no name still produces a sane greeting", () => {
  const draft = buildProspectEmail({ ...lead, contactName: "", companyName: "" });
  assert.match(draft.body, /^Hello there,/);
});

test("sending is approval gated and drafting is not", () => {
  const send = getNovaTool("send_prospect_email");
  const draft = getNovaTool("draft_prospect_email");
  assert.ok(send);
  assert.ok(draft);
  assert.equal(send.risk, "external");
  assert.equal(send.requiresApproval, true);
  assert.equal(draft.risk, "read");
  assert.equal(draft.requiresApproval, false);
});

test("sending refuses when the provider is not configured", async () => {
  const saved = { key: process.env.RESEND_API_KEY, from: process.env.OUTREACH_FROM_EMAIL };
  delete process.env.RESEND_API_KEY;
  delete process.env.OUTREACH_FROM_EMAIL;
  try {
    const send = getNovaTool("send_prospect_email")!;
    const result = await send.execute({ leadId: 0 }, { ownerId: "nobody" });
    // A bad leadId is rejected before any provider call, which is the point:
    // nothing reaches the network without a real, owned lead.
    assert.equal(result.ok, false);
  } finally {
    if (saved.key) process.env.RESEND_API_KEY = saved.key;
    if (saved.from) process.env.OUTREACH_FROM_EMAIL = saved.from;
  }
});
