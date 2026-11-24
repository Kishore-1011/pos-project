import React from 'react';

// Small form controls shared by the Settings screens and the setup wizard.

/** Accessible on/off switch with a label and optional description. */
export function Switch({ checked, onChange, label, description, disabled }) {
  return (
    <label className={`flex items-start gap-3 ${disabled ? 'opacity-60' : 'cursor-pointer'}`}>
      <button
        type="button"
        role="switch"
        aria-checked={Boolean(checked)}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 w-10 h-6 rounded-full flex-shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${
          checked ? 'bg-brand-600' : 'bg-slate-300'
        }`}
      >
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : ''}`} />
      </button>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-ink">{label}</span>
        {description && <span className="block text-xs text-ink-muted mt-0.5">{description}</span>}
      </span>
    </label>
  );
}

/** Coloured info / warning / error note. */
export function Note({ tone = 'info', icon: Icon, children }) {
  const tones = {
    info: 'bg-brand-50 border-brand-200 text-slate-800',
    warning: 'bg-amber-50 border-amber-200 text-amber-900',
    error: 'bg-rose-50 border-rose-200 text-rose-800',
    success: 'bg-emerald-50 border-emerald-200 text-emerald-900'
  };
  return (
    <div className={`flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl border text-sm ${tones[tone] || tones.info}`}>
      {Icon && <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden="true" />}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Small titled group inside a settings panel. */
export function FormGroup({ title, description, children }) {
  return (
    <section className="space-y-3">
      {(title || description) && (
        <div>
          {title && <h3 className="text-sm font-bold text-ink">{title}</h3>}
          {description && <p className="text-xs text-ink-muted mt-0.5">{description}</p>}
        </div>
      )}
      {children}
    </section>
  );
}

