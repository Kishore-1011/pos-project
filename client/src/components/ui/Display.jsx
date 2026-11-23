import React from 'react';

const BADGE_TONES = {
  neutral: 'bg-slate-100 text-slate-700 border-slate-200',
  brand: 'bg-brand-50 text-brand-700 border-brand-200',
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  warning: 'bg-amber-50 text-amber-800 border-amber-200',
  danger: 'bg-rose-50 text-rose-700 border-rose-200'
};

/** Small status label. <Badge tone="success">Paid</Badge> */
export function Badge({ tone = 'neutral', className = '', children }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs font-semibold whitespace-nowrap ${BADGE_TONES[tone] || BADGE_TONES.neutral} ${className}`}>
      {children}
    </span>
  );
}

/** White rounded panel used for sections and tables. */
export function Card({ className = '', children, ...props }) {
  return <div className={`bg-surface border border-line rounded-2xl shadow-sm ${className}`} {...props}>{children}</div>;
}

/** Page title row: icon + title + optional subtitle on the left, actions on the right. */
export function PageHeader({ icon: Icon, title, subtitle, actions }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
      <div className="flex items-center gap-3 min-w-0">
        {Icon && (
          <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center flex-shrink-0">
            <Icon className="w-5 h-5" aria-hidden="true" />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-ink tracking-tight">{title}</h1>
          {subtitle && <p className="text-sm text-ink-muted">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Centered message for empty lists. */
export function EmptyState({ icon: Icon, title, message, action }) {
  return (
    <div className="py-10 px-4 flex flex-col items-center text-center">
      {Icon && (
        <div className="w-12 h-12 rounded-2xl bg-slate-100 text-ink-subtle flex items-center justify-center mb-3">
          <Icon className="w-6 h-6" aria-hidden="true" />
        </div>
      )}
      <p className="text-sm font-bold text-ink">{title}</p>
      {message && <p className="text-sm text-ink-muted mt-1 max-w-sm">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
