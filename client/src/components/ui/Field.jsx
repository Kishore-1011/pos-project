import React, { useId } from 'react';

const CONTROL_BASE = [
  'w-full bg-surface border text-sm text-ink placeholder:text-ink-subtle outline-none transition-colors',
  'focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20',
  'disabled:bg-slate-50 disabled:text-ink-subtle disabled:cursor-not-allowed'
].join(' ');

const controlClass = (error, extra = '') =>
  `${CONTROL_BASE} ${error ? 'border-rose-500 focus:border-rose-600 focus:ring-rose-500/20' : 'border-slate-300'} ${extra}`;

/** Label + control + hint/error, wired for screen readers. Children get id/aria props via render function. */
export function Field({ label, hint, error, required, className = '', children }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="block text-xs font-semibold text-ink-muted mb-1.5">
          {label}{required && <span className="text-rose-600 ml-0.5" aria-hidden="true">*</span>}
        </label>
      )}
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined, required })}
      {error ? (
        <p id={errorId} className="mt-1 text-xs font-medium text-rose-600">{error}</p>
      ) : hint ? (
        <p id={hintId} className="mt-1 text-xs text-ink-subtle">{hint}</p>
      ) : null}
    </div>
  );
}

const SIZE = { sm: 'h-8 px-2.5 rounded-lg', md: 'h-10 px-3 rounded-xl', lg: 'h-12 px-3.5 rounded-xl text-base' };

/** <TextInput label="Name" error={errors.name} hint="..." value onChange ... /> */
export const TextInput = React.forwardRef(function TextInput(
  { label, hint, error, required, size = 'md', className = '', inputClassName = '', icon: Icon, ...props }, ref
) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className}>
      {(a11y) => (
        <div className="relative">
          {Icon && <Icon className="w-4 h-4 text-ink-subtle absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />}
          <input ref={ref} {...a11y} {...props} className={controlClass(error, `${SIZE[size]} ${Icon ? 'pl-9' : ''} ${inputClassName}`)} />
        </div>
      )}
    </Field>
  );
});

/** <Select label="Category" options={[{ value, label }]} placeholder="Choose…" value onChange /> */
export const Select = React.forwardRef(function Select(
  { label, hint, error, required, size = 'md', className = '', options = [], placeholder, children, ...props }, ref
) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className}>
      {(a11y) => (
        <select ref={ref} {...a11y} {...props} className={controlClass(error, `${SIZE[size]} pr-8 cursor-pointer`)}>
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((o) => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}
          {children}
        </select>
      )}
    </Field>
  );
});

export const Textarea = React.forwardRef(function Textarea(
  { label, hint, error, required, className = '', rows = 3, ...props }, ref
) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className}>
      {(a11y) => <textarea ref={ref} rows={rows} {...a11y} {...props} className={controlClass(error, 'px-3 py-2 rounded-xl resize-y')} />}
    </Field>
  );
});

/**
 * Rupee amount input: ₹ prefix, decimal keyboard, at most 2 decimals, no letters.
 * value/onChange work with the text the user typed (parse with Number() when saving).
 */
export const MoneyInput = React.forwardRef(function MoneyInput(
  { label, hint, error, required, size = 'md', className = '', inputClassName = '', onChange, value, ...props }, ref
) {
  const handle = (e) => {
    const raw = e.target.value.replace(/[^\d.]/g, '');
    const [whole, ...rest] = raw.split('.');
    const cleaned = rest.length ? `${whole}.${rest.join('').slice(0, 2)}` : whole;
    if (onChange) onChange(cleaned, e);
  };
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className}>
      {(a11y) => (
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-ink-subtle pointer-events-none" aria-hidden="true">₹</span>
          <input
            ref={ref} {...a11y} {...props}
            type="text" inputMode="decimal" autoComplete="off"
            value={value ?? ''} onChange={handle}
            className={controlClass(error, `${SIZE[size]} pl-7 text-right font-bold tabular-nums ${inputClassName}`)}
          />
        </div>
      )}
    </Field>
  );
});
