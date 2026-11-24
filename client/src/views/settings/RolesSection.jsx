import React, { useEffect, useState } from 'react';
import { ShieldCheck, Crown, Lock, Users, Check } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Button, Badge, useToast } from '../../components/ui';
import { SectionShell } from './SectionShell';
import { Note } from './controls';
import { apiJson } from './settingsData';

const toForm = (role) => ({ permissions: [...role.permissions].sort(), max_discount_pct: role.max_discount_pct === null ? '' : String(role.max_discount_pct) });

/** Permission grid for the editable roles (Owner is always full access). */
export function RolesSection({ onDirtyChange }) {
  const { authFetch, user } = useAuth();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [forms, setForms] = useState({});
  const [errors, setErrors] = useState({});
  const [savingCode, setSavingCode] = useState(null);

  const load = async () => {
    const { ok, data } = await apiJson(authFetch, '/api/roles');
    if (ok) {
      setRoles(data.roles);
      setCatalog(data.permissions);
      setForms(Object.fromEntries(data.roles.map((r) => [r.code, toForm(r)])));
    } else toast.error(data.error || 'Could not load roles');
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const isDirty = (r) => forms[r.code] && JSON.stringify(forms[r.code]) !== JSON.stringify(toForm(r));
  const anyDirty = roles.some(isDirty);
  useEffect(() => { onDirtyChange?.(anyDirty); }, [anyDirty]);

  const groups = catalog.reduce((acc, p) => { (acc[p.group] = acc[p.group] || []).push(p); return acc; }, {});
  const editableRoles = roles.filter((r) => r.editable);
  const owner = roles.find((r) => !r.editable);
  const mine = (code) => user?.role === code;
  const canGrant = (perm) => (user?.permissions || []).includes(perm);

  const toggle = (code, perm) => {
    setForms((f) => {
      const set = new Set(f[code].permissions);
      if (set.has(perm)) set.delete(perm); else set.add(perm);
      return { ...f, [code]: { ...f[code], permissions: [...set].sort() } };
    });
    setErrors((e) => ({ ...e, [code]: {} }));
  };

  const saveRole = async (role) => {
    const form = forms[role.code];
    const body = {};
    if (JSON.stringify(form.permissions) !== JSON.stringify([...role.permissions].sort())) body.permissions = form.permissions;
    const limit = form.max_discount_pct === '' ? null : Number(form.max_discount_pct);
    if (limit !== role.max_discount_pct) body.max_discount_pct = limit;
    setSavingCode(role.code);
    const { ok, data } = await apiJson(authFetch, `/api/roles/${role.code}`, { method: 'PUT', body });
    setSavingCode(null);
    if (ok) {
      setRoles((list) => list.map((r) => (r.code === role.code ? data.role : r)));
      setForms((f) => ({ ...f, [role.code]: toForm(data.role) }));
      setErrors((e) => ({ ...e, [role.code]: {} }));
      toast.success(`${role.name} role saved. It applies immediately.`);
    } else {
      setErrors((e) => ({ ...e, [role.code]: data.fields || { _: data.error } }));
      toast.error(data.error || 'Could not save the role');
    }
  };

  const saveAll = async () => { for (const r of editableRoles.filter(isDirty)) await saveRole(r); };

  return (
    <SectionShell
      icon={ShieldCheck}
      title="Roles & permissions"
      description="Choose what Managers and Cashiers can do. Changes apply at once, without logging in again."
      loading={loading}
      dirty={anyDirty}
      saving={Boolean(savingCode)}
      onSave={saveAll}
      saveLabel="Save all roles"
      onCancel={() => { setForms(Object.fromEntries(roles.map((r) => [r.code, toForm(r)]))); setErrors({}); }}
    >
      <div className="space-y-5">
        {owner && (
          <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-gradient-to-r from-amber-50 to-surface border border-amber-200">
            <span className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center"><Crown className="w-4 h-4" aria-hidden="true" /></span>
            <div className="flex-1">
              <p className="text-sm font-bold text-ink">Owner <span className="font-normal text-ink-muted">· {owner.user_count} active</span></p>
              <p className="text-xs text-ink-muted">Always has every permission and no discount limit, so the shop can never lock itself out.</p>
            </div>
            <Badge tone="warning"><Lock className="w-3 h-3" aria-hidden="true" />Fixed</Badge>
          </div>
        )}

        <div className="rounded-2xl border border-line overflow-hidden">
          {/* Header row: one column per editable role */}
          <div className="grid bg-slate-50/80 border-b border-line" style={{ gridTemplateColumns: `minmax(0,1fr) repeat(${editableRoles.length}, 10.5rem)` }}>
            <div className="px-4 py-3 text-xs font-semibold text-ink-muted">Permission</div>
            {editableRoles.map((r) => (
              <div key={r.code} className="px-3 py-3 text-center border-l border-line">
                <p className="text-sm font-bold text-ink">{r.name}</p>
                <p className="text-xs text-ink-subtle flex items-center justify-center gap-1"><Users className="w-3 h-3" aria-hidden="true" />{r.user_count} active</p>
              </div>
            ))}
          </div>

          {Object.entries(groups).map(([group, perms]) => (
            <div key={group}>
              <div className="px-4 py-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-subtle bg-surface border-b border-line">{group}</div>
              {perms.map((p) => (
                <div key={p.code} className="grid items-center border-b border-line last:border-b-0 hover:bg-slate-50/60"
                  style={{ gridTemplateColumns: `minmax(0,1fr) repeat(${editableRoles.length}, 10.5rem)` }}>
                  <div className="px-4 py-2.5 text-sm text-ink">{p.label}</div>
                  {editableRoles.map((r) => {
                    const checked = forms[r.code]?.permissions.includes(p.code);
                    const locked = mine(r.code) || (!checked && !canGrant(p.code));
                    return (
                      <div key={r.code} className="flex justify-center border-l border-line py-2">
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={Boolean(checked)}
                          aria-label={`${r.name}: ${p.label}`}
                          disabled={locked}
                          title={mine(r.code) ? "You can't edit your own role" : !checked && !canGrant(p.code) ? "You can't grant a permission you don't have" : undefined}
                          onClick={() => toggle(r.code, p.code)}
                          className={`w-6 h-6 rounded-lg border flex items-center justify-center transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
                            checked ? 'bg-brand-600 border-brand-600 text-white' : 'bg-surface border-slate-300 hover:border-brand-500'
                          }`}
                        >
                          {checked && <Check className="w-4 h-4" strokeWidth={3} aria-hidden="true" />}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          ))}

          {/* Discount limit row + per-role save */}
          <div className="grid items-start bg-slate-50/60 border-t border-line" style={{ gridTemplateColumns: `minmax(0,1fr) repeat(${editableRoles.length}, 10.5rem)` }}>
            <div className="px-4 py-3">
              <p className="text-sm font-semibold text-ink">Maximum discount</p>
              <p className="text-xs text-ink-muted">% of the bill. Leave empty for no limit.</p>
            </div>
            {editableRoles.map((r) => (
              <div key={r.code} className="px-3 py-3 border-l border-line space-y-2">
                <div className="relative">
                  <input
                    type="text" inputMode="decimal" aria-label={`${r.name} maximum discount percent`}
                    disabled={mine(r.code)}
                    value={forms[r.code]?.max_discount_pct ?? ''}
                    placeholder="No limit"
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^\d.]/g, '');
                      setForms((f) => ({ ...f, [r.code]: { ...f[r.code], max_discount_pct: v } }));
                      setErrors((er) => ({ ...er, [r.code]: {} }));
                    }}
                    className={`w-full h-9 pl-3 pr-7 rounded-lg border text-sm font-semibold text-right outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 disabled:bg-slate-100 ${errors[r.code]?.max_discount_pct ? 'border-rose-500' : 'border-slate-300'}`}
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-ink-subtle">%</span>
                </div>
                <Button size="sm" fullWidth disabled={!isDirty(r) || mine(r.code)} loading={savingCode === r.code} onClick={() => saveRole(r)}>
                  Save {r.name}
                </Button>
              </div>
            ))}
          </div>
        </div>

        {editableRoles.map((r) => {
          const e = errors[r.code] || {};
          const msg = e.permissions || e.max_discount_pct || e._;
          return msg ? <Note key={r.code} tone="error">{r.name}: {msg}</Note> : null;
        })}
        {editableRoles.some((r) => mine(r.code)) && (
          <Note tone="info" icon={Lock}>You can't change your own role. Ask the shop owner.</Note>
        )}
      </div>
    </SectionShell>
  );
}
