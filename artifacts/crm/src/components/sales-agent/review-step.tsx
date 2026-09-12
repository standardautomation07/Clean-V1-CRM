import { useState } from 'react';
import { LeadSource, type Product, type ProductCategory } from '@workspace/api-client-react';
import { AlertTriangle, ArrowLeft, ArrowUpRight, CircleHelp, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PageHeading, SectionLabel } from '@/components/crm-ui';
import { ProductCandidateCard } from './product-card';
import { Field, SelectField } from './fields';
import { blankReviewItem, type ReviewItem, type ReviewSpecification, type ReviewState } from './types';

const CATEGORIES: ProductCategory[] = ['Sliding Gate Motors', 'Swing Gate Motors', 'Industrial Door Motors', 'Barrier Gate Automation', 'Accessories & Controls', 'Rolling Shutter Motors', 'Automatic Door Operators'];
const CAPACITY_CATEGORIES = new Set<string>(['Sliding Gate Motors', 'Swing Gate Motors', 'Rolling Shutter Motors']);

interface ReviewStepProps {
  review: ReviewState;
  onChange: (next: ReviewState) => void;
  originalRequirement: string;
  catalogue: Product[];
  onRematch: () => void;
  rematching: boolean;
  onBack: () => void;
  onConfirm: () => void;
  confirming: boolean;
}

export function ReviewStep({ review, onChange, originalRequirement, catalogue, onRematch, rematching, onBack, onConfirm, confirming }: ReviewStepProps) {
  function update<K extends keyof ReviewState>(key: K, value: ReviewState[K]) { onChange({ ...review, [key]: value }); }
  function updateItem(index: number, patch: Partial<ReviewItem>) { update('items', review.items.map((item, i) => (i === index ? { ...item, ...patch } : item))); }
  function removeItem(index: number) { update('items', review.items.filter((_, i) => i !== index)); }
  function addItem() { update('items', [...review.items, blankReviewItem()]); }
  function updateSpec(itemIndex: number, specIndex: number, patch: Partial<ReviewSpecification>) {
    updateItem(itemIndex, { specifications: review.items[itemIndex].specifications.map((spec, i) => (i === specIndex ? { ...spec, ...patch } : spec)) });
  }
  const selectedCount = review.items.filter((item) => item.selectedProduct).length;
  const openQuestions = [...new Set([...review.missingInformation, ...review.items.flatMap((item) => item.questions)])];

  return <>
    <div className="mb-6"><button type="button" onClick={onBack} data-testid="button-back-to-enquiry" className="inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"><ArrowLeft className="size-4" />Back to enquiry</button></div>
    <PageHeading eyebrow="Step 2 · Product" title="Review Enquiry" description="Check what the AI understood, answer anything that is missing, and choose the Rollvento product for each item." action={<Button onClick={onConfirm} disabled={confirming} data-testid="button-confirm-create-lead-top">{confirming ? 'Creating lead…' : 'Confirm & Create Lead'}<ArrowUpRight className="size-4" /></Button>} />

    {openQuestions.length > 0 && <div className="mb-6 rounded-xl border border-primary/30 bg-primary/5 p-4" data-testid="panel-missing-information">
      <div className="mb-2 flex items-center gap-2 text-xs font-bold text-foreground"><CircleHelp className="size-4 text-primary" />The AI needs a little more information</div>
      <ul className="space-y-1 text-sm text-foreground/85">{openQuestions.map((question) => <li key={question} className="flex gap-2"><span className="text-primary">•</span><span>{question}</span></li>)}</ul>
      <p className="mt-2 text-[11px] text-muted-foreground">Fill in the answers on the item below (for example the gate weight), then click “Update recommendations”.</p>
    </div>}

    <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
      <div className="space-y-6">
        <section className="rounded-xl border border-border bg-card p-5 md:p-6">
          <SectionLabel>Customer</SectionLabel>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Company / Customer name" value={review.companyName} onChange={(v) => update('companyName', v)} required testId="input-review-company" />
            <Field label="Contact person" value={review.contactName} onChange={(v) => update('contactName', v)} required testId="input-review-contact" />
            <Field label="Phone / WhatsApp" value={review.phone} onChange={(v) => update('phone', v)} type="tel" testId="input-review-phone" />
            <Field label="Email" value={review.email} onChange={(v) => update('email', v)} type="email" placeholder="Optional" testId="input-review-email" />
            <Field label="Location" value={review.location} onChange={(v) => update('location', v)} placeholder="Optional" testId="input-review-location" />
            <SelectField label="Lead source" value={review.source} onChange={(v) => update('source', v as LeadSource)} options={Object.values(LeadSource).map((s) => ({ value: s, label: s }))} testId="select-review-source" />
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-5 md:p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <SectionLabel count={review.items.length}>Requirement items</SectionLabel>
            <div className="flex items-center gap-3">
              <button type="button" onClick={onRematch} disabled={rematching} data-testid="button-rematch-products" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline disabled:opacity-50"><RefreshCw className={`size-3.5 ${rematching ? 'animate-spin' : ''}`} />{rematching ? 'Matching…' : 'Update recommendations'}</button>
              <button type="button" onClick={addItem} data-testid="button-add-item" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"><Plus className="size-3.5" />Add item</button>
            </div>
          </div>
          {review.items.length ? <div className="space-y-5">{review.items.map((item, itemIndex) => <ItemEditor key={itemIndex} item={item} index={itemIndex} catalogue={catalogue} onChange={(patch) => updateItem(itemIndex, patch)} onRemove={() => removeItem(itemIndex)} onSpecChange={(specIndex, patch) => updateSpec(itemIndex, specIndex, patch)} />)}</div>
            : <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-xs text-muted-foreground">The AI did not identify a specific product requirement. Add an item, or create the lead with the original requirement as-is.</div>}
        </section>

        <section className="rounded-xl border border-border bg-card p-5 md:p-6">
          <SectionLabel>Notes</SectionLabel>
          <Textarea value={review.notes} onChange={(e) => update('notes', e.target.value)} placeholder="Urgency, site conditions, preferences…" data-testid="textarea-review-notes" className="min-h-[90px] bg-background" />
          <p className="mt-2 text-[11px] text-muted-foreground">Saved to the lead's private notes with the location and selected products.</p>
        </section>
      </div>

      <aside className="space-y-6">
        <section className="rounded-xl border border-border bg-card p-5 md:p-6">
          <SectionLabel>Original requirement</SectionLabel>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground" data-testid="text-original-requirement">{originalRequirement.trim()}</p>
        </section>
        <section className="rounded-xl border border-border bg-accent/40 p-5 md:p-6">
          <p className="text-xs font-semibold">{selectedCount} of {review.items.length} item{review.items.length === 1 ? '' : 's'} has a Rollvento product selected</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">The lead is created as <span className="font-semibold text-foreground">New</span> with no estimated value. Products can still be changed at the pricing step.</p>
          <div className="mt-4 flex flex-col gap-2">
            <Button onClick={onConfirm} disabled={confirming} data-testid="button-confirm-create-lead" className="w-full">{confirming ? 'Creating lead…' : 'Confirm & Create Lead'}<ArrowUpRight className="size-4" /></Button>
            <Button variant="outline" onClick={onBack} disabled={confirming} data-testid="button-edit-enquiry" className="w-full">Back to enquiry</Button>
          </div>
        </section>
      </aside>
    </div>
  </>;
}

function ItemEditor({ item, index, catalogue, onChange, onRemove, onSpecChange }: { item: ReviewItem; index: number; catalogue: Product[]; onChange: (patch: Partial<ReviewItem>) => void; onRemove: () => void; onSpecChange: (specIndex: number, patch: Partial<ReviewSpecification>) => void }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const showCapacity = !item.category || CAPACITY_CATEGORIES.has(item.category);
  const pickerResults = pickerOpen
    ? catalogue.filter((p) => (!item.category || p.category === item.category) && (!pickerQuery.trim() || `${p.model} ${p.productName}`.toLowerCase().includes(pickerQuery.trim().toLowerCase()))).slice(0, 12)
    : [];

  return <div className="rounded-lg border border-border bg-background/60 p-4" data-testid={`card-item-${index}`}>
    <div className="grid gap-3 sm:grid-cols-[1.5fr_1fr_auto] sm:items-end">
      <Field label="Requirement / product hint" value={item.productHint} onChange={(v) => onChange({ productHint: v })} placeholder="Automatic sliding gate motor" testId={`input-item-product-${index}`} />
      <SelectField label="Rollvento category" value={item.category} onChange={(v) => onChange({ category: v as ProductCategory | '' })} options={[{ value: '', label: 'Not sure yet' }, ...CATEGORIES.map((c) => ({ value: c, label: c }))]} testId={`select-item-category-${index}`} />
      <button type="button" onClick={onRemove} aria-label="Remove item" data-testid={`button-remove-item-${index}`} className="mb-0.5 rounded-md p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"><Trash2 className="size-4" /></button>
    </div>
    <div className="mt-3 grid gap-3 sm:grid-cols-3">
      {showCapacity && <Field label="Gate / shutter weight (kg)" value={item.requiredCapacityKg} onChange={(v) => onChange({ requiredCapacityKg: v })} placeholder="e.g. 1000" type="number" testId={`input-item-capacity-${index}`} />}
      <Field label="Quantity" value={item.quantity} onChange={(v) => onChange({ quantity: v })} placeholder="—" type="number" testId={`input-item-quantity-${index}`} />
      <Field label="Unit" value={item.unit} onChange={(v) => onChange({ unit: v })} placeholder="Nos" testId={`input-item-unit-${index}`} />
    </div>

    <div className="mt-4">
      <div className="mb-2 flex items-center justify-between"><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Specifications mentioned</p><button type="button" onClick={() => onChange({ specifications: [...item.specifications, { name: '', value: '' }] })} data-testid={`button-add-spec-${index}`} className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"><Plus className="size-3" />Add</button></div>
      {item.specifications.length ? <div className="space-y-2">{item.specifications.map((spec, specIndex) => <div key={specIndex} className="grid grid-cols-[1fr_1.4fr_auto] items-center gap-2">
        <Input value={spec.name} onChange={(e) => onSpecChange(specIndex, { name: e.target.value })} placeholder="Opening width" aria-label="Specification name" data-testid={`input-spec-name-${index}-${specIndex}`} className="h-8 bg-background text-xs" />
        <Input value={spec.value} onChange={(e) => onSpecChange(specIndex, { value: e.target.value })} placeholder="approx. 6 metres" aria-label="Specification value" data-testid={`input-spec-value-${index}-${specIndex}`} className="h-8 bg-background text-xs" />
        <button type="button" onClick={() => onChange({ specifications: item.specifications.filter((_, i) => i !== specIndex) })} aria-label="Remove specification" data-testid={`button-remove-spec-${index}-${specIndex}`} className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"><X className="size-3.5" /></button>
      </div>)}</div> : <p className="text-xs text-muted-foreground">Nothing specific was stated.</p>}
    </div>

    <div className="mt-5 border-t border-border pt-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Recommended Rollvento products</p>
        <button type="button" onClick={() => setPickerOpen((open) => !open)} data-testid={`button-pick-product-${index}`} className="text-[11px] font-semibold text-primary hover:underline">{pickerOpen ? 'Close catalogue' : 'Choose from catalogue'}</button>
      </div>
      {item.unknownModel && <p className="mb-3 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-xs text-foreground" data-testid={`text-unknown-model-${index}`}><AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-destructive" /><span>“{item.unknownModel}” is not a model in the Rollvento catalogue. Only catalogue products are shown below.</span></p>}
      {item.noMatchReason && <p className="mb-3 rounded-md border border-border bg-muted/40 p-2.5 text-xs text-muted-foreground" data-testid={`text-no-match-${index}`}>{item.noMatchReason}</p>}
      {item.candidates.length ? <div className="grid gap-2 md:grid-cols-2">{item.candidates.map((candidate) => <ProductCandidateCard key={candidate.product.model} product={candidate.product} reason={candidate.reason} selected={item.selectedProduct?.model === candidate.product.model} onSelect={() => onChange({ selectedProduct: item.selectedProduct?.model === candidate.product.model ? null : candidate.product })} testId={`card-candidate-${index}-${candidate.product.model}`} />)}</div>
        : !item.noMatchReason && <p className="text-xs text-muted-foreground">No recommendation yet. Set the category or weight and click “Update recommendations”.</p>}
      {item.selectedProduct && !item.candidates.some((c) => c.product.model === item.selectedProduct?.model) && <div className="mt-2"><ProductCandidateCard product={item.selectedProduct} selected onSelect={() => onChange({ selectedProduct: null })} testId={`card-selected-${index}`} /></div>}
      {item.candidates.length > 1 && !item.selectedProduct && <p className="mt-2 text-[11px] text-muted-foreground">Several products could fit — select the one to quote, or leave unselected to decide at pricing.</p>}
      {pickerOpen && <div className="mt-3 rounded-lg border border-border bg-card p-3">
        <Label htmlFor={`picker-${index}`} className="text-xs font-semibold text-foreground/80">Search the Rollvento catalogue{item.category ? ` · ${item.category}` : ''}</Label>
        <Input id={`picker-${index}`} value={pickerQuery} onChange={(e) => setPickerQuery(e.target.value)} placeholder="Model or name, e.g. SL1000AC" data-testid={`input-pick-product-${index}`} className="mt-1.5 h-8 bg-background text-xs" autoFocus />
        <ul className="mt-2 max-h-56 divide-y divide-border overflow-auto rounded-md border border-border">{pickerResults.length ? pickerResults.map((product) => <li key={product.model}><button type="button" onClick={() => { onChange({ selectedProduct: product, category: product.category }); setPickerOpen(false); }} data-testid={`option-product-${index}-${product.model}`} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs hover:bg-muted/50"><span className="min-w-0"><span className="font-mono font-bold">{product.model}</span><span className="ml-2 truncate text-muted-foreground">{product.productName}</span></span><span className="shrink-0 text-[10px] text-muted-foreground">{product.category}</span></button></li>) : <li className="px-3 py-3 text-xs text-muted-foreground">No catalogue product matches.</li>}</ul>
      </div>}
    </div>
  </div>;
}
