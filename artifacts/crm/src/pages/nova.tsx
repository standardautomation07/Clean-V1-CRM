import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Bot, CheckCircle2, Clock3, ExternalLink, FileText, MessageCircle, Search, ShieldCheck, Sparkles, Users, XCircle } from "lucide-react";
import { AppShell, PageHeading, SkeletonBlock } from "@/components/crm-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Tool = { name: string; description: string; risk: string; requiresApproval: boolean };
type Approval = { id: number; toolName: string; risk: string; status: string; input: unknown; requestedAt: string };
type WhatsappMessage = { id: number; leadId: number | null; direction: string; status: string; phone: string; messageType: string; body: string; createdAt: string };
type Enrichment = { companyName: string; website?: string; location?: string; sources: Array<{ title: string; url: string; content: string; score: number | null }>; socialProfiles: string[]; contactEvidence: Array<{ title: string; url: string; content: string; score: number | null }>; servicesAndSignals: string[]; rollventoFit?: { category?: string | null; candidates?: Array<{ product?: { model?: string; productName?: string; category?: string }; score?: number; reason?: string }>; questions?: string[] } | null; };
type Candidate = {
  companyName: string;
  contactName?: string;
  phone?: string;
  email?: string;
  website?: string;
  location?: string;
  requirement?: string;
  sourceUrl?: string;
  evidence?: string;
  fitReason?: string;
  qualification?: string;
  duplicate?: { id: number; companyName: string } | null;
  importable?: boolean;
};

type ProductMatch = {
  product?: {
    id?: string;
    model?: string;
    productName?: string;
    category?: string;
    family?: string;
    shortDescription?: string;
    power?: string | null;
    torque?: string | null;
    voltage?: string | null;
    capacityKg?: number | null;
    keySpecifications?: Array<{ label?: string; value?: string | number; unit?: string | null }>;
    features?: string[];
  };
  score?: number | null;
  reason?: string;
};

function isProductSearchResult(value: unknown): value is { ok: true; tool: "search_products"; data: ProductMatch[] } {
  if (!value || typeof value !== "object") return false;
  const result = value as { ok?: boolean; tool?: string; data?: unknown };
  return result.ok === true && result.tool === "search_products" && Array.isArray(result.data);
}

function isCampaignResult(value: unknown): value is { ok: true; data: { candidates?: Candidate[]; discovered?: number; newCandidates?: number; query?: string } } {
  if (!value || typeof value !== "object") return false;
  const data = (value as { data?: unknown }).data;
  return Boolean((value as { ok?: boolean }).ok && data && typeof data === "object" && Array.isArray((data as { candidates?: unknown }).candidates));
}

export function NovaCommandCenter() {
  const [tools, setTools] = useState<Tool[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [command, setCommand] = useState("");
  const [searchIntent, setSearchIntent] = useState<"channel" | "buyer" | "any">("channel");
  const [includeDirectories, setIncludeDirectories] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [running, setRunning] = useState(false);
  const [enrichment, setEnrichment] = useState<Record<string, Enrichment>>({});
  const [loading, setLoading] = useState(true);
  const [salesLeadId, setSalesLeadId] = useState("");
  const [salesRequirement, setSalesRequirement] = useState("");
  const [salesModel, setSalesModel] = useState("");
  const [salesQty, setSalesQty] = useState("1");
  const [salesPrice, setSalesPrice] = useState("");
  const [salesDiscount, setSalesDiscount] = useState("0");
  const [whatsappQuotationId, setWhatsappQuotationId] = useState("");
  const [followupLeadId, setFollowupLeadId] = useState("");
  const [followupDate, setFollowupDate] = useState("");
  const [followupNote, setFollowupNote] = useState("");
  const [inbox, setInbox] = useState<WhatsappMessage[]>([]);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<WhatsappMessage | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [replyAction, setReplyAction] = useState("");


  async function loadInbox() {
    setInboxLoading(true);
    try {
      const response = await fetch("/api/whatsapp/inbox", { credentials: "include" });
      const data = await response.json();
      setInbox(Array.isArray(data.messages) ? data.messages : []);
    } finally { setInboxLoading(false); }
  }

  async function interpretMessage(message: WhatsappMessage) {
    if (!message.leadId || !message.body) return;
    setSelectedMessage(message);
    setReplyDraft("");
    setReplyAction("");
    setRunning(true);
    try {
      const response = await fetch("/api/nova/execute", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool: "draft_whatsapp_reply", input: { leadId: message.leadId, message: message.body } }),
      });
      const data = await response.json();
      setResult(data);
      if (data.ok && data.data) {
        setReplyDraft(data.data.suggestedReply ?? "");
        setReplyAction(data.data.suggestedNextAction ?? "");
      }
    } finally { setRunning(false); }
  }

  async function loadApprovals() {
    const response = await fetch("/api/nova/approvals?status=Pending", { credentials: "include" });
    if (response.ok) setApprovals((await response.json()).approvals ?? []);
  }

  useEffect(() => {
    Promise.all([
      fetch("/api/nova/tools", { credentials: "include" }).then((r) => r.json()).then((data) => setTools(data.tools ?? [])),
      loadApprovals(),
      loadInbox(),
    ]).finally(() => setLoading(false));
  }, []);

  async function preview(commandText: string) {
    setRunning(true);
    setSelected({});
    const text = commandText.toLowerCase();
    let tool = "search_products";
    let input: Record<string, unknown> = { query: commandText };

    const hunterIntent = /(find|discover|prospect|hunter|distributor|dealer|installer|integrator|supplier|reseller|companies)/i.test(commandText);
    if (hunterIntent) {
      tool = "hunter_run_campaign";
      input = { brief: commandText, maxResults: 15, intent: searchIntent, includeDirectories };
    } else if (text.includes("quotation")) {
      tool = "calculate_quotation_preview";
      input = { items: [], taxRate: 18 };
    } else if (text.includes("lead")) {
      tool = "list_leads";
      input = { search: commandText };
    }

    try {
      const response = await fetch("/api/nova/execute", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool, input }),
      });
      setResult(await response.json());
      await loadApprovals();
    } finally {
      setRunning(false);
    }
  }

  async function enrichCandidate(candidate: Candidate) {
    setRunning(true);
    try {
      const response = await fetch("/api/nova/execute", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool: "hunter_enrich_prospect",
          input: {
            companyName: candidate.companyName,
            website: candidate.website,
            location: candidate.location,
            requirement: candidate.requirement,
            productHint: candidate.requirement,
          },
        }),
      });
      const data = await response.json();
      if (data.ok && data.data) setEnrichment((current) => ({ ...current, [candidate.companyName]: data.data }));
      else setResult(data);
    } finally {
      setRunning(false);
    }
  }

  async function requestLead(candidate: Candidate) {
    const response = await fetch("/api/nova/execute", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tool: "hunter_create_lead",
        input: {
          companyName: candidate.companyName,
          contactName: candidate.contactName,
          phone: candidate.phone,
          email: candidate.email,
          website: candidate.website,
          location: candidate.location,
          requirement: candidate.requirement,
          sourceUrl: candidate.sourceUrl,
          evidence: candidate.evidence,
          fitReason: candidate.fitReason,
          enrichment: enrichment[candidate.companyName] ?? null,
        },
      }),
    });
    const data = await response.json();
    setResult(data);
    await loadApprovals();
  }

  async function requestSelectedLeads() {
    const campaign = isCampaignResult(result) ? result.data.candidates ?? [] : [];
    const chosen = campaign.filter((candidate) => selected[candidate.companyName] && candidate.importable && !candidate.duplicate);
    if (!chosen.length) return;

    setRunning(true);
    try {
      for (const candidate of chosen) await requestLead(candidate);
      setSelected({});
      await loadApprovals();
    } finally {
      setRunning(false);
    }
  }

  async function executeNova(tool: string, input: unknown) {
    setRunning(true);
    try {
      const response = await fetch("/api/nova/execute", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool, input }),
      });
      setResult(await response.json());
      await loadApprovals();
    } finally { setRunning(false); }
  }

  async function prepareSalesQuotation() {
    setRunning(true);
    try {
      const response = await fetch("/api/nova/execute", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool: "sales_prepare_quotation",
          input: {
            leadId: Number(salesLeadId),
            requirement: salesRequirement,
            productModel: salesModel || undefined,
            quantity: Number(salesQty),
            unitPrice: salesPrice === "" ? undefined : Number(salesPrice),
            discount: Number(salesDiscount),
            taxRate: 18,
          },
        }),
      });
      setResult(await response.json());
      await loadApprovals();
    } finally {
      setRunning(false);
    }
  }

  async function requestQuotationFromResult() {
    if (!result || typeof result !== "object") return;
    const data = (result as { data?: any }).data;
    if (!data?.readyForQuotation || !data?.lead?.id || !data?.item) return;
    setRunning(true);
    try {
      const response = await fetch("/api/nova/execute", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool: "create_quotation",
          input: {
            leadId: data.lead.id,
            items: [data.item],
            taxRate: data.calculation?.totals?.taxRate ?? 18,
          },
        }),
      });
      setResult(await response.json());
      await loadApprovals();
    } finally {
      setRunning(false);
    }
  }

  async function requestGenerateQuotation() {
    if (!result || typeof result !== "object") return;
    const data = (result as { data?: any }).data;
    if (!data?.id || !String(data?.quotationNumber ?? "").startsWith("RV-")) return;
    setRunning(true);
    try {
      const response = await fetch("/api/nova/execute", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool: "generate_quotation", input: { quotationId: data.id } }),
      });
      setResult(await response.json());
      await loadApprovals();
    } finally {
      setRunning(false);
    }
  }

  async function decide(id: number, action: "approve" | "reject") {
    const response = await fetch(`/api/nova/approvals/${id}/${action}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
    setResult(await response.json());
    await loadApprovals();
  }

  const campaign = isCampaignResult(result) ? result.data.candidates ?? [] : [];
  const productMatches = isProductSearchResult(result) ? result.data : null;
  const selectedCount = campaign.filter((candidate) => selected[candidate.companyName] && candidate.importable && !candidate.duplicate).length;

  return <AppShell>
    <div className="mb-6"><Link href="/" className="inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Back to dashboard</Link></div>
    <PageHeading eyebrow="NOVA / AI Business OS" title="Command Center" description="One place to operate CRM, sales documents and the AI workforce." />

    <section className="rounded-2xl border border-border bg-card p-5 md:p-7">
      <div className="flex items-start gap-4"><div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Bot className="size-5" /></div><div><h2 className="font-display text-xl font-bold tracking-[-0.04em]">Tell NOVA what you need</h2><p className="mt-1 text-xs text-muted-foreground">HUNTER discovers public prospects and checks them against your CRM. Nothing becomes a lead until you approve it.</p></div></div>
      <div className="mt-5 flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold text-muted-foreground">Looking for</span>
        {([
          ["channel", "Resellers & installers"],
          ["buyer", "End users (factories, warehouses)"],
          ["any", "Anything"],
        ] as Array<["channel" | "buyer" | "any", string]>).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setSearchIntent(value)}
            className={`rounded-lg border px-3 py-1.5 transition-colors ${searchIntent === value
              ? "border-primary bg-primary/10 font-semibold text-foreground"
              : "border-border text-muted-foreground hover:bg-muted/40"}`}
          >{label}</button>
        ))}
        <label className="ml-2 flex items-center gap-1.5 text-muted-foreground">
          <input type="checkbox" checked={includeDirectories} onChange={(e) => setIncludeDirectories(e.target.checked)} />
          Include directory listings
        </label>
      </div>
      <div className="mt-6 flex gap-2"><Input value={command} onChange={(e) => setCommand(e.target.value)} placeholder='Try: "Find rolling shutter motor distributors in UAE"' onKeyDown={(e) => { if (e.key === "Enter" && command.trim()) preview(command.trim()); }} /><Button disabled={running} onClick={() => command.trim() && preview(command.trim())}><Sparkles className="size-4" />{running ? "Researching…" : "Run"}</Button></div>
    </section>

    {campaign.length > 0 && <section className="mt-6 rounded-2xl border border-border bg-card p-5 md:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><div className="flex items-center gap-2"><Users className="size-5 text-primary" /><h2 className="font-display text-lg font-bold">HUNTER results</h2></div><p className="mt-1 text-xs text-muted-foreground">{campaign.length} candidates discovered. Select suitable new prospects to send to the approval queue.</p></div>
        <Button disabled={running || selectedCount === 0} onClick={requestSelectedLeads}><ShieldCheck className="size-4" />Request approval ({selectedCount})</Button>
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {campaign.map((candidate) => {
          const duplicate = Boolean(candidate.duplicate);
          const selectable = Boolean(candidate.importable && !duplicate);
          return <article key={candidate.companyName} className="rounded-xl border border-border p-4">
            <div className="flex gap-3">
              {selectable && <input type="checkbox" checked={Boolean(selected[candidate.companyName])} onChange={(e) => setSelected((current) => ({ ...current, [candidate.companyName]: e.target.checked }))} className="mt-1 size-4 rounded border-border" />}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div><h3 className="font-display font-bold">{candidate.companyName}</h3>{candidate.location && <p className="mt-0.5 text-[11px] text-muted-foreground">{candidate.location}</p>}</div>
                  <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${duplicate ? "bg-muted text-muted-foreground" : candidate.qualification === "Research-ready" ? "bg-emerald-500/10 text-emerald-700" : "bg-amber-500/10 text-amber-700"}`}>{duplicate ? "Already in CRM" : candidate.qualification ?? "Unqualified"}</span>
                </div>
                {candidate.website && <a href={candidate.website} target="_blank" rel="noreferrer" className="mt-3 inline-flex max-w-full items-center gap-1 truncate text-xs font-semibold text-primary hover:underline">{candidate.website}<ExternalLink className="size-3 shrink-0" /></a>}
                {candidate.evidence && <p className="mt-3 line-clamp-4 text-xs leading-relaxed text-muted-foreground">{candidate.evidence}</p>}
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="outline" disabled={running} onClick={() => enrichCandidate(candidate)}><Sparkles className="size-3" />{enrichment[candidate.companyName] ? "Enriched" : "Enrich"}</Button>
                  {candidate.sourceUrl && <a href={candidate.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-muted px-2.5 py-1.5 text-[10px] font-semibold"><Search className="size-3" />Source</a>}
                  {duplicate && <span className="rounded-lg bg-muted px-2.5 py-1.5 text-[10px]">CRM #{candidate.duplicate?.id}</span>}
                  {!duplicate && candidate.importable && <span className="rounded-lg bg-emerald-500/10 px-2.5 py-1.5 text-[10px] font-semibold text-emerald-700">Eligible for approval</span>}
                  {!candidate.importable && <span className="rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-[10px] font-semibold text-amber-700">Needs contact/website data</span>}
                </div>
                {enrichment[candidate.companyName] && <div className="mt-4 rounded-lg bg-muted/40 p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Research enrichment</div>
                  <div className="mt-2 grid gap-3 md:grid-cols-2">
                    <div>
                      <div className="text-[10px] font-semibold">Services & signals</div>
                      <ul className="mt-1 space-y-1 text-[10px] text-muted-foreground">
                        {enrichment[candidate.companyName].servicesAndSignals.slice(0, 3).map((item, index) => <li key={index}>{item}</li>)}
                      </ul>
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold">Rollvento catalogue fit</div>
                      {enrichment[candidate.companyName].rollventoFit?.candidates?.length ? <div className="mt-1 space-y-1">{(enrichment[candidate.companyName].rollventoFit?.candidates ?? []).slice(0, 3).map((fit, index) => <div key={index} className="text-[10px]"><span className="font-semibold">{fit.product?.model}</span> — {fit.product?.productName}</div>)}</div> : <div className="mt-1 text-[10px] text-muted-foreground">No deterministic catalogue match yet.</div>}
                    </div>
                  </div>
                  {enrichment[candidate.companyName].socialProfiles.length > 0 && <div className="mt-2 text-[10px] text-muted-foreground">Social profiles found: {enrichment[candidate.companyName].socialProfiles.length}</div>}
                  {enrichment[candidate.companyName].sources.length > 0 && <div className="mt-2 text-[10px] text-muted-foreground">{enrichment[candidate.companyName].sources.length} research sources collected.</div>}
                </div>}
              </div>
            </div>
          </article>;
        })}
      </div>
    </section>}

    {result !== null && campaign.length === 0 && <section className="mt-6 rounded-xl border border-border bg-card p-5">
      {productMatches ? <div>
        <div className="mb-4">
          <h2 className="font-display text-lg font-bold">Matched catalogue products</h2>
          <p className="mt-1 text-xs text-muted-foreground">{productMatches.length} {productMatches.length === 1 ? "product" : "products"} matched your search.</p>
        </div>
        {productMatches.length === 0 ? <p className="rounded-xl bg-muted/40 p-4 text-xs text-muted-foreground">No matching products were found. Try including the motor type, capacity, or application.</p> : <div className="grid gap-4 lg:grid-cols-2">
          {productMatches.map((match, index) => {
            const product = match.product;
            if (!product) return null;
            const specifications = product.keySpecifications?.slice(0, 4) ?? [];
            return <article key={product.id ?? product.model ?? index} className="rounded-xl border border-border p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="font-display font-bold">{product.productName ?? product.model ?? "Catalogue product"}</h3>
                  {product.model && product.productName && <p className="mt-1 text-xs font-semibold text-primary">{product.model}</p>}
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {product.category && <span className="rounded-full bg-muted px-2 py-1 text-[10px]">{product.category}</span>}
                {product.family && <span className="rounded-full bg-muted px-2 py-1 text-[10px]">{product.family}</span>}
              </div>
              {product.shortDescription && <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{product.shortDescription}</p>}
              {specifications.length > 0 && <dl className="mt-4 grid grid-cols-2 gap-2">
                {specifications.map((spec, specIndex) => <div key={spec.label ?? specIndex} className="rounded-lg bg-muted/40 p-2">
                  <dt className="text-[10px] text-muted-foreground">{spec.label ?? "Specification"}</dt>
                  <dd className="mt-0.5 text-xs font-semibold">{spec.value}{spec.unit ? ` ${spec.unit}` : ""}</dd>
                </div>)}
              </dl>}
              {match.reason && <p className="mt-3 text-[11px] text-muted-foreground">{match.reason}</p>}
              {product.features && product.features.length > 0 && <div className="mt-3">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Key features</div>
                <ul className="mt-1 list-inside list-disc space-y-1 text-[11px] text-muted-foreground">
                  {product.features.slice(0, 3).map((feature, featureIndex) => <li key={featureIndex}>{feature}</li>)}
                </ul>
              </div>}
            </article>;
          })}
        </div>}
      </div> : <pre className="max-h-72 overflow-auto rounded-xl bg-muted/60 p-4 text-xs">{JSON.stringify(result, null, 2)}</pre>}
      {typeof result === "object" && result !== null && (result as { data?: any }).data?.readyForQuotation && <div className="mt-4"><Button disabled={running} onClick={requestQuotationFromResult}><ShieldCheck className="size-4" />Request quotation approval</Button></div>}
      {typeof result === "object" && result !== null && (result as { data?: any }).data?.status === "Draft" && (result as { data?: any }).data?.quotationNumber && <div className="mt-4"><Button disabled={running} onClick={requestGenerateQuotation}><ShieldCheck className="size-4" />Request PDF generation approval</Button></div>}
      {typeof result === "object" && result !== null && (result as { data?: any }).data?.pdfPath && <div className="mt-4"><a href={(result as { data: any }).data.pdfPath} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-primary hover:bg-muted"><ExternalLink className="size-4" />Open quotation PDF</a></div>}
    </section>}

    <section className="mt-6 rounded-2xl border border-border bg-card p-5 md:p-7">
      <div className="flex items-start gap-3"><div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><FileText className="size-5" /></div><div><h2 className="font-display text-lg font-bold">SALES — quotation preparation</h2><p className="mt-1 text-xs text-muted-foreground">Use the deterministic Rollvento catalogue to identify the product. Pricing is always supplied by an authorized user; quotation creation remains approval-gated.</p></div></div>
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <Input value={salesLeadId} onChange={(e) => setSalesLeadId(e.target.value)} placeholder="Lead ID" />
        <Input value={salesRequirement} onChange={(e) => setSalesRequirement(e.target.value)} placeholder="Customer requirement" />
        <Input value={salesModel} onChange={(e) => setSalesModel(e.target.value)} placeholder="Exact model (optional)" />
        <Input value={salesQty} onChange={(e) => setSalesQty(e.target.value)} placeholder="Qty" type="number" min="1" />
        <Input value={salesPrice} onChange={(e) => setSalesPrice(e.target.value)} placeholder="Unit price (INR)" type="number" min="0" />
        <Input value={salesDiscount} onChange={(e) => setSalesDiscount(e.target.value)} placeholder="Discount %" type="number" min="0" max="100" />
      </div>
      <div className="mt-4"><Button disabled={running || !salesLeadId || (!salesRequirement && !salesModel)} onClick={prepareSalesQuotation}><FileText className="size-4" />{running ? "Preparing…" : "Prepare quotation"}</Button></div>
    </section>

    <section className="mt-6 rounded-2xl border border-border bg-card p-5 md:p-7">
      <div className="flex items-start gap-3"><div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><MessageCircle className="size-5" /></div><div><h2 className="font-display text-lg font-bold">SALES — WhatsApp & follow-up</h2><p className="mt-1 text-xs text-muted-foreground">Prepare customer messages, request approval before sending, and schedule the next sales follow-up.</p></div></div>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <div className="space-y-2"><label className="text-xs font-semibold">Quotation ID</label><Input value={whatsappQuotationId} onChange={(e) => setWhatsappQuotationId(e.target.value)} placeholder="Quotation ID" type="number" /><Button variant="outline" disabled={running || !whatsappQuotationId} onClick={() => executeNova("prepare_whatsapp_quotation_message",{quotationId:Number(whatsappQuotationId)})}><MessageCircle className="size-4" />Prepare WhatsApp message</Button></div>
        <div className="space-y-2"><label className="text-xs font-semibold">Follow-up</label><Input value={followupLeadId} onChange={(e) => setFollowupLeadId(e.target.value)} placeholder="Lead ID" type="number" /><div className="flex gap-2"><Input value={followupDate} onChange={(e) => setFollowupDate(e.target.value)} type="date" /><Input value={followupNote} onChange={(e) => setFollowupNote(e.target.value)} placeholder="Follow-up note" /></div><Button variant="outline" disabled={running || !followupLeadId || !followupDate} onClick={() => executeNova("schedule_sales_followup",{leadId:Number(followupLeadId),date:followupDate,note:followupNote})}><Clock3 className="size-4" />Request follow-up approval</Button></div>
      </div>
    </section>

    <section className="mt-6 rounded-2xl border border-border bg-card p-5 md:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><div className="flex items-center gap-2"><MessageCircle className="size-5 text-primary" /><h2 className="font-display text-lg font-bold">WhatsApp Inbox</h2></div><p className="mt-1 text-xs text-muted-foreground">Review incoming messages, draft a deterministic reply, then request human approval before sending.</p></div>
        <Button size="sm" variant="outline" disabled={inboxLoading} onClick={loadInbox}>{inboxLoading ? "Refreshing…" : "Refresh inbox"}</Button>
      </div>
      {inbox.length === 0 ? <p className="mt-4 rounded-xl bg-muted/40 p-4 text-xs text-muted-foreground">{inboxLoading ? "Loading messages…" : "No WhatsApp messages found."}</p> : <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="max-h-96 space-y-2 overflow-auto">
          {inbox.map((message) => <button key={message.id} type="button" onClick={() => { setSelectedMessage(message); setReplyDraft(""); setReplyAction(""); }} className={`w-full rounded-xl border p-3 text-left ${selectedMessage?.id === message.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"}`}>
            <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold">{message.phone}</span><span className="text-[10px] text-muted-foreground">{message.direction} · {message.status}</span></div>
            <p className="mt-2 line-clamp-3 text-xs">{message.body || `[${message.messageType} message]`}</p><p className="mt-2 text-[10px] text-muted-foreground">{new Date(message.createdAt).toLocaleString()}</p>
          </button>)}
        </div>
        <div className="rounded-xl border border-border p-4">
          {selectedMessage ? <>
            <div className="text-xs font-semibold">Selected message</div>
            <p className="mt-2 whitespace-pre-wrap rounded-lg bg-muted/40 p-3 text-xs">{selectedMessage.body || `[${selectedMessage.messageType} message]`}</p>
            {selectedMessage.direction === "Inbound" && <Button className="mt-3" size="sm" variant="outline" disabled={running || !selectedMessage.leadId || !selectedMessage.body} onClick={() => interpretMessage(selectedMessage)}><Sparkles className="size-3" />Draft suggested reply</Button>}
            {replyAction && <p className="mt-3 text-[11px] text-muted-foreground"><strong>Suggested next action:</strong> {replyAction}</p>}
            {replyDraft && <>
              <label className="mt-4 block text-xs font-semibold" htmlFor="nova-whatsapp-reply">Suggested reply (editable)</label>
              <textarea id="nova-whatsapp-reply" value={replyDraft} onChange={(event) => setReplyDraft(event.target.value)} rows={5} className="mt-2 w-full resize-y rounded-lg border border-border bg-background p-3 text-xs" />
              <Button className="mt-3" size="sm" disabled={running || !selectedMessage.leadId || !replyDraft.trim()} onClick={() => executeNova("send_whatsapp_text", { leadId: selectedMessage.leadId, phone: selectedMessage.phone, message: replyDraft })}><ShieldCheck className="size-3" />Request approval to send</Button>
              <p className="mt-2 text-[10px] text-muted-foreground">Nothing is sent until an authorized user approves the request below.</p>
            </>}
          </> : <p className="text-xs text-muted-foreground">Select a message to review it and prepare a reply.</p>}
        </div>
      </div>}
    </section>

    {approvals.length > 0 && <section className="mt-6 rounded-2xl border border-amber-500/30 bg-card p-5 md:p-7">
      <div className="mb-4 flex items-center gap-2"><ShieldCheck className="size-5 text-amber-600" /><h2 className="font-display text-lg font-bold">Pending approvals</h2><span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold">{approvals.length}</span></div>
      <div className="space-y-3">
        {approvals.map((approval) => <div key={approval.id} className="rounded-xl border border-border p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><div className="font-mono text-xs font-semibold">{approval.toolName}</div><div className="mt-1 text-[11px] text-muted-foreground">Risk: {approval.risk} · Request #{approval.id}</div></div>
            <div className="flex gap-2"><Button size="sm" onClick={() => decide(approval.id, "approve")}><CheckCircle2 className="size-4" />Approve & run</Button><Button size="sm" variant="outline" onClick={() => decide(approval.id, "reject")}><XCircle className="size-4" />Reject</Button></div>
          </div>
          <pre className="mt-3 max-h-32 overflow-auto rounded-lg bg-muted/50 p-3 text-[10px]">{JSON.stringify(approval.input, null, 2)}</pre>
        </div>)}
      </div>
    </section>}

    <div className="mt-6 grid gap-6 lg:grid-cols-3">
      <section className="rounded-xl border border-border bg-card p-5"><div className="mb-5 flex items-center gap-2"><Users className="size-4 text-primary" /><h2 className="font-display font-bold">HUNTER</h2></div><p className="text-xs leading-relaxed text-muted-foreground">Web discovery → normalization → CRM duplicate detection → evidence qualification → approval queue.</p><div className="mt-5 flex items-center gap-2 text-xs font-semibold text-primary"><Search className="size-4" />Prospecting workspace ready</div></section>
      <section className="rounded-xl border border-border bg-card p-5"><div className="mb-5 flex items-center gap-2"><FileText className="size-4 text-primary" /><h2 className="font-display font-bold">Commercial</h2></div><p className="text-xs leading-relaxed text-muted-foreground">Quotation → Sales Order → Delivery Challan → Invoice is exposed as controlled business tools with persistent approval.</p><div className="mt-5 flex items-center gap-2 text-xs font-semibold text-primary"><ShieldCheck className="size-4" />Approval protected</div></section>
      <section className="rounded-xl border border-border bg-card p-5"><div className="mb-5 flex items-center gap-2"><Bot className="size-4 text-primary" /><h2 className="font-display font-bold">Tool registry</h2></div>{loading ? <SkeletonBlock className="h-16 w-full" /> : <div className="space-y-2">{tools.map((tool) => <div key={tool.name} className="flex items-center justify-between rounded-lg bg-muted/45 px-3 py-2"><span className="font-mono text-[10px]">{tool.name}</span><span className="text-[10px] text-muted-foreground">{tool.requiresApproval ? "approval" : tool.risk}</span></div>)}</div>}</section>
    </div>
  </AppShell>;
}
