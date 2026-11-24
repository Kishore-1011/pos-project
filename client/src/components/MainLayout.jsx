import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  ShoppingCart, FileText, Package, Users, ClipboardList, BarChart3, LogOut, UserCheck, Repeat, CalendarDays, Settings
} from 'lucide-react';
import { PRODUCT_NAME, PRODUCT_SHORT } from '../config/brand';
import { businessDateString } from '../utils/datetime';
import { formatDate } from '../utils/format';
import { SwitchUserDialog } from './SwitchUserDialog';

// Menu built from the user's permissions (must match the screen map in App.jsx)
const NAV_ITEMS = [
  { id: 'billing', label: 'Billing', icon: ShoppingCart, permissions: ['billing.create'] },
  { id: 'invoices', label: 'Invoices', icon: FileText, permissions: ['orders.view'] },
  { id: 'customers', label: 'Customers', icon: UserCheck, permissions: ['customers.view'] },
  { id: 'items', label: 'Items', icon: Package, permissions: ['items.manage'] },
  { id: 'reports', label: 'Reports', icon: BarChart3, permissions: ['reports.view'] },
  { id: 'users', label: 'Staff', icon: Users, permissions: ['users.manage'] },
  { id: 'audit', label: 'Audit log', icon: ClipboardList, permissions: ['audit.view'] },
  { id: 'settings', label: 'Settings', icon: Settings, permissions: ['settings.manage', 'users.manage'] }
];

const initials = (name = '') => name.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

/** Icon rail button with a hover/focus label (the product's own look, not a dashboard sidebar). */
function RailButton({ icon: Icon, label, active, onClick, tone = 'default' }) {
  const base = 'w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-200 relative group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2';
  const look = tone === 'danger'
    ? 'bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200'
    : active
      ? 'bg-brand-600 text-white shadow-md shadow-brand-600/30'
      : 'text-ink-subtle hover:bg-slate-100 hover:text-ink';
  return (
    <button type="button" onClick={onClick} aria-label={label} aria-current={active ? 'page' : undefined} className={`${base} ${look}`}>
      <Icon className="w-5 h-5" aria-hidden="true" />
      {active && <span className="w-1.5 h-1.5 rounded-full bg-white absolute -right-1 top-1/2 -translate-y-1/2" aria-hidden="true" />}
      <span
        className="absolute left-full ml-3 px-2.5 py-1 bg-slate-900 text-white text-xs font-bold rounded-lg opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-lg"
        aria-hidden="true"
      >
        {label}
      </span>
    </button>
  );
}

export function MainLayout({ activeTab, setActiveTab, children }) {
  const { user, logout, can, authFetch } = useAuth();
  const [shopName, setShopName] = useState('');
  const [switchOpen, setSwitchOpen] = useState(false);
  const [businessDay, setBusinessDay] = useState(() => businessDateString());

  // Shop name for the top bar (falls back to the product name until Settings are filled in)
  useEffect(() => {
    if (!user) return;
    authFetch('/api/organization')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setShopName(d?.organization?.trade_name || d?.organization?.legal_name || ''))
      .catch(() => {});
  }, [user?.id]);

  // Keep the business date current if the app stays open past the cutoff
  useEffect(() => {
    const t = setInterval(() => setBusinessDay(businessDateString()), 60 * 1000);
    return () => clearInterval(t);
  }, []);

  if (!user) return children;
  const items = NAV_ITEMS.filter((item) => item.permissions.some((p) => can(p)));

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-canvas text-ink">

      {/* Icon rail: labels on hover */}
      <aside className="w-20 flex-shrink-0 h-screen bg-surface border-r border-line flex flex-col justify-between items-center py-4 z-40" aria-label="Main menu">
        <div className="flex flex-col items-center gap-1">
          <div className="w-12 h-12 rounded-2xl bg-brand-600 flex items-center justify-center p-1 shadow-sm" title={PRODUCT_NAME}>
            <img src="./favicon.svg" alt={PRODUCT_NAME} className="w-full h-full object-contain" />
          </div>
          <span className="text-[10px] font-black text-ink-subtle uppercase tracking-tight">{PRODUCT_SHORT}</span>
        </div>

        <nav className="flex flex-col items-center gap-3">
          {items.map((item) => (
            <RailButton key={item.id} icon={item.icon} label={item.label} active={activeTab === item.id} onClick={() => setActiveTab(item.id)} />
          ))}
        </nav>

        <RailButton icon={LogOut} label="Log out" onClick={logout} tone="danger" />
      </aside>

      {/* Workspace: top bar + screen */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden min-w-0">
        <header className="h-16 flex-shrink-0 bg-surface border-b border-line px-5 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-base font-bold text-ink truncate">{shopName || PRODUCT_NAME}</p>
            <p className="text-xs text-ink-muted flex items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5" aria-hidden="true" />
              Business day {formatDate(businessDay)}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSwitchOpen(true)}
              className="h-9 px-3 rounded-xl border border-line text-sm font-semibold text-ink-muted hover:bg-slate-50 hover:text-ink flex items-center gap-2 cursor-pointer"
            >
              <Repeat className="w-4 h-4" aria-hidden="true" />
              Switch user
            </button>
            <div className="flex items-center gap-2.5 pl-2">
              <span className="w-9 h-9 rounded-full bg-brand-600 text-white text-sm font-bold flex items-center justify-center" aria-hidden="true">
                {initials(user.full_name)}
              </span>
              <div className="leading-tight hidden sm:block">
                <p className="text-sm font-bold text-ink">{user.full_name}</p>
                <p className="text-xs text-ink-muted">{user.role_name || user.role}</p>
              </div>
            </div>
          </div>
        </header>

        <main className={`flex-1 ${activeTab === 'billing' ? 'overflow-hidden p-3 sm:p-4 flex flex-col min-h-0' : 'overflow-y-auto p-4 sm:p-6'}`}>
          {children}
        </main>
      </div>

      <SwitchUserDialog open={switchOpen} onClose={() => setSwitchOpen(false)} />
    </div>
  );
}
