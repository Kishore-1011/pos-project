import React, { useEffect, useState } from 'react';
import { ArrowLeft, KeyRound, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Modal, Button, TextInput, EmptyState, useToast } from './ui';

/**
 * Quick hand-over at the counter: pick a staff member who has a PIN, enter it, and the session
 * switches to them (no full password needed). Staff without a PIN use Log out + password instead.
 */
export function SwitchUserDialog({ open, onClose }) {
  const { authFetch, pinLogin, user } = useAuth();
  const toast = useToast();
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(false);
  const [chosen, setChosen] = useState(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setChosen(null);
    setPin('');
    setError('');
    setLoading(true);
    authFetch('/api/auth/pin-users')
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => setPeople(Array.isArray(list) ? list : []))
      .catch(() => setPeople([]))
      .finally(() => setLoading(false));
  }, [open]);

  const submit = async (e) => {
    e.preventDefault();
    if (!/^\d{4,6}$/.test(pin)) {
      setError('Enter the 4 to 6 digit PIN');
      return;
    }
    try {
      setSubmitting(true);
      const next = await pinLogin(chosen.username, pin);
      toast.success(`Switched to ${next.full_name}`);
      onClose();
    } catch (err) {
      setError(err.message);
      setPin('');
    } finally {
      setSubmitting(false);
    }
  };

  const others = people.filter((p) => p.username !== user?.username);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={chosen ? `Enter PIN for ${chosen.full_name}` : 'Switch user'}
      description={chosen ? chosen.role_name : 'Hand the counter to another staff member.'}
      icon={chosen ? KeyRound : Users}
      size="sm"
    >
      {!chosen ? (
        loading ? (
          <p className="py-6 text-center text-sm text-ink-muted">Loading staff…</p>
        ) : others.length === 0 ? (
          <EmptyState
            icon={KeyRound}
            title="No one else has a PIN yet"
            message="Set a PIN for staff in Staff Users. Until then, use Log out and sign in with a password."
          />
        ) : (
          <ul className="space-y-1.5">
            {others.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => { setChosen(p); setPin(''); setError(''); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-line hover:border-brand-500 hover:bg-brand-50 text-left cursor-pointer"
                >
                  <span className="w-9 h-9 rounded-full bg-brand-600 text-white text-sm font-bold flex items-center justify-center flex-shrink-0">
                    {p.full_name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-ink truncate">{p.full_name}</span>
                    <span className="block text-xs text-ink-muted">{p.role_name}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <TextInput
            label="PIN"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            value={pin}
            onChange={(e) => { setPin(e.target.value.replace(/\D/g, '')); setError(''); }}
            error={error}
            data-autofocus
            inputClassName="text-center text-lg tracking-[0.5em] font-bold"
          />
          <div className="flex items-center justify-between gap-2">
            <Button variant="ghost" icon={ArrowLeft} onClick={() => setChosen(null)}>Back</Button>
            <Button type="submit" loading={submitting}>Switch</Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
