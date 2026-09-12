import { useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  ActivityType,
  getGetDashboardSummaryQueryKey,
  getGetLeadQueryKey,
  getListFollowUpsQueryKey,
  getListLeadActivitiesQueryKey,
  getListLeadsQueryKey,
  getListCustomersQueryKey,
  LeadSource,
  LeadStatus,
  ListLeadsSort,
  type Lead,
  useCreateLeadActivity,
  useDeleteLead,
  useGetLead,
  useGetDashboardSummary,
  useListCustomers,
  useListFollowUps,
  useListLeadActivities,
  useListLeads,
  useUpdateLead,
} from '@workspace/api-client-react';
import { useAuth } from '@workspace/replit-auth-web';
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarCheck2,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Filter,
  Mail,
  Phone,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AppShell, DateLabel, EmptyState, LeadDialog, Money, PageHeading, QueryError, SectionLabel, SkeletonBlock, StatusPill } from '@/components/crm-ui';
import { useToast } from '@/hooks/use-toast';

export function Login() {
  const { login } = useAuth();
  return <div className="min-h-[100dvh] overflow-hidden bg-sidebar text-sidebar-foreground"><div className="absolute left-[-12%] top-[-18%] size-[520px] rounded-full border border-sidebar-primary/15" /><div className="absolute bottom-[-14%] right-[-7%] size-[420px] rounded-full border border-sidebar-primary/10" /><div className="relative mx-auto flex min-h-[100dvh] max-w-6xl flex-col justify-between px-6 py-7 md:px-12 md:py-9">
    <div className="flex items-center gap-3"><span className="brand-mark"><span /></span><span className="font-display text-sm font-bold tracking-[-0.03em]">clean v1 <span className="font-mono text-[10px] font-normal tracking-[0.14em] text-sidebar-primary">CRM</span></span></div>
    <div className="grid items-center gap-14 py-20 md:grid-cols-[1.05fr_0.95fr] md:gap-24"><div><p className="mb-5 font-mono text-[10px] uppercase tracking-[0.24em] text-sidebar-primary">A calmer sales rhythm</p><h1 className="max-w-xl font-display text-5xl font-bold leading-[0.96] tracking-[-0.07em] md:text-7xl">Keep the next conversation <span className="text-sidebar-primary">close.</span></h1><p className="mt-7 max-w-md text-base leading-relaxed text-sidebar-foreground/65">Clean V1 gives small teams the context they need, without the noise they do not.</p><Button onClick={login} data-testid="button-login" className="mt-9 h-11 rounded-lg bg-sidebar-primary px-6 text-sm font-bold text-sidebar-primary-foreground hover:brightness-105">Log in to your workspace <ArrowUpRight className="size-4" /></Button></div><div className="relative"><div className="absolute -inset-5 rounded-[28px] bg-sidebar-primary/5 blur-2xl" /><div className="relative rounded-2xl border border-sidebar-border bg-sidebar-accent/70 p-5 shadow-2xl md:p-7"><div className="mb-8 flex items-center justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[0.18em] text-sidebar-foreground/45">Your daily view</p><p className="mt-2 font-display text-lg font-bold">The next right thing</p></div><div className="flex size-9 items-center justify-center rounded-full bg-sidebar-primary font-mono text-xs font-bold text-sidebar-primary-foreground">V1</div></div><div className="mb-3 flex items-center justify-between text-xs"><span className="text-sidebar-foreground/55">Pipeline health</span><span className="font-mono text-sidebar-primary">steady</span></div><div className="mb-7 h-2 overflow-hidden rounded-full bg-sidebar-border"><div className="h-full w-[72%] rounded-full bg-sidebar-primary" /></div>{['Review your priority queue', 'Prepare the next proposal', 'Close yesterday’s loop'].map((item, index) => <div key={item} className="flex items-center gap-3 border-t border-sidebar-border py-3.5"><div className={`size-2 rounded-full ${index === 0 ? 'bg-sidebar-primary' : 'bg-sidebar-foreground/25'}`} /><span className="flex-1 text-xs text-sidebar-foreground/80">{item}</span><span className="font-mono text-[10px] text-sidebar-foreground/40">{index === 0 ? 'Next' : index === 1 ? 'Soon' : 'Later'}</span></div>)}</div></div></div>
    <div className="flex flex-col gap-2 border-t border-sidebar-border pt-5 text-[11px] text-sidebar-foreground/45 sm:flex-row sm:justify-between"><span>Built for the conversations that matter.</span><span className="font-mono tracking-[0.12em]">V1 / 2025</span></div>
  </div></div>;
}

export function Dashboard() {
  const query = useGetDashboardSummary();
  const summary = query.data;
  return <AppShell><PageHeading eyebrow="Monday, October 21" title="Good morning, team." description="A clear view of what needs attention today." action={<Link href="/leads" data-testid="link-dashboard-all-leads" className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold transition-colors hover:border-primary/40 hover:bg-accent">View all leads <ArrowUpRight className="size-4" /></Link>} />
    {query.isLoading ? <DashboardSkeleton /> : query.isError ? <QueryError message="Your overview is taking a moment to respond." /> : summary ? <><div className="grid grid-cols-2 gap-3 md:grid-cols-5 md:gap-4">{[
      ['Total leads', summary.totalLeads, 'all conversations', 'text-foreground'],
      ['New this week', summary.newLeads, 'fresh opportunities', 'text-primary'],
      ['Due today', summary.followUpsToday, 'follow-ups to make', 'text-accent-foreground'],
      ['Won', summary.wonLeads, 'converted leads', 'text-[#39715e]'],
      ['Lost', summary.lostLeads, 'closed out', 'text-destructive'],
    ].map(([label, value, caption, color], index) => <div key={String(label)} className={`stat-card ${index === 1 ? 'stat-card-highlight' : ''}`} data-testid={`card-stat-${String(label).toLowerCase().replaceAll(' ', '-')}`}><div className="mb-5 flex items-start justify-between"><span className="text-xs font-medium text-muted-foreground">{label}</span><span className={`font-mono text-[10px] ${color}`}>{index === 1 ? '↑' : index === 2 ? '!' : '—'}</span></div><div className={`font-display text-3xl font-bold tracking-[-0.07em] ${color}`} data-testid={`text-stat-${String(label).toLowerCase().replaceAll(' ', '-')}`}>{value}</div><p className="mt-1 text-[11px] text-muted-foreground">{caption}</p></div>)}</div>
      <div className="mt-8 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]"><section className="rounded-xl border border-border bg-card p-5 md:p-6"><div className="mb-5 flex items-center justify-between"><SectionLabel count={summary.recentLeads?.length || 0}>Recent leads</SectionLabel><Link href="/leads" data-testid="link-dashboard-recent-leads" className="text-xs font-semibold text-primary hover:underline">See all</Link></div>{summary.recentLeads?.length ? <div className="divide-y divide-border">{summary.recentLeads.slice(0, 5).map((lead) => <LeadRow key={lead.id} lead={lead} />)}</div> : <EmptyState icon={UsersRound} title="Your board is quiet" description="Add your first lead and give the next conversation somewhere to land." action={<Link href="/leads" data-testid="link-dashboard-empty-leads" className="text-xs font-semibold text-primary">Add a lead <ArrowUpRight className="ml-1 inline size-3.5" /></Link>} />}</section>
        <section className="rounded-xl border border-border bg-card p-5 md:p-6"><div className="mb-5 flex items-center justify-between"><SectionLabel count={summary.todaysFollowUps?.length || 0}>Today's follow-ups</SectionLabel><Link href="/follow-ups" data-testid="link-dashboard-follow-ups" className="text-xs font-semibold text-primary hover:underline">Open list</Link></div>{summary.todaysFollowUps?.length ? <div className="space-y-2">{summary.todaysFollowUps.map((followUp) => <FollowUpRow key={followUp.id} item={followUp} compact />)}</div> : <EmptyState icon={CalendarCheck2} title="Nothing due today" description="A little breathing room. Upcoming follow-ups will appear here when it is time." />}</section></div>
    </> : null}
  </AppShell>;
}

export function Leads() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [source, setSource] = useState('');
  const [sort, setSort] = useState<ListLeadsSort>(ListLeadsSort.newest);
  const [dialogOpen, setDialogOpen] = useState(false);
  const params = useMemo(() => ({ search: search || undefined, status: (status || undefined) as LeadStatus | undefined, source: (source || undefined) as LeadSource | undefined, sort }), [search, status, source, sort]);
  const query = useListLeads(params);
  const leads = query.data || [];
  return <AppShell><PageHeading eyebrow="Pipeline" title="Leads" description="The full conversation list, kept tidy." action={<Button onClick={() => setDialogOpen(true)} data-testid="button-open-add-lead"><Plus className="size-4" />Add lead</Button>} /><LeadDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    <div className="mb-5 rounded-xl border border-border bg-card p-3"><div className="flex flex-col gap-3 lg:flex-row"><div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} data-testid="input-search-leads" placeholder="Search company, contact, or requirement" className="border-0 bg-muted/60 pl-9 shadow-none focus-visible:ring-1 focus-visible:ring-primary" /></div><div className="flex flex-wrap gap-2"><FilterSelect testId="select-filter-status" value={status} onChange={setStatus} placeholder="All statuses" options={Object.values(LeadStatus)} /><FilterSelect testId="select-filter-source" value={source} onChange={setSource} placeholder="All sources" options={Object.values(LeadSource)} /><select value={sort} onChange={(e) => setSort(e.target.value as ListLeadsSort)} data-testid="select-sort-leads" className="h-9 rounded-md border border-input bg-background px-3 text-xs font-medium outline-none focus:border-primary"><option value={ListLeadsSort.newest}>Newest first</option><option value={ListLeadsSort.oldest}>Oldest first</option><option value={ListLeadsSort.follow_up}>Follow-up soonest</option></select></div></div></div>
    {query.isLoading ? <ListSkeleton /> : query.isError ? <QueryError message="The lead list could not be loaded." /> : !leads.length ? <EmptyState icon={Search} title={search || status || source ? 'No leads match that' : 'No leads yet'} description={search || status || source ? 'Try a different search or clear the filters.' : 'Start with the next good conversation. Your pipeline will grow from there.'} action={<Button onClick={() => setDialogOpen(true)} data-testid="button-empty-add-lead"><Plus className="size-4" />Add your first lead</Button>} /> : <div className="overflow-hidden rounded-xl border border-border bg-card"><div className="hidden grid-cols-[minmax(220px,1.4fr)_minmax(130px,0.8fr)_120px_130px_32px] gap-4 border-b border-border bg-muted/35 px-5 py-3 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground md:grid"><span>Lead</span><span>Requirement</span><span>Status</span><span>Follow-up</span><span /></div><div className="divide-y divide-border">{leads.map((lead) => <LeadRow key={lead.id} lead={lead} detailed />)}</div></div>}
  </AppShell>;
}

function LeadRow({ lead, detailed = false }: { lead: Lead; detailed?: boolean }) {
  return <Link href={`/leads/${lead.id}`} data-testid={`link-lead-${lead.id}`} className={`lead-row group grid items-center gap-4 px-5 py-4 ${detailed ? 'md:grid-cols-[minmax(220px,1.4fr)_minmax(130px,0.8fr)_120px_130px_32px]' : 'grid-cols-[1fr_auto]'}`}>
    <div className="flex min-w-0 items-center gap-3"><div className="avatar-tile">{lead.companyName.slice(0, 2).toUpperCase()}</div><div className="min-w-0"><p className="truncate text-sm font-bold tracking-[-0.02em]">{lead.companyName}</p><p className="truncate text-xs text-muted-foreground">{lead.contactName} {lead.source && <span className="hidden sm:inline">· {lead.source}</span>}</p></div></div>
    {detailed && <><p className="hidden truncate text-xs text-muted-foreground md:block">{lead.requirement || 'No requirement added'}</p><div className="hidden md:block"><StatusPill status={lead.status} /></div><p className="hidden text-xs text-muted-foreground md:block"><DateLabel value={lead.nextFollowUp} /></p></>}
    <div className="flex items-center gap-3">{!detailed && <StatusPill status={lead.status} />}<ChevronRight className="size-4 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" /></div>
  </Link>;
}

function FilterSelect({ value, onChange, options, placeholder, testId }: { value: string; onChange: (v: string) => void; options: string[]; placeholder: string; testId: string }) {
  return <select value={value} onChange={(e) => onChange(e.target.value)} data-testid={testId} className="h-9 rounded-md border border-input bg-background px-3 text-xs font-medium outline-none focus:border-primary"><option value="">{placeholder}</option>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select>;
}

export function LeadDetail() {
  const { id } = useParams<{ id: string }>();
  const leadId = Number(id);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [activity, setActivity] = useState('');
  const leadQuery = useGetLead(leadId, { query: { enabled: Number.isFinite(leadId), queryKey: getGetLeadQueryKey(leadId) } });
  const activityQuery = useListLeadActivities(leadId, { query: { enabled: Number.isFinite(leadId), queryKey: getListLeadActivitiesQueryKey(leadId) } });
  const createActivity = useCreateLeadActivity();
  const deleteLead = useDeleteLead();
  const updateLead = useUpdateLead();
  const lead = leadQuery.data?.lead;

  function invalidate() { queryClient.invalidateQueries({ queryKey: getGetLeadQueryKey(leadId) }); queryClient.invalidateQueries({ queryKey: getListLeadActivitiesQueryKey(leadId) }); queryClient.invalidateQueries({ queryKey: getListLeadsQueryKey() }); queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }); queryClient.invalidateQueries({ queryKey: getListFollowUpsQueryKey() }); }
  function addActivity(event: React.FormEvent) { event.preventDefault(); if (!activity.trim()) return; createActivity.mutate({ id: leadId, data: { type: ActivityType.Note, description: activity.trim() } }, { onSuccess: () => { setActivity(''); setActivityOpen(false); invalidate(); toast({ title: 'Note added', description: 'The context is now part of this lead’s history.' }); } }); }
  function changeStatus(status: LeadStatus) { if (!lead || lead.status === status) return; updateLead.mutate({ id: lead.id, data: { status } }, { onSuccess: () => { invalidate(); toast({ title: `Moved to ${status}`, description: 'Pipeline status updated.' }); } }); }
  function removeLead() { if (!lead || !window.confirm(`Delete ${lead.companyName}? This cannot be undone.`)) return; deleteLead.mutate({ id: lead.id }, { onSuccess: () => { invalidate(); toast({ title: 'Lead deleted' }); setLocation('/leads'); } }); }

  if (leadQuery.isLoading) return <AppShell><div className="space-y-5"><SkeletonBlock className="h-5 w-24" /><SkeletonBlock className="h-12 w-72" /><SkeletonBlock className="h-[360px] w-full" /></div></AppShell>;
  if (leadQuery.isError || !lead) return <AppShell><QueryError message="This lead could not be found." /></AppShell>;
  return <AppShell><div className="mb-7 flex items-center justify-between gap-3"><Link href="/leads" data-testid="link-back-leads" className="inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"><ArrowLeft className="size-4" />Back to leads</Link><button type="button" onClick={removeLead} disabled={deleteLead.isPending} data-testid="button-delete-lead" className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"><Trash2 className="size-3.5" />Delete</button></div>
    <div className="mb-8 flex flex-col justify-between gap-6 lg:flex-row lg:items-end"><div className="flex items-center gap-4"><div className="avatar-tile avatar-tile-large">{lead.companyName.slice(0, 2).toUpperCase()}</div><div><div className="mb-2 flex flex-wrap items-center gap-2"><StatusPill status={lead.status} /><span className="text-xs text-muted-foreground">Added <DateLabel value={lead.createdAt} /></span></div><h1 className="font-display text-4xl font-bold tracking-[-0.065em]">{lead.companyName}</h1><p className="mt-1 text-sm text-muted-foreground">{lead.contactName} <span className="mx-1 text-border">•</span> {lead.source} lead</p></div></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setEditOpen(true)} data-testid="button-edit-lead">Edit lead</Button><Button onClick={() => setActivityOpen(true)} data-testid="button-add-note"><Plus className="size-4" />Add note</Button></div></div>
    <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]"><div className="space-y-6"><section className="rounded-xl border border-border bg-card p-5 md:p-6"><SectionLabel>Conversation details</SectionLabel><div className="grid gap-5 sm:grid-cols-2"><DetailItem icon={UserRound} label="Contact" value={lead.contactName} /><DetailItem icon={Mail} label="Email" value={lead.email || 'No email added'} /><DetailItem icon={Phone} label="Phone" value={lead.phone || 'No phone added'} /><DetailItem icon={CircleDollarSign} label="Estimated value" value={<Money value={lead.estimatedValue} />} /></div><div className="mt-5 border-t border-border pt-5"><p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Requirement</p><p className="text-sm leading-relaxed">{lead.requirement || 'No requirement captured yet.'}</p></div>{lead.notes && <div className="mt-5 border-t border-border pt-5"><p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Private notes</p><p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{lead.notes}</p></div>}</section>
      <section className="rounded-xl border border-border bg-card p-5 md:p-6"><div className="mb-5 flex items-center justify-between"><SectionLabel count={activityQuery.data?.length || 0}>Activity history</SectionLabel><button type="button" onClick={() => setActivityOpen(true)} data-testid="button-add-activity-history" className="text-xs font-semibold text-primary hover:underline">Add note</button></div>{activityQuery.isLoading ? <div className="space-y-4"><SkeletonBlock className="h-12 w-full" /><SkeletonBlock className="h-12 w-4/5" /></div> : activityQuery.data?.length ? <div className="activity-line space-y-0">{activityQuery.data.map((item) => <div key={item.id} className="relative flex gap-3 pb-6 last:pb-0"><div className="activity-dot" /><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="text-xs font-bold">{item.type === ActivityType.Note ? 'Note added' : item.type}</p><span className="text-[11px] text-muted-foreground"><DateLabel value={item.createdAt} includeTime /></span></div><p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.description}</p></div></div>)}</div> : <EmptyState icon={Sparkles} title="No history yet" description="Add a note after the next touchpoint to keep the thread warm." />}</section></div>
      <aside className="space-y-6"><section className="rounded-xl border border-border bg-card p-5 md:p-6"><SectionLabel>Next step</SectionLabel><div className="rounded-lg bg-accent/40 p-4"><div className="mb-2 flex items-center gap-2 text-xs font-semibold"><Clock3 className="size-4 text-accent-foreground" />Follow-up</div><p className="font-display text-xl font-bold tracking-[-0.04em]"><DateLabel value={lead.nextFollowUp} includeTime /></p><p className="mt-1 text-xs text-muted-foreground">Stay close to the momentum.</p></div><Button variant="outline" onClick={() => setEditOpen(true)} data-testid="button-schedule-follow-up" className="mt-4 w-full"><CalendarCheck2 className="size-4" />Schedule follow-up</Button><div className="mt-5"><p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Move pipeline stage</p><div className="grid grid-cols-2 gap-2">{[LeadStatus.Contacted, LeadStatus.Qualified, LeadStatus.Proposal, LeadStatus.Negotiation, LeadStatus.Won, LeadStatus.Lost].map((status) => <button type="button" key={status} onClick={() => changeStatus(status)} data-testid={`button-status-${status.toLowerCase()}`} className={`rounded-md border px-2 py-2 text-[11px] font-semibold transition-colors ${lead.status === status ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'}`}>{status}</button>)}</div></div></section><section className="rounded-xl border border-border bg-card p-5 md:p-6"><SectionLabel>Record</SectionLabel><div className="space-y-4 text-sm"><DetailItem icon={Target} label="Owner" value={lead.ownerId || 'Workspace team'} /><DetailItem icon={Clock3} label="Last updated" value={<DateLabel value={lead.updatedAt} includeTime />} /></div></section></aside></div>
    <LeadDialog open={editOpen} onOpenChange={setEditOpen} lead={lead} /><Dialog open={activityOpen} onOpenChange={setActivityOpen}><DialogContent className="border-card-border bg-card sm:max-w-lg"><DialogHeader><DialogTitle className="font-display text-2xl tracking-[-0.05em]">Add a note</DialogTitle><DialogDescription>Leave the next person a useful sentence, not a mystery.</DialogDescription></DialogHeader><form onSubmit={addActivity} className="space-y-4 pt-2"><div><Label htmlFor="activity-note" className="text-xs font-semibold">Note</Label><Textarea id="activity-note" data-testid="textarea-activity-note" value={activity} onChange={(e) => setActivity(e.target.value)} placeholder="They are comparing options this week…" className="mt-2 min-h-[130px] resize-none" autoFocus /></div><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setActivityOpen(false)} data-testid="button-cancel-activity">Cancel</Button><Button type="submit" disabled={createActivity.isPending || !activity.trim()} data-testid="button-save-activity">{createActivity.isPending ? 'Saving…' : 'Save note'}<Check className="size-4" /></Button></div></form></DialogContent></Dialog>
  </AppShell>;
}

function DetailItem({ icon: Icon, label, value }: { icon: typeof UserRound; label: string; value: React.ReactNode }) { return <div className="flex items-start gap-3"><Icon className="mt-0.5 size-4 shrink-0 text-primary" strokeWidth={1.7} /><div className="min-w-0"><p className="mb-0.5 text-[11px] font-semibold uppercase tracking-[0.11em] text-muted-foreground">{label}</p><p className="truncate text-sm font-medium">{value}</p></div></div>; }

export function FollowUps() {
  const query = useListFollowUps({ query: { queryKey: getListFollowUpsQueryKey() } });
  const data = query.data;
  return <AppShell><PageHeading eyebrow="Stay close" title="Follow-ups" description="The right nudge, at the right moment." action={<div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="size-2 rounded-full bg-primary" />{data ? `${(data.overdue?.length || 0) + (data.today?.length || 0) + (data.upcoming?.length || 0)} in view` : 'Loading'}</div>} />{query.isLoading ? <div className="grid gap-6 xl:grid-cols-3">{[1, 2, 3].map((item) => <div key={item} className="space-y-3"><SkeletonBlock className="h-5 w-28" /><SkeletonBlock className="h-20 w-full" /><SkeletonBlock className="h-20 w-full" /></div>)}</div> : query.isError ? <QueryError message="Follow-ups are not available right now." /> : <div className="grid gap-6 xl:grid-cols-3"><FollowUpColumn title="Overdue" helper="Worth reclaiming" items={data?.overdue || []} tone="overdue" /><FollowUpColumn title="Today" helper="Make it count" items={data?.today || []} tone="today" /><FollowUpColumn title="Upcoming" helper="Keep the thread warm" items={data?.upcoming || []} tone="upcoming" /></div>}</AppShell>;
}

function FollowUpColumn({ title, helper, items, tone }: { title: string; helper: string; items: Array<{ id: number; companyName: string; contactName: string; nextFollowUp: string; status: string }>; tone: string }) {
  return <section><div className="mb-3 flex items-end justify-between"><div><div className={`mb-1 size-2 rounded-full ${tone === 'overdue' ? 'bg-destructive' : tone === 'today' ? 'bg-primary' : 'bg-accent-foreground'}`} /><h2 className="font-display text-lg font-bold tracking-[-0.04em]">{title}</h2></div><span className="text-[11px] text-muted-foreground">{helper}</span></div><div className="space-y-2">{items.length ? items.map((item) => <FollowUpRow key={item.id} item={item} />) : <div className="rounded-xl border border-dashed border-border bg-card/40 px-4 py-10 text-center text-xs text-muted-foreground">No {title.toLowerCase()} follow-ups.</div>}</div></section>;
}

function FollowUpRow({ item, compact = false }: { item: { id: number; companyName: string; contactName: string; nextFollowUp: string; status: string }; compact?: boolean }) {
  return <Link href={`/leads/${item.id}`} data-testid={`link-follow-up-${item.id}`} className={`group block rounded-xl border border-border bg-card p-4 transition-all hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-sm ${compact ? 'p-3.5' : ''}`}><div className="flex items-start gap-3"><div className="avatar-tile avatar-tile-small">{item.companyName.slice(0, 2).toUpperCase()}</div><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><p className="truncate text-sm font-bold tracking-[-0.02em]">{item.companyName}</p><ChevronRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/50 group-hover:text-primary" /></div><p className="mt-0.5 truncate text-xs text-muted-foreground">{item.contactName}</p><div className="mt-3 flex items-center justify-between gap-2"><span className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground"><Clock3 className="size-3" /><DateLabel value={item.nextFollowUp} includeTime /></span><StatusPill status={item.status} /></div></div></div></Link>;
}

export function Customers() {
  const query = useListCustomers({ query: { queryKey: getListCustomersQueryKey() } });
  const customers = query.data || [];
  return <AppShell><PageHeading eyebrow="The good stuff" title="Customers" description="Every hard-won yes, in one considered place." action={<div className="flex items-center gap-2 rounded-lg bg-accent/45 px-3 py-2 text-xs font-semibold text-accent-foreground"><CheckCircle2 className="size-4" />{customers.length} converted</div>} />{query.isLoading ? <ListSkeleton /> : query.isError ? <QueryError message="Customers could not be loaded." /> : customers.length ? <div className="overflow-hidden rounded-xl border border-border bg-card"><div className="hidden grid-cols-[minmax(220px,1.3fr)_minmax(160px,1fr)_140px_120px] gap-4 border-b border-border bg-muted/35 px-5 py-3 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground md:grid"><span>Customer</span><span>Requirement</span><span>Value</span><span>Converted</span></div><div className="divide-y divide-border">{customers.map((customer) => <div key={customer.id} className="grid gap-3 px-5 py-4 transition-colors hover:bg-muted/25 md:grid-cols-[minmax(220px,1.3fr)_minmax(160px,1fr)_140px_120px] md:items-center md:gap-4" data-testid={`row-customer-${customer.id}`}><div className="flex items-center gap-3"><div className="avatar-tile bg-accent text-accent-foreground">{customer.companyName.slice(0, 2).toUpperCase()}</div><div><p className="text-sm font-bold tracking-[-0.02em]" data-testid={`text-customer-company-${customer.id}`}>{customer.companyName}</p><p className="text-xs text-muted-foreground">{customer.contactName}</p></div></div><p className="truncate text-xs text-muted-foreground">{customer.requirement || '—'}</p><p className="font-mono text-sm font-bold text-[#39715e]"><Money value={customer.value} /></p><p className="text-xs text-muted-foreground"><DateLabel value={customer.convertedAt} /></p></div>)}</div></div> : <EmptyState icon={CheckCircle2} title="Your customer list starts here" description="When a lead becomes a yes, they will take their place in this list." action={<Link href="/leads" data-testid="link-customers-to-leads" className="text-xs font-semibold text-primary">View your leads <ArrowUpRight className="ml-1 inline size-3.5" /></Link>} />}</AppShell>;
}

export function SettingsPage() {
  const { user, logout } = useAuth();
  const [saved, setSaved] = useState(false);
  const name = `${user?.firstName || ''} ${user?.lastName || ''}`.trim();
  return <AppShell><PageHeading eyebrow="Workspace" title="Settings" description="A few details about you and this workspace." /><div className="grid max-w-4xl gap-6 lg:grid-cols-[1fr_280px]"><section className="rounded-xl border border-border bg-card p-5 md:p-7"><SectionLabel>Account details</SectionLabel><div className="grid gap-5 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="settings-name" className="text-xs font-semibold">Name</Label><Input id="settings-name" data-testid="input-settings-name" defaultValue={name} placeholder="Your name" /></div><div className="space-y-2"><Label htmlFor="settings-email" className="text-xs font-semibold">Email</Label><Input id="settings-email" data-testid="input-settings-email" defaultValue={user?.email || ''} disabled /></div></div><div className="mt-6 border-t border-border pt-5"><p className="mb-1 text-sm font-semibold">Workspace feel</p><p className="text-xs text-muted-foreground">Clean V1 keeps the defaults intentionally quiet. No dashboards to configure, no noise to tune.</p></div><Button onClick={() => { setSaved(true); setTimeout(() => setSaved(false), 2200); }} data-testid="button-save-settings" className="mt-6">{saved ? <><Check className="size-4" />Saved</> : 'Save changes'}</Button></section><aside className="space-y-4"><div className="rounded-xl border border-border bg-sidebar p-5 text-sidebar-foreground"><ShieldCheck className="mb-6 size-5 text-sidebar-primary" /><p className="font-display text-lg font-bold tracking-[-0.04em]">Your data stays yours.</p><p className="mt-2 text-xs leading-relaxed text-sidebar-foreground/60">This workspace is private to your team. Keep your records focused and your follow-ups human.</p></div><button type="button" onClick={logout} data-testid="button-logout-settings" className="flex w-full items-center justify-center gap-2 rounded-lg border border-destructive/25 bg-destructive/5 px-4 py-3 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/10"><X className="size-3.5" />Log out</button></aside></div></AppShell>;
}

function DashboardSkeleton() { return <><div className="grid grid-cols-2 gap-3 md:grid-cols-5">{[1, 2, 3, 4, 5].map((item) => <SkeletonBlock key={item} className="h-[132px]" />)}</div><div className="mt-8 grid gap-6 xl:grid-cols-2"><SkeletonBlock className="h-[360px]" /><SkeletonBlock className="h-[360px]" /></div></>; }
function ListSkeleton() { return <div className="overflow-hidden rounded-xl border border-border bg-card">{[1, 2, 3, 4, 5].map((item) => <div key={item} className="flex items-center gap-4 border-b border-border px-5 py-5 last:border-0"><SkeletonBlock className="size-9 shrink-0 rounded-lg" /><div className="flex-1 space-y-2"><SkeletonBlock className="h-3 w-36" /><SkeletonBlock className="h-2.5 w-24" /></div><SkeletonBlock className="h-6 w-20" /></div>)}</div>; }