import React, { useState } from 'react';
import { Building2, BadgeCheck, Hash, Globe2, Receipt, ShieldCheck, Settings } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useDialogs, EmptyState } from '../../components/ui';
import { OrganizationSection } from './OrganizationSection';
import { TaxSection } from './TaxSection';
import { NumberSeriesSection } from './NumberSeriesSection';
import { RegionSection } from './RegionSection';
import { ReceiptSection } from './ReceiptSection';
import { RolesSection } from './RolesSection';

const SECTIONS = [
  { id: 'organization', title: 'Business', hint: 'Name, address, logo', icon: Building2, permission: 'settings.manage', Component: OrganizationSection },
  { id: 'tax', title: 'Tax & licences', hint: 'GSTIN, FSSAI and others', icon: BadgeCheck, permission: 'settings.manage', Component: TaxSection },
  { id: 'series', title: 'Bill numbers', hint: 'Invoice and customer series', icon: Hash, permission: 'settings.manage', Component: NumberSeriesSection },
  { id: 'region', title: 'Region & year', hint: 'Time zone, financial year', icon: Globe2, permission: 'settings.manage', Component: RegionSection },
  { id: 'receipt', title: 'Receipt', hint: 'Paper size, footer, details', icon: Receipt, permission: 'settings.manage', Component: ReceiptSection },
  { id: 'roles', title: 'Roles & permissions', hint: 'Who can do what', icon: ShieldCheck, permission: 'users.manage', Component: RolesSection }
];

/** Shop settings: section list on the left, the chosen section's form on the right. */
export function SettingsView() {
  const { can } = useAuth();
  const dialogs = useDialogs();
  const sections = SECTIONS.filter((s) => can(s.permission));
  const [activeId, setActiveId] = useState(sections[0]?.id);
  const [dirty, setDirty] = useState(false);

  if (sections.length === 0) {
    return <EmptyState icon={Settings} title="No settings available" message="Your role can't change shop settings. Ask the shop owner." />;
  }

  const active = sections.find((s) => s.id === activeId) || sections[0];

  const choose = async (id) => {
    if (id === active.id) return;
    if (dirty) {
      const ok = await dialogs.confirm({
        title: 'Discard unsaved changes?',
        message: `Your changes in ${active.title} haven't been saved.`,
        confirmLabel: 'Discard changes',
        tone: 'danger'
      });
      if (!ok) return;
    }
    setDirty(false);
    setActiveId(id);
  };

  const Active = active.Component;

  return (
    <div className="h-full max-w-7xl mx-auto flex flex-col min-h-0">
      <div className="flex items-end justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-ink tracking-tight">Settings</h1>
          <p className="text-sm text-ink-muted">How your shop appears on bills, and how the counter works.</p>
        </div>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-[15.5rem_1fr] gap-5" style={{ minHeight: '32rem' }}>
        <nav aria-label="Settings sections" className="space-y-1.5">
          {sections.map((s) => {
            const Icon = s.icon;
            const on = s.id === active.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => choose(s.id)}
                aria-current={on ? 'page' : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-left transition-all cursor-pointer ${
                  on ? 'bg-surface border border-brand-200 shadow-sm ring-1 ring-brand-100' : 'border border-transparent hover:bg-surface/70'
                }`}
              >
                <span className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${on ? 'bg-brand-600 text-white shadow-sm shadow-brand-600/30' : 'bg-slate-100 text-ink-muted'}`}>
                  <Icon className="w-[18px] h-[18px]" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className={`block text-sm font-bold truncate ${on ? 'text-ink' : 'text-ink-muted'}`}>{s.title}</span>
                  <span className="block text-xs text-ink-subtle truncate">{s.hint}</span>
                </span>
              </button>
            );
          })}
        </nav>

        <div className="min-h-0">
          <Active key={active.id} onDirtyChange={setDirty} />
        </div>
      </div>
    </div>
  );
}
