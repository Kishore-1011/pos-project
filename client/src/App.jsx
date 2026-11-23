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

function MainApp() {
  const { user, loading } = useAuth();
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

  const isAdmin = user.role === 'ADMIN';

  const renderContent = () => {
    switch (activeTab) {
      case 'billing':
        return <BillingView searchQuery={searchQuery} setSearchQuery={setSearchQuery} searchInputRef={searchInputRef} />;
      case 'invoices':
        return <InvoicesView />;
      case 'customers':
        return <CustomersView />;
      case 'items':
        return isAdmin ? <ItemManagerView /> : <BillingView searchQuery={searchQuery} setSearchQuery={setSearchQuery} searchInputRef={searchInputRef} />;
      case 'users':
        return isAdmin ? <UserManagerView /> : <BillingView searchQuery={searchQuery} setSearchQuery={setSearchQuery} searchInputRef={searchInputRef} />;
      case 'audit':
        return isAdmin ? <AuditLogView /> : <BillingView searchQuery={searchQuery} setSearchQuery={setSearchQuery} searchInputRef={searchInputRef} />;
      case 'reports':
        return isAdmin ? <EODReportView /> : <BillingView searchQuery={searchQuery} setSearchQuery={setSearchQuery} searchInputRef={searchInputRef} />;
      default:
        return <BillingView searchQuery={searchQuery} setSearchQuery={setSearchQuery} searchInputRef={searchInputRef} />;
    }
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
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}
