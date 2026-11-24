import React, { useState, useEffect } from 'react';
import { businessDateString } from '../utils/datetime';
import { formatMoney, formatDate, formatTime, formatDateTime } from '../utils/format';
import { useAuth } from '../context/AuthContext';
import { useToast, useDialogs, Button, Badge } from '../components/ui';
import { exportToCSV } from '../utils/csvExport';
import { FILE_PREFIX, formatInvoiceFallback } from '../config/brand';
import {
  BarChart3, Calendar, UserCheck, RefreshCw, ChevronLeft, ChevronRight, Download
} from 'lucide-react';

// Business date in the shop's time zone (respects the business-day cutoff setting)
const getLocalDateString = (d = new Date()) => businessDateString(d);

export function EODReportView() {
  const { authFetch } = useAuth();
  const toast = useToast();
  const dialogs = useDialogs();

  const todayStr = getLocalDateString();
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(todayStr);
  const [activePreset, setActivePreset] = useState('today'); // 'today' | 'yesterday' | 'week' | 'month' | 'custom'

  const [report, setReport] = useState(null);
  const [recentOrders, setRecentOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isExportingCSV, setIsExportingCSV] = useState(false);

  // Pagination State for Detailed Orders Table (25 items per page)
  const [page, setPage] = useState(1);
  const [totalOrders, setTotalOrders] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const PAGE_LIMIT = 25;

  // Quick Preset Handlers
  const handlePresetSelect = (preset) => {
    setActivePreset(preset);
    setPage(1);
    const now = new Date();
    const today = getLocalDateString(now);

    if (preset === 'today') {
      setStartDate(today);
      setEndDate(today);
    } else if (preset === 'yesterday') {
      const yest = new Date(now);
      yest.setDate(yest.getDate() - 1);
      const yestStr = getLocalDateString(yest);
      setStartDate(yestStr);
      setEndDate(yestStr);
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

  const fetchReport = async () => {
    try {
      setLoading(true);
      const res = await authFetch(`/api/reports/eod?startDate=${startDate}&endDate=${endDate}`);
      if (res.ok) {
        const data = await res.json();
        setReport(data);
      }

      const ordersRes = await authFetch(`/api/orders?startDate=${startDate}&endDate=${endDate}&page=${page}&limit=${PAGE_LIMIT}`);
      if (ordersRes.ok) {
        const oData = await ordersRes.json();
        if (Array.isArray(oData)) {
          setRecentOrders(oData);
          setTotalOrders(oData.length);
          setTotalPages(Math.ceil(oData.length / PAGE_LIMIT) || 1);
        } else {
          setRecentOrders(oData.orders || []);
          setTotalOrders(oData.total || 0);
          setTotalPages(oData.totalPages || 1);
        }
      }
    } catch (err) {
      console.error('Failed to load EOD report:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [startDate, endDate, page]);

  // Export CSV Handler for EOD Orders
  const handleExportCSV = async () => {
    try {
      setIsExportingCSV(true);
      // Fetch all matching orders for the full date range for complete export
      const res = await authFetch(`/api/orders?startDate=${startDate}&endDate=${endDate}&limit=5000`);
      let allOrders = [];
      if (res.ok) {
        const data = await res.json();
        allOrders = Array.isArray(data) ? data : (data.orders || []);
      }

      if (allOrders.length === 0) {
        toast.info('No orders found for the selected date range.');
        return;
      }

      const headers = [
        { key: 'invoice_no', label: 'Invoice No' },
        { key: 'date', label: 'Date' },
        { key: 'time', label: 'Time' },
        { key: 'customer_name', label: 'Customer Name' },
        { key: 'customer_phone', label: 'Customer Phone' },
        { key: 'payment_method', label: 'Payment Method' },
        { key: 'subtotal', label: 'Subtotal (₹)' },
        { key: 'discount', label: 'Discount (₹)' },
        { key: 'final_amount', label: 'Final Amount (₹)' },
        { key: 'staff_name', label: 'Staff Name' },
        { key: 'payment_status', label: 'Status' }
      ];

      const rows = allOrders.map(o => {
        return {
          invoice_no: o.invoice_no || o.order_number || formatInvoiceFallback(o.id),
          date: formatDate(o.created_at),
          time: formatTime(o.created_at),
          customer_name: o.customer_name || 'Walk-in / Guest',
          customer_phone: o.customer_phone || '-',
          payment_method: o.payment_method || 'CASH',
          subtotal: Number(o.subtotal || 0).toFixed(2),
          discount: Number(o.discount || 0).toFixed(2),
          final_amount: Number(o.final_amount || 0).toFixed(2),
          staff_name: o.cashier_name || o.cashier_username || 'Staff',
          payment_status: o.payment_status || 'PAID'
        };
      });

      exportToCSV(`${FILE_PREFIX}_Sales_${startDate}_to_${endDate}`, headers, rows);
    } catch (err) {
      console.error('Export CSV Error:', err);
      toast.error('Failed to export CSV: ' + err.message);
    } finally {
      setIsExportingCSV(false);
    }
  };

  const handleVoidOrder = async (orderId) => {
    const reason = await dialogs.prompt({
      title: 'Void this bill?',
      message: 'The bill stays in your records, marked as void, and is left out of sales totals.',
      label: 'Reason',
      placeholder: 'e.g. Customer cancelled the order',
      required: true,
      minLength: 3,
      confirmLabel: 'Void bill',
      tone: 'danger'
    });
    if (reason === null) return;

    try {
      const res = await authFetch(`/api/orders/${orderId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'VOID', reason })
      });

      if (res.ok) {
        toast.success('Bill voided.');
        fetchReport();
      } else {
        const errData = await res.json();
        toast.error(errData.error || 'Failed to void order');
      }
    } catch (err) {
      toast.error('Error voiding order: ' + err.message);
    }
  };

  // Metrics breakdown calculations
  const totalRevenue = report?.summary?.total_revenue || 0;
  const customerRevenue = report?.summary?.customer_revenue || 0;
  const guestRevenue = report?.summary?.guest_revenue || 0;
  const customerOrdersCount = report?.summary?.customer_orders_count || 0;
  const guestOrdersCount = report?.summary?.guest_orders_count || 0;
  const totalPaidOrders = report?.summary?.paid_orders_count || 0;

  const customerSpendPercent = totalRevenue > 0 ? Math.round((customerRevenue / totalRevenue) * 100) : 0;
  const guestSpendPercent = totalRevenue > 0 ? 100 - customerSpendPercent : 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      
      {/* Header & Date Range Controls */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs flex flex-col gap-4">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-ink flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center">
                <BarChart3 className="w-5 h-5" />
              </div>
              <span>Reports</span>
            </h1>
            <p className="text-sm text-ink-muted mt-1 ml-12">
              Sales, payment split, customers and top sellers for any date range.
            </p>
          </div>

          <button
            onClick={fetchReport}
            title="Refresh Report Data"
            className="self-start md:self-auto p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Date Presets & Range Selector */}
        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
          
          {/* Preset Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {[
              { id: 'today', label: 'Today' },
              { id: 'yesterday', label: 'Yesterday' },
              { id: 'week', label: 'This Week (7D)' },
              { id: 'month', label: 'This Month' },
              { id: 'custom', label: 'Custom Range' },
            ].map(preset => (
              <button
                key={preset.id}
                onClick={() => handlePresetSelect(preset.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  activePreset === preset.id
                    ? 'bg-blue-600 dark:bg-emerald-500 text-white dark:text-slate-950 shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Start Date & End Date Pickers */}
          <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 p-1.5 rounded-xl">
            <div className="flex items-center gap-1.5 px-2">
              <Calendar className="w-3.5 h-3.5 text-blue-600 dark:text-emerald-400" />
              <span className="text-[11px] font-bold text-slate-400">From:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setActivePreset('custom');
                }}
                className="bg-transparent text-xs font-bold text-slate-900 dark:text-white outline-none cursor-pointer"
              />
            </div>

            <span className="text-slate-400 text-xs font-bold">→</span>

            <div className="flex items-center gap-1.5 px-2">
              <span className="text-[11px] font-bold text-slate-400">To:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setActivePreset('custom');
                }}
                className="bg-transparent text-xs font-bold text-slate-900 dark:text-white outline-none cursor-pointer"
              />
            </div>
          </div>

        </div>

      </div>

      {loading || !report ? (
        <div className="p-16 text-center text-slate-400 text-sm font-semibold flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <span>Consolidating sales report for {startDate} to {endDate}...</span>
        </div>
      ) : (
        <div className="space-y-6">
          
          {/* Summary Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
              <span className="text-sm font-semibold text-ink-muted block">Net sales</span>
              <div className="text-2xl font-black text-blue-600 dark:text-emerald-400 mt-1">
                {formatMoney(report.summary.total_revenue)}
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block font-medium">
                {startDate === endDate ? formatDate(startDate) : `${formatDate(startDate)} – ${formatDate(endDate)}`}
              </span>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
              <span className="text-sm font-semibold text-ink-muted block">Paid bills</span>
              <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                {report.summary.paid_orders_count}
              </div>
              <span className="text-[10px] text-emerald-600 mt-1 block font-semibold">
                Completed and paid
              </span>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
              <span className="text-sm font-semibold text-ink-muted block">Discounts given</span>
              <div className="text-2xl font-black text-slate-700 dark:text-slate-300 mt-1">
                {formatMoney(report.summary.total_discounts)}
              </div>
              <span className="text-xs text-ink-subtle mt-1 block font-medium">Taken off bill totals</span>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
              <span className="text-sm font-semibold text-ink-muted block">Voided bills</span>
              <div className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-1">
                {report.summary.void_orders_count}
              </div>
              <span className="text-[10px] text-rose-500 mt-1 block font-medium">
                {formatMoney(report.summary.void_revenue)} not counted in sales
              </span>
            </div>

          </div>

          {/* Customer CRM Breakdown vs Walk-in Card */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <UserCheck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Customers vs. walk-ins
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Share of sales from bills with a customer attached
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 text-xs font-bold">
                <span className="flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 dark:bg-indigo-400"></span>
                  Customers ({customerSpendPercent}%)
                </span>
                <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-400 dark:bg-slate-600"></span>
                  Walk-ins ({guestSpendPercent}%)
                </span>
              </div>
            </div>

            {/* Split Progress Bar */}
            <div className="w-full h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
              <div 
                style={{ width: `${customerSpendPercent}%` }} 
                className="h-full bg-indigo-600 dark:bg-indigo-500 transition-all duration-500"
                title={`Customers: ${formatMoney(customerRevenue)} (${customerSpendPercent}%)`}
              />
              <div 
                style={{ width: `${guestSpendPercent}%` }} 
                className="h-full bg-slate-300 dark:bg-slate-600 transition-all duration-500"
                title={`Walk-ins: ${formatMoney(guestRevenue)} (${guestSpendPercent}%)`}
              />
            </div>

            {/* Sub-cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <div className="p-3.5 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 flex items-center justify-between">
                <div className="space-y-0.5">
                  <span className="text-xs font-semibold text-indigo-900">
                    Customer bills
                  </span>
                  <div className="text-xs text-indigo-700 dark:text-indigo-400">
                    <strong>{customerOrdersCount}</strong> bills placed
                  </div>
                </div>
                <span className="text-lg font-black text-indigo-700 dark:text-indigo-300">
                  {formatMoney(customerRevenue)}
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div className="space-y-0.5">
                  <span className="text-xs font-semibold text-ink">
                    Walk-in bills
                  </span>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    <strong>{guestOrdersCount}</strong> bills placed
                  </div>
                </div>
                <span className="text-lg font-black text-slate-700 dark:text-slate-300">
                  {formatMoney(guestRevenue)}
                </span>
              </div>
            </div>

          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Payment Method Split */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-4">Payment methods</h3>
              {report.paymentBreakdown.length === 0 ? (
                <p className="text-xs text-slate-400 py-6 text-center">No transactions recorded for this period.</p>
              ) : (
                <div className="space-y-3">
                  {report.paymentBreakdown.map((pm, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                      <div className="flex items-center gap-2.5">
                        <span className={`w-3 h-3 rounded-full ${
                          pm.payment_method === 'CASH' ? 'bg-emerald-500' : 'bg-blue-600'
                        }`}></span>
                        <span className="text-xs font-bold text-slate-900 dark:text-white">{pm.payment_method}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-black text-blue-600 dark:text-emerald-400">{formatMoney(pm.amount)}</span>
                        <span className="text-[10px] text-slate-400 block font-medium">{pm.count} bills</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Top Selling Items */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-4">Top sellers</h3>
              {report.topItems.length === 0 ? (
                <p className="text-xs text-slate-400 py-6 text-center">No item sales for this date range.</p>
              ) : (
                <div className="space-y-2.5">
                  {report.topItems.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs">
                      <div className="flex items-center gap-2.5">
                        <span className="w-5 h-5 rounded-md bg-blue-50 dark:bg-slate-700 text-blue-700 dark:text-blue-300 font-black text-[10px] flex items-center justify-center border border-blue-200 dark:border-slate-600">
                          #{idx + 1}
                        </span>
                        <span className="font-bold text-slate-900 dark:text-white">{item.item_name}</span>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-blue-600 dark:text-emerald-400">{formatMoney(item.total_sales)}</span>
                        <span className="text-[10px] text-slate-400 block font-medium">{item.total_qty} units sold</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

          {/* Daily Breakdown for Multi-Day Range */}
          {report.dailyBreakdown && report.dailyBreakdown.length > 1 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3">Day by day</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-xs text-ink-muted font-semibold border-b border-line">
                    <tr>
                      <th className="px-4 py-2.5">Date</th>
                      <th className="px-4 py-2.5 text-center">Paid bills</th>
                      <th className="px-4 py-2.5 text-center">Customer bills</th>
                      <th className="px-4 py-2.5 text-center">Walk-in bills</th>
                      <th className="px-4 py-2.5 text-right">Net sales</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {report.dailyBreakdown.map((d, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="px-4 py-3 font-bold text-ink whitespace-nowrap">{formatDate(d.date)}</td>
                        <td className="px-4 py-3 text-center font-semibold text-slate-700 dark:text-slate-300">{d.paid_orders_count}</td>
                        <td className="px-4 py-3 text-center text-indigo-600 dark:text-indigo-400 font-bold">{d.customer_orders}</td>
                        <td className="px-4 py-3 text-center text-slate-500 dark:text-slate-400">{d.guest_orders}</td>
                        <td className="px-4 py-3 text-right font-black text-blue-600 dark:text-emerald-400">{formatMoney(d.total_revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Orders History & Void Management Table */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Bills in this range
                </h3>
                <p className="text-xs text-slate-400 font-medium">
                  {totalOrders} {totalOrders === 1 ? 'bill' : 'bills'}, including voids
                </p>
              </div>

              <Button
                variant="secondary"
                size="sm"
                icon={Download}
                onClick={handleExportCSV}
                disabled={isExportingCSV || totalOrders === 0}
                loading={isExportingCSV}
                className="self-start sm:self-auto"
              >
                {isExportingCSV ? 'Exporting…' : 'Export CSV'}
              </Button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
                <thead className="bg-slate-50 text-xs text-ink-muted font-semibold border-b border-line">
                  <tr>
                    <th className="px-4 py-3 whitespace-nowrap min-w-[9.5rem]">Invoice no.</th>
                    <th className="px-4 py-3 whitespace-nowrap">Date & time</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Cashier</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Payment</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {recentOrders.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400 italic">
                        No orders recorded for this time range.
                      </td>
                    </tr>
                  ) : (
                    recentOrders.map((o) => (
                      <tr key={o.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="px-4 py-3 font-bold text-ink font-mono text-[11px] whitespace-nowrap">
                          {o.invoice_no || o.order_number}
                        </td>
                        <td className="px-4 py-3 text-[11px] text-ink-subtle whitespace-nowrap">
                          {formatDateTime(o.created_at)}
                        </td>
                        <td className="px-4 py-3">
                          {o.customer_name ? (
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-indigo-600 dark:text-indigo-400">{o.customer_name}</span>
                              <span className="text-[10px] font-mono text-slate-400">({o.customer_code})</span>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic text-[11px]">Walk-in Guest</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-500 font-medium">@{o.cashier_username}</td>
                        <td className="px-4 py-3 font-black text-blue-600 dark:text-emerald-400">{formatMoney(o.final_amount)}</td>
                        <td className="px-4 py-3 font-semibold">{o.payment_method}</td>
                        <td className="px-4 py-3">
                          <Badge tone={o.payment_status === 'PAID' ? 'success' : o.payment_status === 'VOID' ? 'danger' : 'warning'}>
                            {o.payment_status === 'PAID' ? 'Paid' : o.payment_status === 'VOID' ? 'Void' : 'Pending'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {o.payment_status === 'PAID' ? (
                            <Button variant="danger-quiet" size="sm" onClick={() => handleVoidOrder(o.id)}>
                              Void bill
                            </Button>
                          ) : (
                            <span className="text-xs text-ink-subtle italic">Voided</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalOrders > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-100 dark:border-slate-800 mt-3 text-xs">
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

        </div>
      )}

    </div>
  );
}
