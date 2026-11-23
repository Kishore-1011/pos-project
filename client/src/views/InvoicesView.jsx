import React, { useState, useEffect } from 'react';
import { getShopTimeZone, businessDateString } from '../utils/datetime';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ui';
import { ThermalReceipt } from '../components/ThermalReceipt';
import { exportToCSV } from '../utils/csvExport';
import { FILE_PREFIX, formatInvoiceFallback } from '../config/brand';
import {
  FileText, Search, Calendar, Printer, Eye, Download, ChevronLeft, ChevronRight, X, CreditCard, Users, RefreshCw, Tag
} from 'lucide-react';

// Business date in the shop's time zone (respects the business-day cutoff setting)
const getLocalDateString = (d = new Date()) => businessDateString(d);

export function InvoicesView() {
  const { authFetch } = useAuth();
  const toast = useToast();

  const todayStr = getLocalDateString();
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(todayStr);
  const [activePreset, setActivePreset] = useState('today'); // 'today' | 'week' | 'month' | 'custom'

  const [searchQuery, setSearchQuery] = useState('');
  const [paymentModeFilter, setPaymentModeFilter] = useState('ALL'); // 'ALL' | 'CASH' | 'UPI_CARD'
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'PAID' | 'VOID'
  const [staffFilter, setStaffFilter] = useState('ALL'); // 'ALL' | user_id
  const [staffList, setStaffList] = useState([]);

  const [orders, setOrders] = useState([]);
  const [totalOrders, setTotalOrders] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const PAGE_LIMIT = 25;

  const [loading, setLoading] = useState(true);
  const [isExportingCSV, setIsExportingCSV] = useState(false);

  // Detail Modal State
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedOrderDetail, setSelectedOrderDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Print Modal State
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [orderToPrint, setOrderToPrint] = useState(null);
  const [itemsToPrint, setItemsToPrint] = useState([]);
  const [rollSize, setRollSize] = useState('58mm');
  const [loadingPrintData, setLoadingPrintData] = useState(false);

  // Preset Handlers
  const handlePresetSelect = (preset) => {
    setActivePreset(preset);
    setPage(1);
    const now = new Date();
    const today = getLocalDateString(now);

    if (preset === 'today') {
      setStartDate(today);
      setEndDate(today);
    } else if (preset === 'week') {
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 6);
      setStartDate(getLocalDateString(weekAgo));
      setEndDate(today);
    } else if (preset === 'month') {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      setStartDate(getLocalDateString(monthStart));
      setEndDate(today);
    }
  };

  // Fetch Invoices List with Filters and Pagination
  const fetchInvoices = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        startDate,
        endDate,
        page: String(page),
        limit: String(PAGE_LIMIT)
      });

      if (searchQuery.trim()) {
        params.set('search', searchQuery.trim());
      }
      if (paymentModeFilter !== 'ALL') {
        params.set('payment_method', paymentModeFilter);
      }
      if (statusFilter !== 'ALL') {
        params.set('status', statusFilter);
      }
      if (staffFilter !== 'ALL') {
        params.set('user_id', staffFilter);
      }

      const res = await authFetch(`/api/orders?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setOrders(data);
          setTotalOrders(data.length);
          setTotalPages(Math.ceil(data.length / PAGE_LIMIT) || 1);
        } else {
          setOrders(data.orders || []);
          setTotalOrders(data.total || 0);
          setTotalPages(data.totalPages || 1);
        }
      }
    } catch (err) {
      console.error('Failed to load invoices:', err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch Staff List on Mount for Filter Dropdown
  useEffect(() => {
    const fetchStaffList = async () => {
      try {
        const res = await authFetch('/api/users');
        if (res.ok) {
          const data = await res.json();
          setStaffList(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.error('Failed to load staff users list:', err);
      }
    };
    fetchStaffList();
  }, []);

  useEffect(() => {
    fetchInvoices();
  }, [startDate, endDate, page, paymentModeFilter, statusFilter, staffFilter]);

  // Debounced search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      fetchInvoices();
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Open Order Breakdown Modal
  const handleViewOrder = async (orderId) => {
    setShowDetailModal(true);
    setLoadingDetail(true);
    setSelectedOrderDetail(null);

    try {
      const res = await authFetch(`/api/orders/${orderId}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedOrderDetail(data);
      }
    } catch (err) {
      console.error('Failed to load order detail:', err);
    } finally {
      setLoadingDetail(false);
    }
  };

  // Trigger Thermal Re-Print Modal
  const handlePrintOrder = async (order) => {
    setShowPrintModal(true);
    setLoadingPrintData(true);
    setOrderToPrint(order);
    setItemsToPrint([]);

    try {
      const res = await authFetch(`/api/orders/${order.id}`);
      if (res.ok) {
        const data = await res.json();
        setOrderToPrint(data.order || order);
        setItemsToPrint(data.items || []);
      }
    } catch (err) {
      console.error('Failed to load order items for printing:', err);
    } finally {
      setLoadingPrintData(false);
    }
  };

  // CSV Export Handler
  const handleExportCSV = async () => {
    try {
      setIsExportingCSV(true);
      const params = new URLSearchParams({
        startDate,
        endDate,
        limit: '10000'
      });

      if (searchQuery.trim()) params.set('search', searchQuery.trim());
      if (paymentModeFilter !== 'ALL') params.set('payment_method', paymentModeFilter);
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (staffFilter !== 'ALL') params.set('user_id', staffFilter);

      const res = await authFetch(`/api/orders?${params.toString()}`);
      let exportData = [];
      if (res.ok) {
        const data = await res.json();
        exportData = Array.isArray(data) ? data : (data.orders || []);
      }

      if (exportData.length === 0) {
        toast.info('No invoice records match current filters.');
        return;
      }

      const headers = [
        { key: 'invoice_no', label: 'Invoice No' },
        { key: 'date', label: 'Date' },
        { key: 'time', label: 'Time' },
        { key: 'staff_name', label: 'Billed By' },
        { key: 'customer_name', label: 'Customer Name' },
        { key: 'customer_phone', label: 'Customer Phone' },
        { key: 'payment_method', label: 'Payment Method' },
        { key: 'subtotal', label: 'Subtotal (₹)' },
        { key: 'discount', label: 'Discount (₹)' },
        { key: 'final_amount', label: 'Final Amount (₹)' },
        { key: 'status', label: 'Status' }
      ];

      const rows = exportData.map(o => {
        const d = new Date(o.created_at || Date.now());
        const dateStr = d.toLocaleDateString('en-IN', { timeZone: getShopTimeZone(), day: '2-digit', month: '2-digit', year: 'numeric' });
        const timeStr = d.toLocaleTimeString('en-IN', { timeZone: getShopTimeZone(), hour: '2-digit', minute: '2-digit', hour12: true });

        return {
          invoice_no: o.invoice_no || o.order_number || formatInvoiceFallback(o.id),
          date: dateStr,
          time: timeStr,
          staff_name: o.staff_name || o.cashier_name || o.cashier_username || 'Admin',
          customer_name: o.customer_name || 'Walk-in / Guest',
          customer_phone: o.customer_phone || '-',
          payment_method: o.payment_method || 'CASH',
          subtotal: Number(o.subtotal || 0).toFixed(2),
          discount: Number(o.discount || 0).toFixed(2),
          final_amount: Number(o.final_amount || 0).toFixed(2),
          status: o.payment_status || 'PAID'
        };
      });

      exportToCSV(`${FILE_PREFIX}_Invoices_${startDate}_to_${endDate}`, headers, rows);
    } catch (err) {
      console.error('Export Invoices CSV error:', err);
      toast.error('Failed to export CSV: ' + err.message);
    } finally {
      setIsExportingCSV(false);
    }
  };

  const formatDateTime = (dateStr) => {
    if (!dateStr) return '-';
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
        timeZone: getShopTimeZone()
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600/10 dark:bg-emerald-500/10 text-blue-600 dark:text-emerald-400 flex items-center justify-center">
              <FileText className="w-5 h-5" />
            </div>
            <span>Invoices & Order Management</span>
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchInvoices()}
            title="Refresh Invoices"
            className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-xs cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={handleExportCSV}
            disabled={isExportingCSV || totalOrders === 0}
            className="px-4 py-2.5 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold text-xs rounded-xl border border-slate-300 dark:border-slate-700 shadow-xs flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
          >
            <Download className="w-4 h-4 text-blue-600 dark:text-emerald-400" />
            <span>{isExportingCSV ? 'Exporting...' : 'Export CSV'}</span>
          </button>
        </div>
      </div>

      {/* Date Range & Preset Filter Bar */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          
          {/* Quick Presets */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-1">
              Date Presets:
            </span>
            <button
              onClick={() => handlePresetSelect('today')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activePreset === 'today'
                  ? 'bg-blue-600 dark:bg-emerald-500 text-white dark:text-slate-950 shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              Today
            </button>
            <button
              onClick={() => handlePresetSelect('week')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activePreset === 'week'
                  ? 'bg-blue-600 dark:bg-emerald-500 text-white dark:text-slate-950 shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              This Week (7D)
            </button>
            <button
              onClick={() => handlePresetSelect('month')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activePreset === 'month'
                  ? 'bg-blue-600 dark:bg-emerald-500 text-white dark:text-slate-950 shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              This Month
            </button>
          </div>

          {/* Date Picker Inputs */}
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-[11px] font-bold text-slate-500">From:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setActivePreset('custom');
                  setPage(1);
                }}
                className="bg-transparent text-xs font-mono font-bold text-slate-800 dark:text-slate-200 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-[11px] font-bold text-slate-500">To:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setActivePreset('custom');
                  setPage(1);
                }}
                className="bg-transparent text-xs font-mono font-bold text-slate-800 dark:text-slate-200 focus:outline-none"
              />
            </div>
          </div>

        </div>

        {/* Search & Secondary Filter Dropdowns */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
          
          {/* Invoice / Customer / Staff Search */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search Invoice #, Customer, Staff..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>

          {/* User / Cashier Filter */}
          <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700">
            <Users className="w-4 h-4 text-slate-400" />
            <span className="text-xs text-slate-500 font-bold whitespace-nowrap">Staff:</span>
            <select
              value={staffFilter}
              onChange={(e) => {
                setStaffFilter(e.target.value);
                setPage(1);
              }}
              className="bg-transparent text-xs font-bold text-slate-900 dark:text-white focus:outline-none w-full cursor-pointer"
            >
              <option value="ALL">All Staff</option>
              {staffList.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.full_name || s.username} ({s.role || 'Staff'})
                </option>
              ))}
            </select>
          </div>

          {/* Payment Method Filter */}
          <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700">
            <CreditCard className="w-4 h-4 text-slate-400" />
            <span className="text-xs text-slate-500 font-bold whitespace-nowrap">Mode:</span>
            <select
              value={paymentModeFilter}
              onChange={(e) => {
                setPaymentModeFilter(e.target.value);
                setPage(1);
              }}
              className="bg-transparent text-xs font-bold text-slate-900 dark:text-white focus:outline-none w-full cursor-pointer"
            >
              <option value="ALL">All Modes</option>
              <option value="CASH">Cash</option>
              <option value="UPI">UPI</option>
              <option value="CARD">Card</option>
              <option value="UPI_CARD">UPI + Card</option>
            </select>
          </div>

          {/* Payment Status Filter */}
          <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700">
            <Tag className="w-4 h-4 text-slate-400" />
            <span className="text-xs text-slate-500 font-bold whitespace-nowrap">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="bg-transparent text-xs font-bold text-slate-900 dark:text-white focus:outline-none w-full cursor-pointer"
            >
              <option value="ALL">All Statuses</option>
              <option value="PAID">Paid Only</option>
              <option value="VOID">Voided / Cancelled</option>
            </select>
          </div>

        </div>
      </div>

      {/* Invoices Table Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
        
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">
            Transactions ({totalOrders})
          </h2>
          <span className="text-xs text-slate-400 font-medium">
            25 orders per page
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
            <thead className="bg-slate-50 dark:bg-slate-800 text-[10px] text-slate-400 uppercase font-black border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-4 py-3">Invoice No</th>
                <th className="px-4 py-3">Date & Time</th>
                <th className="px-4 py-3">Billed By</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3 text-center">Items</th>
                <th className="px-4 py-3">Payment Mode</th>
                <th className="px-4 py-3 text-right">Total Amount</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-16 text-center text-slate-400">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                      <span>Loading invoices...</span>
                    </div>
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-16 text-center text-slate-400">
                    <FileText className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                    <p className="font-bold text-slate-600 dark:text-slate-300">No Invoices Found</p>
                    <p className="text-xs text-slate-400 mt-0.5">Try broadening your date range or search query.</p>
                  </td>
                </tr>
              ) : (
                orders.map((order) => (
                  <tr 
                    key={order.id}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    {/* Invoice No */}
                    <td className="px-4 py-3.5 font-bold font-mono text-slate-900 dark:text-white">
                      {order.invoice_no || order.order_number || formatInvoiceFallback(order.id)}
                    </td>

                    {/* Date/Time */}
                    <td className="px-4 py-3.5 text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {formatDateTime(order.created_at)}
                    </td>

                    {/* Billed By / Staff */}
                    <td className="px-4 py-3.5">
                      <span className="text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-200/60 dark:border-slate-700/60 inline-flex items-center gap-1.5 whitespace-nowrap">
                        <Users className="w-3 h-3 text-slate-400" />
                        <span>{order.staff_name || order.cashier_name || order.cashier_username || 'Admin'}</span>
                      </span>
                    </td>

                    {/* Customer */}
                    <td className="px-4 py-3.5">
                      {order.customer_name ? (
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-blue-600 dark:text-emerald-400">{order.customer_name}</span>
                          <span className="text-[10px] font-mono text-slate-400">({order.customer_phone || order.customer_code})</span>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic text-[11px]">Walk-in Guest</span>
                      )}
                    </td>

                    {/* Items Count */}
                    <td className="px-4 py-3.5 text-center">
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[11px] font-bold text-slate-700 dark:text-slate-300">
                        {order.total_items_count || 1}
                      </span>
                    </td>

                    {/* Payment Mode */}
                    <td className="px-4 py-3.5">
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {order.payment_method}
                      </span>
                    </td>

                    {/* Total Amount */}
                    <td className="px-4 py-3.5 text-right font-black text-slate-900 dark:text-white tabular-nums">
                      ₹{Number(order.final_amount || 0).toFixed(2)}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3.5 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                        order.payment_status === 'PAID'
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                          : 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                      }`}>
                        {order.payment_status}
                      </span>
                    </td>

                    {/* Actions: View & Print */}
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleViewOrder(order.id)}
                          title="View Order Details"
                          className="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View</span>
                        </button>

                        <button
                          onClick={() => handlePrintOrder(order)}
                          title="Print Thermal Receipt"
                          className="px-2.5 py-1.5 rounded-lg bg-blue-50 dark:bg-emerald-950/60 hover:bg-blue-100 dark:hover:bg-emerald-900/60 text-blue-600 dark:text-emerald-400 border border-blue-200/60 dark:border-emerald-800/50 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>Print</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {totalOrders > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 border-t border-slate-100 dark:border-slate-800 text-xs">
            <span className="text-slate-500 dark:text-slate-400 font-medium">
              Showing {Math.min((page - 1) * PAGE_LIMIT + 1, totalOrders)}-{Math.min(page * PAGE_LIMIT, totalOrders)} of {totalOrders} orders
            </span>

            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
                title="Previous Page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <span className="font-bold text-slate-800 dark:text-slate-200 px-2 tabular-nums">
                Page {page} / {totalPages}
              </span>

              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
                title="Next Page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

      </div>

      {/* MODAL 1: ORDER BREAKDOWN VIEW */}
      {showDetailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-lg p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in duration-150">
            
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-emerald-950/60 text-blue-600 dark:text-emerald-400 flex items-center justify-center font-bold">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    {selectedOrderDetail?.order?.invoice_no || selectedOrderDetail?.order?.order_number || 'Order Breakdown'}
                  </h3>
                  <span className="text-xs text-slate-400">
                    {formatDateTime(selectedOrderDetail?.order?.created_at)}
                  </span>
                </div>
              </div>

              <button
                onClick={() => setShowDetailModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {loadingDetail ? (
              <div className="py-12 text-center text-xs text-slate-400">Loading line items...</div>
            ) : !selectedOrderDetail ? (
              <div className="py-12 text-center text-xs text-slate-400">Order details not available.</div>
            ) : (
              <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
                
                {/* Meta Summary */}
                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-800 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">Cashier</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">{selectedOrderDetail.order.cashier_name || selectedOrderDetail.order.cashier_username || 'Staff'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">Payment Mode</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">{selectedOrderDetail.order.payment_method}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">Customer</span>
                    <span className="font-bold text-blue-600 dark:text-emerald-400">
                      {selectedOrderDetail.order.customer_name 
                        ? `${selectedOrderDetail.order.customer_name} (${selectedOrderDetail.order.customer_phone || selectedOrderDetail.order.customer_code})`
                        : 'Walk-in / Guest'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">Payment Status</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">{selectedOrderDetail.order.payment_status}</span>
                  </div>
                </div>

                {/* Line Items List */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Ordered Items</h4>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                    {selectedOrderDetail.items?.map((item, idx) => (
                      <div key={idx} className="p-3 flex items-center justify-between bg-white dark:bg-slate-900 text-xs">
                        <div>
                          <span className="font-bold text-slate-900 dark:text-white block">{item.item_name}</span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {item.quantity} × ₹{Number(item.unit_price).toFixed(2)}
                          </span>
                        </div>
                        <span className="font-bold text-slate-900 dark:text-white tabular-nums">
                          ₹{Number(item.subtotal).toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Totals */}
                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-2xl space-y-1.5 text-xs">
                  <div className="flex justify-between text-slate-500 dark:text-slate-400">
                    <span>Subtotal:</span>
                    <span>₹{Number(selectedOrderDetail.order.subtotal || 0).toFixed(2)}</span>
                  </div>
                  {Number(selectedOrderDetail.order.discount) > 0 && (
                    <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-semibold">
                      <span>Discount:</span>
                      <span>- ₹{Number(selectedOrderDetail.order.discount).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-black text-slate-900 dark:text-white pt-1.5 border-t border-slate-200 dark:border-slate-700">
                    <span>Grand Total:</span>
                    <span>₹{Number(selectedOrderDetail.order.final_amount || 0).toFixed(2)}</span>
                  </div>
                </div>

              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => {
                  setShowDetailModal(false);
                  if (selectedOrderDetail?.order) {
                    handlePrintOrder(selectedOrderDetail.order);
                  }
                }}
                className="px-4 py-2 bg-blue-600 dark:bg-emerald-500 text-white dark:text-slate-950 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Receipt</span>
              </button>

              <button
                onClick={() => setShowDetailModal(false)}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold cursor-pointer"
              >
                Close
              </button>
            </div>

          </div>
        </div>
      )}

      {/* MODAL 2: THERMAL PRINT PREVIEW MODAL */}
      {showPrintModal && orderToPrint && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 w-full max-w-lg shadow-2xl relative my-8 animate-in fade-in zoom-in duration-150">
            
            <button
              onClick={() => setShowPrintModal(false)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 text-blue-600 dark:text-emerald-400 font-black mb-3">
              <Printer className="w-5 h-5" />
              <span>Thermal Receipt Re-Print ({orderToPrint.invoice_no || orderToPrint.order_number})</span>
            </div>

            {/* Paper Size selector */}
            <div className="flex items-center justify-between mb-4 bg-slate-50 dark:bg-slate-800 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700">
              <span className="text-xs text-slate-600 dark:text-slate-300 font-bold">Paper Roll Size:</span>
              <div className="flex gap-1">
                <button
                  onClick={() => setRollSize('58mm')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                    rollSize === '58mm' ? 'bg-blue-600 text-white shadow-xs' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  58mm Roll
                </button>
                <button
                  onClick={() => setRollSize('80mm')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                    rollSize === '80mm' ? 'bg-blue-600 text-white shadow-xs' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  80mm Roll
                </button>
              </div>
            </div>

            {/* Thermal Receipt Preview */}
            <div className="my-4 max-h-96 overflow-y-auto rounded-xl p-2 bg-slate-50 border border-slate-200">
              {loadingPrintData ? (
                <div className="py-12 text-center text-xs text-slate-400">Loading receipt details...</div>
              ) : (
                <ThermalReceipt
                  order={orderToPrint}
                  items={itemsToPrint}
                  rollSize={rollSize}
                />
              )}
            </div>

            {/* Actions */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={() => window.print()}
                className="py-3 px-4 bg-blue-600 dark:bg-emerald-500 text-white dark:text-slate-950 font-black text-xs rounded-xl shadow-md flex items-center justify-center gap-2 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Print Thermal Receipt</span>
              </button>

              <button
                onClick={() => setShowPrintModal(false)}
                className="py-3 px-4 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Dismiss</span>
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
