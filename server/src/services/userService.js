const bcrypt = require('bcryptjs');
const { getSync, allSync, runSync } = require('../db/database');
const india = require('../utils/india');
const { PERMISSIONS, OWNER_ROLE, roleAccess } = require('./permissions');

class UserError extends Error {
  constructor(fields, status = 400, message = 'Please correct the highlighted fields') {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

const USERNAME_PATTERN = /^[A-Za-z0-9._-]{3,32}$/;
const PIN_PATTERN = /^\d{4,6}$/;
const MIN_PASSWORD = 6;
const ROLE_ALIASES = { ADMIN: OWNER_ROLE }; // older clients sent ADMIN

const str = (v) => (v === null || v === undefined ? '' : String(v).trim());

function roleExists(code) {
  return Boolean(getSync('SELECT 1 FROM roles WHERE code = ?', [code]));
}

function activeOwnerCount(excludeUserId = null) {
  return getSync(
    `SELECT COUNT(*) n FROM users WHERE role = ? AND is_active = 1 AND id != ?`,
    [OWNER_ROLE, excludeUserId || -1]
  ).n;
}

function getUser(id) {
  return getSync(
    `SELECT u.id, u.username, u.full_name, u.role, r.name AS role_name, u.phone, u.email, u.is_active,
            u.pin_hash IS NOT NULL AS has_pin, u.last_login_at, u.created_at, u.updated_at
     FROM users u LEFT JOIN roles r ON r.code = u.role WHERE u.id = ?`,
    [id]
  );
}

function listUsers({ full = false } = {}) {
  const cols = full
    ? `u.id, u.username, u.full_name, u.role, r.name AS role_name, u.phone, u.email, u.is_active,
       u.pin_hash IS NOT NULL AS has_pin, u.last_login_at, u.created_at, u.updated_at`
    : 'u.id, u.username, u.full_name, u.role, r.name AS role_name, u.is_active';
  return allSync(`SELECT ${cols} FROM users u LEFT JOIN roles r ON r.code = u.role ORDER BY u.id DESC`)
    .map((u) => (full ? { ...u, has_pin: u.has_pin === 1 } : u));
}

function checkPassword(pw, errors, key = 'password') {
  if (typeof pw !== 'string' || pw.length < MIN_PASSWORD) errors[key] = `Password must be at least ${MIN_PASSWORD} characters`;
  else if (pw.length > 128) errors[key] = 'Password is too long';
}

/**
 * Validates profile fields for create (all required) or update (partial).
 * `actor` is the signed-in user doing it; enforces the owner-protection rules.
 */
function validateUserInput(input, { actor, existing = null }) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new UserError({ _: 'Expected an object of fields' });
  const creating = !existing;
  const errors = {};
  const out = {};
  const has = (k) => k in input;

  if (creating || has('username')) {
    const v = str(input.username);
    if (!USERNAME_PATTERN.test(v)) errors.username = '3–32 characters: letters, digits, . _ - (no spaces)';
    else if (getSync('SELECT 1 FROM users WHERE username = ? COLLATE NOCASE AND id != ?', [v, existing ? existing.id : -1])) {
      errors.username = 'Username already exists';
    } else out.username = v;
  }
  if (creating || has('full_name')) {
    const v = str(input.full_name);
    if (!v) errors.full_name = 'Full name is required';
    else if (v.length > 80) errors.full_name = 'At most 80 characters';
    else out.full_name = v;
  }
  if (creating || has('role')) {
    let v = str(input.role).toUpperCase();
    v = ROLE_ALIASES[v] || v;
    if (!roleExists(v)) errors.role = 'Unknown role';
    else out.role = v;
  }
  if (has('phone')) {
    const v = str(input.phone);
    if (v && !india.isValidPhone(v)) errors.phone = 'Enter a 10-digit mobile number';
    else out.phone = v;
  }
  if (has('email')) {
    const v = str(input.email).toLowerCase();
    if (v && !india.isValidEmail(v)) errors.email = 'Enter a valid email address';
    else out.email = v;
  }
  if (creating) checkPassword(input.password, errors);
  if (has('pin') && input.pin !== null && input.pin !== '') {
    if (!PIN_PATTERN.test(String(input.pin))) errors.pin = 'PIN must be 4 to 6 digits';
  }
  if (Object.keys(errors).length) throw new UserError(errors);

  // Owner protection
  const actorIsOwner = actor.role === OWNER_ROLE;
  const touchesOwner = out.role === OWNER_ROLE || (existing && existing.role === OWNER_ROLE);
  if (touchesOwner && !actorIsOwner) {
    throw new UserError({ role: 'Only an Owner can create, edit or promote Owner accounts' }, 403, 'Not allowed');
  }
  if (existing && out.role && out.role !== existing.role) {
    if (existing.id === actor.id) throw new UserError({ role: 'You cannot change your own role' }, 400);
    if (existing.role === OWNER_ROLE && existing.is_active === 1 && activeOwnerCount(existing.id) === 0) {
      throw new UserError({ role: 'This is the only active Owner; make someone else Owner first' }, 409);
    }
  }
  return out;
}

async function createUser(input, actor) {
  const out = validateUserInput(input, { actor });
  const passwordHash = await bcrypt.hash(input.password, 10);
  const pinHash = input.pin ? await bcrypt.hash(String(input.pin), 10) : null;
  return { out, passwordHash, pinHash };
}

function insertUser({ out, passwordHash, pinHash }) {
  const { lastInsertRowid } = runSync(
    `INSERT INTO users (username, password_hash, full_name, role, phone, email, pin_hash, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
    [out.username, passwordHash, out.full_name, out.role, out.phone || '', out.email || '', pinHash]
  );
  return lastInsertRowid;
}

function updateUserRow(id, out) {
  const keys = Object.keys(out);
  if (!keys.length) return;
  runSync(
    `UPDATE users SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [...keys.map((k) => out[k]), id]
  );
}

/** Status change rules: not yourself, not the last active owner, owners only by owners. */
function checkStatusChange(target, isActive, actor) {
  if (target.id === actor.id) throw new UserError({ is_active: 'You cannot change your own active status' });
  if (target.role === OWNER_ROLE && actor.role !== OWNER_ROLE) {
    throw new UserError({ is_active: 'Only an Owner can activate or deactivate an Owner' }, 403, 'Not allowed');
  }
  if (!isActive && target.role === OWNER_ROLE && target.is_active === 1 && activeOwnerCount(target.id) === 0) {
    throw new UserError({ is_active: 'This is the only active Owner and cannot be deactivated' }, 409);
  }
}

function checkCanManage(target, actor) {
  if (target.role === OWNER_ROLE && actor.role !== OWNER_ROLE) {
    throw new UserError({ _: 'Only an Owner can change an Owner account' }, 403, 'Not allowed');
  }
}

/** Role edit rules: OWNER fixed; can't edit your own role; can't grant what you don't have. */
function validateRolePatch(code, patch, actor) {
  if (code === OWNER_ROLE) throw new UserError({ _: 'The Owner role always has full access and cannot be edited' }, 400);
  if (!roleExists(code)) throw new UserError({ _: 'Unknown role' }, 404, 'Not found');
  if (actor.role === code) throw new UserError({ _: 'You cannot edit your own role' }, 403, 'Not allowed');
  if (!patch || typeof patch !== 'object') throw new UserError({ _: 'Expected an object of fields' });

  const errors = {};
  const out = {};
  if ('permissions' in patch) {
    const list = patch.permissions;
    if (!Array.isArray(list)) errors.permissions = 'Expected a list of permissions';
    else {
      const unknown = list.filter((p) => !PERMISSIONS[p]);
      const notHeld = list.filter((p) => PERMISSIONS[p] && !actor.permissions.includes(p));
      if (unknown.length) errors.permissions = `Unknown: ${unknown.join(', ')}`;
      else if (notHeld.length) errors.permissions = `You can't grant permissions you don't have: ${notHeld.join(', ')}`;
      else out.permissions = [...new Set(list)].sort();
    }
  }
  if ('max_discount_pct' in patch) {
    const v = patch.max_discount_pct;
    if (v === null || v === '') out.max_discount_pct = null;
    else {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || n > 100) errors.max_discount_pct = 'Discount limit must be 0–100%, or empty for no limit';
      else out.max_discount_pct = Math.round(n * 100) / 100;
    }
  }
  if (Object.keys(errors).length) throw new UserError(errors);
  return out;
}

function applyRolePatch(code, out) {
  if ('max_discount_pct' in out) {
    runSync('UPDATE roles SET max_discount_pct = ?, updated_at = CURRENT_TIMESTAMP WHERE code = ?', [out.max_discount_pct, code]);
  }
  if (out.permissions) {
    runSync('DELETE FROM role_permissions WHERE role_code = ?', [code]);
    for (const p of out.permissions) runSync('INSERT INTO role_permissions (role_code, permission) VALUES (?, ?)', [code, p]);
    runSync('UPDATE roles SET updated_at = CURRENT_TIMESTAMP WHERE code = ?', [code]);
  }
}

function roleSnapshot(code) {
  const role = getSync('SELECT code, name, max_discount_pct FROM roles WHERE code = ?', [code]);
  return { ...role, permissions: [...roleAccess(code).permissions].sort() };
}

module.exports = {
  UserError,
  MIN_PASSWORD,
  PIN_PATTERN,
  getUser,
  listUsers,
  validateUserInput,
  createUser,
  insertUser,
  updateUserRow,
  checkStatusChange,
  checkCanManage,
  checkPassword,
  validateRolePatch,
  applyRolePatch,
  roleSnapshot
};
