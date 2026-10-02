import test from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ??= "postgresql://placeholder:placeholder@127.0.0.1:5432/placeholder";
const { normalizePlace } = await import("./maps");
const { getNovaTool } = await import("./tools");

test("a Maps place becomes a prospect with its contact details", () => {
  const p = normalizePlace({
    title: "Shree Rolling Shutters",
    categoryName: "Shutter supplier",
    address: "Gondal Road",
    city: "Rajkot",
    phone: "+91 98250 11111",
    website: "https://shreeshutters.in",
    totalScore: 4.4,
    reviewsCount: 37,
    url: "https://maps.google.com/?cid=1",
  });
  assert.ok(p);
  assert.equal(p.companyName, "Shree Rolling Shutters");
  assert.equal(p.phone, "+91 98250 11111");
  assert.equal(p.website, "https://shreeshutters.in");
  assert.equal(p.location, "Gondal Road, Rajkot");
  assert.equal(p.category, "Shutter supplier");
  assert.equal(p.rating, 4.4);
});

test("a place with no way to contact it is not a prospect", () => {
  assert.equal(normalizePlace({ title: "Nameless Shop", city: "Rajkot" }), null);
});

test("permanently closed businesses are dropped", () => {
  assert.equal(normalizePlace({ title: "Old Shutters", phone: "123", permanentlyClosed: true }), null);
});

test("a listing whose only link is a directory keeps the phone but not the website", () => {
  const p = normalizePlace({ title: "A Shutters", phone: "+91 90000 00000", website: "https://www.indiamart.com/x" });
  assert.ok(p);
  assert.equal(p.website, undefined);
  assert.equal(p.phone, "+91 90000 00000");
});

test("an unnamed place is never a prospect", () => {
  assert.equal(normalizePlace({ phone: "+91 90000 00000", website: "https://x.in" }), null);
});

test("Maps prospecting is read-only and needs no approval", () => {
  for (const name of ["hunter_maps_campaign", "hunter_maps_results"]) {
    const tool = getNovaTool(name);
    assert.ok(tool, `${name} must be registered`);
    assert.equal(tool.risk, "read");
    assert.equal(tool.requiresApproval, false);
  }
});

test("it refuses clearly when APIFY_TOKEN is absent", async () => {
  const saved = process.env.APIFY_TOKEN;
  delete process.env.APIFY_TOKEN;
  try {
    const tool = getNovaTool("hunter_maps_campaign")!;
    const result = await tool.execute({ query: "rolling shutter dealers" }, { ownerId: "x" });
    assert.equal(result.ok, false);
    assert.match(String(result.error), /APIFY_TOKEN/);
  } finally {
    if (saved) process.env.APIFY_TOKEN = saved;
  }
});
