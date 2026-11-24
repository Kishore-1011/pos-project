import React, { useEffect, useRef, useState } from 'react';
import { Building2, ImagePlus, Trash2, Store } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { TextInput, Select, Button, useToast } from '../../components/ui';
import { SectionShell } from './SectionShell';
import { FormGroup } from './controls';
import { apiJson, changedFields } from './settingsData';
import { invalidateReceiptProfile } from './receiptProfile';

const FIELDS = ['legal_name', 'trade_name', 'address_line1', 'address_line2', 'city', 'state_code', 'pincode', 'phone', 'email', 'website'];
const pick = (org) => Object.fromEntries(FIELDS.map((k) => [k, org?.[k] ?? '']));

export function OrganizationSection({ onDirtyChange }) {
  const { authFetch } = useAuth();
  const toast = useToast();
  const fileRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [original, setOriginal] = useState(null);
  const [form, setForm] = useState(pick({}));
  const [logoUrl, setLogoUrl] = useState(null);
  const [states, setStates] = useState([]);
  const [errors, setErrors] = useState({});

  const apply = (data) => {
    const p = pick(data.organization);
    setOriginal(p);
    setForm(p);
    setLogoUrl(data.organization?.logo_url || null);
    if (data.options?.states) setStates(data.options.states);
  };

  useEffect(() => {
    apiJson(authFetch, '/api/organization').then(({ ok, data }) => {
      if (ok) apply(data);
      else toast.error(data.error || 'Could not load business details');
      setLoading(false);
    });
  }, []);

  const changes = original ? changedFields(form, original) : {};
  const dirty = Object.keys(changes).length > 0;
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty]);

  const set = (key) => (e) => { setForm((f) => ({ ...f, [key]: e.target.value })); setErrors((er) => ({ ...er, [key]: undefined })); };

  const save = async () => {
    setSaving(true);
    const { ok, data } = await apiJson(authFetch, '/api/organization', { method: 'PUT', body: changes });
    setSaving(false);
    if (ok) {
      apply(data);
      setErrors({});
      invalidateReceiptProfile();
      toast.success('Business details saved');
    } else {
      setErrors(data.fields || {});
      toast.error(data.error || 'Could not save');
    }
  };

  const uploadLogo = async (file) => {
    if (!file) return;
    const form = new FormData();
    form.append('logo', file);
    setUploading(true);
    const { ok, data } = await apiJson(authFetch, '/api/organization/logo', { method: 'POST', form });
    setUploading(false);
    if (ok) { setLogoUrl(data.organization?.logo_url || null); invalidateReceiptProfile(); toast.success('Logo updated'); }
    else toast.error(data.error || 'Could not upload the logo');
    if (fileRef.current) fileRef.current.value = '';
  };

  const removeLogo = async () => {
    const { ok, data } = await apiJson(authFetch, '/api/organization/logo', { method: 'DELETE' });
    if (ok) { setLogoUrl(null); invalidateReceiptProfile(); toast.success('Logo removed'); }
    else toast.error(data.error || 'Could not remove the logo');
  };

  const displayName = form.trade_name || form.legal_name;

  return (
    <SectionShell
      icon={Building2}
      title="Business"
      description="Your shop's name and contact details, as customers see them on bills."
      loading={loading}
      dirty={dirty}
      saving={saving}
      onSave={save}
      onCancel={() => { setForm(original); setErrors({}); }}
    >
      <div className="space-y-7">
        {/* Identity card with logo */}
        <div className="flex items-center gap-5 p-4 rounded-2xl bg-gradient-to-br from-brand-50 via-surface to-surface border border-brand-100">
          <div className="w-20 h-20 rounded-2xl bg-surface border border-line flex items-center justify-center overflow-hidden flex-shrink-0 shadow-sm">
            {logoUrl ? <img src={logoUrl} alt="Shop logo" className="w-full h-full object-contain" /> : <Store className="w-8 h-8 text-ink-subtle" aria-hidden="true" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold text-ink truncate">{displayName || 'Your shop name'}</p>
            <p className="text-sm text-ink-muted truncate">{[form.city, states.find((s) => s.code === form.state_code)?.name].filter(Boolean).join(', ') || 'Add your address below'}</p>
            <div className="flex items-center gap-2 mt-2.5">
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => uploadLogo(e.target.files?.[0])} />
              <Button size="sm" variant="secondary" icon={ImagePlus} loading={uploading} onClick={() => fileRef.current?.click()}>
                {logoUrl ? 'Change logo' : 'Upload logo'}
              </Button>
              {logoUrl && <Button size="sm" variant="danger-quiet" icon={Trash2} onClick={removeLogo}>Remove</Button>}
              <span className="text-xs text-ink-subtle">PNG, JPG or WebP, up to 2 MB</span>
            </div>
          </div>
        </div>

        <FormGroup title="Names" description="The trade name is printed large on bills; the legal name is used for tax records.">
          <div className="grid grid-cols-2 gap-4">
            <TextInput label="Trade name" placeholder="e.g. Ganesh Bhavan" value={form.trade_name} onChange={set('trade_name')} error={errors.trade_name} />
            <TextInput label="Legal name" placeholder="e.g. Sri Ganesh Foods Pvt Ltd" value={form.legal_name} onChange={set('legal_name')} error={errors.legal_name} />
          </div>
        </FormGroup>

        <FormGroup title="Address">
          <div className="grid grid-cols-2 gap-4">
            <TextInput label="Address line 1" value={form.address_line1} onChange={set('address_line1')} error={errors.address_line1} />
            <TextInput label="Address line 2" value={form.address_line2} onChange={set('address_line2')} error={errors.address_line2} />
            <TextInput label="City" value={form.city} onChange={set('city')} error={errors.city} />
            <div className="grid grid-cols-[1fr_8rem] gap-4">
              <Select label="State" value={form.state_code || ''} onChange={set('state_code')} error={errors.state_code}
                placeholder="Choose state" options={states.map((s) => ({ value: s.code, label: `${s.name} (${s.code})` }))} />
              <TextInput label="PIN code" inputMode="numeric" maxLength={6} value={form.pincode} onChange={set('pincode')} error={errors.pincode} />
            </div>
          </div>
        </FormGroup>

        <FormGroup title="Contact">
          <div className="grid grid-cols-3 gap-4">
            <TextInput label="Phone" inputMode="tel" placeholder="98765 43210" value={form.phone} onChange={set('phone')} error={errors.phone} />
            <TextInput label="Email" type="email" value={form.email} onChange={set('email')} error={errors.email} />
            <TextInput label="Website" placeholder="optional" value={form.website} onChange={set('website')} error={errors.website} />
          </div>
        </FormGroup>
      </div>
    </SectionShell>
  );
}
