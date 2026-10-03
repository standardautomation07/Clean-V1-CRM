import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { QueryError, SkeletonBlock } from '@/components/crm-ui';

// The expanded Sales Order, editable in place.
//
// Totals are deliberately NOT calculated here. The server recalculates from the
// submitted lines with the same calculator the quotation flow uses and answers
// with the stored result, so this screen can never disagree with the document
// or with the PDF rendered from it.

export interface DocumentItem {
  id?: number;
  productModel: string;
  productName: string;
  quantity: number | string;
  unit: string;
  unitPrice: number | string;
  discount: number | string;
  lineTotal?: number | string;
}

interface EditLine {
  key: string;
  productModel: string;
  productName: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  discount: string;
}

let editKey = 0;
function toEditLine(item: Partial<DocumentItem>): EditLine {
  editKey += 1;
  return {
    key: `so-line-${editKey}`,
    productModel: item.productModel ?? '',
    productName: item.productName ?? '',
    quantity: String(item.quantity ?? '1'),
    unit: item.unit || 'Nos',
    unitPrice: String(item.unitPrice ?? '0'),
    discount: String(item.discount ?? '0'),
  };
}

interface Props {
  documentId: number;
  documentNumber: string;
  onSaved: () => void;
}

export function SalesOrderEditor({ documentId, documentNumber, onSaved }: Props) {
  const [lines, setLines] = useState<EditLine[] | null>(null);
  const [taxRate, setTaxRate] = useState('18');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const detail = useQuery({
    queryKey: ['documents', documentId],
    queryFn: async (): Promise<{ document: { notes?: string; taxDetails?: { taxRate?: number } }; items: DocumentItem[] }> => {
      const response = await fetch(`/api/documents/${documentId}`, { credentials: 'include' });
      if (!response.ok) throw new Error('This Sales Order could not be loaded.');
      return response.json();
    },
  });

  // Seed the form once. A background refetch must not overwrite what is being
  // typed, so this is keyed on the form being empty rather than on the data.
  if (detail.data && lines === null) {
    setLines(detail.data.items.map(toEditLine));
    setTaxRate(String(detail.data.document?.taxDetails?.taxRate ?? 18));
    setNotes(detail.data.document?.notes ?? '');
  }

  if (detail.isError) return <QueryError message="This Sales Order could not be loaded." />;
  if (detail.isLoading || lines === null) return <SkeletonBlock className="mt-3 h-24 w-full" />;

  function update(key: string, field: keyof EditLine, value: string) {
    setLines((current) => (current ?? []).map((line) => (line.key === key ? { ...line, [field]: value } : line)));
    setMessage(null);
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/documents/${documentId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taxRate: Number(taxRate) || 0,
          notes,
          items: (lines ?? []).map((line) => ({
            productModel: line.productModel.trim(),
            productName: line.productName.trim(),
            quantity: Number(line.quantity) || 0,
            unit: line.unit.trim() || 'Nos',
            unitPrice: Number(line.unitPrice) || 0,
            discount: Number(line.discount) || 0,
          })),
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setMessage({ ok: false, text: String(body?.error ?? 'The Sales Order could not be saved.') });
        return;
      }
      setMessage({ ok: true, text: `${documentNumber} updated. The PDF now reflects the change.` });
      onSaved();
    } catch {
      setMessage({ ok: false, text: 'The Sales Order could not be saved.' });
    } finally {
      setSaving(false);
    }
  }

  const cell = 'rounded border border-border bg-background px-2 py-1';

  return <div className="mt-3 rounded-lg border border-border bg-muted/20 p-3">
    <div className="overflow-x-auto">
      <table className="w-full min-w-[680px] text-xs">
        <thead><tr className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          <th className="pb-2 pr-2 text-left font-medium">Model</th>
          <th className="pb-2 px-2 text-left font-medium">Description</th>
          <th className="pb-2 px-2 text-right font-medium">Qty</th>
          <th className="pb-2 px-2 text-left font-medium">Unit</th>
          <th className="pb-2 px-2 text-right font-medium">Unit price</th>
          <th className="pb-2 px-2 text-right font-medium">Disc %</th>
          <th className="pb-2 pl-2 text-right font-medium" />
        </tr></thead>
        <tbody>{lines.map((line) => <tr key={line.key}>
          <td className="py-1 pr-2"><input value={line.productModel} onChange={(e) => update(line.key, 'productModel', e.target.value)} className={`w-24 font-mono ${cell}`} /></td>
          <td className="py-1 px-2"><input value={line.productName} onChange={(e) => update(line.key, 'productName', e.target.value)} className={`w-full min-w-[160px] ${cell}`} /></td>
          <td className="py-1 px-2"><input value={line.quantity} onChange={(e) => update(line.key, 'quantity', e.target.value)} type="number" min={0} className={`w-16 text-right font-mono ${cell}`} /></td>
          <td className="py-1 px-2"><input value={line.unit} onChange={(e) => update(line.key, 'unit', e.target.value)} className={`w-16 ${cell}`} /></td>
          <td className="py-1 px-2"><input value={line.unitPrice} onChange={(e) => update(line.key, 'unitPrice', e.target.value)} type="number" min={0} className={`w-24 text-right font-mono ${cell}`} /></td>
          <td className="py-1 px-2"><input value={line.discount} onChange={(e) => update(line.key, 'discount', e.target.value)} type="number" min={0} max={100} className={`w-16 text-right font-mono ${cell}`} /></td>
          <td className="py-1 pl-2 text-right">
            <button
              type="button"
              onClick={() => { setLines((c) => (c ?? []).filter((l) => l.key !== line.key)); setMessage(null); }}
              disabled={lines.length === 1}
              className="text-[11px] font-semibold text-muted-foreground hover:text-destructive disabled:opacity-40"
            >Remove</button>
          </td>
        </tr>)}</tbody>
      </table>
    </div>

    <div className="mt-3 flex flex-wrap items-end gap-3">
      <button
        type="button"
        onClick={() => { setLines((c) => [...(c ?? []), toEditLine({})]); setMessage(null); }}
        className="text-xs font-semibold text-primary hover:underline"
      >Add line</button>
      <label className="flex items-center gap-2 text-xs font-semibold">GST %
        <input value={taxRate} onChange={(e) => { setTaxRate(e.target.value); setMessage(null); }} type="number" min={0} max={100} step="0.5" className={`w-20 text-right font-mono ${cell}`} />
      </label>
      <label className="flex flex-1 items-center gap-2 text-xs font-semibold">Notes
        <input value={notes} onChange={(e) => { setNotes(e.target.value); setMessage(null); }} className={`min-w-[160px] flex-1 font-normal ${cell}`} />
      </label>
      <Button size="sm" disabled={saving} onClick={save} data-testid={`button-save-sales-order-${documentId}`}>{saving ? 'Saving…' : 'Save changes'}</Button>
    </div>

    {message && <p className={`mt-2 rounded-lg p-2 text-[11px] ${message.ok ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-200' : 'bg-destructive/10 text-destructive'}`}>{message.text}</p>}
    <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
      Totals and GST are recalculated by the server from these lines, so the figures on the PDF always match the saved
      order. Every change is recorded on the lead's activity history.
    </p>
  </div>;
}
