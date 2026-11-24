import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast, Card, PageHeader, Select, EmptyState, Button } from '../components/ui';
import { formatDateTime, formatMoney } from '../utils/format';
import {
  ClipboardList, ChevronDown, ChevronUp, Receipt, Ban, RotateCcw, Tag, Package, Layers, UserCheck, Users,
  Settings, ShieldCheck, KeyRound, Hash, Building2, Image as ImageIcon, ListOrdered, Activity, RefreshCw
} from 'lucide-react';

// Every action the server records (server/src: logAudit / logAuditSync), with a friendly label and group.
const ACTIONS = {
  ORDER_CREATE: { label: 'Bill created', group: 'Bills', icon: Receipt, tone: 'success' },
  VOID_ORDER: { label: 'Bill voided', group: 'Bills', icon: Ban, tone: 'danger' },
  UNVOID_ORDER: { label: 'Voided bill restored', group: 'Bills', icon: RotateCcw, tone: 'warning' },
  STATUS_CHANGE: { label: 'Bill status changed', group: 'Bills', icon: Receipt, tone: 'neutral' },
  BILL_PRICE_CHANGE: { label: 'Price changed at billing', group: 'Bills', icon: Tag, tone: 'warning' },
  ITEM_CREATE: { label: 'Item added', group: 'Items', icon: Package, tone: 'brand' },
  PRICE_UPDATE: { label: 'Item edited', group: 'Items', icon: Package, tone: 'brand' },
  ITEM_TOGGLE: { label: 'Item shown / hidden', group: 'Items', icon: Package, tone: 'neutral' },
  ITEM_TOGGLE_BULK: { label: 'Items shown / hidden (bulk)', group: 'Items', icon: Package, tone: 'neutral' },
  ITEM_CATEGORY_BULK: { label: 'Item categories changed (bulk)', group: 'Items', icon: Package, tone: 'neutral' },
  ITEM_PRICE_BULK: { label: 'Item prices changed (bulk)', group: 'Items', icon: Tag, tone: 'brand' },
  BULK_UPDATE: { label: 'Items updated (bulk)', group: 'Items', icon: Package, tone: 'neutral' },
  CATEGORY_CREATE: { label: 'Category added', group: 'Items', icon: Layers, tone: 'brand' },
  CATEGORY_RENAME: { label: 'Category renamed', group: 'Items', icon: Layers, tone: 'neutral' },
  CATEGORY_TOGGLE: { label: 'Category shown / hidden', group: 'Items', icon: Layers, tone: 'neutral' },
  CATEGORY_DELETE: { label: 'Category deleted', group: 'Items', icon: Layers, tone: 'danger' },
  CUSTOMER_CREATE: { label: 'Customer added', group: 'Customers', icon: UserCheck, tone: 'brand' },
  CUSTOMER_UPDATE: { label: 'Customer edited', group: 'Customers', icon: UserCheck, tone: 'neutral' },
  CUSTOMER_TOGGLE_STATUS: { label: 'Customer activated / deactivated', group: 'Customers', icon: UserCheck, tone: 'neutral' },
  CUSTOMER_DELETE: { label: 'Customer deleted', group: 'Customers', icon: UserCheck, tone: 'danger' },
  USER_CREATE: { label: 'Staff added', group: 'Staff & access', icon: Users, tone: 'brand' },
  USER_UPDATE: { label: 'Staff profile edited', group: 'Staff & access', icon: Users, tone: 'neutral' },
  USER_TOGGLE: { label: 'Staff activated / deactivated', group: 'Staff & access', icon: Users, tone: 'warning' },
  USER_PASSWORD_RESET: { label: 'Staff password reset', group: 'Staff & access', icon: KeyRound, tone: 'warning' },
  USER_PIN_SET: { label: 'Staff PIN set', group: 'Staff & access', icon: Hash, tone: 'neutral' },
  USER_PIN_CLEAR: { label: 'Staff PIN removed', group: 'Staff & access', icon: Hash, tone: 'neutral' },
  PASSWORD_CHANGE: { label: 'Own password changed', group: 'Staff & access', icon: KeyRound, tone: 'neutral' },
  PIN_SET: { label: 'Own PIN set', group: 'Staff & access', icon: Hash, tone: 'neutral' },
  PIN_CLEAR: { label: 'Own PIN removed', group: 'Staff & access', icon: Hash, tone: 'neutral' },
  ROLE_UPDATE: { label: 'Role permissions changed', group: 'Staff & access', icon: ShieldCheck, tone: 'warning' },
  SETTINGS_UPDATE: { label: 'Settings changed', group: 'Shop settings', icon: Settings, tone: 'neutral' },
  ORGANIZATION_UPDATE: { label: 'Shop details changed', group: 'Shop settings', icon: Building2, tone: 'neutral' },
  LICENCES_UPDATE: { label: 'Licences changed', group: 'Shop settings', icon: ShieldCheck, tone: 'neutral' },
  LOGO_UPDATE: { label: 'Logo changed', group: 'Shop settings', icon: ImageIcon, tone: 'neutral' },
  LOGO_REMOVE: { label: 'Logo removed', group: 'Shop settings', icon: ImageIcon, tone: 'neutral' },
  NUMBER_SERIES_UPDATE: { label: 'Number series changed', group: 'Shop settings', icon: ListOrdered, tone: 'neutral' }
};

const TONE_CLASS = {
  success: 'bg-emerald-50 text-emerald-700',
  danger: 'bg-rose-50 text-rose-700',
  warning: 'bg-amber-50 text-amber-700',
  brand: 'bg-brand-50 text-brand-700',
  neutral: 'bg-slate-100 text-ink-muted'
};

const SETTING_LABELS = {
  time_zone: 'time zone',
  fy_start_month: 'financial year start',
  business_day_cutoff: 'business-day cutoff',
  cashier_max_discount_pct: 'cashier discount limit'
};

const FIELD_LABELS = {
  legal_name: 'legal name', trade_name: 'shop name', address_line1: 'address', address_line2: 'address', city: 'city',
  state_code: 'state', pincode: 'PIN code', phone: 'phone', email: 'email', website: 'website',
  business_types: 'business type', gst_registration_type: 'GST registration', gstin: 'GSTIN', pan: 'PAN',
  full_name: 'name', username: 'username', role: 'role', name: 'name', price: 'price', category_id: 'category',
  image_url: 'photo', allow_price_change: 'price change at billing', is_active: 'status',
  prefix: 'prefix', separator: 'separator', include_period: 'period in number', padding: 'number length',
  suffix: 'suffix', reset_policy: 'reset rule', start_number: 'start number', next_value: 'next number',
  permissions: 'permissions', max_discount_pct: 'discount limit'
};

const list = (keys) => {
  const labels = [...new Set(keys.map((k) => FIELD_LABELS[k] || SETTING_LABELS[k] || k.replace(/_/g, ' ')))];
  if (labels.length <= 1) return labels.join('');
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
};
const changedKeys = (oldV, newV) =>
  Object.keys(newV || {}).filter((k) => JSON.stringify((oldV || {})[k]) !== JSON.stringify((newV || {})[k]));

/** One readable sentence for an audit entry (plus an optional second detail line). */
function describe(log, who, lookup) {
  const o = log.old_value || {};
  const n = log.new_value || {};
  const itemName = n.name || o.name || lookup.items[log.entity_id] || `item #${log.entity_id}`;
  const personName = n.full_name || o.full_name || lookup.users[log.entity_id] || (n.username ? `@${n.username}` : `staff #${log.entity_id}`);
  const shown = (v) => (Number(v) === 1 ? 'shown in billing' : 'hidden from billing');

  switch (log.action) {
    case 'ORDER_CREATE': {
      const parts = [`${who} created bill ${n.invoice_no || n.order_number || `#${log.entity_id}`}`];
      if (n.final_amount !== undefined || n.total !== undefined) parts.push(formatMoney(n.final_amount ?? n.total));
      if (n.payment_method) parts.push(n.payment_method);
      const detail = [
        n.customer_name && n.customer_name !== 'Walk-in / Guest' ? `Customer: ${n.customer_name}` : 'Walk-in customer',
        n.items_count ? `${n.items_count} ${n.items_count === 1 ? 'line' : 'lines'}` : null,
        n.price_changes ? `${n.price_changes} price ${n.price_changes === 1 ? 'change' : 'changes'}` : null
      ].filter(Boolean).join(' · ');
      return { text: parts.join(' · '), detail };
    }
    case 'VOID_ORDER':
      return { text: `${who} voided bill ${n.invoice_no || `#${log.entity_id}`}${n.reason ? `: ${n.reason}` : ''}` };
    case 'UNVOID_ORDER':
      return { text: `${who} restored voided bill ${n.invoice_no || `#${log.entity_id}`}${n.reason ? `: ${n.reason}` : ''}` };
    case 'STATUS_CHANGE':
      return { text: `${who} changed bill #${log.entity_id} from ${o.payment_status || '?'} to ${n.payment_status || '?'}` };
    case 'BILL_PRICE_CHANGE': {
      const lines = Array.isArray(n.lines) ? n.lines : [];
      return {
        text: `${who} changed ${lines.length === 1 ? 'a price' : `${lines.length} prices`} on bill ${n.invoice_no || `#${log.entity_id}`}`,
        detail: lines.map((l) => `${l.item_name}: ${formatMoney(l.catalog_price)} → ${formatMoney(l.charged_price)}${l.reason ? ` (${l.reason})` : ''}`).join(' · ')
      };
    }
    case 'ITEM_CREATE':
      return { text: `${who} added item ${itemName}${n.price !== undefined ? ` at ${formatMoney(n.price)}` : ''}` };
    case 'PRICE_UPDATE': {
      const keys = changedKeys(o, n);
      if (keys.length === 1 && keys[0] === 'price') {
        return { text: `${who} changed the price of ${itemName} ${formatMoney(o.price)} → ${formatMoney(n.price)}` };
      }
      if (keys.includes('price')) {
        return { text: `${who} edited ${itemName}: price ${formatMoney(o.price)} → ${formatMoney(n.price)}`, detail: `Also changed ${list(keys.filter((k) => k !== 'price'))}` };
      }
      return { text: keys.length ? `${who} edited ${itemName} (${list(keys)})` : `${who} saved ${itemName} without changes` };
    }
    case 'ITEM_TOGGLE':
      return { text: `${who} ${Number(n.is_active) === 1 ? 'showed' : 'hid'} ${itemName} ${Number(n.is_active) === 1 ? 'in billing' : 'from billing'}` };
    case 'ITEM_TOGGLE_BULK':
      return { text: `${who} set ${itemName} as ${shown(n.is_active)} (bulk)` };
    case 'ITEM_CATEGORY_BULK':
      return { text: `${who} moved ${itemName} to ${lookup.categories[n.category_id] || (n.category_id ? `category #${n.category_id}` : 'Uncategorised')} (bulk)` };
    case 'ITEM_PRICE_BULK':
      return { text: `${who} changed the price of ${itemName} ${formatMoney(o.price)} → ${formatMoney(n.price)} (bulk)` };
    case 'BULK_UPDATE':
      return { text: `${who} updated ${itemName} (bulk)` };
    case 'CATEGORY_CREATE':
      return { text: `${who} added category ${n.name || `#${log.entity_id}`}` };
    case 'CATEGORY_RENAME':
      return { text: `${who} renamed category ${o.name || ''} → ${n.name || ''}`.replace('  ', ' ') };
    case 'CATEGORY_TOGGLE':
      return { text: `${who} set category ${lookup.categories[log.entity_id] || `#${log.entity_id}`} as ${shown(n.is_active)}` };
    case 'CATEGORY_DELETE':
      return { text: `${who} deleted category ${o.name || `#${log.entity_id}`}` };
    case 'CUSTOMER_CREATE':
      return { text: `${who} added customer ${n.name || ''}${n.customer_code ? ` (${n.customer_code})` : ''}`, detail: n.phone || '' };
    case 'CUSTOMER_UPDATE':
      return { text: `${who} edited customer ${n.name || o.name || `#${log.entity_id}`} (${list(changedKeys(o, n)) || 'no changes'})` };
    case 'CUSTOMER_TOGGLE_STATUS':
      return { text: `${who} ${Number(n.is_active) === 1 ? 'reactivated' : 'deactivated'} customer #${log.entity_id}` };
    case 'CUSTOMER_DELETE':
      return { text: `${who} deleted customer ${o.name || `#${log.entity_id}`}${o.customer_code ? ` (${o.customer_code})` : ''}` };
    case 'USER_CREATE':
      return { text: `${who} added ${n.full_name || personName} (@${n.username}) as ${String(n.role || '').toLowerCase()}`, detail: n.pin_set ? 'With a quick PIN' : '' };
    case 'USER_UPDATE': {
      const keys = changedKeys(o, n);
      const roleText = keys.includes('role') ? `: role ${String(o.role).toLowerCase()} → ${String(n.role).toLowerCase()}` : '';
      return { text: `${who} edited ${personName}${roleText || (keys.length ? ` (${list(keys)})` : '')}` };
    }
    case 'USER_TOGGLE':
      return { text: `${who} ${Number(n.is_active) === 1 ? 'reactivated' : 'deactivated'} ${personName}` };
    case 'USER_PASSWORD_RESET':
      return { text: `${who} reset the password of ${personName}` };
    case 'USER_PIN_SET':
      return { text: `${who} set a quick PIN for ${personName}` };
    case 'USER_PIN_CLEAR':
      return { text: `${who} removed the quick PIN of ${personName}` };
    case 'PASSWORD_CHANGE':
      return { text: `${who} changed their own password` };
    case 'PIN_SET':
      return { text: `${who} set their own quick PIN` };
    case 'PIN_CLEAR':
      return { text: `${who} removed their own quick PIN` };
    case 'ROLE_UPDATE': {
      const role = n.name || o.name || n.code || 'a role';
      const added = (n.permissions || []).filter((p) => !(o.permissions || []).includes(p));
      const removed = (o.permissions || []).filter((p) => !(n.permissions || []).includes(p));
      const bits = [];
      if (added.length) bits.push(`allowed ${added.join(', ')}`);
      if (removed.length) bits.push(`removed ${removed.join(', ')}`);
      if (o.max_discount_pct !== n.max_discount_pct) {
        bits.push(`discount limit ${o.max_discount_pct ?? 'none'}% → ${n.max_discount_pct ?? 'no limit'}${n.max_discount_pct == null ? '' : '%'}`);
      }
      return { text: `${who} changed the ${role} role`, detail: bits.join(' · ') };
    }
    case 'SETTINGS_UPDATE': {
      const keys = Object.keys(n);
      return {
        text: `${who} updated settings${keys.length ? ` (${list(keys)})` : ''}`,
        detail: keys.map((k) => `${SETTING_LABELS[k] || k}: ${o[k] ?? '—'} → ${n[k]}`).join(' · ')
      };
    }
    case 'ORGANIZATION_UPDATE':
      return { text: `${who} updated shop details (${list(Object.keys(n)) || 'no changes'})` };
    case 'LICENCES_UPDATE': {
      const types = Array.isArray(n) ? n.map((l) => l.type).join(', ') : '';
      return { text: `${who} updated licences`, detail: types ? `Now: ${types}` : 'All licences removed' };
    }
    case 'LOGO_UPDATE':
      return { text: `${who} changed the shop logo` };
    case 'LOGO_REMOVE':
      return { text: `${who} removed the shop logo` };
    case 'NUMBER_SERIES_UPDATE':
      return {
        text: `${who} changed the ${String(n.code || o.code || '').toLowerCase()} number series`,
        detail: o.next_value || n.next_value ? `Next number: ${o.next_value || '—'} → ${n.next_value || '—'}` : ''
      };
    default:
      return { text: `${who}: ${String(log.action || 'change').replace(/_/g, ' ').toLowerCase()} (${log.entity_type} #${log.entity_id})` };
  }
}

const GROUP_ORDER = ['Bills', 'Items', 'Customers', 'Staff & access', 'Shop settings'];

export function AuditLogView() {
  const { authFetch } = useAuth();
  const toast = useToast();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [lookup, setLookup] = useState({ users: {}, usernames: {}, items: {}, categories: {} });

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const url = actionFilter ? `/api/audit-logs?action=${encodeURIComponent(actionFilter)}` : '/api/audit-logs';
      const res = await authFetch(url);
      if (res.ok) setLogs(await res.json());
    } catch (err) {
      console.error('Failed to load audit log:', err);
      toast.error('Could not load the audit log');
    } finally {
      setLoading(false);
    }
  };

  // Names for people, items and categories, so entries read as sentences instead of ids
  useEffect(() => {
    (async () => {
      try {
        const [uRes, iRes] = await Promise.all([authFetch('/api/users'), authFetch('/api/items')]);
        const next = { users: {}, usernames: {}, items: {}, categories: {} };
        if (uRes.ok) {
          for (const u of await uRes.json()) {
            next.users[u.id] = u.full_name;
            next.usernames[u.username] = u.full_name;
          }
        }
        if (iRes.ok) {
          const data = await iRes.json();
          for (const i of data.items || []) next.items[i.id] = i.name;
          for (const c of data.categories || []) next.categories[c.id] = c.name;
        }
        setLookup(next);
      } catch (e) {
        // names are a nicety; ids still show
      }
    })();
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [actionFilter]);

  const filterOptions = useMemo(() => GROUP_ORDER.flatMap((group) =>
    Object.entries(ACTIONS).filter(([, a]) => a.group === group).map(([code, a]) => ({ value: code, label: `${group}: ${a.label}` }))
  ), []);

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        icon={ClipboardList}
        title="Audit log"
        subtitle="Every change to bills, items, staff and settings, with who did it and when. Entries can't be edited or deleted."
        actions={
          <div className="flex items-center gap-2">
            <Select
              size="sm"
              className="w-72"
              aria-label="Filter by type of change"
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              placeholder="All changes"
              options={filterOptions}
            />
            <Button size="sm" variant="ghost" icon={RefreshCw} onClick={fetchLogs} aria-label="Refresh" />
          </div>
        }
      />

      <Card className="overflow-hidden">
        {loading ? (
          <p className="p-8 text-center text-sm text-ink-muted">Loading audit log…</p>
        ) : logs.length === 0 ? (
          <EmptyState icon={Activity} title="Nothing recorded yet" message={actionFilter ? 'No entries of this type.' : 'Changes will appear here as they happen.'} />
        ) : (
          <ul className="divide-y divide-line">
            {logs.map((log) => {
              const meta = ACTIONS[log.action] || { label: log.action, icon: Activity, tone: 'neutral' };
              const Icon = meta.icon;
              const who = lookup.usernames[log.user_name] || (log.user_name ? `@${log.user_name}` : 'System');
              const { text, detail } = describe(log, who, lookup);
              const isOpen = expanded === log.id;
              const hasData = Boolean(log.old_value || log.new_value);
              return (
                <li key={log.id} className="px-5 py-3.5">
                  <div className="flex items-start gap-3">
                    <span className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${TONE_CLASS[meta.tone] || TONE_CLASS.neutral}`} aria-hidden="true">
                      <Icon className="w-4.5 h-4.5" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-ink break-words">{text}</p>
                      {detail && <p className="text-xs text-ink-muted mt-0.5 break-words">{detail}</p>}
                      <p className="text-xs text-ink-subtle mt-1">
                        {formatDateTime(log.timestamp)} · {meta.label}
                      </p>
                    </div>
                    {hasData && (
                      <Button size="sm" variant="ghost" iconRight={isOpen ? ChevronUp : ChevronDown}
                        onClick={() => setExpanded(isOpen ? null : log.id)} aria-expanded={isOpen}>
                        Details
                      </Button>
                    )}
                  </div>
                  {isOpen && (
                    <div className="mt-3 ml-12 grid gap-2 sm:grid-cols-2">
                      {log.old_value && (
                        <div>
                          <p className="text-xs font-semibold text-ink-muted mb-1">Before</p>
                          <pre className="p-3 rounded-xl bg-slate-50 border border-line text-xs font-mono text-ink overflow-x-auto max-h-64">
                            {JSON.stringify(log.old_value, null, 2)}
                          </pre>
                        </div>
                      )}
                      {log.new_value && (
                        <div>
                          <p className="text-xs font-semibold text-ink-muted mb-1">After</p>
                          <pre className="p-3 rounded-xl bg-slate-50 border border-line text-xs font-mono text-ink overflow-x-auto max-h-64">
                            {JSON.stringify(log.new_value, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
