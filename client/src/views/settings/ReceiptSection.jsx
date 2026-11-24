import React, { useEffect, useState } from 'react';
import { Receipt } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Textarea, useToast } from '../../components/ui';
import { ThermalReceipt } from '../../components/ThermalReceipt';
import { SectionShell } from './SectionShell';
import { FormGroup, Switch } from './controls';
import { apiJson, changedFields } from './settingsData';
import { invalidateReceiptProfile } from './receiptProfile';

const KEYS = ['receipt_width', 'receipt_footer', 'receipt_show_gstin', 'receipt_show_licences', 'receipt_show_customer'];
const DEFAULTS = { receipt_width: '58mm', receipt_footer: '', receipt_show_gstin: true, receipt_show_licences: true, receipt_show_customer: true };
const pick = (s) => Object.fromEntries(KEYS.map((k) => [k, s?.[k] ?? DEFAULTS[k]]));

const SAMPLE_ORDER = {
  id: 0, invoice_no: 'INV/26-27/0042', created_at: new Date().toISOString(), cashier_name: 'Ravi Kumar',
  customer_name: 'Arun Prakash', customer_phone: '9884011111', payment_method: 'CASH',
  subtotal: 185, discount: 0, final_amount: 185, cash_received: 200, change_given: 15
};
const SAMPLE_ITEMS = [
  { id: 1, name: 'Masala Chai', quantity: 1, price: 25, subtotal: 25 },
  { id: 2, name: 'Samosa', quantity: 2, price: 20, subtotal: 40 },
  { id: 3, name: 'Masala Dosa', quantity: 1, price: 80, subtotal: 80 },
  { id: 4, name: 'Idli (2 pcs)', quantity: 1, price: 40, subtotal: 40 }
];

export function ReceiptSection({ onDirtyChange }) {
  const { authFetch } = useAuth();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [orig, setOrig] = useState(null);
  const [form, setForm] = useState(DEFAULTS);
  const [org, setOrg] = useState({ organization: null, licences: [] });

  useEffect(() => {
    Promise.all([apiJson(authFetch, '/api/settings'), apiJson(authFetch, '/api/organization')]).then(([s, o]) => {
      if (s.ok) { const p = pick(s.data); setOrig(p); setForm(p); } else toast.error(s.data.error || 'Could not load receipt settings');
      if (o.ok) setOrg({ organization: o.data.organization, licences: o.data.licences || [] });
      setLoading(false);
    });
  }, []);

  const changes = orig ? changedFields(form, orig) : {};
  const dirty = Object.keys(changes).length > 0;
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    setSaving(true);
    const { ok, data } = await apiJson(authFetch, '/api/settings', { method: 'PUT', body: changes });
    setSaving(false);
    if (ok) { const p = pick(data); setOrig(p); setForm(p); invalidateReceiptProfile(); toast.success('Receipt settings saved'); }
    else toast.error(data.error || 'Could not save receipt settings');
  };

  return (
    <SectionShell
      icon={Receipt}
      title="Receipt"
      description="Paper size and what is printed on every bill. The preview updates as you change things."
      loading={loading}
      dirty={dirty}
      saving={saving}
      onSave={save}
      onCancel={() => setForm(orig)}
    >
      <div className="grid grid-cols-[1fr_auto] gap-8 items-start">
        <div className="space-y-7 min-w-0">
          <FormGroup title="Paper width" description="Match your thermal printer's roll.">
            <div role="radiogroup" aria-label="Paper width" className="grid grid-cols-2 gap-3 max-w-md">
              {[['58mm', '58 mm', 'Small counters, handheld printers'], ['80mm', '80 mm', 'Most desktop receipt printers']].map(([value, label, hint]) => {
                const on = form.receipt_width === value;
                return (
                  <button key={value} type="button" role="radio" aria-checked={on} onClick={() => set('receipt_width', value)}
                    className={`p-3 rounded-2xl border text-left cursor-pointer transition-all ${on ? 'border-brand-600 bg-brand-50 ring-1 ring-brand-600' : 'border-line hover:border-brand-200'}`}>
                    <span className={`block text-sm font-bold ${on ? 'text-brand-700' : 'text-ink'}`}>{label}</span>
                    <span className="block text-xs text-ink-muted mt-0.5">{hint}</span>
                  </button>
                );
              })}
            </div>
          </FormGroup>

          <FormGroup title="Print on the bill">
            <div className="space-y-3.5">
              <Switch checked={form.receipt_show_gstin} onChange={(v) => set('receipt_show_gstin', v)}
                label="GSTIN" description="Shown only when the shop is GST-registered." />
              <Switch checked={form.receipt_show_licences} onChange={(v) => set('receipt_show_licences', v)}
                label="Licence numbers" description="FSSAI and others marked “Print” under Tax & licences." />
              <Switch checked={form.receipt_show_customer} onChange={(v) => set('receipt_show_customer', v)}
                label="Customer name and phone" description="When a customer is added to the bill." />
            </div>
          </FormGroup>

          <FormGroup title="Footer message" description="Up to a few short lines, e.g. thanks, timings or a return policy.">
            <Textarea rows={3} maxLength={300} placeholder={'Thank you for your visit!\nOpen daily 7 am – 10 pm'}
              value={form.receipt_footer} onChange={(e) => set('receipt_footer', e.target.value)} className="max-w-md" />
          </FormGroup>
        </div>

        <div className="sticky top-0">
          <p className="text-xs font-semibold text-ink-muted mb-2 text-center">Preview</p>
          <div className="p-4 rounded-2xl bg-slate-100 border border-line">
            <ThermalReceipt order={SAMPLE_ORDER} items={SAMPLE_ITEMS} rollSize={form.receipt_width}
              profile={{ organization: org.organization, licences: org.licences, settings: form }} />
          </div>
        </div>
      </div>
    </SectionShell>
  );
}
