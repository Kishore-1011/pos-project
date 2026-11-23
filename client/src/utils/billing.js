// Billing maths for the counter screen. Pure functions, no React, so they can be tested directly.
// Everything is computed in whole paise and returned in rupees; the server repeats the same
// checks (server/src/routes/orderRoutes.js) and is the final authority.

const toPaise = (rupees) => Math.round((Number(rupees) || 0) * 100);
const toRupees = (paise) => Math.round(paise) / 100;

/** Line total in rupees: price x quantity (quantity defaults to 1). */
export function lineTotal(price, quantity = 1) {
  return toRupees(toPaise(price) * (Number(quantity) || 1));
}

/** Sum of all cart lines in rupees. Lines: { price, quantity }. */
export function cartSubtotal(cart) {
  return toRupees((cart || []).reduce((sum, l) => sum + toPaise(l.price) * (Number(l.quantity) || 1), 0));
}

/** Number of units in the cart. */
export function cartItemCount(cart) {
  return (cart || []).reduce((sum, l) => sum + (Number(l.quantity) || 1), 0);
}

/**
 * Discount in rupees for a subtotal. type: 'PERCENT' (0–100) or 'FLAT' (rupees).
 * Never negative and never more than the subtotal.
 */
export function discountAmount(subtotal, type, value) {
  const subP = toPaise(subtotal);
  const v = Math.max(0, parseFloat(value) || 0);
  const rawP = type === 'PERCENT' ? Math.round((subP * Math.min(100, v)) / 100) : toPaise(v);
  return toRupees(Math.min(subP, rawP));
}

/** Total payable after discount, in rupees (never negative). */
export function grandTotal(subtotal, discount) {
  return toRupees(Math.max(0, toPaise(subtotal) - toPaise(discount)));
}

/** Change to hand back for a cash payment (negative = still short). */
export function cashChange(received, total) {
  return toRupees(toPaise(received) - toPaise(total));
}

/** Whether the cash received covers the total. */
export function isCashEnough(received, total) {
  return toPaise(received) >= toPaise(total);
}

/**
 * Amount to pre-fill as "cash received": the total rounded UP to the next rupee, so the pre-filled
 * value always covers the bill (₹70.30 -> ₹71, not ₹70).
 */
export function suggestedCash(total) {
  return Math.ceil(toPaise(total) / 100);
}
