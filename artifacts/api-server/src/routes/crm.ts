import {
  CreateLeadActivityBody,
  CreateLeadActivityParams,
  CreateLeadActivityResponse,
  CreateLeadBody,
  CreateLeadResponse,
  DeleteLeadParams,
  GetDashboardSummaryResponse,
  GetLeadParams,
  GetLeadResponse,
  ListCustomersResponse,
  ListFollowUpsResponse,
  ListLeadActivitiesParams,
  ListLeadActivitiesResponse,
  ListLeadsQueryParams,
  ListLeadsResponse,
  UpdateLeadBody,
  UpdateLeadParams,
  UpdateLeadResponse,
} from "@workspace/api-zod";
import {
  activitiesTable,
  customersTable,
  db,
  leadsTable,
} from "@workspace/db";
import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";

const router: IRouter = Router();

const statuses = ["New", "Contacted", "Qualified", "Proposal", "Negotiation", "Won", "Lost"] as const;
const sources = ["Website", "WhatsApp", "Phone", "Email", "Referral", "Other"] as const;

type LeadStatus = (typeof statuses)[number];
type LeadSource = (typeof sources)[number];

function requireUser(req: Parameters<Parameters<typeof router.get>[1]>[0], res: Parameters<Parameters<typeof router.get>[1]>[1]): string | null {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  return req.user.id;
}

function numberValue(value: string | number): number {
  return typeof value === "number" ? value : Number(value);
}

function serializeLead(lead: typeof leadsTable.$inferSelect) {
  return {
    ...lead,
    estimatedValue: numberValue(lead.estimatedValue),
  };
}

function serializeCustomer(customer: typeof customersTable.$inferSelect) {
  return { ...customer, value: numberValue(customer.value) };
}

function serializeActivity(activity: typeof activitiesTable.$inferSelect) {
  return activity;
}

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function calendarValue(value: Date | string | null | undefined): string | null | undefined {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value;
}

function followUpRow(lead: typeof leadsTable.$inferSelect) {
  return {
    id: lead.id,
    companyName: lead.companyName,
    contactName: lead.contactName,
    nextFollowUp: lead.nextFollowUp!,
    status: lead.status,
  };
}

const seededOwners = new Set<string>();

async function ensureDevelopmentSeed(ownerId: string) {
  if (process.env.NODE_ENV !== "development" || seededOwners.has(ownerId)) return;
  const [existing] = await db.select({ id: leadsTable.id }).from(leadsTable).where(eq(leadsTable.ownerId, ownerId)).limit(1);
  if (existing) {
    seededOwners.add(ownerId);
    return;
  }
  const today = todayString();
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const seedLeads = [
    { companyName: "Northstar Studio", contactName: "Maya Patel", phone: "+91 98765 43210", email: "maya@northstar.example", source: "Website" as LeadSource, requirement: "Brand refresh and website redesign", estimatedValue: "18000", status: "Qualified" as LeadStatus, nextFollowUp: today, notes: "Strong fit for the spring launch." },
    { companyName: "Hearth & Field", contactName: "Sam Rivera", phone: "+1 415 555 0182", email: "sam@hearthfield.example", source: "Referral" as LeadSource, requirement: "Quarterly content production", estimatedValue: "9600", status: "Proposal" as LeadStatus, nextFollowUp: yesterday, notes: "Proposal sent Monday; follow up with procurement." },
    { companyName: "Aster Labs", contactName: "Jordan Lee", phone: "+65 8123 4567", email: "jordan@asterlabs.example", source: "Email" as LeadSource, requirement: "Product launch campaign", estimatedValue: "24000", status: "New" as LeadStatus, nextFollowUp: tomorrow, notes: "Inbound from the product marketing team." },
    { companyName: "Cedar House", contactName: "Owen Brooks", phone: "+44 20 7946 0958", email: "owen@cedarhouse.example", source: "Phone" as LeadSource, requirement: "Customer research sprint", estimatedValue: "12500", status: "Negotiation" as LeadStatus, nextFollowUp: nextWeek, notes: "Waiting on final scope confirmation." },
    { companyName: "Bluebird Market", contactName: "Priya Nair", phone: "+91 99887 66554", email: "priya@bluebird.example", source: "WhatsApp" as LeadSource, requirement: "Retail growth strategy", estimatedValue: "32000", status: "Won" as LeadStatus, nextFollowUp: null, notes: "Converted from the February referral event." },
  ];
  for (const seedLead of seedLeads) {
    const [lead] = await db.insert(leadsTable).values({ ...seedLead, ownerId }).returning();
    await addActivity(lead.id, ownerId, "LeadCreated", `Lead created for ${lead.companyName}`);
    if (lead.status === "Won") await syncCustomer(lead);
  }
  seededOwners.add(ownerId);
}

async function syncCustomer(lead: typeof leadsTable.$inferSelect) {
  if (lead.status === "Won") {
    await db.insert(customersTable).values({
      leadId: lead.id,
      ownerId: lead.ownerId,
      companyName: lead.companyName,
      contactName: lead.contactName,
      phone: lead.phone,
      email: lead.email,
      requirement: lead.requirement,
      value: lead.estimatedValue,
    }).onConflictDoUpdate({
      target: customersTable.leadId,
      set: {
        ownerId: lead.ownerId,
        companyName: lead.companyName,
        contactName: lead.contactName,
        phone: lead.phone,
        email: lead.email,
        requirement: lead.requirement,
        value: lead.estimatedValue,
      },
    });
  } else {
    await db.delete(customersTable).where(and(eq(customersTable.leadId, lead.id), eq(customersTable.ownerId, lead.ownerId)));
  }
}

async function addActivity(leadId: number, createdBy: string, type: string, description: string) {
  const [activity] = await db.insert(activitiesTable).values({ leadId, createdBy, type, description }).returning();
  return activity;
}

router.get("/dashboard", async (req, res): Promise<void> => {
  const ownerId = requireUser(req, res);
  if (!ownerId) return;
  await ensureDevelopmentSeed(ownerId);
  const today = todayString();
  const [total] = await db.select({ count: sql<number>`count(*)` }).from(leadsTable).where(eq(leadsTable.ownerId, ownerId));
  const [newCount] = await db.select({ count: sql<number>`count(*)` }).from(leadsTable).where(and(eq(leadsTable.ownerId, ownerId), eq(leadsTable.status, "New")));
  const [todayCount] = await db.select({ count: sql<number>`count(*)` }).from(leadsTable).where(and(eq(leadsTable.ownerId, ownerId), eq(leadsTable.nextFollowUp, today)));
  const [won] = await db.select({ count: sql<number>`count(*)` }).from(leadsTable).where(and(eq(leadsTable.ownerId, ownerId), eq(leadsTable.status, "Won")));
  const [lost] = await db.select({ count: sql<number>`count(*)` }).from(leadsTable).where(and(eq(leadsTable.ownerId, ownerId), eq(leadsTable.status, "Lost")));
  const recentRows = await db.select().from(leadsTable).where(eq(leadsTable.ownerId, ownerId)).orderBy(desc(leadsTable.createdAt)).limit(5);
  const followRows = await db.select().from(leadsTable).where(and(eq(leadsTable.ownerId, ownerId), eq(leadsTable.nextFollowUp, today))).orderBy(asc(leadsTable.nextFollowUp));
  res.json(GetDashboardSummaryResponse.parse({
    totalLeads: Number(total?.count ?? 0),
    newLeads: Number(newCount?.count ?? 0),
    followUpsToday: Number(todayCount?.count ?? 0),
    wonLeads: Number(won?.count ?? 0),
    lostLeads: Number(lost?.count ?? 0),
    recentLeads: recentRows.map(serializeLead),
    todaysFollowUps: followRows.map(followUpRow),
  }));
});

router.get("/leads", async (req, res): Promise<void> => {
  const ownerId = requireUser(req, res);
  if (!ownerId) return;
  await ensureDevelopmentSeed(ownerId);
  const parsed = ListLeadsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { search, status, source, sort = "newest" } = parsed.data;
  const filters = [eq(leadsTable.ownerId, ownerId)];
  if (status) filters.push(eq(leadsTable.status, status as LeadStatus));
  if (source) filters.push(eq(leadsTable.source, source as LeadSource));
  if (search) {
    filters.push(or(ilike(leadsTable.companyName, `%${search}%`), ilike(leadsTable.contactName, `%${search}%`), ilike(leadsTable.email, `%${search}%`))!);
  }
  const orderBy = sort === "oldest" ? asc(leadsTable.createdAt) : sort === "follow_up" ? asc(leadsTable.nextFollowUp) : desc(leadsTable.createdAt);
  const rows = await db.select().from(leadsTable).where(and(...filters)).orderBy(orderBy);
  res.json(ListLeadsResponse.parse(rows.map(serializeLead)));
});

router.post("/leads", async (req, res): Promise<void> => {
  const ownerId = requireUser(req, res);
  if (!ownerId) return;
  const parsed = CreateLeadBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [lead] = await db.insert(leadsTable).values({
    ...parsed.data,
    estimatedValue: String(parsed.data.estimatedValue),
    nextFollowUp: calendarValue(parsed.data.nextFollowUp),
    ownerId,
  }).returning();
  await addActivity(lead.id, ownerId, "LeadCreated", `Lead created for ${lead.companyName}`);
  await syncCustomer(lead);
  res.status(201).json(CreateLeadResponse.parse(serializeLead(lead)));
});

router.get("/leads/:id", async (req, res): Promise<void> => {
  const ownerId = requireUser(req, res);
  if (!ownerId) return;
  const params = GetLeadParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [lead] = await db.select().from(leadsTable).where(and(eq(leadsTable.id, params.data.id), eq(leadsTable.ownerId, ownerId)));
  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }
  const activities = await db.select().from(activitiesTable).where(and(eq(activitiesTable.leadId, lead.id), eq(activitiesTable.createdBy, ownerId))).orderBy(desc(activitiesTable.createdAt));
  res.json(GetLeadResponse.parse({ lead: serializeLead(lead), activities: activities.map(serializeActivity) }));
});

router.patch("/leads/:id", async (req, res): Promise<void> => {
  const ownerId = requireUser(req, res);
  if (!ownerId) return;
  const params = UpdateLeadParams.safeParse(req.params);
  const parsed = UpdateLeadBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    const error = !params.success ? params.error.message : !parsed.success ? parsed.error.message : "Invalid request";
    res.status(400).json({ error });
    return;
  }
  const [before] = await db.select().from(leadsTable).where(and(eq(leadsTable.id, params.data.id), eq(leadsTable.ownerId, ownerId)));
  if (!before) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }
  const { estimatedValue, nextFollowUp, ...leadFields } = parsed.data;
  const [lead] = await db.update(leadsTable).set({
    ...leadFields,
    ...(estimatedValue === undefined ? {} : { estimatedValue: String(estimatedValue) }),
    ...(nextFollowUp === undefined ? {} : { nextFollowUp: calendarValue(nextFollowUp) }),
    updatedAt: new Date(),
  }).where(and(eq(leadsTable.id, params.data.id), eq(leadsTable.ownerId, ownerId))).returning();
  if (parsed.data.status && parsed.data.status !== before.status) {
    await addActivity(lead.id, ownerId, "StatusChange", `Status changed from ${before.status} to ${lead.status}`);
  }
  if (parsed.data.nextFollowUp !== undefined && parsed.data.nextFollowUp !== before.nextFollowUp && parsed.data.nextFollowUp) {
    await addActivity(lead.id, ownerId, "FollowUpScheduled", `Follow-up scheduled for ${parsed.data.nextFollowUp}`);
  }
  await syncCustomer(lead);
  res.json(UpdateLeadResponse.parse(serializeLead(lead)));
});

router.delete("/leads/:id", async (req, res): Promise<void> => {
  const ownerId = requireUser(req, res);
  if (!ownerId) return;
  const params = DeleteLeadParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const deleted = await db.delete(leadsTable).where(and(eq(leadsTable.id, params.data.id), eq(leadsTable.ownerId, ownerId))).returning();
  if (deleted.length === 0) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }
  res.sendStatus(204);
});

router.get("/leads/:id/activities", async (req, res): Promise<void> => {
  const ownerId = requireUser(req, res);
  if (!ownerId) return;
  const params = ListLeadActivitiesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [lead] = await db.select({ id: leadsTable.id }).from(leadsTable).where(and(eq(leadsTable.id, params.data.id), eq(leadsTable.ownerId, ownerId)));
  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }
  const rows = await db.select().from(activitiesTable).where(and(eq(activitiesTable.leadId, lead.id), eq(activitiesTable.createdBy, ownerId))).orderBy(desc(activitiesTable.createdAt));
  res.json(ListLeadActivitiesResponse.parse(rows));
});

router.post("/leads/:id/activities", async (req, res): Promise<void> => {
  const ownerId = requireUser(req, res);
  if (!ownerId) return;
  const params = CreateLeadActivityParams.safeParse(req.params);
  const parsed = CreateLeadActivityBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    const error = !params.success ? params.error.message : !parsed.success ? parsed.error.message : "Invalid request";
    res.status(400).json({ error });
    return;
  }
  const [lead] = await db.select({ id: leadsTable.id }).from(leadsTable).where(and(eq(leadsTable.id, params.data.id), eq(leadsTable.ownerId, ownerId)));
  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }
  const activity = await addActivity(lead.id, ownerId, parsed.data.type, parsed.data.description);
  res.status(201).json(CreateLeadActivityResponse.parse(activity));
});

router.get("/follow-ups", async (req, res): Promise<void> => {
  const ownerId = requireUser(req, res);
  if (!ownerId) return;
  await ensureDevelopmentSeed(ownerId);
  const today = todayString();
  const rows = await db.select().from(leadsTable).where(and(eq(leadsTable.ownerId, ownerId), sql`${leadsTable.nextFollowUp} is not null`)).orderBy(asc(leadsTable.nextFollowUp));
  res.json(ListFollowUpsResponse.parse({
    overdue: rows.filter((row) => row.nextFollowUp! < today).map(followUpRow),
    today: rows.filter((row) => row.nextFollowUp === today).map(followUpRow),
    upcoming: rows.filter((row) => row.nextFollowUp! > today).map(followUpRow),
  }));
});

router.get("/customers", async (req, res): Promise<void> => {
  const ownerId = requireUser(req, res);
  if (!ownerId) return;
  await ensureDevelopmentSeed(ownerId);
  const rows = await db.select().from(customersTable).where(eq(customersTable.ownerId, ownerId)).orderBy(desc(customersTable.convertedAt));
  res.json(ListCustomersResponse.parse(rows.map(serializeCustomer)));
});

export default router;