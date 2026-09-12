import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import {
  ArrowUpRight,
  Bell,
  CalendarDays,
  ChevronRight,
  CircleHelp,
  Gauge,
  LayoutList,
  LogOut,
  Menu,
  Search,
  Settings,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '@workspace/replit-auth-web';
import {
  getGetCurrentAuthUserQueryKey,
  type Lead,
  type LeadInput,
  LeadSource,
  LeadStatus,
  useCreateLead,
  useGetCurrentAuthUser,
  useUpdateLead,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

const navItems = [
  { href: '/', label: 'Overview', icon: Gauge },
  { href: '/leads', label: 'Leads', icon: LayoutList },
  { href: '/enquiry', label: 'New Enquiry', icon: Sparkles },
  { href: '/follow-ups', label: 'Follow-ups', icon: CalendarDays },
  { href: '/customers', label: 'Customers', icon: Users },
];

export function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, logout } = useAuth();
  const currentUser = useGetCurrentAuthUser({
    query: { enabled: Boolean(user), queryKey: getGetCurrentAuthUserQueryKey() },
  });
  const displayUser = currentUser.data?.user ?? user;
  const initials = `${displayUser?.firstName?.[0] ?? ''}${displayUser?.lastName?.[0] ?? ''}` || 'CV';

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col bg-sidebar px-4 py-5 text-sidebar-foreground transition-transform duration-300 md:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="mb-9 flex items-center justify-between px-3">
          <Link href="/" data-testid="link-brand" className="flex items-center gap-3">
            <span className="brand-mark"><span /></span>
            <span className="font-display text-[15px] font-bold tracking-[-0.03em]">clean v1 <span className="font-mono text-[10px] font-normal tracking-[0.14em] text-sidebar-primary">CRM</span></span>
          </Link>
          <button type="button" onClick={() => setMobileOpen(false)} data-testid="button-close-menu" className="rounded-md p-1 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground md:hidden"><X className="size-4" /></button>
        </div>

        <div className="mb-3 px-3 font-mono text-[10px] uppercase tracking-[0.2em] text-sidebar-foreground/45">Workspace</div>
        <nav className="space-y-1">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = href === '/' ? location === '/' : location.startsWith(href);
            return (
              <Link href={href} key={href} onClick={() => setMobileOpen(false)} data-testid={`link-nav-${label.toLowerCase().replace(' ', '-')}`} className={`group flex items-center justify-between rounded-lg px-3 py-2.5 text-[13px] transition-colors ${active ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-sm' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'}`}>
                <span className="flex items-center gap-3"><Icon className="size-[17px]" strokeWidth={1.8} />{label}</span>
                {active && <ChevronRight className="size-3.5" />}
              </Link>
            );
          })}
        </nav>

        <div className="my-7 h-px bg-sidebar-border" />
        <div className="mb-3 px-3 font-mono text-[10px] uppercase tracking-[0.2em] text-sidebar-foreground/45">Account</div>
        <Link href="/settings" data-testid="link-nav-settings" className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] transition-colors ${location.startsWith('/settings') ? 'bg-sidebar-accent text-sidebar-foreground' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'}`}><Settings className="size-[17px]" strokeWidth={1.8} />Settings</Link>

        <div className="mt-auto">
          <div className="mb-4 rounded-xl border border-sidebar-border bg-sidebar-accent/50 p-3">
            <div className="mb-2 flex items-center gap-2 text-[11px] text-sidebar-foreground/55"><Sparkles className="size-3.5 text-sidebar-primary" />Small team, clear pipeline</div>
            <p className="text-[12px] leading-relaxed text-sidebar-foreground/75">A quiet place to move the right conversations forward.</p>
          </div>
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sidebar-primary font-mono text-[11px] font-bold text-sidebar-primary-foreground" data-testid="avatar-current-user">{initials}</div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-semibold" data-testid="text-current-user">{displayUser?.firstName || displayUser?.email || 'Your workspace'}</p>
              <p className="truncate text-[11px] text-sidebar-foreground/45">{displayUser?.email || 'Signed in'}</p>
            </div>
            <button type="button" onClick={logout} data-testid="button-logout-sidebar" className="rounded-md p-1.5 text-sidebar-foreground/45 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground" aria-label="Log out"><LogOut className="size-3.5" /></button>
          </div>
        </div>
      </aside>

      {mobileOpen && <button type="button" aria-label="Close navigation" onClick={() => setMobileOpen(false)} data-testid="button-overlay-menu" className="fixed inset-0 z-30 bg-foreground/20 md:hidden" />}
      <main className="min-h-[100dvh] md:pl-[248px]">
        <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between border-b border-border/70 bg-background/90 px-5 backdrop-blur-md md:px-9">
          <button type="button" onClick={() => setMobileOpen(true)} data-testid="button-open-menu" className="rounded-md p-2 text-muted-foreground hover:bg-muted md:hidden"><Menu className="size-5" /></button>
          <div className="hidden items-center gap-2 text-xs text-muted-foreground md:flex"><span className="size-1.5 rounded-full bg-accent-foreground" />Pipeline at a glance</div>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/enquiry" data-testid="link-new-enquiry" className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:brightness-105"><Sparkles className="size-3.5" /><span className="hidden sm:inline">New enquiry</span></Link>
            <Link href="/leads" data-testid="link-command-search" className="hidden items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground sm:flex"><Search className="size-3.5" />Search <kbd className="ml-4 font-mono text-[10px] opacity-60">Ctrl K</kbd></Link>
            <Link href="/follow-ups" data-testid="link-notifications" className="relative rounded-lg border border-transparent p-2 text-muted-foreground transition-colors hover:border-border hover:bg-card hover:text-foreground"><Bell className="size-[17px]" strokeWidth={1.8} /><span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-primary" /></Link>
            <Link href="/settings" data-testid="link-settings-header" className="hidden rounded-lg border border-transparent p-2 text-muted-foreground transition-colors hover:border-border hover:bg-card hover:text-foreground sm:block"><Settings className="size-[17px]" strokeWidth={1.8} /></Link>
          </div>
        </header>
        <div className="page-enter mx-auto max-w-[1440px] px-5 py-7 md:px-9 md:py-9">{children}</div>
      </main>
    </div>
  );
}

export function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
    <div><div className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-primary" data-testid={`text-eyebrow-${eyebrow.toLowerCase().replaceAll(' ', '-')}`}>{eyebrow}</div><h1 className="font-display text-3xl font-bold tracking-[-0.055em] text-foreground md:text-[38px]" data-testid={`heading-${title.toLowerCase().replaceAll(' ', '-')}`}>{title}</h1>{description && <p className="mt-2 max-w-xl text-sm text-muted-foreground">{description}</p>}</div>
    {action}
  </div>;
}

export function StatusPill({ status }: { status: string }) {
  const tones: Record<string, string> = { New: 'status-new', Contacted: 'status-contacted', Qualified: 'status-qualified', Proposal: 'status-proposal', Negotiation: 'status-negotiation', Won: 'status-won', Lost: 'status-lost' };
  return <span className={`status-pill ${tones[status] || 'status-contacted'}`} data-testid={`status-${status.toLowerCase()}`}>{status}</span>;
}

export function SkeletonBlock({ className = '' }: { className?: string }) { return <div className={`animate-pulse rounded-lg bg-muted ${className}`} />; }

export function QueryError({ message = 'We could not load this just now.' }: { message?: string }) {
  return <div className="rounded-xl border border-destructive/25 bg-destructive/5 p-6 text-center"><CircleHelp className="mx-auto mb-2 size-5 text-destructive" /><p className="text-sm font-semibold text-foreground">A small snag</p><p className="mt-1 text-xs text-muted-foreground">{message} Try refreshing.</p></div>;
}

export function EmptyState({ icon: Icon = LayoutList, title, description, action }: { icon?: typeof LayoutList; title: string; description: string; action?: ReactNode }) {
  return <div className="flex min-h-[260px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/50 px-6 text-center"><div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-accent text-accent-foreground"><Icon className="size-5" strokeWidth={1.6} /></div><h3 className="font-display text-lg font-bold tracking-[-0.03em]">{title}</h3><p className="mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">{description}</p>{action && <div className="mt-5">{action}</div>}</div>;
}

function blankLead(): LeadInput {
  return { companyName: '', contactName: '', phone: '', email: '', source: LeadSource.Website, requirement: '', estimatedValue: 0, status: LeadStatus.New, nextFollowUp: null, notes: '' };
}

export function LeadDialog({ open, onOpenChange, lead }: { open: boolean; onOpenChange: (open: boolean) => void; lead?: Lead | null }) {
  const [form, setForm] = useState<LeadInput>(() => lead ? { companyName: lead.companyName, contactName: lead.contactName, phone: lead.phone, email: lead.email, source: lead.source, requirement: lead.requirement, estimatedValue: lead.estimatedValue, status: lead.status, nextFollowUp: lead.nextFollowUp, notes: lead.notes } : blankLead());
  const createLead = useCreateLead();
  const updateLead = useUpdateLead();
  const { toast } = useToast();
  const editing = Boolean(lead);

  function update<K extends keyof LeadInput>(key: K, value: LeadInput[K]) { setForm((current) => ({ ...current, [key]: value })); }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.companyName.trim() || !form.contactName.trim()) { toast({ title: 'Add a company and contact', description: 'Those two fields help keep the pipeline scannable.' }); return; }
    if (editing && lead) {
      updateLead.mutate({ id: lead.id, data: form }, { onSuccess: () => { toast({ title: 'Lead updated', description: 'The record is looking fresh.' }); onOpenChange(false); } });
    } else {
      createLead.mutate({ data: form }, { onSuccess: () => { toast({ title: 'Lead added', description: 'A new conversation is on the board.' }); onOpenChange(false); setForm(blankLead()); } });
    }
  }
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-2xl border-card-border bg-card p-0"><div className="border-b border-border bg-accent/35 px-6 py-5"><DialogHeader><DialogTitle className="font-display text-2xl tracking-[-0.05em]">{editing ? 'Edit lead' : 'Add a lead'}</DialogTitle><DialogDescription className="mt-1">Keep the useful context close to the conversation.</DialogDescription></DialogHeader></div><form onSubmit={submit} className="space-y-5 p-6">
    <div className="grid gap-4 sm:grid-cols-2"><Field label="Company" value={form.companyName} onChange={(v) => update('companyName', v)} placeholder="Northstar Studio" required testId="input-company-name" /><Field label="Contact" value={form.contactName} onChange={(v) => update('contactName', v)} placeholder="Maya Chen" required testId="input-contact-name" /><Field label="Email" value={form.email} onChange={(v) => update('email', v)} placeholder="maya@northstar.co" type="email" testId="input-email" /><Field label="Phone" value={form.phone} onChange={(v) => update('phone', v)} placeholder="+1 415 555 0138" testId="input-phone" /></div>
    <div className="grid gap-4 sm:grid-cols-3"><SelectField label="Source" value={form.source} onChange={(v) => update('source', v as LeadSource)} options={Object.values(LeadSource)} testId="select-source" /><SelectField label="Status" value={form.status} onChange={(v) => update('status', v as LeadStatus)} options={Object.values(LeadStatus)} testId="select-status" /><Field label="Est. value" value={String(form.estimatedValue || '')} onChange={(v) => update('estimatedValue', Number(v) || 0)} placeholder="12000" type="number" testId="input-estimated-value" /></div>
    <Field label="Requirement" value={form.requirement} onChange={(v) => update('requirement', v)} placeholder="What are they trying to solve?" testId="input-requirement" /><div className="grid gap-4 sm:grid-cols-2"><Field label="Next follow-up" value={form.nextFollowUp || ''} onChange={(v) => update('nextFollowUp', v || null)} type="date" testId="input-next-follow-up" /><Field label="Notes" value={form.notes} onChange={(v) => update('notes', v)} placeholder="Useful context for the team" testId="input-notes" /></div>
    <div className="flex flex-col-reverse gap-2 border-t border-border pt-5 sm:flex-row sm:justify-end"><Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-lead">Cancel</Button><Button type="submit" disabled={createLead.isPending || updateLead.isPending} data-testid="button-save-lead">{createLead.isPending || updateLead.isPending ? 'Saving…' : editing ? 'Save changes' : 'Add lead'}<ArrowUpRight className="size-4" /></Button></div>
  </form></DialogContent></Dialog>;
}

function Field({ label, value, onChange, placeholder, type = 'text', required, testId }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string; required?: boolean; testId: string }) {
  return <div className="space-y-1.5"><Label htmlFor={testId} className="text-xs font-semibold text-foreground/80">{label}</Label>{label === 'Notes' ? <Textarea id={testId} data-testid={testId} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="min-h-[88px] resize-none bg-background" /> : <Input id={testId} data-testid={testId} type={type} required={required} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="bg-background" />}</div>;
}

function SelectField({ label, value, onChange, options, testId }: { label: string; value: string; onChange: (value: string) => void; options: string[]; testId: string }) {
  return <div className="space-y-1.5"><Label htmlFor={testId} className="text-xs font-semibold text-foreground/80">{label}</Label><select id={testId} data-testid={testId} value={value} onChange={(e) => onChange(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary">{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></div>;
}

export function SectionLabel({ children, count }: { children: ReactNode; count?: number }) { return <div className="mb-4 flex items-center gap-2"><h2 className="font-display text-base font-bold tracking-[-0.03em]">{children}</h2>{count !== undefined && <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground">{count}</span>}</div>; }

export function Money({ value }: { value: number }) { return <span>{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value || 0)}</span>; }

export function DateLabel({ value, includeTime = false }: { value?: string | null; includeTime?: boolean }) {
  if (!value) return <span className="text-muted-foreground">Not set</span>;
  // Calendar dates (YYYY-MM-DD) are shown as local dates so they never shift with the timezone.
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) return <span>{new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3])).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>;
  const date = new Date(value);
  return <span>{date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: includeTime ? 'numeric' : undefined })}{includeTime && <span className="text-muted-foreground"> · {date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>}</span>;
}