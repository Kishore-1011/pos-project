import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { ClipboardList, Eye, X, Filter } from 'lucide-react';

export function AuditLogView() {
  const { authFetch } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('');
  const [selectedSnapshot, setSelectedSnapshot] = useState(null);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      let url = '/api/audit-logs';
      if (actionFilter) {
        url += `?action=${actionFilter}`;
      }
      const res = await authFetch(url);
      if (res.ok) {
        const data = await res.json();
        setLogs(data);
      }
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [actionFilter]);

  const getActionBadge = (action) => {
    switch (action) {
      case 'ORDER_CREATE':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'PRICE_UPDATE':
      case 'ITEM_PRICE_BULK':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'VOID_ORDER':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'USER_TOGGLE':
      case 'ITEM_TOGGLE_BULK':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'USER_CREATE':
      case 'ITEM_CREATE':
        return 'bg-teal-50 text-teal-700 border-teal-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      
      {/* Header & Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-blue-600" />
            <span>Audit Trail</span>
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="bg-white border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 rounded-xl px-3 py-2 text-xs text-slate-900 font-bold outline-none shadow-xs"
          >
            <option value="">All Audit Actions</option>
            <option value="ORDER_CREATE">ORDER_CREATE</option>
            <option value="PRICE_UPDATE">PRICE_UPDATE</option>
            <option value="ITEM_PRICE_BULK">ITEM_PRICE_BULK</option>
            <option value="ITEM_CATEGORY_BULK">ITEM_CATEGORY_BULK</option>
            <option value="ITEM_TOGGLE_BULK">ITEM_TOGGLE_BULK</option>
            <option value="VOID_ORDER">VOID_ORDER</option>
            <option value="STATUS_CHANGE">STATUS_CHANGE</option>
            <option value="USER_TOGGLE">USER_TOGGLE</option>
            <option value="USER_CREATE">USER_CREATE</option>
            <option value="USER_UPDATE">USER_UPDATE</option>
            <option value="USER_PASSWORD_RESET">USER_PASSWORD_RESET</option>
          </select>
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm font-semibold">Loading audit trail history...</div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm font-semibold">No audit logs recorded yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-slate-500 uppercase font-bold border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3.5">Timestamp</th>
                  <th className="px-5 py-3.5">Action</th>
                  <th className="px-5 py-3.5">Performed By</th>
                  <th className="px-5 py-3.5">Affected Entity</th>
                  <th className="px-5 py-3.5 text-right">Data Snapshot</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-5 py-4 text-slate-500 whitespace-nowrap font-medium text-xs">
                      {(() => {
                        try {
                          const ts = log.timestamp;
                          let d;
                          if (typeof ts === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(ts) && !ts.endsWith('Z')) {
                            d = new Date(ts.replace(' ', 'T') + 'Z');
                          } else {
                            d = new Date(ts);
                          }
                          return d.toLocaleString('en-IN', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: true,
                            timeZone: 'Asia/Kolkata'
                          });
                        } catch (e) {
                          return String(log.timestamp);
                        }
                      })()}
                    </td>
                    <td className="px-5 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase border ${getActionBadge(log.action)}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-5 py-4 font-bold text-slate-900">
                      @{log.user_name}
                    </td>
                    <td className="px-5 py-4 text-slate-700 font-medium">
                      {(() => {
                        let newVal = null;
                        try {
                          newVal = typeof log.new_value === 'string' ? JSON.parse(log.new_value) : log.new_value;
                        } catch (e) {
                          newVal = null;
                        }
                        if (log.entity_type?.toLowerCase() === 'order') {
                          const inv = newVal?.invoice_no || newVal?.order_number;
                          return (
                            <span>
                              <span className="font-bold text-slate-900">Order #{log.entity_id}</span>
                              {inv && <span className="text-blue-600 font-bold ml-1.5 font-mono text-[11px]">({inv})</span>}
                            </span>
                          );
                        }
                        return <span className="capitalize text-slate-600">{log.entity_type} #{log.entity_id}</span>;
                      })()}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button
                        onClick={() => setSelectedSnapshot(log)}
                        className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold inline-flex items-center gap-1 border border-slate-200 transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5 text-blue-600" />
                        <span>View JSON</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Snapshot JSON Modal */}
      {selectedSnapshot && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 w-full max-w-lg shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
            <button
              onClick={() => setSelectedSnapshot(null)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-bold text-slate-900 mb-1">
              Audit Snapshot #{selectedSnapshot.id}
            </h3>
            <p className="text-xs text-slate-500 mb-4 font-medium">
              Action: <span className="text-blue-600 font-bold">{selectedSnapshot.action}</span> by @{selectedSnapshot.user_name}
            </p>

            <div className="space-y-3 max-h-96 overflow-y-auto">
              {selectedSnapshot.old_value && (
                <div>
                  <span className="text-xs font-bold text-rose-600 block mb-1">BEFORE (Old State):</span>
                  <pre className="p-3 rounded-xl bg-rose-50/50 text-rose-700 text-xs font-mono overflow-x-auto border border-rose-200">
                    {JSON.stringify(selectedSnapshot.old_value, null, 2)}
                  </pre>
                </div>
              )}

              {selectedSnapshot.new_value && (
                <div>
                  <span className="text-xs font-bold text-emerald-600 block mb-1">AFTER (New State):</span>
                  <pre className="p-3 rounded-xl bg-emerald-50/50 text-emerald-700 text-xs font-mono overflow-x-auto border border-emerald-200">
                    {JSON.stringify(selectedSnapshot.new_value, null, 2)}
                  </pre>
                </div>
              )}
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
