import React, { useEffect, useState } from 'react';
import { BadgeCheck, Plus, Trash2, AlertTriangle, Info } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { TextInput, Select, Button, useToast } from '../../components/ui';
import { SectionShell } from './SectionShell';
import { FormGroup, Note, Switch } from './controls';
import { apiJson, REGISTRATION_LABELS, LICENCE_TYPES } from './settingsData';
import { invalidateReceiptProfile } from './receiptProfile';

const pickTax = (org) => ({
  gst_registration_type: org?.gst_registration_type || 'UNREGISTERED',
  gstin: org?.gstin || '',
  pan: org?.pan || ''
});
const cleanLicence = (l) => ({
  type: l.type, label: l.label || '', number: l.number || '', valid_until: l.valid_until || '', print_on_bill: l.print_on_bill !== false
});

export function TaxSection({ onDirtyChange }) {
  const { authFetch } = useAuth();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [orig, setOrig] = useState(null);
  const [tax, setTax] = useState(pickTax({}));
  const [licences, setLicences] = useState([]);
  const [businessTypes, setBusinessTypes] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [errors, setErrors] = useState({});

  const apply = (data) => {
    const t = pickTax(data.organization);
    const l = (data.licences || []).map(cleanLicence);
    setOrig({ tax: t, licences: l });
    setTax(t);
    setLicences(l);
    setBusinessTypes(data.organization?.business_types || []);
    setWarnings(data.warnings || []);
  };

  useEffect(() => {
    apiJson(authFetch, '/api/organization').then(({ ok, data }) => {
      if (ok) apply(data);
      else toast.error(data.error || 'Could not load tax details');
      setLoading(false);
    });
  }, []);

  const taxChanged = orig && JSON.stringify(tax) !== JSON.stringify(orig.tax);
  const licencesChanged = orig && JSON.stringify(licences) !== JSON.stringify(orig.licences);
  const dirty = Boolean(taxChanged || licencesChanged);
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty]);

  const registered = tax.gst_registration_type !== 'UNREGISTERED';

  const setRegistration = (value) => {
    // Unregistered shops can't keep a GSTIN; clear it so the save goes through
    setTax((t) => (value === 'UNREGISTERED' ? { ...t, gst_registration_type: value, gstin: '', pan: t.pan } : { ...t, gst_registration_type: value }));
    setErrors({});
  };

  const updateLicence = (i, patch) => {
    setLicences((list) => list.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
    setErrors((e) => ({ ...e, [`licences[${i}]`]: undefined }));
  };

  const addLicence = (type = 'FSSAI') => setLicences((list) => [...list, { type, label: '', number: '', valid_until: '', print_on_bill: true }]);

  const save = async () => {
    setSaving(true);
    let latest = null;
    if (taxChanged) {
      const body = {};
      for (const k of Object.keys(tax)) if (tax[k] !== orig.tax[k]) body[k] = tax[k];
      // Moving to unregistered: clear GSTIN and PAN together, as the server requires
      if (body.gst_registration_type === 'UNREGISTERED') { body.gstin = ''; body.pan = ''; }
      const res = await apiJson(authFetch, '/api/organization', { method: 'PUT', body });
      if (!res.ok) { setSaving(false); setErrors(res.data.fields || {}); toast.error(res.data.error || 'Could not save tax details'); return; }
      latest = res.data;
    }
    if (licencesChanged) {
      const body = { licences: licences.map((l) => ({ ...l, valid_until: l.valid_until || null })) };
      const res = await apiJson(authFetch, '/api/organization/licences', { method: 'PUT', body });
      if (!res.ok) {
        setSaving(false);
        setErrors(res.data.fields || {});
        toast.error(res.data.error || 'Could not save licences');
        if (latest) apply({ ...latest, licences: orig.licences });
        return;
      }
      latest = res.data;
    }
    setSaving(false);
    if (latest) apply(latest);
    setErrors({});
    invalidateReceiptProfile();
    toast.success('Tax and licence details saved');
  };

  const isFood = businessTypes.includes('FOOD');
  const hasFssai = licences.some((l) => l.type === 'FSSAI');
  const crossFieldError = errors.state_code;

  return (
    <SectionShell
      icon={BadgeCheck}
      title="Tax & licences"
      description="GST registration and the licence numbers printed on your bills."
      loading={loading}
      dirty={dirty}
      saving={saving}
      onSave={save}
      onCancel={() => { setTax(orig.tax); setLicences(orig.licences); setErrors({}); }}
    >
      <div className="space-y-7">
        {warnings.length > 0 && (
          <div className="space-y-2">
            {warnings.map((w) => <Note key={w.code + w.message} tone="warning" icon={AlertTriangle}>{w.message}</Note>)}
          </div>
        )}

        <FormGroup title="GST registration" description="Regular and composition dealers need a GSTIN. Composition and unregistered shops print a Bill of Supply.">
          <div role="radiogroup" aria-label="GST registration" className="grid grid-cols-3 gap-3">
            {Object.entries(REGISTRATION_LABELS).map(([value, label]) => {
              const on = tax.gst_registration_type === value;
              return (
                <button key={value} type="button" role="radio" aria-checked={on} onClick={() => setRegistration(value)}
                  className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${on ? 'border-brand-600 bg-brand-50 ring-1 ring-brand-600' : 'border-line hover:border-brand-200 bg-surface'}`}>
                  <span className={`block text-sm font-bold ${on ? 'text-brand-700' : 'text-ink'}`}>{label}</span>
                  <span className="block text-xs text-ink-muted mt-0.5">
                    {value === 'REGULAR' ? 'Tax Invoice with GST' : value === 'COMPOSITION' ? 'Bill of Supply, GSTIN printed' : 'Bill of Supply, no GSTIN'}
                  </span>
                </button>
              );
            })}
          </div>
          {registered && (
            <div className="grid grid-cols-2 gap-4 pt-1">
              <TextInput label="GSTIN" required placeholder="e.g. 33AAPFU0939F1Z4" maxLength={15}
                value={tax.gstin} onChange={(e) => { setTax((t) => ({ ...t, gstin: e.target.value.toUpperCase().replace(/\s/g, '') })); setErrors({}); }}
                error={errors.gstin} hint="15 characters. The state and PAN are checked against it." inputClassName="font-mono tracking-wider" />
              <TextInput label="PAN" placeholder="Filled in from the GSTIN if left blank" maxLength={10}
                value={tax.pan} onChange={(e) => { setTax((t) => ({ ...t, pan: e.target.value.toUpperCase().replace(/\s/g, '') })); setErrors({}); }}
                error={errors.pan} inputClassName="font-mono tracking-wider" />
            </div>
          )}
          {crossFieldError && <Note tone="error" icon={AlertTriangle}>{crossFieldError} You can change the state under Business.</Note>}
        </FormGroup>

        <FormGroup title="Licences" description="Printed on bills when “Print” is on. Up to 10.">
          {isFood && !hasFssai && (
            <Note tone="info" icon={Info}>
              Food businesses must show an FSSAI licence or registration number on bills.{' '}
              <button type="button" onClick={() => addLicence('FSSAI')} className="font-bold text-brand-700 underline cursor-pointer">Add FSSAI</button>
            </Note>
          )}
          <div className="space-y-2.5">
            {licences.map((l, i) => (
              <div key={i} className={`grid grid-cols-[13rem_1fr_9.5rem_auto_auto] gap-3 items-end p-3 rounded-2xl border ${errors[`licences[${i}]`] ? 'border-rose-300 bg-rose-50/40' : 'border-line bg-slate-50/50'}`}>
                <Select label="Type" value={l.type} onChange={(e) => updateLicence(i, { type: e.target.value })}
                  options={LICENCE_TYPES.map((t) => ({ value: t.type, label: t.name }))} />
                <div className="grid gap-2" style={{ gridTemplateColumns: l.type === 'OTHER' ? '9rem 1fr' : '1fr' }}>
                  {l.type === 'OTHER' && (
                    <TextInput label="Label" placeholder="e.g. Labour Reg." value={l.label} onChange={(e) => updateLicence(i, { label: e.target.value })} />
                  )}
                  <TextInput label="Number" placeholder={l.type === 'FSSAI' ? '14 digits' : 'Licence number'} value={l.number}
                    onChange={(e) => updateLicence(i, { number: e.target.value })} inputClassName="font-mono" />
                </div>
                <TextInput label="Valid until" type="date" value={l.valid_until || ''} onChange={(e) => updateLicence(i, { valid_until: e.target.value })} />
                <div className="pb-2"><Switch checked={l.print_on_bill} onChange={(v) => updateLicence(i, { print_on_bill: v })} label="Print" /></div>
                <Button variant="danger-quiet" size="md" icon={Trash2} aria-label="Remove licence"
                  onClick={() => setLicences((list) => list.filter((_, idx) => idx !== i))} />
                {errors[`licences[${i}]`] && <p className="col-span-5 text-xs font-medium text-rose-600">{errors[`licences[${i}]`]}</p>}
              </div>
            ))}
          </div>
          {licences.length < 10 && (
            <Button variant="secondary" size="sm" icon={Plus} onClick={() => addLicence(isFood && !hasFssai ? 'FSSAI' : 'SHOP_ESTABLISHMENT')}>Add licence</Button>
          )}
          {errors.licences && <p className="text-xs font-medium text-rose-600">{errors.licences}</p>}
        </FormGroup>
      </div>
    </SectionShell>
  );
}
