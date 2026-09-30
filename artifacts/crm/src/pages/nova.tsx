import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Bot, CheckCircle2, FileText, Search, ShieldCheck, Sparkles } from "lucide-react";
import { AppShell, PageHeading, SkeletonBlock } from "@/components/crm-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Tool = { name: string; description: string; risk: string; requiresApproval: boolean };

export function NovaCommandCenter() {
  const [tools, setTools] = useState<Tool[]>([]);
  const [command, setCommand] = useState("");
  const [result, setResult] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/nova/tools", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => setTools(data.tools ?? []))
      .finally(() => setLoading(false));
  }, []);

  async function preview(commandText: string) {
    const text = commandText.toLowerCase();
    let tool = "search_products";
    let input: Record<string, unknown> = { query: commandText };
    if (text.includes("quotation")) {
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
  }

  return <AppShell>
    <div className="mb-6"><Link href="/" className="inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Back to dashboard</Link></div>
    <PageHeading eyebrow="NOVA / AI Business OS" title="Command Center" description="One place to operate CRM, sales documents and the future AI workforce." />
    <section className="rounded-2xl border border-border bg-card p-5 md:p-7">
      <div className="flex items-start gap-4"><div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Bot className="size-5" /></div><div><h2 className="font-display text-xl font-bold tracking-[-0.04em]">Tell NOVA what you need</h2><p className="mt-1 text-xs text-muted-foreground">The command layer will progressively connect to CRM, quotations, operations, marketing and lead generation.</p></div></div>
      <div className="mt-6 flex gap-2"><Input value={command} onChange={(e) => setCommand(e.target.value)} placeholder='Try: "Find RV 600" or "Show my leads"' onKeyDown={(e) => { if (e.key === "Enter" && command.trim()) preview(command.trim()); }} /><Button onClick={() => command.trim() && preview(command.trim())}><Sparkles className="size-4" />Run</Button></div>
      {result !== null && <pre className="mt-4 max-h-72 overflow-auto rounded-xl bg-muted/60 p-4 text-xs">{JSON.stringify(result, null, 2)}</pre>}
    </section>
    <div className="mt-6 grid gap-6 lg:grid-cols-3">
      <section className="rounded-xl border border-border bg-card p-5"><div className="mb-5 flex items-center gap-2"><Search className="size-4 text-primary" /><h2 className="font-display font-bold">Knowledge</h2></div><p className="text-xs leading-relaxed text-muted-foreground">NOVA can already query the Rollvento catalogue, identify exact models and deterministically match requirements.</p><div className="mt-5 flex items-center gap-2 text-xs font-semibold text-primary"><CheckCircle2 className="size-4" />Catalogue protected</div></section>
      <section className="rounded-xl border border-border bg-card p-5"><div className="mb-5 flex items-center gap-2"><FileText className="size-4 text-primary" /><h2 className="font-display font-bold">Commercial</h2></div><p className="text-xs leading-relaxed text-muted-foreground">Quotation → Sales Order → Delivery Challan → Invoice is being exposed as controlled business tools.</p><div className="mt-5 flex items-center gap-2 text-xs font-semibold text-primary"><ShieldCheck className="size-4" />Approval protected</div></section>
      <section className="rounded-xl border border-border bg-card p-5"><div className="mb-5 flex items-center gap-2"><Bot className="size-4 text-primary" /><h2 className="font-display font-bold">Tool registry</h2></div>{loading ? <SkeletonBlock className="h-16 w-full" /> : <div className="space-y-2">{tools.map((tool) => <div key={tool.name} className="flex items-center justify-between rounded-lg bg-muted/45 px-3 py-2"><span className="font-mono text-[10px]">{tool.name}</span><span className="text-[10px] text-muted-foreground">{tool.requiresApproval ? "approval" : tool.risk}</span></div>)}</div>}</section>
    </div>
  </AppShell>;
}
