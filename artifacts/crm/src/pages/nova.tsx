import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Bot, CheckCircle2, FileText, Search, ShieldCheck, Sparkles, Users, XCircle } from "lucide-react";
import { AppShell, PageHeading, SkeletonBlock } from "@/components/crm-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Tool = { name: string; description: string; risk: string; requiresApproval: boolean };
type Approval = { id: number; toolName: string; risk: string; status: string; input: unknown; requestedAt: string };

export function NovaCommandCenter() {
  const [tools, setTools] = useState<Tool[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [command, setCommand] = useState("");
  const [result, setResult] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  async function loadApprovals() {
    const response = await fetch("/api/nova/approvals?status=Pending", { credentials: "include" });
    if (response.ok) setApprovals((await response.json()).approvals ?? []);
  }

  useEffect(() => {
    Promise.all([
      fetch("/api/nova/tools", { credentials: "include" }).then((r) => r.json()).then((data) => setTools(data.tools ?? [])),
      loadApprovals(),
    ]).finally(() => setLoading(false));
  }, []);

  async function preview(commandText: string) {
    const text = commandText.toLowerCase();
    let tool = "search_products";
    let input: Record<string, unknown> = { query: commandText };

    const hunterIntent = /(find|discover|prospect|hunter|distributor|dealer|installer|integrator|supplier|reseller|companies)/i.test(commandText);
    if (hunterIntent) {
      tool = "hunter_run_campaign";
      input = { brief: commandText, maxResults: 15 };
    } else if (text.includes("quotation")) {
      tool = "calculate_quotation_preview";
      input = { items: [], taxRate: 18 };
    } else if (text.includes("lead")) {
      tool = "list_leads";
      input = { search: commandText };
    }

    const response = await fetch("/api/nova/execute", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool, input }),
    });
    setResult(await response.json());
    await loadApprovals();
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

  return <AppShell>
    <div className="mb-6"><Link href="/" className="inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Back to dashboard</Link></div>
    <PageHeading eyebrow="NOVA / AI Business OS" title="Command Center" description="One place to operate CRM, sales documents and the AI workforce." />

    <section className="rounded-2xl border border-border bg-card p-5 md:p-7">
      <div className="flex items-start gap-4"><div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Bot className="size-5" /></div><div><h2 className="font-display text-xl font-bold tracking-[-0.04em]">Tell NOVA what you need</h2><p className="mt-1 text-xs text-muted-foreground">NOVA can now run read-only HUNTER campaigns from a natural-language prospecting brief. Lead creation still requires approval.</p></div></div>
      <div className="mt-6 flex gap-2"><Input value={command} onChange={(e) => setCommand(e.target.value)} placeholder='Try: "Find rolling shutter motor distributors in UAE"' onKeyDown={(e) => { if (e.key === "Enter" && command.trim()) preview(command.trim()); }} /><Button onClick={() => command.trim() && preview(command.trim())}><Sparkles className="size-4" />Run</Button></div>
      {result !== null && <pre className="mt-4 max-h-96 overflow-auto rounded-xl bg-muted/60 p-4 text-xs">{JSON.stringify(result, null, 2)}</pre>}
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
      <section className="rounded-xl border border-border bg-card p-5"><div className="mb-5 flex items-center gap-2"><Users className="size-4 text-primary" /><h2 className="font-display font-bold">HUNTER</h2></div><p className="text-xs leading-relaxed text-muted-foreground">Web discovery → normalization → CRM duplicate detection → evidence qualification. No outreach and no automatic lead creation.</p><div className="mt-5 flex items-center gap-2 text-xs font-semibold text-primary"><Search className="size-4" />Research pipeline ready</div></section>
      <section className="rounded-xl border border-border bg-card p-5"><div className="mb-5 flex items-center gap-2"><FileText className="size-4 text-primary" /><h2 className="font-display font-bold">Commercial</h2></div><p className="text-xs leading-relaxed text-muted-foreground">Quotation → Sales Order → Delivery Challan → Invoice is exposed as controlled business tools with persistent approval.</p><div className="mt-5 flex items-center gap-2 text-xs font-semibold text-primary"><ShieldCheck className="size-4" />Approval protected</div></section>
      <section className="rounded-xl border border-border bg-card p-5"><div className="mb-5 flex items-center gap-2"><Bot className="size-4 text-primary" /><h2 className="font-display font-bold">Tool registry</h2></div>{loading ? <SkeletonBlock className="h-16 w-full" /> : <div className="space-y-2">{tools.map((tool) => <div key={tool.name} className="flex items-center justify-between rounded-lg bg-muted/45 px-3 py-2"><span className="font-mono text-[10px]">{tool.name}</span><span className="text-[10px] text-muted-foreground">{tool.requiresApproval ? "approval" : tool.risk}</span></div>)}</div>}</section>
    </div>
  </AppShell>;
}
