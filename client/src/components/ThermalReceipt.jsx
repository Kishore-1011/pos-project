import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { PRODUCT_NAME, formatInvoiceFallback } from '../config/brand';
import { formatDateTime } from '../utils/format';
import { loadReceiptProfile, getCachedReceiptProfile } from '../views/settings/receiptProfile';

const money = (n) => `₹${(Number(n) || 0).toFixed(2)}`;

/**
 * Printed bill. Header, GSTIN, licences, footer and default width come from the shop settings
 * (loaded once per session). Props:
 *   order, items     the bill
 *   rollSize         '58mm' | '80mm' to force a width (otherwise the shop's receipt width)
 *   profile          optional { organization, licences, settings } override (Settings live preview)
 */
export function ThermalReceipt({ order, items, rollSize, profile: profileOverride }) {
  const auth = useAuth();
  const authFetch = auth?.authFetch;
  const [loaded, setLoaded] = useState(() => getCachedReceiptProfile());

  useEffect(() => {
    if (profileOverride || loaded) return undefined;
    let alive = true;
    loadReceiptProfile(authFetch).then((p) => { if (alive && p) setLoaded(p); });
    return () => { alive = false; };
  }, [profileOverride, loaded, authFetch]);

  if (!order) return null;

  const profile = profileOverride || loaded || {};
  const org = profile.organization || {};
  const settings = profile.settings || {};
  const licences = Array.isArray(profile.licences) ? profile.licences : [];

  const width = rollSize || settings.receipt_width || '58mm';
  const widthClass = width === '80mm' ? 'w-[78mm]' : 'w-[54mm]';

  const shopName = org.trade_name || org.legal_name || PRODUCT_NAME;
  const addressLine = [org.address_line1, org.address_line2].filter(Boolean).join(', ');
  const cityLine = [org.city, org.pincode].filter(Boolean).join(' - ');
  // Composition dealers and unregistered shops issue a Bill of Supply, not a Tax Invoice
  const title = org.gst_registration_type === 'REGULAR' ? 'TAX INVOICE' : 'BILL OF SUPPLY';
  const showGstin = settings.receipt_show_gstin !== false && org.gstin && org.gst_registration_type !== 'UNREGISTERED';
  const printedLicences = settings.receipt_show_licences !== false ? licences.filter((l) => l.print_on_bill) : [];
  const showCustomer = settings.receipt_show_customer !== false && (order.customer_name || order.customer_phone);
  const footerLines = (settings.receipt_footer || '').split('\n').map((l) => l.trim()).filter(Boolean);

  const orderNumber = order.invoice_no || order.order_number || formatInvoiceFallback(order.id);
  const safeItems = Array.isArray(items) ? items : [];
  const subtotalVal = Number(order.subtotal) || 0;
  const discountVal = Number(order.discount) || 0;
  const finalAmountVal = Number(order.final_amount) || 0;
  const paymentMethod = order.payment_method || 'CASH';

  return (
    <div id="thermal-receipt" className={`p-2 bg-white text-black font-mono text-xs ${widthClass} mx-auto border border-dashed border-gray-300 shadow-sm print:shadow-none print:border-none`}>
      {/* Shop header from Settings */}
      <div className="text-center pb-2 border-b border-dashed border-black space-y-0.5">
        <h1 className="font-black text-sm uppercase tracking-widest leading-tight">{shopName}</h1>
        {org.trade_name && org.legal_name && org.trade_name !== org.legal_name && (
          <p className="text-[9px]">{org.legal_name}</p>
        )}
        {addressLine && <p className="text-[9px] leading-snug">{addressLine}</p>}
        {cityLine && <p className="text-[9px]">{cityLine}</p>}
        {org.phone && <p className="text-[9px]">Ph: {org.phone}</p>}
        {showGstin && <p className="text-[9px] font-bold">GSTIN: {org.gstin}</p>}
        {printedLicences.map((l) => (
          <p key={`${l.type}-${l.number}`} className="text-[9px]">{l.label || l.type}: {l.number}</p>
        ))}
        <p className="text-[10px] font-bold tracking-wider pt-1">{title}</p>
      </div>

      {/* Meta */}
      <div className="py-2 text-[10px] border-b border-dashed border-black space-y-0.5">
        <div className="flex justify-between gap-2"><span>Bill No:</span><span className="font-bold">{orderNumber}</span></div>
        <div className="flex justify-between gap-2"><span>Date:</span><span>{formatDateTime(order.created_at || new Date())}</span></div>
        <div className="flex justify-between gap-2"><span>Staff:</span><span>{order.cashier_name || order.cashier_username || 'Staff'}</span></div>
        {showCustomer && (
          <div className="flex justify-between gap-2"><span>Customer:</span><span className="truncate">{order.customer_name || ''}{order.customer_phone ? ` (${order.customer_phone})` : ''}</span></div>
        )}
        <div className="flex justify-between gap-2"><span>Mode:</span><span className="font-bold">{paymentMethod}</span></div>
      </div>

      {/* Items */}
      <div className="py-2 border-b border-dashed border-black">
        <div className="flex justify-between font-bold text-[10px] pb-1 border-b border-gray-400 mb-1">
          <span className="w-1/2">Item</span>
          <span className="w-1/4 text-center">Qty</span>
          <span className="w-1/4 text-right">Amt</span>
        </div>
        {safeItems.map((item, idx) => {
          const qty = Number(item.quantity || item.qty) || 1;
          const unitPrice = Number(item.price ?? item.unit_price) || 0;
          const lineTotal = Number(item.subtotal) || unitPrice * qty;
          return (
            <div key={item.id || item.item_id || idx} className="flex justify-between text-[10px] py-0.5">
              <span className="w-1/2 truncate">{item.name || item.item_name || 'Item'}</span>
              <span className="w-1/4 text-center">{qty}</span>
              <span className="w-1/4 text-right">{money(lineTotal)}</span>
            </div>
          );
        })}
      </div>

      {/* Totals */}
      <div className="py-2 border-b border-dashed border-black text-[10px] space-y-1">
        <div className="flex justify-between"><span>Subtotal:</span><span>{money(subtotalVal)}</span></div>
        {discountVal > 0 && (
          <div className="flex justify-between text-gray-700"><span>Discount:</span><span>- {money(discountVal)}</span></div>
        )}
        <div className="flex justify-between text-xs font-bold pt-1 border-t border-black"><span>TOTAL:</span><span>{money(finalAmountVal)}</span></div>
        {paymentMethod === 'CASH' && (
          <div className="pt-1 mt-1 border-t border-dotted border-gray-400 space-y-0.5">
            <div className="flex justify-between"><span>Cash received:</span><span>{money(order.cash_received)}</span></div>
            <div className="flex justify-between font-bold"><span>Change:</span><span>{money(order.change_given)}</span></div>
          </div>
        )}
      </div>

      {/* Footer from Settings */}
      <div className="text-center pt-2 text-[9px] text-gray-700 space-y-0.5">
        {footerLines.length > 0
          ? footerLines.map((line, i) => <p key={i} className={i === 0 ? 'font-semibold text-black' : ''}>{line}</p>)
          : (<><p className="font-semibold text-black">Thank you for your visit!</p><p>Please visit us again.</p></>)}
      </div>
    </div>
  );
}
