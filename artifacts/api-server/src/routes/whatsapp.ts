import { and, desc, eq } from "drizzle-orm";
import { db, leadsTable, whatsappMessagesTable, activitiesTable } from "@workspace/db";
import { getNovaTool } from "../lib/nova/tools";
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

        const lead = await findLeadByPhone(phone);
        const body = message?.type === "text" ? String(message?.text?.body ?? "") : "";
        const [saved] = await db.insert(whatsappMessagesTable).values({
          ownerId: lead?.ownerId ?? null,
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
        accepted++;
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
  const rows = await db.select().from(whatsappMessagesTable).where(eq(whatsappMessagesTable.ownerId, req.user.id)).orderBy(desc(whatsappMessagesTable.createdAt)).limit(100);
  res.json({ messages: rows });
});

export default router;
