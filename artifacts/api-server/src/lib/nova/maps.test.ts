import test from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ??= "postgresql://placeholder:placeholder@127.0.0.1:5432/placeholder";
const { normalizePlace, parseBrief } = await import("./maps");
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

test("a natural-language brief becomes a Maps search term, place and count", () => {
  // The brief that returned a single result in production.
  const b = parseBrief("find 50 rolling shuuter manufacturers in kerala");
  assert.equal(b.query, "rolling shuuter manufacturers");
  assert.equal(b.location, "kerala");
  assert.equal(b.maxPlaces, 50);
});

test("a bare search term is left alone", () => {
  const b = parseBrief("rolling shutter dealers");
  assert.equal(b.query, "rolling shutter dealers");
  assert.equal(b.location, undefined);
  assert.equal(b.maxPlaces, undefined);
});

test("other lead-ins and prepositions are understood", () => {
  assert.deepEqual(parseBrief("show me top 20 shutter installers near Surat"), {
    query: "shutter installers",
    location: "Surat",
    maxPlaces: 20,
  });
  assert.deepEqual(parseBrief("Please find garage door suppliers around Pune."), {
    query: "garage door suppliers",
    location: "Pune",
    maxPlaces: undefined,
  });
});

test("a preposition is only a place when something is left to search for", () => {
  // Treating "bulk" as the location would leave nothing to search for.
  const b = parseBrief("in bulk");
  assert.equal(b.query, "in bulk");
  assert.equal(b.location, undefined);
});
