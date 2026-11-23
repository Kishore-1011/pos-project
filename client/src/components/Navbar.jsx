import React from 'react';
import { useAuth } from '../context/AuthContext';
import { PRODUCT_NAME } from '../config/brand';
import { ShieldAlert, UserCheck, Search } from 'lucide-react';

export function Navbar({ searchQuery, setSearchQuery, searchInputRef }) {
  const { user } = useAuth();

  if (!user) return null;

  const isAdmin = user.role === 'OWNER' || (user.permissions || []).includes('users.manage');
  const todayDateStr = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });

  return (
    <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-3 sticky top-0 z-30 transition-colors shadow-xs">
      <div className="flex items-center justify-between gap-4">
        
        {/* Title / Brand */}
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-base font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
              <span>{PRODUCT_NAME}</span>
            </h1>
            <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500">Local Offline Point of Sale</p>
          </div>
        </div>

        {/* Global Search Input (Matching Reference Images 1, 2, 4) */}
        <div className="relative flex-1 max-w-md hidden sm:block">
          <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery && setSearchQuery(e.target.value)}
            placeholder="Search menu here... (Press '/' to focus)"
            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-blue-500 dark:focus:border-emerald-500 rounded-xl pl-10 pr-10 py-2 text-xs font-semibold text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 outline-none transition-all"
          />
          <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono font-extrabold text-slate-400 dark:text-slate-500 bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700">
            /
          </kbd>
        </div>

        {/* User Profile Card & Shift Status (Matching Reference Image Header) */}
        <div className="flex items-center gap-3">
          
          <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
            {isAdmin ? (
              <ShieldAlert className="w-4 h-4 text-amber-500" />
            ) : (
              <UserCheck className="w-4 h-4 text-teal-500" />
            )}
            <div className="text-right leading-none">
              <span className="text-xs font-extrabold text-slate-900 dark:text-slate-100 block">
                {user.full_name}
              </span>
              <span className="text-[10px] font-semibold text-slate-400 block mt-0.5">
                {todayDateStr} • <span className="text-blue-600 dark:text-emerald-400 font-bold uppercase">{user.role_name || user.role}</span>
              </span>
            </div>
          </div>

        </div>

      </div>
    </header>
  );
}
