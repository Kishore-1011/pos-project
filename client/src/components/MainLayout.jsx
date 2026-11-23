import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Navbar } from './Navbar';
import { ShoppingCart, FileText, Utensils, Users, ClipboardList, BarChart3, LogOut, UserCheck } from 'lucide-react';
import { PRODUCT_NAME, PRODUCT_SHORT } from '../config/brand';

export function MainLayout({ activeTab, setActiveTab, searchQuery, setSearchQuery, searchInputRef, children }) {
  const { user, logout, can } = useAuth();

  if (!user) return children;

  // Menu built from the user's permissions (must match the screen map in App.jsx)
  const navItems = [
    { id: 'billing', label: 'Billing', icon: ShoppingCart, permission: 'billing.create' },
    { id: 'items', label: 'Item Master', icon: Utensils, permission: 'items.manage' },
    { id: 'customers', label: 'Customer Master', icon: UserCheck, permission: 'customers.view' },
    { id: 'invoices', label: 'Order & Invoice', icon: FileText, permission: 'orders.view' },
    { id: 'reports', label: 'Reports', icon: BarChart3, permission: 'reports.view' },
    { id: 'users', label: 'Staff Users', icon: Users, permission: 'users.manage' },
    { id: 'audit', label: 'Audit Trail', icon: ClipboardList, permission: 'audit.view' },
  ];

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 text-slate-900 font-sans">
      
      {/* 1. FIXED PERSISTENT SLIM ICON NAV RAIL (w-16 md:w-20 flex-shrink-0 h-screen sticky top-0 - ZERO SHIFT) */}
      <aside className="w-16 md:w-20 flex-shrink-0 h-screen bg-white border-r border-slate-200 flex flex-col justify-between items-center py-4 z-40 shadow-xs">
        
        {/* Brand Icon Logo */}
        <div className="flex flex-col items-center gap-1 px-1">
          <div className="w-11 h-11 md:w-13 md:h-13 rounded-2xl bg-blue-600 flex items-center justify-center p-1 shadow-xs overflow-hidden" title={PRODUCT_NAME}>
            <img src="./favicon.svg" alt={PRODUCT_NAME} className="w-full h-full object-contain" />
          </div>
          <span className="text-[9px] font-black text-slate-500 uppercase tracking-tighter hidden md:block">{PRODUCT_SHORT}</span>
        </div>

        {/* Navigation Icon Buttons */}
        <nav className="flex flex-col items-center gap-3 w-full px-2">
          {navItems.map((item) => {
            if (!can(item.permission)) return null;
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                title={item.label}
                className={`w-10 h-10 md:w-12 md:h-12 rounded-2xl flex items-center justify-center transition-all duration-200 group relative ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className="w-5 h-5" />
                
                {/* Active Indicator Dot */}
                {isActive && (
                  <span className="w-1.5 h-1.5 rounded-full bg-white absolute -right-1 top-1/2 -translate-y-1/2"></span>
                )}

                {/* Hover Label Tooltip */}
                <span className="absolute left-full ml-3 px-2.5 py-1 bg-slate-900 text-white text-xs font-extrabold rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-lg">
                  {item.label}
                </span>
              </button>
            );
          })}
        </nav>

        {/* Bottom Exit / Logout Button */}
        <div className="flex flex-col items-center">
          <button
            onClick={logout}
            title="Sign Out"
            className="w-10 h-10 md:w-12 md:h-12 rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-600 flex items-center justify-center transition-colors border border-rose-200"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>

      </aside>

      {/* 2. RIGHT DYNAMIC WORKSPACE */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden min-w-0">
        <Navbar searchQuery={searchQuery} setSearchQuery={setSearchQuery} searchInputRef={searchInputRef} />
        <main className={`flex-1 ${activeTab === 'billing' ? 'overflow-hidden p-3 sm:p-4 flex flex-col min-h-0' : 'overflow-y-auto p-4 sm:p-6'} bg-slate-50`}>
          {children}
        </main>
      </div>

    </div>
  );
}
