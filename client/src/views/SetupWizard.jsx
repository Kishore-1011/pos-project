import React, { useMemo, useState } from 'react';
import {
  Store, MapPin, BadgeCheck, Hash, UserRound, ClipboardCheck, Check, ArrowLeft, ArrowRight, UtensilsCrossed,
  ShoppingBasket, Wrench, ShieldCheck, WifiOff, Sparkles
} from 'lucide-react';
import { Button, TextInput, Select } from '../components/ui';
import { Switch, Note } from './settings/controls';
import { GST_STATES, REGISTRATION_LABELS, RESET_LABELS, SEPARATOR_OPTIONS, COMMON_TIME_ZONES, MONTHS, previewSeries } from './settings/settingsData';
import { PRODUCT_NAME } from '../config/brand';

const STEPS = [
  { id: 'business', title: 'Your business', icon: Store },
  { id: 'address', title: 'Address & contact', icon: MapPin },
  { id: 'tax', title: 'Tax & licences', icon: BadgeCheck },
  { id: 'series', title: 'Bill numbers', icon: Hash },
  { id: 'owner', title: 'Owner account', icon: UserRound },
  { id: 'review', title: 'Review', icon: ClipboardCheck }
];

const TYPES = [
  { value: 'FOOD', label: 'Food', hint: 'Restaurant, café, bakery, sweets', icon: UtensilsCrossed },
  { value: 'RETAIL', label: 'Retail', hint: 'Grocery, pharmacy, clothing, electronics', icon: ShoppingBasket },
  { value: 'SERVICES', label: 'Services', hint: 'Salon, repairs, laundry, studio', icon: Wrench }
];

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

const INITIAL = {
  organization: {
    legal_name: '', trade_name: '', address_line1: '', address_line2: '', city: '', state_code: '', pincode: '',
    phone: '', email: '', business_types: [], gst_registration_type: 'UNREGISTERED', gstin: '', pan: ''
  },
  fssai: '',
  number_series: {
    INVOICE: { prefix: 'INV', separator: '/', include_period: true, padding: 4, suffix: '', reset_policy: 'FINANCIAL_YEAR' },
    CUSTOMER: { prefix: 'CUST', separator: '-', include_period: false, padding: 4, suffix: '', reset_policy: 'NEVER' }
  },
  settings: { time_zone: 'Asia/Kolkata', fy_start_month: 4 },
  owner: { full_name: '', username: '', password: '', confirm: '', pin: '' }
};

// Which step a server field error belongs to
function stepForField(key) {
  if (/^organization\.(legal_name|trade_name|business_types)/.test(key)) return 0;
  if (/^organization\.(address|city|state_code|pincode|phone|email|website)/.test(key)) return 1;
  if (/^organization\./.test(key) || key.startsWith('licences')) return 2;
  if (key.startsWith('number_series') || key.startsWith('settings')) return 3;
  if (key.startsWith('owner')) return 4;
  return 5;
}

function validateStep(i, data) {
  const e = {};
  const o = data.organization;
  if (i === 0) {
    if (!o.trade_name.trim() && !o.legal_name.trim()) e['organization.trade_name'] = 'Enter the name customers know you by';
    if (!o.business_types.length) e['organization.business_types'] = 'Choose at least one';
  }
  if (i === 1) {
    if (o.pincode && !/^[1-9][0-9]{5}$/.test(o.pincode)) e['organization.pincode'] = 'PIN code must be 6 digits';
    if (o.phone && !/^[0-9]{10,11}$/.test(o.phone.replace(/[\s-]/g, '').replace(/^\+91/, '').replace(/^0/, ''))) e['organization.phone'] = 'Enter a 10-digit mobile or a landline with STD code';
    if (o.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(o.email)) e['organization.email'] = 'Enter a valid email address';
  }
  if (i === 2) {
    if (o.gst_registration_type !== 'UNREGISTERED') {
      if (!o.gstin) e['organization.gstin'] = 'GSTIN is required for a GST-registered business';
      else if (!GSTIN_RE.test(o.gstin)) e['organization.gstin'] = 'GSTIN format looks wrong (15 characters, e.g. 33AAPFU0939F1Z4)';
    }
    if (o.pan && !PAN_RE.test(o.pan)) e['organization.pan'] = 'PAN format is invalid (e.g. AAPFU0939F)';
    if (data.fssai && !/^[0-9]{14}$/.test(data.fssai.replace(/\s/g, ''))) e['licences[0]'] = 'FSSAI number must be 14 digits';
  }
  if (i === 3) {
    for (const code of ['INVOICE', 'CUSTOMER']) {
      const s = data.number_series[code];
      if (!/^[A-Za-z0-9/_.#-]*$/.test(s.prefix)) e[`number_series.${code}.prefix`] = "Only letters, digits and - / _ . # (no spaces)";
      if (s.reset_policy !== 'NEVER' && !s.include_period) e[`number_series.${code}.include_period`] = 'A series that starts again must show the period, or numbers will repeat';
    }
  }
  if (i === 4) {
    const w = data.owner;
    if (!w.full_name.trim()) e['owner.full_name'] = 'Enter your name';
    if (!/^[A-Za-z0-9._-]{3,32}$/.test(w.username)) e['owner.username'] = '3–32 characters: letters, digits, . _ - (no spaces)';
    if (w.password.length < 6) e['owner.password'] = 'At least 6 characters';
    else if (w.password !== w.confirm) e['owner.confirm'] = "Passwords don't match";
    if (w.pin && !/^\d{4,6}$/.test(w.pin)) e['owner.pin'] = 'PIN must be 4 to 6 digits';
  }
  return e;
}

/** First-run setup: business → address → tax → numbers → owner → review. Calls onComplete(token, user). */
export function SetupWizard({ onComplete }) {
  const [step, setStep] = useState(0);
  const [data, setData] = useState(INITIAL);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState('');

  const org = data.organization;
  const setOrg = (key, value) => { setData((d) => ({ ...d, organization: { ...d.organization, [key]: value } })); setErrors((e) => ({ ...e, [`organization.${key}`]: undefined })); };
  const setSeries = (code, key, value) => { setData((d) => ({ ...d, number_series: { ...d.number_series, [code]: { ...d.number_series[code], [key]: value } } })); setErrors((e) => ({ ...e, [`number_series.${code}.${key}`]: undefined })); };
  const setOwner = (key, value) => { setData((d) => ({ ...d, owner: { ...d.owner, [key]: value } })); setErrors((e) => ({ ...e, [`owner.${key}`]: undefined })); };
  const err = (key) => errors[key];
  const isFood = org.business_types.includes('FOOD');
  const shopName = org.trade_name || org.legal_name;

  const next = () => {
    const e = validateStep(step, data);
    setErrors(e);
    if (Object.keys(e).length) return;
    setBanner('');
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };
  const back = () => { setErrors({}); setStep((s) => Math.max(0, s - 1)); };
  const goTo = (i) => {
    if (i <= step) { setErrors({}); setStep(i); return; }
    for (let k = step; k < i; k++) {
      const e = validateStep(k, data);
      if (Object.keys(e).length) { setErrors(e); setStep(k); return; }
    }
    setStep(i);
  };

  const finish = async () => {
    for (let k = 0; k < 5; k++) {
      const e = validateStep(k, data);
      if (Object.keys(e).length) { setErrors(e); setStep(k); return; }
    }
    const body = {
      organization: {
        ...org,
        gstin: org.gst_registration_type === 'UNREGISTERED' ? '' : org.gstin,
        pan: org.pan
      },
      licences: data.fssai ? [{ type: 'FSSAI', number: data.fssai.replace(/\s/g, ''), print_on_bill: true }] : [],
      number_series: data.number_series,
      settings: { ...data.settings, business_day_cutoff: '00:00' },
      owner: { full_name: data.owner.full_name.trim(), username: data.owner.username.trim(), password: data.owner.password, ...(data.owner.pin ? { pin: data.owner.pin } : {}) }
    };
    setSubmitting(true);
    setBanner('');
    try {
      const res = await fetch('/api/setup/complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const out = await res.json().catch(() => ({}));
      if (res.ok) { onComplete?.(out.token, out.user); return; }
      if (res.status === 409) { setBanner('This shop has already been set up. Please sign in instead.'); return; }
      const fields = out.fields || {};
      setErrors(fields);
      const keys = Object.keys(fields);
      if (keys.length) {
        setStep(Math.min(...keys.map(stepForField)));
        setBanner(out.error || 'Please correct the highlighted fields.');
      } else setBanner(out.error || 'Setup could not be completed.');
    } catch (e) {
      setBanner('Could not reach the server. Check that the app is running and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const fyLabel = useMemo(() => {
    const d = new Date(); const start = d.getMonth() + 1 >= Number(data.settings.fy_start_month) ? d.getFullYear() : d.getFullYear() - 1;
    return Number(data.settings.fy_start_month) === 1 ? String(start) : `${String(start % 100).padStart(2, '0')}-${String((start + 1) % 100).padStart(2, '0')}`;
  }, [data.settings.fy_start_month]);

  const Current = STEPS[step];

  return (
    <div className="min-h-screen w-full bg-canvas flex">
      {/* Brand panel with the step list */}
      <aside className="w-[22rem] flex-shrink-0 bg-gradient-to-br from-brand-700 via-brand-600 to-indigo-700 text-white p-8 flex flex-col relative overflow-hidden">
        <span className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-white/10" aria-hidden="true" />
        <span className="absolute -bottom-32 -left-20 w-80 h-80 rounded-full bg-white/5" aria-hidden="true" />
        <div className="relative flex items-center gap-3">
          <img src="./favicon.svg" alt="" className="w-11 h-11 rounded-2xl bg-white/15 p-1" />
          <div>
            <p className="text-lg font-bold leading-tight">{PRODUCT_NAME}</p>
            <p className="text-xs text-white/70">Set up your counter</p>
          </div>
        </div>

        <ol className="relative mt-10 space-y-1.5" aria-label="Setup steps">
          {STEPS.map((s, i) => {
            const done = i < step;
            const on = i === step;
            const Icon = s.icon;
            return (
              <li key={s.id}>
                <button type="button" onClick={() => goTo(i)} aria-current={on ? 'step' : undefined}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-left transition-colors cursor-pointer ${on ? 'bg-white/15' : 'hover:bg-white/10'}`}>
                  <span className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${done ? 'bg-emerald-400 text-emerald-950' : on ? 'bg-white text-brand-700' : 'bg-white/10 text-white/70'}`}>
                    {done ? <Check className="w-4 h-4" strokeWidth={3} aria-hidden="true" /> : <Icon className="w-4 h-4" aria-hidden="true" />}
                  </span>
                  <span className={`text-sm font-semibold ${on ? 'text-white' : 'text-white/75'}`}>{s.title}</span>
                </button>
              </li>
            );
          })}
        </ol>

        <div className="relative mt-auto space-y-3 text-sm text-white/80">
          <p className="flex items-center gap-2.5"><Sparkles className="w-4 h-4" aria-hidden="true" />Takes about 3 minutes</p>
          <p className="flex items-center gap-2.5"><WifiOff className="w-4 h-4" aria-hidden="true" />Works fully offline</p>
          <p className="flex items-center gap-2.5"><ShieldCheck className="w-4 h-4" aria-hidden="true" />Bills can't be deleted or quietly edited</p>
        </div>
      </aside>

      {/* Form */}
      <main className="flex-1 min-w-0 flex flex-col">
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-10 pt-10 pb-6">
            <p className="text-xs font-bold uppercase tracking-wider text-brand-600">Step {step + 1} of {STEPS.length}</p>
            <h1 className="text-2xl font-bold text-ink tracking-tight mt-1">{Current.title}</h1>
            <div className="h-1.5 rounded-full bg-slate-200 mt-4 overflow-hidden" aria-hidden="true">
              <div className="h-full bg-brand-600 rounded-full transition-all duration-300" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
            </div>

            {banner && <div className="mt-5"><Note tone="error">{banner}</Note></div>}

            <div className="mt-7 space-y-6">
              {step === 0 && (
                <>
                  <p className="text-sm text-ink-muted">Welcome! Let's get your shop ready to bill. You can change all of this later in Settings.</p>
                  <div className="grid grid-cols-2 gap-4">
                    <TextInput label="Shop name" required placeholder="e.g. Ganesh Bhavan" value={org.trade_name}
                      onChange={(e) => setOrg('trade_name', e.target.value)} error={err('organization.trade_name')} hint="Printed large on every bill" data-autofocus />
                    <TextInput label="Legal / registered name" placeholder="e.g. Sri Ganesh Foods Pvt Ltd" value={org.legal_name}
                      onChange={(e) => setOrg('legal_name', e.target.value)} error={err('organization.legal_name')} hint="Optional, for tax records" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-ink-muted mb-2">What do you sell? <span className="font-normal">(choose all that apply)</span></p>
                    <div className="grid grid-cols-3 gap-3">
                      {TYPES.map((t) => {
                        const on = org.business_types.includes(t.value);
                        const Icon = t.icon;
                        return (
                          <button key={t.value} type="button" role="checkbox" aria-checked={on}
                            onClick={() => setOrg('business_types', on ? org.business_types.filter((x) => x !== t.value) : [...org.business_types, t.value])}
                            className={`relative p-4 rounded-2xl border text-left transition-all cursor-pointer ${on ? 'border-brand-600 bg-brand-50 ring-1 ring-brand-600 shadow-sm' : 'border-line bg-surface hover:border-brand-200'}`}>
                            {on && <span className="absolute top-3 right-3 w-5 h-5 rounded-full bg-brand-600 text-white flex items-center justify-center"><Check className="w-3 h-3" strokeWidth={3} /></span>}
                            <span className={`w-10 h-10 rounded-xl flex items-center justify-center ${on ? 'bg-brand-600 text-white' : 'bg-slate-100 text-ink-muted'}`}><Icon className="w-5 h-5" aria-hidden="true" /></span>
                            <span className="block text-sm font-bold text-ink mt-3">{t.label}</span>
                            <span className="block text-xs text-ink-muted mt-0.5">{t.hint}</span>
                          </button>
                        );
                      })}
                    </div>
                    {err('organization.business_types') && <p className="mt-2 text-xs font-medium text-rose-600">{err('organization.business_types')}</p>}
                  </div>
                </>
              )}

              {step === 1 && (
                <>
                  <p className="text-sm text-ink-muted">Shown at the top of your bills. All optional, but customers like to see it.</p>
                  <div className="grid grid-cols-2 gap-4">
                    <TextInput label="Address line 1" value={org.address_line1} onChange={(e) => setOrg('address_line1', e.target.value)} error={err('organization.address_line1')} />
                    <TextInput label="Address line 2" value={org.address_line2} onChange={(e) => setOrg('address_line2', e.target.value)} error={err('organization.address_line2')} />
                    <TextInput label="City" value={org.city} onChange={(e) => setOrg('city', e.target.value)} error={err('organization.city')} />
                    <div className="grid grid-cols-[1fr_8rem] gap-4">
                      <Select label="State" value={org.state_code} onChange={(e) => setOrg('state_code', e.target.value)} placeholder="Choose state"
                        options={GST_STATES.map((s) => ({ value: s.code, label: s.name }))} error={err('organization.state_code')} />
                      <TextInput label="PIN code" inputMode="numeric" maxLength={6} value={org.pincode} onChange={(e) => setOrg('pincode', e.target.value.replace(/\D/g, ''))} error={err('organization.pincode')} />
                    </div>
                    <TextInput label="Phone" inputMode="tel" placeholder="98765 43210" value={org.phone} onChange={(e) => setOrg('phone', e.target.value)} error={err('organization.phone')} />
                    <TextInput label="Email" type="email" value={org.email} onChange={(e) => setOrg('email', e.target.value)} error={err('organization.email')} />
                  </div>
                </>
              )}

              {step === 2 && (
                <>
                  <div role="radiogroup" aria-label="GST registration" className="grid grid-cols-3 gap-3">
                    {Object.entries(REGISTRATION_LABELS).map(([value, label]) => {
                      const on = org.gst_registration_type === value;
                      return (
                        <button key={value} type="button" role="radio" aria-checked={on} onClick={() => setOrg('gst_registration_type', value)}
                          className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${on ? 'border-brand-600 bg-brand-50 ring-1 ring-brand-600' : 'border-line bg-surface hover:border-brand-200'}`}>
                          <span className={`block text-sm font-bold ${on ? 'text-brand-700' : 'text-ink'}`}>{label}</span>
                          <span className="block text-xs text-ink-muted mt-0.5">{value === 'REGULAR' ? 'Bills are Tax Invoices' : value === 'COMPOSITION' ? 'Bills of Supply with GSTIN' : 'Bills of Supply, no GSTIN'}</span>
                        </button>
                      );
                    })}
                  </div>
                  {org.gst_registration_type !== 'UNREGISTERED' && (
                    <div className="grid grid-cols-2 gap-4">
                      <TextInput label="GSTIN" required maxLength={15} placeholder="e.g. 33AAPFU0939F1Z4" value={org.gstin}
                        onChange={(e) => setOrg('gstin', e.target.value.toUpperCase().replace(/\s/g, ''))} error={err('organization.gstin')}
                        hint="Your state and PAN are filled in from it" inputClassName="font-mono tracking-wider" />
                      <TextInput label="PAN" maxLength={10} placeholder="Optional" value={org.pan}
                        onChange={(e) => setOrg('pan', e.target.value.toUpperCase().replace(/\s/g, ''))} error={err('organization.pan')} inputClassName="font-mono tracking-wider" />
                    </div>
                  )}
                  {isFood ? (
                    <div className="p-4 rounded-2xl border border-line bg-surface space-y-3">
                      <Note tone="info" icon={UtensilsCrossed}>Food businesses must print their FSSAI licence or registration number on bills.</Note>
                      <TextInput label="FSSAI number" inputMode="numeric" placeholder="14 digits" value={data.fssai}
                        onChange={(e) => { setData((d) => ({ ...d, fssai: e.target.value })); setErrors((x) => ({ ...x, 'licences[0]': undefined })); }}
                        error={err('licences[0]')} hint="You can add other licences later in Settings." inputClassName="font-mono" />
                    </div>
                  ) : (
                    <p className="text-sm text-ink-muted">Licence numbers (drug licence, trade licence and others) can be added later in Settings → Tax & licences.</p>
                  )}
                </>
              )}

              {step === 3 && (
                <>
                  <p className="text-sm text-ink-muted">We've picked sensible defaults. Most shops keep them.</p>
                  {['INVOICE', 'CUSTOMER'].map((code) => {
                    const s = data.number_series[code];
                    return (
                      <div key={code} className="rounded-2xl border border-line bg-surface overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-3 bg-slate-50/70 border-b border-line">
                          <p className="text-sm font-bold text-ink">{code === 'INVOICE' ? 'Invoice numbers' : 'Customer codes'}</p>
                          <p className="font-mono text-lg font-bold text-brand-700" aria-live="polite">{previewSeries(s)}</p>
                        </div>
                        <div className="p-4 grid grid-cols-6 gap-3 items-end">
                          <TextInput className="col-span-2" label="Prefix" maxLength={10} value={s.prefix} onChange={(e) => setSeries(code, 'prefix', e.target.value.replace(/\s/g, ''))} error={err(`number_series.${code}.prefix`)} inputClassName="font-mono" />
                          <Select className="col-span-2" label="Separator" value={s.separator} onChange={(e) => setSeries(code, 'separator', e.target.value)} options={SEPARATOR_OPTIONS} />
                          <Select className="col-span-2" label="Starts again" value={s.reset_policy} onChange={(e) => setSeries(code, 'reset_policy', e.target.value)}
                            options={Object.entries(RESET_LABELS).map(([value, label]) => ({ value, label }))} error={err(`number_series.${code}.reset_policy`)} />
                          <div className="col-span-6">
                            <Switch checked={s.include_period} onChange={(v) => setSeries(code, 'include_period', v)} label="Show the period in the number" description={`e.g. ${fyLabel} for this financial year`} />
                            {err(`number_series.${code}.include_period`) && <p className="mt-1 text-xs font-medium text-rose-600">{err(`number_series.${code}.include_period`)}</p>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div className="grid grid-cols-2 gap-4">
                    <Select label="Time zone" value={data.settings.time_zone} onChange={(e) => setData((d) => ({ ...d, settings: { ...d.settings, time_zone: e.target.value } }))}
                      options={COMMON_TIME_ZONES} error={err('settings.time_zone')} />
                    <Select label="Financial year starts in" value={String(data.settings.fy_start_month)}
                      onChange={(e) => setData((d) => ({ ...d, settings: { ...d.settings, fy_start_month: Number(e.target.value) } }))}
                      options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))} error={err('settings.fy_start_month')}
                      hint="Can't be changed after the first bill" />
                  </div>
                </>
              )}

              {step === 4 && (
                <>
                  <p className="text-sm text-ink-muted">You'll be the shop Owner, with full access. Add staff later from the Staff screen.</p>
                  <div className="grid grid-cols-2 gap-4">
                    <TextInput label="Your name" required value={data.owner.full_name} onChange={(e) => setOwner('full_name', e.target.value)} error={err('owner.full_name')} />
                    <TextInput label="Username" required autoComplete="username" value={data.owner.username} onChange={(e) => setOwner('username', e.target.value.trim())} error={err('owner.username')} hint="Used to sign in" />
                    <TextInput label="Password" required type="password" autoComplete="new-password" value={data.owner.password} onChange={(e) => setOwner('password', e.target.value)} error={err('owner.password')} hint="At least 6 characters" />
                    <TextInput label="Confirm password" required type="password" autoComplete="new-password" value={data.owner.confirm} onChange={(e) => setOwner('confirm', e.target.value)} error={err('owner.confirm')} />
                    <TextInput label="Quick-switch PIN" type="password" inputMode="numeric" maxLength={6} placeholder="Optional, 4–6 digits" value={data.owner.pin}
                      onChange={(e) => setOwner('pin', e.target.value.replace(/\D/g, ''))} error={err('owner.pin')} hint="To hand over the counter quickly" />
                  </div>
                </>
              )}

              {step === 5 && (
                <div className="space-y-4">
                  <p className="text-sm text-ink-muted">Check everything once. Click a step on the left to change it.</p>
                  {[
                    ['Business', [shopName, org.legal_name && org.legal_name !== shopName ? org.legal_name : null, org.business_types.map((t) => TYPES.find((x) => x.value === t)?.label).join(' · ')], 0],
                    ['Address', [[org.address_line1, org.address_line2].filter(Boolean).join(', '), [org.city, GST_STATES.find((s) => s.code === org.state_code)?.name, org.pincode].filter(Boolean).join(', '), [org.phone, org.email].filter(Boolean).join(' · ')], 1],
                    ['Tax', [REGISTRATION_LABELS[org.gst_registration_type], org.gst_registration_type !== 'UNREGISTERED' ? `GSTIN ${org.gstin}` : null, data.fssai ? `FSSAI ${data.fssai}` : null], 2],
                    ['Bill numbers', [`Invoices: ${previewSeries(data.number_series.INVOICE)}`, `Customers: ${previewSeries(data.number_series.CUSTOMER)}`, `${data.settings.time_zone} · FY from ${MONTHS[data.settings.fy_start_month - 1]}`], 3],
                    ['Owner', [data.owner.full_name, `@${data.owner.username}`, data.owner.pin ? 'Quick-switch PIN set' : 'No PIN'], 4]
                  ].map(([title, lines, i]) => (
                    <div key={title} className="flex items-start justify-between gap-4 p-4 rounded-2xl border border-line bg-surface">
                      <div className="min-w-0">
                        <p className="text-xs font-bold uppercase tracking-wide text-ink-subtle">{title}</p>
                        {lines.filter(Boolean).map((l, k) => <p key={k} className={`text-sm truncate ${k === 0 ? 'font-bold text-ink' : 'text-ink-muted'}`}>{l}</p>)}
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => goTo(i)}>Edit</Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="border-t border-line bg-surface">
          <div className="max-w-3xl mx-auto px-10 py-4 flex items-center justify-between">
            <Button variant="ghost" icon={ArrowLeft} onClick={back} disabled={step === 0 || submitting}>Back</Button>
            {step < STEPS.length - 1 ? (
              <Button iconRight={ArrowRight} onClick={next}>Continue</Button>
            ) : (
              <Button variant="success" size="lg" icon={Check} loading={submitting} onClick={finish}>Finish & open the counter</Button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
