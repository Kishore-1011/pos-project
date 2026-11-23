import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { exportToCSV } from '../utils/csvExport';
import { FILE_PREFIX, formatInvoiceFallback } from '../config/brand';
import { 
  Users, Search, Plus, Phone, Calendar, ShoppingBag, 
  IndianRupee, ArrowUpDown, ChevronRight, X, Edit2, 
  Trash2, UserCheck, Sparkles, Receipt, Clock, CheckCircle2,
  TrendingUp, Award, RefreshCw, AlertCircle, Download,
  ChevronLeft
} from 'lucide-react';

export function CustomersView() {
  const { authFetch, user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const [customers, setCustomers] = useState([]);
  const [stats, setStats] = useState({
    total_customers: 0,
    total_customer_revenue: 0,
    total_customer_orders: 0,
    avg_spend: 0
  });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('spend'); // 'spend' | 'orders' | 'recent' | 'name' | 'code'
  const [sortOrder, setSortOrder] = useState('DESC');

  // Add / Edit Customer Modal State
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formError, setFormError] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Customer Orders Drawer State & 5-Item Pagination
  const [selectedCustomerForHistory, setSelectedCustomerForHistory] = useState(null);
  const [customerOrders, setCustomerOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const HISTORY_PAGE_LIMIT = 5;

  // Toast State
  const [toastMessage, setToastMessage] = useState('');

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  const handleToggleStatus = async (cust) => {
    try {
      const newActive = cust.is_active === 0 ? 1 : 0;
      const res = await authFetch(`/api/customers/${cust.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: newActive })
      });
      if (res.ok) {
        showToast(`Customer ${cust.name} ${newActive === 1 ? 'activated' : 'disabled'}`);
        loadCustomers();
      }
    } catch (err) {
      console.error('Failed to toggle customer status:', err);
    }
  };

  const loadCustomers = async () => {
    try {
      setLoading(true);
      const queryParams = new URLSearchParams({
        sortBy,
        order: sortOrder,
        withStats: 'true',
        search: searchQuery
      });
      const res = await authFetch(`/api/customers?${queryParams.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setCustomers(data.customers || []);
        if (data.stats) {
          setStats(data.stats);
        }
      }
    } catch (err) {
      console.error('Failed to load customers:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers();
  }, [sortBy, sortOrder]);

  // Debounced search query
  useEffect(() => {
    const timer = setTimeout(() => {
      loadCustomers();
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleOpenAddModal = () => {
    setEditingCustomer(null);
    setFormName('');
    setFormPhone('');
    setFormError('');
    setShowFormModal(true);
  };

  const handleOpenEditModal = (cust) => {
    setEditingCustomer(cust);
    setFormName(cust.name);
    setFormPhone(cust.phone);
    setFormError('');
    setShowFormModal(true);
  };

  const handleSaveCustomer = async (e) => {
    e.preventDefault();
    if (!formName.trim() || !formPhone.trim()) {
      setFormError('Please enter both name and phone number');
      return;
    }

    try {
      setFormSubmitting(true);
      setFormError('');

      const url = editingCustomer ? `/api/customers/${editingCustomer.id}` : '/api/customers';
      const method = editingCustomer ? 'PUT' : 'POST';

      const res = await authFetch(url, {
        method,
        body: JSON.stringify({
          name: formName.trim(),
          phone: formPhone.trim()
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save customer');
      }

      setShowFormModal(false);
      showToast(editingCustomer ? 'Customer updated successfully!' : `Customer ${data.customer?.customer_code || ''} created!`);
      loadCustomers();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDeleteCustomer = async (cust) => {
    if (!window.confirm(`Are you sure you want to remove customer profile "${cust.name}" (${cust.customer_code})?`)) {
      return;
    }

    try {
      const res = await authFetch(`/api/customers/${cust.id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        showToast(`Customer ${cust.name} removed`);
        loadCustomers();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to delete customer');
      }
    } catch (err) {
      alert('Error deleting customer: ' + err.message);
    }
  };

  const handleViewOrders = async (cust) => {
    setSelectedCustomerForHistory(cust);
    setLoadingOrders(true);
    setCustomerOrders([]);

    try {
      const res = await authFetch(`/api/customers/${cust.id}`);
      if (res.ok) {
        const data = await res.json();
        setCustomerOrders(data.orders || []);
      }
    } catch (err) {
      console.error('Failed to load customer orders:', err);
    } finally {
      setLoadingOrders(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'No visits yet';
    try {
      const d = new Date(dateStr.endsWith('Z') ? dateStr : dateStr.replace(' ', 'T') + 'Z');
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        timeZone: 'Asia/Kolkata'
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-xl flex items-center gap-2 border border-slate-700 animate-bounce">
          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          <span className="text-sm font-semibold">{toastMessage}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600/10 dark:bg-emerald-500/10 text-blue-600 dark:text-emerald-400 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <span>Customers</span>
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => loadCustomers()}
            title="Refresh list"
            className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-xs cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => {
              if (customers.length === 0) {
                alert('No customer records to export.');
                return;
              }

              const headers = [
                { key: 'customer_code', label: 'Customer ID' },
                { key: 'name', label: 'Name' },
                { key: 'phone', label: 'Phone' },
                { key: 'total_orders', label: 'Total Orders' },
                { key: 'total_spend', label: 'Total Spend (₹)' },
                { key: 'last_visit', label: 'Last Visit Date' }
              ];

              const rows = customers.map(c => ({
                customer_code: c.customer_code,
                name: c.name,
                phone: c.phone,
                total_orders: c.total_orders || 0,
                total_spend: Number(c.total_spend || 0).toFixed(2),
                last_visit: c.last_visit ? formatDate(c.last_visit) : 'No visits yet'
              }));

              exportToCSV(`${FILE_PREFIX}_Customers`, headers, rows);
            }}
            title="Export all customers to CSV"
            className="px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 font-bold text-xs flex items-center gap-2 transition-all shadow-xs cursor-pointer"
          >
            <Download className="w-4 h-4 text-blue-600 dark:text-emerald-400" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={handleOpenAddModal}
            className="px-4 py-2.5 bg-blue-600 dark:bg-emerald-500 hover:bg-blue-700 dark:hover:bg-emerald-600 text-white dark:text-slate-950 font-bold text-xs rounded-xl shadow-md shadow-blue-500/20 dark:shadow-emerald-500/20 flex items-center gap-2 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Register New Customer</span>
          </button>
        </div>
      </div>

      {/* CRM Metric Stats Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider">Registered Profiles</span>
            <Users className="w-4 h-4 text-blue-600 dark:text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-2">
            {stats.total_customers}
          </div>
          <span className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 block">Active CRM database</span>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider">Customer Lifetime Spend</span>
            <IndianRupee className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-2">
            ₹{stats.total_customer_revenue.toFixed(2)}
          </div>
          <span className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 block">From tagged customer orders</span>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider">Total Customer Bills</span>
            <ShoppingBag className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-2">
            {stats.total_customer_orders}
          </div>
          <span className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 block">Completed repeat visits</span>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider">Avg Spend / Customer</span>
            <Award className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-2">
            ₹{stats.avg_spend.toFixed(2)}
          </div>
          <span className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 block">Average spend per customer</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        
        {/* Search Bar */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by customer name, phone number, or ID (e.g. CUST-0001)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Sort Presets */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-slate-400 dark:text-slate-500 mr-1 flex items-center gap-1">
            <ArrowUpDown className="w-3.5 h-3.5" /> Sort:
          </span>

          <button
            onClick={() => { setSortBy('spend'); setSortOrder(sortBy === 'spend' && sortOrder === 'DESC' ? 'ASC' : 'DESC'); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              sortBy === 'spend'
                ? 'bg-blue-600 text-white dark:bg-emerald-500 dark:text-slate-950'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            Top Spenders {sortBy === 'spend' && (sortOrder === 'DESC' ? '↓' : '↑')}
          </button>

          <button
            onClick={() => { setSortBy('orders'); setSortOrder(sortBy === 'orders' && sortOrder === 'DESC' ? 'ASC' : 'DESC'); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              sortBy === 'orders'
                ? 'bg-blue-600 text-white dark:bg-emerald-500 dark:text-slate-950'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            Order Count {sortBy === 'orders' && (sortOrder === 'DESC' ? '↓' : '↑')}
          </button>

          <button
            onClick={() => { setSortBy('recent'); setSortOrder(sortBy === 'recent' && sortOrder === 'DESC' ? 'ASC' : 'DESC'); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              sortBy === 'recent'
                ? 'bg-blue-600 text-white dark:bg-emerald-500 dark:text-slate-950'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            Recent Visit {sortBy === 'recent' && (sortOrder === 'DESC' ? '↓' : '↑')}
          </button>

          <button
            onClick={() => { setSortBy('name'); setSortOrder(sortBy === 'name' && sortOrder === 'ASC' ? 'DESC' : 'ASC'); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              sortBy === 'name'
                ? 'bg-blue-600 text-white dark:bg-emerald-500 dark:text-slate-950'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            Name {sortBy === 'name' && (sortOrder === 'ASC' ? 'A-Z' : 'Z-A')}
          </button>
        </div>
      </div>

      {/* Customer Directory Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-slate-400 text-sm font-semibold flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <span>Loading customer database...</span>
          </div>
        ) : customers.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-sm font-semibold flex flex-col items-center justify-center gap-3">
            <Users className="w-12 h-12 text-slate-300 dark:text-slate-700" />
            <p className="text-slate-700 dark:text-slate-300 font-bold">No customers found</p>
            <p className="text-xs text-slate-400 max-w-sm">
              {searchQuery ? 'No customers match your search criteria.' : 'No customer profiles have been registered yet.'}
            </p>
            <button
              onClick={handleOpenAddModal}
              className="mt-2 px-4 py-2 bg-blue-600 dark:bg-emerald-500 text-white dark:text-slate-950 text-xs font-bold rounded-xl"
            >
              Register First Customer
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/75 border-b border-slate-200 dark:border-slate-800 text-[11px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-400">
                  <th className="py-3.5 px-4 sm:px-6">Customer Code</th>
                  <th className="py-3.5 px-4 sm:px-6">Name</th>
                  <th className="py-3.5 px-4 sm:px-6">Phone Number</th>
                  <th className="py-3.5 px-4 sm:px-6 text-center">Orders Placed</th>
                  <th className="py-3.5 px-4 sm:px-6 text-right">Lifetime Spend (₹)</th>
                  <th className="py-3.5 px-4 sm:px-6">Last Visit</th>
                  <th className="py-3.5 px-4 sm:px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {customers.map((cust, idx) => {
                  const initials = cust.name
                    ? cust.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
                    : 'C';
                  const spend = Number(cust.total_spend) || 0;
                  const ordersCount = Number(cust.total_orders) || 0;

                  return (
                    <tr 
                      key={cust.id} 
                      onClick={() => handleViewOrders(cust)}
                      className="hover:bg-blue-50/50 dark:hover:bg-slate-800/60 transition-colors group cursor-pointer"
                    >
                      {/* Customer Code */}
                      <td className="py-4 px-4 sm:px-6 font-mono font-bold text-blue-600 dark:text-emerald-400">
                        <span className="px-2.5 py-1 rounded-md bg-blue-50 dark:bg-emerald-950/40 border border-blue-200/60 dark:border-emerald-800/40 text-[11px]">
                          {cust.customer_code}
                        </span>
                      </td>

                      {/* Name & Avatar */}
                      <td className="py-4 px-4 sm:px-6">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 dark:from-emerald-500 dark:to-teal-500 text-white dark:text-slate-950 font-black text-xs flex items-center justify-center flex-shrink-0 shadow-xs">
                            {initials}
                          </div>
                          <div>
                            <span className="font-bold text-slate-900 dark:text-white block group-hover:text-blue-600 dark:group-hover:text-emerald-400 transition-colors">
                              {cust.name}
                            </span>
                            <span className="text-[10px] text-slate-400">Registered {new Date(cust.created_at).toLocaleDateString('en-IN')}</span>
                          </div>
                        </div>
                      </td>

                      {/* Phone */}
                      <td className="py-4 px-4 sm:px-6 font-mono text-slate-700 dark:text-slate-300 font-semibold">
                        <div className="flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5 text-slate-400" />
                          <span>{cust.phone}</span>
                        </div>
                      </td>

                      {/* Orders Count */}
                      <td className="py-4 px-4 sm:px-6 text-center">
                        <span className={`inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-black ${
                          ordersCount > 5 
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300' 
                            : ordersCount > 0 
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                        }`}>
                          {ordersCount} {ordersCount === 1 ? 'order' : 'orders'}
                        </span>
                      </td>

                      {/* Total Spend */}
                      <td className="py-4 px-4 sm:px-6 text-right">
                        <span className="font-black text-slate-900 dark:text-white text-sm">
                          ₹{spend.toFixed(2)}
                        </span>
                      </td>

                      {/* Last Visit */}
                      <td className="py-4 px-4 sm:px-6 text-slate-500 dark:text-slate-400 text-[11px]">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span>{formatDate(cust.last_visit)}</span>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-4 sm:px-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {/* Active / Disable Toggle Status */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleStatus(cust);
                            }}
                            title={cust.is_active === 0 ? "Click to Activate customer" : "Click to Disable customer"}
                            className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase transition-all cursor-pointer flex items-center gap-1.5 border ${
                              cust.is_active !== 0
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100'
                                : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 border-slate-300 dark:border-slate-700 hover:bg-slate-200'
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${cust.is_active !== 0 ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`}></span>
                            <span>{cust.is_active !== 0 ? 'Active' : 'Disabled'}</span>
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenEditModal(cust);
                            }}
                            title="Edit customer details"
                            className="p-1.5 text-slate-400 hover:text-blue-600 dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Add / Edit Customer Form */}
      {showFormModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-blue-600 dark:text-emerald-400" />
                <span>{editingCustomer ? 'Edit Customer Profile' : 'Register New Customer'}</span>
              </h3>
              <button
                onClick={() => setShowFormModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSaveCustomer} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Customer Full Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. John Doe"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  10-Digit Mobile / Phone Number <span className="text-rose-500">*</span>
                </label>
                <input
                  type="tel"
                  required
                  placeholder="e.g. 9876543210"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Used for fast auto-complete identification during cashier billing.
                </p>
              </div>

              {editingCustomer && (
                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 text-[11px] text-slate-500 space-y-1">
                  <div className="flex justify-between">
                    <span>Customer Code:</span>
                    <span className="font-mono font-bold text-blue-600 dark:text-emerald-400">{editingCustomer.customer_code}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Lifetime Orders:</span>
                    <span className="font-bold text-slate-900 dark:text-white">{editingCustomer.total_orders || 0}</span>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowFormModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="px-5 py-2.5 bg-blue-600 dark:bg-emerald-500 hover:bg-blue-700 dark:hover:bg-emerald-600 text-white dark:text-slate-950 font-bold text-xs rounded-xl shadow-md shadow-blue-500/20 dark:shadow-emerald-500/20 transition-all flex items-center gap-2"
                >
                  {formSubmitting ? (
                    <span>Saving...</span>
                  ) : (
                    <span>{editingCustomer ? 'Update Customer' : 'Create Customer'}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Customer Detail Slide-Over Drawer Panel */}
      {selectedCustomerForHistory && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          {/* Backdrop blur overlay */}
          <div 
            onClick={() => setSelectedCustomerForHistory(null)}
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
          />

          <div className="fixed inset-y-0 right-0 max-w-full flex pl-10 z-50">
            <div className="w-screen max-w-lg bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col transform transition-all animate-in slide-in-from-right duration-300 ease-out">
              
              {/* Drawer Header */}
              <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between bg-slate-50/50 dark:bg-slate-800/40">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-2xl bg-blue-600 dark:bg-emerald-500 text-white dark:text-slate-950 flex items-center justify-center font-black shadow-md shadow-blue-500/20 dark:shadow-emerald-500/20 flex-shrink-0">
                    <UserCheck className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-base font-bold text-slate-900 dark:text-white truncate">
                        {selectedCustomerForHistory.name}
                      </h3>
                      <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-100 dark:bg-emerald-950 text-blue-800 dark:text-emerald-300 border border-blue-200 dark:border-emerald-800">
                        {selectedCustomerForHistory.customer_code}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5 flex items-center gap-1">
                      <Phone className="w-3 h-3 text-slate-400" />
                      <span>{selectedCustomerForHistory.phone}</span>
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedCustomerForHistory(null)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  title="Close Drawer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Drawer Content: Stats & Order History */}
              <div className="p-5 overflow-y-auto space-y-5 flex-1 divide-y divide-slate-100 dark:divide-slate-800">
                
                {/* Lifetime Metrics Overview */}
                <div className="grid grid-cols-3 gap-2.5 pb-2">
                  <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 text-center">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Lifetime Spend</span>
                    <span className="text-sm font-black text-emerald-600 dark:text-emerald-400 mt-0.5 block tabular-nums">
                      ₹{Number(selectedCustomerForHistory.total_spend || 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 text-center">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Total Orders</span>
                    <span className="text-sm font-black text-slate-900 dark:text-white mt-0.5 block tabular-nums">
                      {selectedCustomerForHistory.total_orders || 0}
                    </span>
                  </div>
                  <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 text-center">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Avg Bill Value</span>
                    <span className="text-sm font-black text-blue-600 dark:text-emerald-400 mt-0.5 block tabular-nums">
                      ₹{selectedCustomerForHistory.total_orders > 0 
                        ? (Number(selectedCustomerForHistory.total_spend || 0) / Number(selectedCustomerForHistory.total_orders)).toFixed(2)
                        : '0.00'}
                    </span>
                  </div>
                </div>

                {/* Related Order Invoices List */}
                <div className="pt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Customer Order History ({customerOrders.length})
                    </h4>
                    {customerOrders.length > 0 && (
                      <span className="text-[10px] text-slate-400 font-medium">
                        5 orders / page
                      </span>
                    )}
                  </div>

                  {loadingOrders ? (
                    <div className="py-12 text-center text-xs text-slate-400 font-semibold flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                      <span>Loading orders history...</span>
                    </div>
                  ) : customerOrders.length === 0 ? (
                    <div className="py-12 text-center bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
                      <ShoppingBag className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-bold">No orders placed yet</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Orders attached during billing will appear here.</p>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {customerOrders
                        .slice((historyPage - 1) * HISTORY_PAGE_LIMIT, historyPage * HISTORY_PAGE_LIMIT)
                        .map(order => (
                          <div 
                            key={order.id}
                            className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100/70 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-800 transition-all space-y-2"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-xs text-slate-900 dark:text-white">
                                  {order.invoice_no || order.order_number || formatInvoiceFallback(order.id)}
                                </span>
                                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                                  order.payment_status === 'PAID'
                                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400'
                                    : 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-400'
                                }`}>
                                  {order.payment_status}
                                </span>
                                <span className="px-1.5 py-0.5 rounded-md bg-slate-200 dark:bg-slate-700 text-[10px] font-semibold text-slate-700 dark:text-slate-300">
                                  {order.payment_method}
                                </span>
                              </div>

                              <span className="text-sm font-black text-blue-600 dark:text-emerald-400 tabular-nums">
                                ₹{Number(order.final_amount || 0).toFixed(2)}
                              </span>
                            </div>

                            {/* Item Summary Details */}
                            {order.items_summary && (
                              <p className="text-[11px] text-slate-600 dark:text-slate-300 font-medium line-clamp-2 bg-white dark:bg-slate-900/60 p-2 rounded-xl border border-slate-200/50 dark:border-slate-800">
                                🛒 {order.items_summary}
                              </p>
                            )}

                            <div className="flex items-center justify-between text-[10px] text-slate-400 font-medium pt-0.5">
                              <span>{formatDate(order.created_at)}</span>
                              <span>Cashier: {order.cashier_name || 'Staff'}</span>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}

                  {/* 5-Item Order History Pagination */}
                  {customerOrders.length > HISTORY_PAGE_LIMIT && (
                    <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
                      <span className="text-[11px] text-slate-400 font-medium">
                        Showing {(historyPage - 1) * HISTORY_PAGE_LIMIT + 1}-{Math.min(historyPage * HISTORY_PAGE_LIMIT, customerOrders.length)} of {customerOrders.length}
                      </span>

                      <div className="flex items-center gap-1.5">
                        <button
                          disabled={historyPage <= 1}
                          onClick={() => setHistoryPage(p => Math.max(1, p - 1))}
                          className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
                          title="Previous Page"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </button>

                        <span className="font-bold text-[11px] text-slate-800 dark:text-slate-200 px-1.5 tabular-nums">
                          {historyPage} / {Math.ceil(customerOrders.length / HISTORY_PAGE_LIMIT)}
                        </span>

                        <button
                          disabled={historyPage >= Math.ceil(customerOrders.length / HISTORY_PAGE_LIMIT)}
                          onClick={() => setHistoryPage(p => Math.min(Math.ceil(customerOrders.length / HISTORY_PAGE_LIMIT), p + 1))}
                          className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
                          title="Next Page"
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>

              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
}
