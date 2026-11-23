import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  ShoppingCart, FileText, Package, Users, ClipboardList, BarChart3, LogOut, UserCheck,
  PanelLeftClose, PanelLeftOpen, Repeat, CalendarDays
} from 'lucide-react';
import { PRODUCT_NAME, STORAGE_PREFIX } from '../config/brand';
import { businessDateString } from '../utils/datetime';
import { formatDate } from '../utils/format';
import { SwitchUserDialog } from './SwitchUserDialog';

// Menu built from the user's permissions (must match the screen map in App.jsx)
const NAV_ITEMS = [
  { id: 'billing', label: 'Billing', icon: ShoppingCart, permission: 'billing.create' },
  { id: 'invoices', label: 'Invoices', icon: FileText, permission: 'orders.view' },
  { id: 'customers', label: 'Customers', icon: UserCheck, permission: 'customers.view' },
  { id: 'items', label: 'Items', icon: Package, permission: 'items.manage' },
  { id: 'reports', label: 'Reports', icon: BarChart3, permission: 'reports.view' },
  { id: 'users', label: 'Staff', icon: Users, permission: 'users.manage' },
  { id: 'audit', label: 'Audit log', icon: ClipboardList, permission: 'audit.view' }
];

const SIDEBAR_KEY = `${STORAGE_PREFIX}_sidebar_collapsed`;
const readCollapsed = () => {
  try { return localStorage.getItem(SIDEBAR_KEY) === '1'; } catch (e) { return false; }
};

const initials = (name = '') => name.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

export function MainLayout({ activeTab, setActiveTab, children }) {
  const { user, logout, can, authFetch } = useAuth();
  const [collapsed, setCollapsed] = useState(readCollapsed);
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

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try { localStorage.setItem(SIDEBAR_KEY, c ? '0' : '1'); } catch (e) { /* per-PC preference only */ }
      return !c;
    });
  };

  if (!user) return children;
  const items = NAV_ITEMS.filter((item) => can(item.permission));

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-canvas text-ink">

      {/* Sidebar: icons with labels; can be collapsed to icons only (remembered on this PC) */}
      <aside
        className={`${collapsed ? 'w-[4.5rem]' : 'w-52'} flex-shrink-0 h-screen bg-surface border-r border-line flex flex-col transition-[width] duration-150`}
        aria-label="Main menu"
      >
        <div className={`h-16 flex items-center gap-2.5 border-b border-line ${collapsed ? 'justify-center px-2' : 'px-4'}`}>
          <img src="./favicon.svg" alt="" className="w-9 h-9 rounded-xl flex-shrink-0" />
          {!collapsed && <span className="text-sm font-bold text-ink truncate">{PRODUCT_NAME}</span>}
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-2.5 space-y-1">
          {items.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                title={collapsed ? item.label : undefined}
                aria-current={active ? 'page' : undefined}
                className={`w-full flex items-center gap-3 rounded-xl text-sm font-semibold transition-colors cursor-pointer h-10 ${
                  collapsed ? 'justify-center px-0' : 'px-3'
                } ${active ? 'bg-brand-600 text-white shadow-sm shadow-brand-600/25' : 'text-ink-muted hover:bg-slate-100 hover:text-ink'}`}
              >
                <Icon className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
                {collapsed ? <span className="sr-only">{item.label}</span> : <span className="truncate">{item.label}</span>}
              </button>
            );
          })}
        </nav>

        <div className="border-t border-line p-2.5 space-y-1">
          <button
            type="button"
            onClick={toggleCollapsed}
            title={collapsed ? 'Expand menu' : undefined}
            className={`w-full h-9 flex items-center gap-3 rounded-xl text-sm text-ink-muted hover:bg-slate-100 hover:text-ink cursor-pointer ${collapsed ? 'justify-center' : 'px-3'}`}
          >
            {collapsed ? <PanelLeftOpen className="w-5 h-5" aria-hidden="true" /> : <PanelLeftClose className="w-5 h-5" aria-hidden="true" />}
            {collapsed ? <span className="sr-only">Expand menu</span> : <span>Collapse menu</span>}
          </button>
          <button
            type="button"
            onClick={logout}
            title={collapsed ? 'Log out' : undefined}
            className={`w-full h-9 flex items-center gap-3 rounded-xl text-sm font-semibold text-rose-600 hover:bg-rose-50 cursor-pointer ${collapsed ? 'justify-center' : 'px-3'}`}
          >
            <LogOut className="w-5 h-5" aria-hidden="true" />
            {collapsed ? <span className="sr-only">Log out</span> : <span>Log out</span>}
          </button>
        </div>
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
