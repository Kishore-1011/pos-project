import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  useToast, useDialogs, Button, Badge, Card, PageHeader, TextInput, Select, Modal, EmptyState
} from '../components/ui';
import { formatDate, formatDateTime } from '../utils/format';
import { UserPlus, Users, KeyRound, Edit2, UserCog, Phone, Mail, Hash, Lock, UserX, UserCheck } from 'lucide-react';

const ROLE_OPTIONS = [
  { value: 'CASHIER', label: 'Cashier: billing at the counter' },
  { value: 'MANAGER', label: 'Manager: billing, voids, items, reports' },
  { value: 'OWNER', label: 'Owner: full access, including staff and settings' }
];
const ROLE_TONE = { OWNER: 'brand', MANAGER: 'warning', CASHIER: 'neutral' };
const EMPTY_FORM = { full_name: '', username: '', password: '', role: 'CASHIER', phone: '', email: '' };

const initials = (name = '') => name.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

export function UserManagerView() {
  const { authFetch, user: currentUser } = useAuth();
  const toast = useToast();
  const dialogs = useDialogs();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Create / edit (one form)
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null); // user being edited, or null when creating
  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  // Reset password
  const [resetUser, setResetUser] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const res = await authFetch('/api/users');
      if (res.ok) setUsers(await res.json());
    } catch (err) {
      console.error('Failed to load users:', err);
      toast.error('Could not load staff');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const setField = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setFieldErrors((e) => ({ ...e, [key]: undefined }));
    setFormError('');
  };

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFieldErrors({});
    setFormError('');
    setFormOpen(true);
  };

  const openEdit = (u) => {
    setEditing(u);
    setForm({ full_name: u.full_name, username: u.username, password: '', role: u.role, phone: u.phone || '', email: u.email || '' });
    setFieldErrors({});
    setFormError('');
    setFormOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const errors = {};
    if (!form.full_name.trim()) errors.full_name = 'Full name is required';
    if (!form.username.trim()) errors.username = 'Username is required';
    if (!editing && form.password.length < 6) errors.password = 'At least 6 characters';
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      return;
    }

    const body = {
      full_name: form.full_name.trim(),
      username: form.username.trim(),
      role: form.role,
      phone: form.phone.trim(),
      email: form.email.trim()
    };
    if (!editing) body.password = form.password;

    try {
      setSaving(true);
      const res = await authFetch(editing ? `/api/users/${editing.id}` : '/api/users', {
        method: editing ? 'PUT' : 'POST',
        body: JSON.stringify(body)
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setFormOpen(false);
        toast.success(editing ? `${body.full_name}'s profile updated` : `${body.full_name} can now log in as @${body.username}`);
        loadUsers();
      } else {
        const fields = data.fields || {};
        const { _: general, ...rest } = fields;
        setFieldErrors(rest);
        setFormError(Object.keys(rest).length ? (general || '') : (data.error || general || 'Could not save'));
      }
    } catch (err) {
      setFormError(`Could not save: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (u) => {
    if (u.id === currentUser.id) {
      toast.error('You cannot deactivate your own account');
      return;
    }
    const deactivating = u.is_active === 1;
    const ok = await dialogs.confirm({
      title: deactivating ? `Deactivate ${u.full_name}?` : `Reactivate ${u.full_name}?`,
      message: deactivating
        ? `@${u.username} will be signed out at once and can't log in until reactivated.`
        : `@${u.username} will be able to log in again.`,
      confirmLabel: deactivating ? 'Deactivate' : 'Reactivate',
      tone: deactivating ? 'danger' : 'primary'
    });
    if (!ok) return;

    try {
      const res = await authFetch(`/api/users/${u.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: deactivating ? 0 : 1 })
      });
      if (res.ok) {
        toast.success(deactivating ? `${u.full_name} deactivated` : `${u.full_name} reactivated`);
        loadUsers();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Could not change the status');
      }
    } catch (err) {
      toast.error(`Could not change the status: ${err.message}`);
    }
  };

  const handleSetPin = async (u) => {
    const pin = await dialogs.prompt({
      title: `${u.has_pin ? 'Change' : 'Set'} PIN for ${u.full_name}`,
      message: 'A 4 to 6 digit PIN lets them take over the counter quickly with Switch user. Share it with them privately.',
      label: 'PIN',
      placeholder: '4 to 6 digits',
      required: true,
      minLength: 4,
      maxLength: 6,
      confirmLabel: 'Save PIN'
    });
    if (pin === null) return;
    if (!/^\d{4,6}$/.test(pin)) {
      toast.error('The PIN must be 4 to 6 digits');
      return;
    }
    try {
      const res = await authFetch(`/api/users/${u.id}/pin`, { method: 'PUT', body: JSON.stringify({ pin }) });
      if (res.ok) {
        toast.success(`PIN saved for ${u.full_name}`);
        loadUsers();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Could not save the PIN');
      }
    } catch (err) {
      toast.error(`Could not save the PIN: ${err.message}`);
    }
  };

  const handleClearPin = async (u) => {
    const ok = await dialogs.confirm({
      title: `Remove ${u.full_name}'s PIN?`,
      message: 'They will need their password to log in; Switch user will no longer list them.',
      confirmLabel: 'Remove PIN',
      tone: 'danger'
    });
    if (!ok) return;
    try {
      const res = await authFetch(`/api/users/${u.id}/pin`, { method: 'PUT', body: JSON.stringify({ pin: null }) });
      if (res.ok) {
        toast.success(`PIN removed for ${u.full_name}`);
        loadUsers();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Could not remove the PIN');
      }
    } catch (err) {
      toast.error(`Could not remove the PIN: ${err.message}`);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      setResetError('At least 6 characters');
      return;
    }
    try {
      setResetLoading(true);
      const res = await authFetch(`/api/users/${resetUser.id}/password`, {
        method: 'PATCH',
        body: JSON.stringify({ new_password: newPassword })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(`New password set for ${resetUser.full_name}`);
        setResetUser(null);
      } else {
        setResetError(data.fields?.new_password || data.error || 'Could not reset the password');
      }
    } catch (err) {
      setResetError(`Could not reset the password: ${err.message}`);
    } finally {
      setResetLoading(false);
    }
  };

  const activeCount = users.filter((u) => u.is_active === 1).length;

  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader
        icon={Users}
        title="Staff"
        subtitle={`${activeCount} active of ${users.length}. Roles decide what each person can do.`}
        actions={<Button icon={UserPlus} onClick={openCreate}>Add staff</Button>}
      />

      <Card className="overflow-hidden">
        {loading ? (
          <p className="p-8 text-center text-sm text-ink-muted">Loading staff…</p>
        ) : users.length === 0 ? (
          <EmptyState icon={Users} title="No staff yet" message="Add the people who use the counter."
            action={<Button icon={UserPlus} onClick={openCreate}>Add staff</Button>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-ink">
              <thead className="bg-slate-50 text-xs text-ink-muted font-semibold border-b border-line">
                <tr>
                  <th className="px-5 py-3">Person</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Contact</th>
                  <th className="px-4 py-3">Quick PIN</th>
                  <th className="px-4 py-3">Last login</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {users.map((u) => {
                  const isSelf = u.id === currentUser.id;
                  const isActive = u.is_active === 1;
                  const hasPin = u.has_pin === true || u.has_pin === 1;
                  return (
                    <tr key={u.id} className={`transition-colors ${isActive ? 'hover:bg-slate-50/80' : 'bg-slate-50/60'}`}>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <span className={`w-9 h-9 rounded-full text-sm font-bold flex items-center justify-center flex-shrink-0 ${isActive ? 'bg-brand-600 text-white' : 'bg-slate-200 text-ink-muted'}`} aria-hidden="true">
                            {initials(u.full_name)}
                          </span>
                          <div className="min-w-0">
                            <p className="font-bold text-ink flex items-center gap-1.5">
                              {u.full_name}
                              {isSelf && <Badge tone="brand">You</Badge>}
                            </p>
                            <p className="text-xs text-ink-muted">@{u.username}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3"><Badge tone={ROLE_TONE[u.role] || 'neutral'}>{u.role_name || u.role}</Badge></td>
                      <td className="px-4 py-3 text-xs text-ink-muted">
                        {u.phone ? <p className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" aria-hidden="true" />{u.phone}</p> : null}
                        {u.email ? <p className="flex items-center gap-1.5 mt-0.5"><Mail className="w-3.5 h-3.5" aria-hidden="true" />{u.email}</p> : null}
                        {!u.phone && !u.email && <span className="text-ink-subtle">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {hasPin ? <Badge tone="success"><Hash className="w-3 h-3" aria-hidden="true" />PIN set</Badge> : <span className="text-xs text-ink-subtle">No PIN</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-ink-muted whitespace-nowrap">
                        {u.last_login_at ? formatDateTime(u.last_login_at) : 'Never'}
                        <p className="text-ink-subtle">Added {formatDate(u.created_at)}</p>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={isActive ? 'success' : 'neutral'}>
                          {isActive ? <UserCheck className="w-3 h-3" aria-hidden="true" /> : <UserX className="w-3 h-3" aria-hidden="true" />}
                          {isActive ? 'Active' : 'Deactivated'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1 flex-wrap">
                          <Button size="sm" variant="secondary" icon={Edit2} onClick={() => openEdit(u)}>Edit</Button>
                          <Button size="sm" variant="ghost" icon={Hash} onClick={() => handleSetPin(u)}>{hasPin ? 'Change PIN' : 'Set PIN'}</Button>
                          {hasPin && <Button size="sm" variant="ghost" onClick={() => handleClearPin(u)}>Clear PIN</Button>}
                          <Button size="sm" variant="ghost" icon={KeyRound}
                            onClick={() => { setResetUser(u); setNewPassword(''); setResetError(''); }}>Password</Button>
                          {!isSelf && (
                            isActive
                              ? <Button size="sm" variant="danger-quiet" onClick={() => handleToggleStatus(u)}>Deactivate</Button>
                              : <Button size="sm" variant="ghost" onClick={() => handleToggleStatus(u)}>Reactivate</Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Create / edit */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? `Edit ${editing.full_name}` : 'Add staff'}
        description={editing ? `@${editing.username}` : 'They log in with this username and password.'}
        icon={editing ? UserCog : UserPlus}
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button type="submit" form="staff-form" loading={saving}>{editing ? 'Save changes' : 'Add staff'}</Button>
          </>
        }
      >
        <form id="staff-form" onSubmit={handleSave} className="space-y-4" noValidate>
          <TextInput label="Full name" required value={form.full_name} onChange={(e) => setField('full_name', e.target.value)}
            error={fieldErrors.full_name} placeholder="e.g. Rahul Sharma" data-autofocus />
          <div className="grid grid-cols-2 gap-3">
            <TextInput label="Username" required value={form.username} onChange={(e) => setField('username', e.target.value)}
              error={fieldErrors.username} placeholder="e.g. rahul" autoComplete="off" />
            {!editing && (
              <TextInput label="Password" type="password" required icon={Lock} value={form.password}
                onChange={(e) => setField('password', e.target.value)} error={fieldErrors.password}
                hint="At least 6 characters" autoComplete="new-password" />
            )}
          </div>
          <Select label="Role" value={form.role} onChange={(e) => setField('role', e.target.value)}
            error={fieldErrors.role} options={ROLE_OPTIONS} />
          <div className="grid grid-cols-2 gap-3">
            <TextInput label="Phone" icon={Phone} value={form.phone} onChange={(e) => setField('phone', e.target.value)}
              error={fieldErrors.phone} placeholder="Optional" inputMode="tel" />
            <TextInput label="Email" icon={Mail} type="email" value={form.email} onChange={(e) => setField('email', e.target.value)}
              error={fieldErrors.email} placeholder="Optional" />
          </div>
          {formError && <p className="text-sm font-medium text-rose-600" role="alert">{formError}</p>}
        </form>
      </Modal>

      {/* Reset password */}
      <Modal
        open={Boolean(resetUser)}
        onClose={() => setResetUser(null)}
        title={resetUser ? `New password for ${resetUser.full_name}` : ''}
        description={resetUser ? `@${resetUser.username}` : ''}
        icon={KeyRound}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setResetUser(null)}>Cancel</Button>
            <Button type="submit" form="reset-form" loading={resetLoading}>Set password</Button>
          </>
        }
      >
        <form id="reset-form" onSubmit={handleResetPassword} noValidate>
          <TextInput label="New password" type="password" icon={Lock} value={newPassword}
            onChange={(e) => { setNewPassword(e.target.value); setResetError(''); }}
            error={resetError} hint="At least 6 characters" autoComplete="new-password" data-autofocus />
        </form>
      </Modal>
    </div>
  );
}
