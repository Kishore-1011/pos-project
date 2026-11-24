import React, { useEffect, useState, useRef } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { MainLayout } from './components/MainLayout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LoginView } from './views/LoginView';
import { BillingView } from './views/BillingView';
import { ItemManagerView } from './views/ItemManagerView';
import { EODReportView } from './views/EODReportView';
import { CustomersView } from './views/CustomersView';
import { InvoicesView } from './views/InvoicesView';
import { SettingsView } from './views/settings/SettingsView';
import { SetupWizard } from './views/SetupWizard';
import { PRODUCT_NAME } from './config/brand';
import { FeedbackProvider } from './components/ui';

function Splash() {
  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center text-slate-500">
      <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center font-black text-white text-2xl animate-pulse mb-4 shadow-lg shadow-blue-500/20">
        ⚡
      </div>
      <p className="text-sm font-bold text-slate-700">Starting {PRODUCT_NAME}...</p>
    </div>
  );
}

function MainApp() {
  const { user, loading, can, adoptSession } = useAuth();
  const [activeTab, setActiveTab] = useState('billing');
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef(null);
  // First run: a fresh install shows the setup wizard instead of the login screen
  const [setupRequired, setSetupRequired] = useState(null);

  useEffect(() => {
    if (user) return;
    fetch('/api/setup/status')
      .then((r) => (r.ok ? r.json() : { setup_required: false }))
      .then((d) => setSetupRequired(Boolean(d.setup_required)))
      .catch(() => setSetupRequired(false));
  }, [user]);

  if (loading || (!user && setupRequired === null)) return <Splash />;

  if (!user) {
    if (setupRequired) {
      return (
        <SetupWizard
          onComplete={async (token, newUser) => {
            await adoptSession(token, newUser);
            setSetupRequired(false);
            setActiveTab('billing');
          }}
        />
      );
    }
    return <LoginView />;
  }

  const canAny = (perms) => perms.some((p) => can(p));

  // Each screen and the permissions that open it (must match MainLayout's menu)
  const billing = <BillingView searchQuery={searchQuery} setSearchQuery={setSearchQuery} searchInputRef={searchInputRef} />;
  const screens = {
    billing: { permissions: ['billing.create'], view: billing },
    invoices: { permissions: ['orders.view'], view: <InvoicesView /> },
    customers: { permissions: ['customers.view'], view: <CustomersView /> },
    items: { permissions: ['items.manage'], view: <ItemManagerView /> },
    reports: { permissions: ['reports.view'], view: <EODReportView /> },
    // Staff and Audit log are sections inside Settings
    settings: { permissions: ['settings.manage', 'users.manage', 'audit.view'], view: <SettingsView /> }
  };

  const renderContent = () => {
    const screen = screens[activeTab];
    if (screen && canAny(screen.permissions)) return screen.view;
    // Fall back to the first screen this user may open
    const first = Object.values(screens).find((s) => canAny(s.permissions));
    return first ? first.view : (
      <div className="p-10 text-center text-sm font-semibold text-slate-500">
        Your role has no screens enabled. Ask the shop owner to update your permissions.
      </div>
    );
  };

  return (
    <MainLayout activeTab={activeTab} setActiveTab={setActiveTab}>
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
