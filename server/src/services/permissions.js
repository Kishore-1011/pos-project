const { allSync, getSync } = require('../db/database');

// Every permission the server checks. Grouped for the Phase 2 Roles & Permissions screen.
// Adding a permission later needs a new migration that grants it to the roles that should have it
// (migration 007 only seeded the roles once). OWNER gets every permission automatically.
const PERMISSIONS = {
  'billing.create': { group: 'Billing', label: 'Create bills' },
  'billing.discount': { group: 'Billing', label: "Give discounts (up to the role's limit)" },
  'billing.price_change': { group: 'Billing', label: 'Change item price at billing' },
  'orders.view': { group: 'Billing', label: 'View and reprint bills' },
  'orders.void': { group: 'Billing', label: 'Void bills' },
  'orders.unvoid': { group: 'Billing', label: 'Restore voided bills' },
  'customers.view': { group: 'Customers', label: 'View and look up customers' },
  'customers.manage': { group: 'Customers', label: 'Add and edit customers' },
  'customers.delete': { group: 'Customers', label: 'Delete customers' },
  'items.manage': { group: 'Catalog', label: 'Manage items and categories' },
  'reports.view': { group: 'Admin', label: 'View sales reports' },
  'audit.view': { group: 'Admin', label: 'View the audit log' },
  'users.manage': { group: 'Admin', label: 'Manage users and role permissions' },
  'settings.manage': { group: 'Admin', label: 'Manage shop settings, tax details and number series' }
};

// Built-in roles. OWNER always has every permission and no discount limit (can't be edited, so the
// shop can never lock itself out). MANAGER and CASHIER permissions and limits are editable.
const DEFAULT_ROLES = {
  OWNER: {
    name: 'Owner',
    description: 'Full access, including users, roles and shop settings',
    max_discount_pct: null,
    permissions: 'ALL'
  },
  MANAGER: {
    name: 'Manager',
    description: 'Runs the shop day to day: billing, voids, catalog, customers, reports',
    max_discount_pct: 50,
    permissions: [
      'billing.create', 'billing.discount', 'billing.price_change',
      'orders.view', 'orders.void', 'orders.unvoid',
      'customers.view', 'customers.manage', 'customers.delete',
      'items.manage', 'reports.view', 'audit.view'
    ]
  },
  CASHIER: {
    name: 'Cashier',
    description: 'Billing at the counter',
    max_discount_pct: 20,
    permissions: ['billing.create', 'billing.discount', 'orders.view', 'customers.view', 'customers.manage']
  }
};

const OWNER_ROLE = 'OWNER';

/** Permissions and limits of a role, read live from the DB (so edits apply immediately). */
function roleAccess(roleCode) {
  if (roleCode === OWNER_ROLE) {
    return { permissions: new Set(Object.keys(PERMISSIONS)), max_discount_pct: null };
  }
  const role = getSync('SELECT max_discount_pct FROM roles WHERE code = ?', [roleCode]);
  if (!role) return { permissions: new Set(), max_discount_pct: 0 };
  const perms = allSync('SELECT permission FROM role_permissions WHERE role_code = ?', [roleCode]).map((r) => r.permission);
  return { permissions: new Set(perms), max_discount_pct: role.max_discount_pct };
}

function listRoles() {
  return allSync('SELECT code, name, description, max_discount_pct, is_system, updated_at FROM roles ORDER BY rowid').map((r) => {
    const access = roleAccess(r.code);
    return {
      ...r,
      is_system: r.is_system === 1,
      editable: r.code !== OWNER_ROLE,
      permissions: [...access.permissions].sort(),
      user_count: getSync('SELECT COUNT(*) n FROM users WHERE role = ? AND is_active = 1', [r.code]).n
    };
  });
}

module.exports = { PERMISSIONS, DEFAULT_ROLES, OWNER_ROLE, roleAccess, listRoles };
