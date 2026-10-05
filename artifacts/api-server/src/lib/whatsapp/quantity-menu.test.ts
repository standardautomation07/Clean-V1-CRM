import test from "node:test";
import assert from "node:assert/strict";
import { acknowledgement, buildQuantityMenu, readQuantityReply, QUANTITY_OPTIONS } from "./quantity-menu";

test("the menu names the product, because the customer may have switched apps", () => {
  const menu = buildQuantityMenu("919999999999", "SL500DC");
  const body = String((menu.interactive.body as { text: string }).text);
  assert.match(body, /SL500DC/);
  assert.match(body, /How many sets/);
  assert.equal(menu.to, "919999999999");
  assert.equal(menu.type, "interactive");
  assert.equal((menu.interactive as { type: string }).type, "list");
});

test("the menu stays inside WhatsApp's limits", () => {
  const menu = buildQuantityMenu("919999999999", "SL500DC");
  const sections = (menu.interactive.action as { sections: Array<{ rows: Array<{ title: string; id: string }> }> }).sections;
  const rows = sections.flatMap((s) => s.rows);
  // WhatsApp rejects a list with more than 10 rows, or a title over 24 chars.
  assert.ok(rows.length <= 10, `expected at most 10 rows, got ${rows.length}`);
  for (const row of rows) assert.ok(row.title.length <= 24, `row title too long: ${row.title}`);
  assert.ok(String((menu.interactive.body as { text: string }).text).length <= 1024);
});

test("a customer wanting an unlisted quantity has a way through", () => {
  const menu = buildQuantityMenu("919999999999", "SL500DC");
  const rows = (menu.interactive.action as { sections: Array<{ rows: Array<{ id: string }> }> }).sections.flatMap((s) => s.rows);
  assert.ok(rows.some((r) => r.id === "qty_other"), "there must be an escape from the fixed options");
  assert.equal(rows.length, QUANTITY_OPTIONS.length + 1);
});

test("reads the quantity the customer tapped", () => {
  const reply = readQuantityReply({ type: "interactive", interactive: { type: "list_reply", list_reply: { id: "qty_10", title: "10 sets" } } });
  assert.deepEqual(reply, { quantity: 10, title: "10 sets" });
});

test("'a different quantity' is a reply, but carries no number", () => {
  const reply = readQuantityReply({ type: "interactive", interactive: { type: "list_reply", list_reply: { id: "qty_other", title: "A different quantity" } } });
  assert.equal(reply?.quantity, null);
  assert.equal(reply?.title, "A different quantity");
});

test("an ordinary message is not mistaken for a menu reply", () => {
  assert.equal(readQuantityReply({ type: "text", text: { body: "10 sets please" } }), null);
  assert.equal(readQuantityReply({ type: "interactive", interactive: { type: "button_reply", button_reply: { id: "x", title: "y" } } }), null);
  // A list reply from some other menu must not be read as a quantity.
  assert.equal(readQuantityReply({ type: "interactive", interactive: { type: "list_reply", list_reply: { id: "colour_red", title: "Red" } } }), null);
});

test("the acknowledgement is one fixed branded line", () => {
  // Deliberately identical for every enquiry: an earlier version varied the
  // reply by guessed intent and got it wrong in front of customers.
  assert.equal(acknowledgement("Dinesh"), "Hi Dinesh, thank you for contacting Rollvento. Our team will reach out to you shortly.");
  assert.equal(acknowledgement(null), "thank you for contacting Rollvento. Our team will reach out to you shortly.");
  assert.equal(acknowledgement("  "), "thank you for contacting Rollvento. Our team will reach out to you shortly.");
  // No prices, and no promise about what happens next beyond contact.
  assert.doesNotMatch(acknowledgement("A"), /price|quote|₹|INR/i);
});
