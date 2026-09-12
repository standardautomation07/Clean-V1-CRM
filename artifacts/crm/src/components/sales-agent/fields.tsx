import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// Small form primitives that mirror the styling used in crm-ui.tsx.

export function Field({ label, value, onChange, placeholder, type = 'text', required, testId, min, step }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string; required?: boolean; testId: string; min?: number; step?: string }) {
  return <div className="space-y-1.5"><Label htmlFor={testId} className="text-xs font-semibold text-foreground/80">{label}</Label><Input id={testId} data-testid={testId} type={type} required={required} value={value} min={min} step={step} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="bg-background" /></div>;
}

export function SelectField({ label, value, onChange, options, testId }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }>; testId: string }) {
  return <div className="space-y-1.5"><Label htmlFor={testId} className="text-xs font-semibold text-foreground/80">{label}</Label><select id={testId} data-testid={testId} value={value} onChange={(e) => onChange(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary">{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>;
}
