import { and, desc, eq, isNull, or } from "drizzle-orm";
import { db, leadsTable, usersTable, whatsappMessagesTable, activitiesTable } from "@workspace/db";
import { getNovaTool } from "../lib/nova/tools";
import { parseProductEnquiry } from "../lib/whatsapp/product-enquiry";
import { Router, type IRouter } from "express";
import crypto from "node:crypto";

const router: IRouter = Router();

function verifySignature(rawBody: Buffer, signature: string | undefined, secret: string | undefined) {
  if (!secret) return false;
  if (!signature?.startsWith("sha256=")) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const received = signature.slice("sha256=".length);
  return received.length === expected.length && crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

function normalizePhone(value: string) {
  return value.replace(/[^\d]/g, "");
}

/**
 * Owner for an inbound message whose number matches no lead. Without this the
 * message is stored with a null owner and the inbox, which is scoped by owner,
 * can never show it - so every message from a new customer is invisible.
 */
async function resolveInboxOwnerId(): Promise<string | null> {
  const configured = process.env.WHATSAPP_LEAD_OWNER_ID?.trim() || process.env.SITE_USER_ID?.trim();
  if (configured) {
    const [user] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, configured));
    if (user) return user.id;
  }
  const users = await db.select({ id: usersTable.id }).from(usersTable).limit(2);
  return users.length === 1 ? users[0].id : null;
}

/** Display name WhatsApp sends with the message, when the sender shares it. */
function profileName(value: unknown, phone: string): string {
  const contacts = (value as { contacts?: Array<{ profile?: { name?: string } }> } | undefined)?.contacts;
  const name = Array.isArray(contacts) ? contacts[0]?.profile?.name?.trim() : "";
  return name || `WhatsApp +${phone}`;
}

async function findLeadByPhone(phone: string) {
  const normalized = normalizePhone(phone);
  const rows = await db.select().from(leadsTable);
  return rows.find((lead) => normalizePhone(lead.phone) === normalized) ?? null;
}

router.get("/whatsapp/webhook", (req, res): void => {
  const mode = String(req.query["hub.mode"] ?? "");
  const token = String(req.query["hub.verify_token"] ?? "");
  const challenge = String(req.query["hub.challenge"] ?? "");
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN?.trim();
  if (mode === "subscribe" && verifyToken && token === verifyToken) {
    res.status(200).send(challenge);
    return;
  }
  res.status(403).send("Forbidden");
});

router.post("/whatsapp/webhook", async (req, res): Promise<void> => {
  const raw = (req as typeof req & { rawBody?: Buffer }).rawBody;
  if (!raw) {
    res.status(400).json({ error: "Raw request body unavailable" });
    return;
  }
  if (!verifySignature(raw, req.header("x-hub-signature-256"), process.env.WHATSAPP_APP_SECRET?.trim())) {
    res.status(401).json({ error: "Invalid webhook signature" });
    return;
  }

  // Acknowledge Meta quickly; processing is idempotent by waMessageId.
  const entries = Array.isArray(req.body?.entry) ? req.body.entry : [];
  let accepted = 0;
  for (const entry of entries) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      const value = change?.value;
      for (const message of Array.isArray(value?.messages) ? value.messages : []) {
        const waMessageId = String(message?.id ?? "");
        const phone = String(message?.from ?? "");
        if (!waMessageId || !phone) continue;
        const existing = await db.select({ id: whatsappMessagesTable.id }).from(whatsappMessagesTable).where(eq(whatsappMessagesTable.waMessageId, waMessageId)).limit(1);
        if (existing.length) continue;

        const existingLead = await findLeadByPhone(phone);
        const ownerId = existingLead?.ownerId ?? (await resolveInboxOwnerId());
        const body = message?.type === "text" ? String(message?.text?.body ?? "") : "";

        // A message from an unknown number is held as an enquiry rather than
        // becoming a lead on arrival. The website funnels real traffic at this
        // number, so wrong numbers and spam would otherwise land straight in
        // the leads list. A person converts it from the NOVA inbox instead.
        //
        // A number that already belongs to a lead still attaches to it, so an
        // ongoing conversation stays in one place and can be replied to.
        const lead = existingLead;
        const [saved] = await db.insert(whatsappMessagesTable).values({
          ownerId,
          leadId: lead?.id ?? null,
          direction: "Inbound",
          status: "Received",
          waMessageId,
          phone,
          messageType: String(message?.type ?? "unknown"),
          body,
          payload: message,
        }).returning();

        if (lead) {
          await db.insert(activitiesTable).values({
            leadId: lead.id,
            createdBy: lead.ownerId,
            type: "WhatsApp",
            description: body ? `Inbound WhatsApp: ${body.slice(0, 500)}` : `Inbound WhatsApp message received (${message?.type ?? "unknown"}).`,
          });
        }
        accepted += 1;
        if (!lead) req.log.info({ messageId: saved.id }, "WhatsApp enquiry awaiting conversion to a lead");
      }
    }
  }
  res.status(200).json({ ok: true, accepted });
});

router.get("/whatsapp/inbox", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  // Unassigned messages are included: a number that matches no lead and no
  // resolvable owner must still reach a human rather than vanish.
  const rows = await db
    .select()
    .from(whatsappMessagesTable)
    .where(or(eq(whatsappMessagesTable.ownerId, req.user.id), isNull(whatsappMessagesTable.ownerId)))
    .orderBy(desc(whatsappMessagesTable.createdAt))
    .limit(100);
  res.json({ messages: rows });
});

// Converting a held enquiry into a lead. This is the human step: the website
// sends real traffic to this number, so a person decides what becomes a lead.
router.post("/whatsapp/messages/:id/convert-lead", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const ownerId = req.user.id;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid message id" });
    return;
  }

  const [message] = await db.select().from(whatsappMessagesTable).where(eq(whatsappMessagesTable.id, id));
  if (!message) {
    res.status(404).json({ error: "Message not found" });
    return;
  }
  if (message.leadId) {
    res.status(409).json({ error: "This message already belongs to a lead", leadId: message.leadId });
    return;
  }

  // The number may have become a lead since the message arrived, through
  // another enquiry or by hand. Reuse it rather than creating a duplicate.
  const existing = await findLeadByPhone(message.phone);
  const enquiry = parseProductEnquiry(message.body);
  const body = (req.body ?? {}) as { companyName?: string; contactName?: string };
  const name = String(body.companyName ?? "").trim() || profileName(message.payload, message.phone);

  const lead = existing ?? (await db.insert(leadsTable).values({
    companyName: name,
    contactName: String(body.contactName ?? "").trim() || name,
    phone: message.phone,
    email: "",
    source: "WhatsApp",
    // The parsed enquiry when we could read one, so the quotation can be
    // started from it; otherwise the message itself, which is better than
    // nothing for the salesperson picking it up.
    requirement: (enquiry.requirement ?? message.body).slice(0, 2000),
    status: "New",
    notes: `Created from a WhatsApp enquiry from +${message.phone}.`,
    ownerId,
  }).returning())[0];

  await db.update(whatsappMessagesTable)
    .set({ leadId: lead.id, ownerId: lead.ownerId })
    .where(eq(whatsappMessagesTable.id, id));

  await db.insert(activitiesTable).values({
    leadId: lead.id,
    createdBy: ownerId,
    type: existing ? "WhatsApp" : "LeadCreated",
    description: existing
      ? `WhatsApp enquiry attached to this lead: ${(enquiry.requirement ?? message.body).slice(0, 400)}`
      : `Lead created from a WhatsApp enquiry: ${(enquiry.requirement ?? message.body).slice(0, 400)}`,
  });

  res.status(201).json({ ok: true, lead, enquiry, reusedExistingLead: Boolean(existing) });
});

// Why this exists: inbound webhooks were not arriving and every setting in
// Meta's console looked correct. The console shows the app's webhook
// subscription but never shows whether the WhatsApp Business Account is
// subscribed to the app, which is a separate thing and the usual cause. Only
// the Graph API can answer that, and the server already holds the token, so it
// asks on our behalf rather than anyone pasting a credential anywhere.
//
// Read-only, and the token never appears in the response.

const GRAPH = () => `https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION?.trim() || "v23.0"}`;

async function graph(path: string, init?: RequestInit) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  if (!token) return { ok: false, error: "WHATSAPP_ACCESS_TOKEN is not configured" };
  const response = await fetch(`${GRAPH()}/${path}`, {
    ...init,
    headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}` },
  });
  const body = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, body };
}

router.get("/whatsapp/diagnostics", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const wabaId = String(req.query.wabaId ?? "").trim();

  const report: Record<string, unknown> = {
    configured: {
      phoneNumberId: phoneNumberId ?? null,
      hasAccessToken: Boolean(process.env.WHATSAPP_ACCESS_TOKEN?.trim()),
      hasAppSecret: Boolean(process.env.WHATSAPP_APP_SECRET?.trim()),
      hasVerifyToken: Boolean(process.env.WHATSAPP_VERIFY_TOKEN?.trim()),
    },
  };

  // Does the token work, and which number does it actually point at?
  if (phoneNumberId) {
    report.phoneNumber = await graph(`${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating,platform_type,code_verification_status`);
  }

  // The answer we are actually after: is any app subscribed to this WABA?
  if (wabaId) {
    report.subscribedApps = await graph(`${wabaId}/subscribed_apps`);
  } else {
    report.subscribedApps = { skipped: "Pass ?wabaId=<id> to check which apps this WhatsApp Business Account delivers webhooks to." };
  }

  res.json(report);
});

// Subscribing is a write, so it is a POST and never happens by loading a page.
router.post("/whatsapp/diagnostics/subscribe", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const wabaId = String(req.query.wabaId ?? "").trim();
  if (!wabaId) {
    res.status(400).json({ error: "wabaId is required" });
    return;
  }
  const result = await graph(`${wabaId}/subscribed_apps`, { method: "POST" });
  res.status(result.ok ? 200 : 502).json(result);
});

export default router;
