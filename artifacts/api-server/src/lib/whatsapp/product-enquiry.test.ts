import test from "node:test";
import assert from "node:assert/strict";
import { parseProductEnquiry } from "./product-enquiry";

test("reads the message the website sends", () => {
  const e = parseProductEnquiry("Enquiry: SL1000AC\nQuantity: 10 sets");
  assert.equal(e.model, "SL1000AC");
  assert.equal(e.quantity, 10);
  assert.equal(e.unit, "sets");
  assert.match(e.requirement ?? "", /^SL1000AC — /);
  assert.match(e.requirement ?? "", /Quantity: 10 sets$/);
});

test("reads a customer who typed it themselves", () => {
  const e = parseProductEnquiry("hi i need 25 nos of SL600AC please send price");
  assert.equal(e.model, "SL600AC");
  assert.equal(e.quantity, 25);
  assert.equal(e.unit, "nos");
});

test("a model with no quantity is still an enquiry", () => {
  const e = parseProductEnquiry("Enquiry: SL500DC");
  assert.equal(e.model, "SL500DC");
  assert.equal(e.quantity, null);
  assert.equal(e.requirement, "SL500DC — SL500DC 24V DC Sliding Gate Motor with Battery Backup");
});

test("a quantity with no model is still worth keeping", () => {
  const e = parseProductEnquiry("need 10 sets for my shop");
  assert.equal(e.model, null);
  assert.equal(e.quantity, 10);
  assert.equal(e.requirement, "Quantity: 10 sets");
});

test("an ordinary message yields nothing rather than a guess", () => {
  const e = parseProductEnquiry("Hello World");
  assert.deepEqual(e, { model: null, productName: null, quantity: null, unit: null, requirement: null });
});

test("a model is not matched inside a longer code", () => {
  // Otherwise an order reference would be read as a product.
  assert.equal(parseProductEnquiry("ref XSL600ACZ99").model, null);
  assert.equal(parseProductEnquiry("ref: SL600AC").model, "SL600AC");
});

test("the longer model wins when one model contains another", () => {
  // SL500DCW contains SL500DC; matching the shorter one would quote the wrong
  // motor, which is the kind of mistake nobody notices until delivery.
  assert.equal(parseProductEnquiry("Enquiry: SL500DCW\nQuantity: 2 sets").model, "SL500DCW");
});

test("case and spacing do not matter", () => {
  assert.equal(parseProductEnquiry("enquiry: sl800dc qty 4").model, "SL800DC");
  assert.equal(parseProductEnquiry("enquiry: sl800dc qty 4").quantity, 4);
});

test("a zero or absurd quantity is ignored", () => {
  assert.equal(parseProductEnquiry("SL600AC Quantity: 0").quantity, null);
});

test("a rolling shutter model is recognised however the customer writes it", () => {
  // RV-400 is the model; customers type it loosely, and these are exactly the
  // products the website funnels enquiries for.
  for (const written of ["Enquiry: RV-400", "enquiry: rv 400", "I want RV400", "rv-400 please"]) {
    assert.equal(parseProductEnquiry(written).model, "RV-400", `failed on: ${written}`);
  }
});

test("a loosely written model still cannot match inside a longer code", () => {
  assert.equal(parseProductEnquiry("ref RV4001").model, null);
  assert.equal(parseProductEnquiry("ref XRV400").model, null);
});

test("the larger shutter motor is not read as the smaller one", () => {
  assert.equal(parseProductEnquiry("RV-1500 qty 3").model, "RV-1500");
  assert.equal(parseProductEnquiry("RV 2000, 5 sets").model, "RV-2000");
});
