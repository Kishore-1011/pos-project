import React, { useEffect, useRef, useState } from 'react';
import { Hash, FileText, UserCheck, AlertTriangle, Info, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { TextInput, Select, useToast } from '../../components/ui';
import { SectionShell } from './SectionShell';
import { Note, Switch } from './controls';
import { apiJson, RESET_LABELS, SEPARATOR_OPTIONS } from './settingsData';

const EDITABLE = ['prefix', 'separator', 'include_period', 'padding', 'suffix', 'reset_policy'];
const pickForm = (s) => ({ ...Object.fromEntries(EDITABLE.map((k) => [k, s[k]])), next_number: '' });
const META = {
  INVOICE: { title: 'Invoice numbers', icon: FileText, blurb: 'Printed on every bill.' },
  CUSTOMER: { title: 'Customer codes', icon: UserCheck, blurb: 'Given to each new customer.' }
};

function diff(form, series) {
  const out = {};
  for (const k of EDITABLE) if (form[k] !== series[k]) out[k] = form[k];
  if (form.next_number !== '' && form.next_number !== null) out.next_number = Number(form.next_number);
  return out;
}

function SeriesCard({ series, form, setForm, errors, preview, previewError, previewLoading }) {
  const meta = META[series.code] || { title: series.name, icon: Hash };
  const Icon = meta.icon;
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  return (
    <div className="rounded-2xl border border-line overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 bg-slate-50/70 border-b border-line">
        <div className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-xl bg-brand-600 text-white flex items-center justify-center"><Icon className="w-4 h-4" aria-hidden="true" /></span>
          <div>
            <p className="text-sm font-bold text-ink">{meta.title}</p>
            <p className="text-xs text-ink-muted">{meta.blurb}</p>
          </div>
        </div>
        {/* Live preview: exactly what the next number will look like */}
        <div className="text-right">
          <p className="text-[11px] uppercase tracking-wide font-semibold text-ink-subtle">Next number</p>
          <p className={`font-mono text-lg font-bold tracking-tight ${previewError ? 'text-rose-600' : 'text-brand-700'}`} aria-live="polite">
            {previewLoading ? <Loader2 className="w-4 h-4 animate-spin inline" aria-hidden="true" /> : preview || series.next_value}
          </p>
        </div>
      </div>
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-6 gap-3">
          <TextInput className="col-span-2" label="Prefix" value={form.prefix} maxLength={10} onChange={(e) => set('prefix', e.target.value.replace(/\s/g, ''))} error={errors.prefix} inputClassName="font-mono" />
          <Select className="col-span-2" label="Separator" value={form.separator} onChange={(e) => set('separator', e.target.value)} options={SEPARATOR_OPTIONS} error={errors.separator} />
          <Select label="Digits" value={String(form.padding)} onChange={(e) => set('padding', Number(e.target.value))}
            options={[1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ value: String(n), label: String(n) }))} error={errors.padding} />
          <TextInput label="Suffix" value={form.suffix} maxLength={10} onChange={(e) => set('suffix', e.target.value.replace(/\s/g, ''))} error={errors.suffix} inputClassName="font-mono" />
        </div>
        <div className="grid grid-cols-2 gap-3 items-end">
          <Select label="Start again from 1" value={form.reset_policy} onChange={(e) => set('reset_policy', e.target.value)}
            options={Object.entries(RESET_LABELS).map(([value, label]) => ({ value, label }))} error={errors.reset_policy} />
          <TextInput label="Next number (optional)" type="number" min={1} placeholder={`currently ${series.next_number}`}
            value={form.next_number} onChange={(e) => set('next_number', e.target.value)} error={errors.next_number}
            hint="Only moves forward, e.g. to continue from a paper bill book." />
        </div>
        <Switch checked={form.include_period} onChange={(v) => set('include_period', v)}
          label="Show the period in the number" description="e.g. 26-27 for the financial year. Required when numbers start again." />
        {errors.include_period && <p className="text-xs font-medium text-rose-600">{errors.include_period}</p>}
        {previewError && !Object.keys(errors).length && <Note tone="error" icon={AlertTriangle}>{previewError}</Note>}
        {series.gst_rules_apply && (
          <Note tone="info" icon={Info}>Your shop is GST-registered, so invoice numbers follow GST rules: at most 16 characters, letters, digits, “-” and “/” only.</Note>
        )}
        {(series.warnings || []).map((w) => <Note key={w} tone="warning" icon={AlertTriangle}>{w}</Note>)}
      </div>
    </div>
  );
}

export function NumberSeriesSection({ onDirtyChange }) {
  const { authFetch } = useAuth();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [list, setList] = useState([]);
  const [forms, setForms] = useState({});
  const [errors, setErrors] = useState({});
  const [previews, setPreviews] = useState({});
  const timers = useRef({});

  const load = async () => {
    const { ok, data } = await apiJson(authFetch, '/api/number-series');
    if (ok) {
      const ordered = [...data.series].sort((a, b) => (a.code === 'INVOICE' ? -1 : b.code === 'INVOICE' ? 1 : 0));
      setList(ordered);
      setForms(Object.fromEntries(ordered.map((s) => [s.code, pickForm(s)])));
      setPreviews({});
    } else toast.error(data.error || 'Could not load number series');
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const changes = Object.fromEntries(list.map((s) => [s.code, forms[s.code] ? diff(forms[s.code], s) : {}]));
  const dirty = Object.values(changes).some((c) => Object.keys(c).length > 0);
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty]);

  // Debounced live preview from the server (same rules as saving)
  const changeKey = JSON.stringify(changes);
  useEffect(() => {
    for (const s of list) {
      const body = changes[s.code];
      clearTimeout(timers.current[s.code]);
      if (!body || !Object.keys(body).length) { setPreviews((p) => ({ ...p, [s.code]: undefined })); continue; }
      setPreviews((p) => ({ ...p, [s.code]: { ...(p[s.code] || {}), loading: true } }));
      timers.current[s.code] = setTimeout(async () => {
        const { ok, data } = await apiJson(authFetch, `/api/number-series/${s.code}/preview`, { method: 'POST', body });
        setPreviews((p) => ({
          ...p,
          [s.code]: ok ? { value: data.preview } : { error: Object.values(data.fields || {})[0] || data.error }
        }));
      }, 350);
    }
    return undefined;
  }, [changeKey]);

  const setFormFor = (code) => (updater) => {
    setForms((f) => ({ ...f, [code]: typeof updater === 'function' ? updater(f[code]) : updater }));
    setErrors((e) => ({ ...e, [code]: {} }));
  };

  const save = async () => {
    setSaving(true);
    const nextErrors = {};
    let savedAny = false;
    for (const s of list) {
      const body = changes[s.code];
      if (!body || !Object.keys(body).length) continue;
      const { ok, data } = await apiJson(authFetch, `/api/number-series/${s.code}`, { method: 'PUT', body });
      if (ok) savedAny = true;
      else nextErrors[s.code] = data.fields || { prefix: data.error };
    }
    setSaving(false);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      toast.error('Some changes were not saved. Check the highlighted fields.');
      if (savedAny) {
        // reload saved series but keep the failing form as typed
        const failing = Object.fromEntries(Object.keys(nextErrors).map((c) => [c, forms[c]]));
        await load();
        setForms((f) => ({ ...f, ...failing }));
        setErrors(nextErrors);
      }
      return;
    }
    await load();
    toast.success('Number series saved');
  };

  return (
    <SectionShell
      icon={Hash}
      title="Bill numbers"
      description="How invoice numbers and customer codes look, and when they start again."
      loading={loading}
      dirty={dirty}
      saving={saving}
      onSave={save}
      onCancel={() => { setForms(Object.fromEntries(list.map((s) => [s.code, pickForm(s)]))); setErrors({}); setPreviews({}); }}
    >
      <div className="space-y-5">
        {list.map((s) => (
          <SeriesCard
            key={s.code}
            series={s}
            form={forms[s.code] || pickForm(s)}
            setForm={setFormFor(s.code)}
            errors={errors[s.code] || {}}
            preview={previews[s.code]?.value}
            previewError={previews[s.code]?.error}
            previewLoading={previews[s.code]?.loading}
          />
        ))}
      </div>
    </SectionShell>
  );
}
