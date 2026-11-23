// Single source for product branding. Change PRODUCT_NAME when the final name is decided.
// Shop-specific details (shop name, address, GSTIN, logo) will come from a Shop Settings screen.
export const PRODUCT_NAME = 'POS Project';
export const PRODUCT_SHORT = 'POS';
export const STORAGE_PREFIX = 'pos_project';

// Display fallback only, for a record that somehow has no invoice number.
// Real numbers come from the server's number series (default INV/25-26/0001).
export const INVOICE_PREFIX = 'INV-';
export const formatInvoiceFallback = (id) => `${INVOICE_PREFIX}${String(id || 1).padStart(4, '0')}`;

// Filename-safe form for CSV exports, e.g. "POS_Project".
export const FILE_PREFIX = PRODUCT_NAME.replace(/\s+/g, '_');
