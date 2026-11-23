// All billing maths is done in whole paise (integers) and converted back to rupees
// with exactly two decimals only when storing / returning. This avoids float drift
// like 29.700000000000003. (Phase 1 will store integer paise in the DB directly.)

/** Rupees (number|string) -> integer paise. Returns NaN for non-numeric input. */
function toPaise(rupees) {
  const n = typeof rupees === 'string' ? Number(rupees.trim()) : Number(rupees);
  if (!Number.isFinite(n)) return NaN;
  return Math.round(n * 100);
}

/** Integer paise -> rupees number with 2-decimal precision. */
function fromPaise(paise) {
  return Math.round(paise) / 100;
}

/** Round a rupee amount to 2 decimals. */
function roundRupees(rupees) {
  return fromPaise(toPaise(rupees));
}

module.exports = { toPaise, fromPaise, roundRupees };
