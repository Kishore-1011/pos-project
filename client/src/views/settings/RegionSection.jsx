import React, { useEffect, useState } from 'react';
import { Globe2, Lock, CalendarDays, Clock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { TextInput, Select, useToast } from '../../components/ui';
import { SectionShell } from './SectionShell';
import { FormGroup, Note } from './controls';
import { apiJson, changedFields, COMMON_TIME_ZONES, MONTHS } from './settingsData';
import { invalidateReceiptProfile } from './receiptProfile';
import { setShopCalendar } from '../../utils/datetime';
import { formatDate } from '../../utils/format';

const KEYS = ['time_zone', 'fy_start_month', 'business_day_cutoff'];
const pick = (s) => Object.fromEntries(KEYS.map((k) => [k, s?.[k]]));
const OTHER = '__other__';
const CUTOFFS = Array.from({ length: 13 }, (_, i) => {
  const h = Math.floor(i / 2); const m = i % 2 ? '30' : '00';
  return `${String(h).padStart(2, '0')}:${m}`;
});

export function RegionSection({ onDirtyChange }) {
  const { authFetch } = useAuth();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [orig, setOrig] = useState(null);
  const [form, setForm] = useState(pick({}));
  const [calendar, setCalendar] = useState(null);
  const [errors, setErrors] = useState({});
  const [otherZone, setOtherZone] = useState(false);

  const apply = (data) => {
    const p = pick(data);
    setOrig(p);
    setForm(p);
    setCalendar(data.calendar || null);
    setOtherZone(!COMMON_TIME_ZONES.some((z) => z.value === p.time_zone));
  };

  useEffect(() => {
    apiJson(authFetch, '/api/settings').then(({ ok, data }) => {
      if (ok) apply(data);
      else toast.error(data.error || 'Could not load settings');
      setLoading(false);
    });
  }, []);

  const changes = orig ? changedFields(form, orig) : {};
  const dirty = Object.keys(changes).length > 0;
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty]);

  const save = async () => {
    setSaving(true);
    const { ok, status, data } = await apiJson(authFetch, '/api/settings', { method: 'PUT', body: changes });
    setSaving(false);
    if (ok) {
      apply(data);
      setErrors({});
      setShopCalendar(data); // screens follow the new time zone / cutoff right away
      invalidateReceiptProfile();
      toast.success('Region and year saved');
      return;
    }
    // Settings errors are a single message; attach it to the field it is about
    const msg = data.error || 'Could not save';
    const key = status === 409 ? 'fy_start_month' : KEYS.find((k) => msg.includes(k)) || (msg.includes('time zone') ? 'time_zone' : null);
    setErrors(key ? { [key]: msg.replace(/^[a-z_]+ must/, 'Must') } : {});
    toast.error(msg);
  };

  const zoneOptions = [...COMMON_TIME_ZONES, { value: OTHER, label: 'Other time zone…' }];

  return (
    <SectionShell
      icon={Globe2}
      title="Region & year"
      description="Decides which day a bill belongs to and when invoice numbers start again."
      loading={loading}
      dirty={dirty}
      saving={saving}
      onSave={save}
      onCancel={() => { setForm(orig); setErrors({}); setOtherZone(!COMMON_TIME_ZONES.some((z) => z.value === orig.time_zone)); }}
    >
      <div className="space-y-7">
        {calendar && (
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3.5 rounded-2xl bg-brand-50 border border-brand-100">
              <p className="text-xs font-semibold text-ink-muted flex items-center gap-1.5"><CalendarDays className="w-3.5 h-3.5" aria-hidden="true" />Business day</p>
              <p className="text-base font-bold text-ink mt-1">{formatDate(calendar.business_date)}</p>
            </div>
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-line">
              <p className="text-xs font-semibold text-ink-muted">Financial year</p>
              <p className="text-base font-bold text-ink mt-1">{calendar.financial_year?.label}</p>
              <p className="text-xs text-ink-subtle">{formatDate(calendar.financial_year?.start_date)} – {formatDate(calendar.financial_year?.end_date)}</p>
            </div>
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-line">
              <p className="text-xs font-semibold text-ink-muted flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" aria-hidden="true" />Time zone</p>
              <p className="text-base font-bold text-ink mt-1 truncate">{calendar.time_zone}</p>
            </div>
          </div>
        )}

        <FormGroup title="Time zone" description="Bills are dated and grouped into days in this time zone.">
          <div className="grid grid-cols-2 gap-4">
            <Select label="Time zone" value={otherZone ? OTHER : form.time_zone}
              onChange={(e) => {
                if (e.target.value === OTHER) { setOtherZone(true); return; }
                setOtherZone(false); setForm((f) => ({ ...f, time_zone: e.target.value })); setErrors({});
              }}
              options={zoneOptions} error={!otherZone ? errors.time_zone : undefined} />
            {otherZone && (
              <TextInput label="Time zone name" placeholder="e.g. Asia/Kuala_Lumpur" value={form.time_zone || ''}
                onChange={(e) => { setForm((f) => ({ ...f, time_zone: e.target.value.trim() })); setErrors({}); }}
                error={errors.time_zone} hint="Any standard (IANA) time zone name." />
            )}
          </div>
        </FormGroup>

        <FormGroup title="Financial year" description="India's financial year starts in April. Invoice numbers can restart at the start of each financial year.">
          <div className="grid grid-cols-2 gap-4">
            <Select label="Starts in" value={String(form.fy_start_month || 4)}
              onChange={(e) => { setForm((f) => ({ ...f, fy_start_month: Number(e.target.value) })); setErrors({}); }}
              options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))} error={errors.fy_start_month} />
          </div>
          <Note tone="info" icon={Lock}>This can only be changed before the first bill is made; changing it later would restart invoice numbering mid-year.</Note>
        </FormGroup>

        <FormGroup title="Business day ends at" description="For shops open past midnight: bills before this time count in the previous day's sales.">
          <div className="grid grid-cols-2 gap-4">
            <Select label="Day ends at" value={form.business_day_cutoff || '00:00'}
              onChange={(e) => { setForm((f) => ({ ...f, business_day_cutoff: e.target.value })); setErrors({}); }}
              options={CUTOFFS.map((c) => ({ value: c, label: c === '00:00' ? 'Midnight (00:00)' : `${c} next morning` }))}
              error={errors.business_day_cutoff} />
          </div>
        </FormGroup>
      </div>
    </SectionShell>
  );
}
