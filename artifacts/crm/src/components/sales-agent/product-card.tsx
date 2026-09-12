import type { Product } from '@workspace/api-client-react';
import { Check } from 'lucide-react';
import { specOrTbc } from './types';

const SPEC_ROWS: Array<{ key: keyof Pick<Product, 'motorType' | 'power' | 'torque' | 'voltage'>; label: string }> = [
  { key: 'motorType', label: 'Motor / Operator' },
  { key: 'power', label: 'Power' },
  { key: 'torque', label: 'Torque' },
  { key: 'voltage', label: 'Voltage' },
];

export function ProductSpecGrid({ product, compact = false }: { product: Product; compact?: boolean }) {
  return <dl className={`grid gap-x-4 gap-y-1.5 ${compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4'}`}>
    {SPEC_ROWS.map(({ key, label }) => {
      const value = product[key];
      return <div key={key} className="min-w-0"><dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</dt><dd className={`truncate text-xs ${value ? 'font-medium text-foreground' : 'italic text-muted-foreground'}`} title={specOrTbc(value)}>{specOrTbc(value)}</dd></div>;
    })}
  </dl>;
}

export function ProductCandidateCard({ product, reason, selected, onSelect, testId }: { product: Product; reason?: string; selected: boolean; onSelect: () => void; testId: string }) {
  return <button type="button" onClick={onSelect} data-testid={testId} aria-pressed={selected} className={`w-full rounded-lg border p-3.5 text-left transition-colors ${selected ? 'border-primary bg-primary/5 shadow-sm' : 'border-border bg-background/60 hover:border-primary/40'}`}>
    <div className="mb-2 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="font-mono text-[13px] font-bold tracking-[-0.01em] text-foreground">{product.model}</p>
        <p className="truncate text-xs text-muted-foreground" title={product.productName}>{product.productName}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{product.category}{product.capacityKg !== null ? ` · up to ${product.capacityKg} kg` : ''}</p>
      </div>
      <span className={`flex size-5 shrink-0 items-center justify-center rounded-full border ${selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-transparent'}`}><Check className="size-3" strokeWidth={3} /></span>
    </div>
    <ProductSpecGrid product={product} />
    {reason && <p className="mt-2 text-[11px] text-muted-foreground">Why: {reason}</p>}
  </button>;
}
