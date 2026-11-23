import React from 'react';
import { getShopTimeZone } from '../utils/datetime';
import { PRODUCT_NAME, formatInvoiceFallback } from '../config/brand';

export function ThermalReceipt({ order, items, rollSize = '58mm' }) {
  if (!order) return null;

  const safeOrder = order || {};
  const safeItems = Array.isArray(items) ? items : [];
  const widthClass = rollSize === '80mm' ? 'w-[78mm]' : 'w-[54mm]';

  const orderNumber = safeOrder.invoice_no || safeOrder.order_number || formatInvoiceFallback(safeOrder.id);
  
  // Format local machine timestamp: DD/MM/YYYY, hh:mm A (no seconds) in IST (+5:30)
  const formatDateTime = (dateVal) => {
    try {
      let d;
      if (!dateVal) {
        d = new Date();
      } else if (typeof dateVal === 'string') {
        // Handle SQLite raw UTC datetime 'YYYY-MM-DD HH:MM:SS' without Z
        if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(dateVal) && !dateVal.endsWith('Z')) {
          d = new Date(dateVal.replace(' ', 'T') + 'Z');
        } else {
          d = new Date(dateVal);
        }
      } else {
        d = new Date(dateVal);
      }

      if (isNaN(d.getTime())) d = new Date();

      return d.toLocaleString('en-IN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        timeZone: getShopTimeZone()
      });
    } catch (e) {
      return new Date().toLocaleString('en-IN', { timeZone: getShopTimeZone() });
    }
  };

  const createdAtStr = formatDateTime(safeOrder.created_at);
  const cashierDisplay = safeOrder.cashier_name || safeOrder.cashier_username || 'Staff';
  const paymentMethodDisplay = safeOrder.payment_method || 'CASH';
  const subtotalVal = Number(safeOrder.subtotal) || 0;
  const discountVal = Number(safeOrder.discount) || 0;
  const finalAmountVal = Number(safeOrder.final_amount) || 0;
  const cashReceivedVal = Number(safeOrder.cash_received) || 0;
  const changeGivenVal = Number(safeOrder.change_given) || 0;

  return (
    <div id="thermal-receipt" className={`p-2 bg-white text-black font-mono text-xs ${widthClass} mx-auto border border-dashed border-gray-300 shadow-sm print:shadow-none print:border-none`}>
      {/* Shop header: placeholder until Shop Settings (name, address, GSTIN) exists */}
      <div className="text-center pb-2 border-b border-dashed border-black space-y-0.5">
        <h1 className="font-black text-sm uppercase tracking-widest leading-none">{PRODUCT_NAME}</h1>
      </div>

      {/* Meta Info */}
      <div className="py-2 text-[10px] border-b border-dashed border-black space-y-0.5">
        <div className="flex justify-between">
          <span>Invoice No:</span>
          <span className="font-bold">{orderNumber}</span>
        </div>
        <div className="flex justify-between">
          <span>Date/Time:</span>
          <span>{createdAtStr}</span>
        </div>
        <div className="flex justify-between">
          <span>Staff:</span>
          <span>{cashierDisplay}</span>
        </div>
        <div className="flex justify-between">
          <span>Mode:</span>
          <span className="font-bold">{paymentMethodDisplay}</span>
        </div>
      </div>

      {/* Items Table */}
      <div className="py-2 border-b border-dashed border-black">
        <div className="flex justify-between font-bold text-[10px] pb-1 border-b border-gray-400 mb-1">
          <span className="w-1/2">Item</span>
          <span className="w-1/4 text-center">Qty</span>
          <span className="w-1/4 text-right">Amt</span>
        </div>
        {safeItems.map((item, idx) => {
          const qty = Number(item.quantity || item.qty) || 1;
          const unitPrice = Number(item.price || item.unit_price) || 0;
          const itemSubtotal = Number(item.subtotal) || (unitPrice * qty);
          const itemName = item.name || item.item_name || 'Item';
          return (
            <div key={item.id || item.item_id || idx} className="flex justify-between text-[10px] py-0.5">
              <span className="w-1/2 truncate">{itemName}</span>
              <span className="w-1/4 text-center">{qty}</span>
              <span className="w-1/4 text-right">₹{itemSubtotal.toFixed(2)}</span>
            </div>
          );
        })}
      </div>

      {/* Totals */}
      <div className="py-2 border-b border-dashed border-black text-[10px] space-y-1">
        <div className="flex justify-between">
          <span>Subtotal:</span>
          <span>₹{subtotalVal.toFixed(2)}</span>
        </div>
        {discountVal > 0 && (
          <div className="flex justify-between text-gray-700">
            <span>Discount:</span>
            <span>- ₹{discountVal.toFixed(2)}</span>
          </div>
        )}
        <div className="flex justify-between text-xs font-bold pt-1 border-t border-black">
          <span>GRAND TOTAL:</span>
          <span>₹{finalAmountVal.toFixed(2)}</span>
        </div>

        {/* CASH TENDER DETAILS */}
        {paymentMethodDisplay === 'CASH' && (
          <div className="pt-1 mt-1 border-t border-dotted border-gray-400 text-[10px] space-y-0.5">
            <div className="flex justify-between">
              <span>Amount Tendered:</span>
              <span>₹{cashReceivedVal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-bold">
              <span>Change Returned:</span>
              <span>₹{changeGivenVal.toFixed(2)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="text-center pt-2 text-[9px] text-gray-600">
        <p className="font-semibold text-black">Thank you for your visit!</p>
        <p>Please visit us again!</p>
      </div>
    </div>
  );
}
