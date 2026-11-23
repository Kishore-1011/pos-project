import React, { useState, useRef } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { MainLayout } from './components/MainLayout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LoginView } from './views/LoginView';
import { BillingView } from './views/BillingView';
import { ItemManagerView } from './views/ItemManagerView';
import { UserManagerView } from './views/UserManagerView';
import { AuditLogView } from './views/AuditLogView';
import { EODReportView } from './views/EODReportView';
import { CustomersView } from './views/CustomersView';
import { InvoicesView } from './views/InvoicesView';
import { PRODUCT_NAME } from './config/brand';
import { FeedbackProvider } from './components/ui';

function MainApp() {
  const { user, loading, can } = useAuth();
  const [activeTab, setActiveTab] = useState('billing');
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef(null);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center text-slate-500">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center font-black text-white text-2xl animate-pulse mb-4 shadow-lg shadow-blue-500/20">
          ⚡
        </div>
        <p className="text-sm font-bold text-slate-700">Starting {PRODUCT_NAME}...</p>
      </div>
    );
  }

  if (!user) {
    return <LoginView />;
  }

  // Each screen and the permission needed to open it (must match MainLayout's menu)
  const billing = <BillingView searchQuery={searchQuery} setSearchQuery={setSearchQuery} searchInputRef={searchInputRef} />;
  const screens = {
    billing: { permission: 'billing.create', view: billing },
    invoices: { permission: 'orders.view', view: <InvoicesView /> },
    customers: { permission: 'customers.view', view: <CustomersView /> },
    items: { permission: 'items.manage', view: <ItemManagerView /> },
    users: { permission: 'users.manage', view: <UserManagerView /> },
    audit: { permission: 'audit.view', view: <AuditLogView /> },
    reports: { permission: 'reports.view', view: <EODReportView /> }
  };

  const renderContent = () => {
    const screen = screens[activeTab];
    if (screen && can(screen.permission)) return screen.view;
    // Fall back to the first screen this user may open
    const first = Object.values(screens).find((s) => can(s.permission));
    return first ? first.view : (
      <div className="p-10 text-center text-sm font-semibold text-slate-500">
        Your role has no screens enabled. Ask the shop owner to update your permissions.
      </div>
    );
  };

  return (
    <MainLayout
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      searchQuery={searchQuery}
      setSearchQuery={setSearchQuery}
      searchInputRef={searchInputRef}
    >
      <ErrorBoundary>
        {renderContent()}
      </ErrorBoundary>
    </MainLayout>
  );
}

export default function App() {
  return (
    <FeedbackProvider>
      <AuthProvider>
        <MainApp />
      </AuthProvider>
    </FeedbackProvider>
  );
}
