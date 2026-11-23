import React from 'react';
import { Loader2 } from 'lucide-react';

const VARIANTS = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm shadow-brand-600/20 disabled:bg-brand-600/50 disabled:shadow-none',
  secondary: 'bg-surface text-ink border border-line hover:bg-slate-50 disabled:text-ink-subtle',
  ghost: 'text-ink-muted hover:bg-slate-100 hover:text-ink disabled:text-ink-subtle',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 disabled:bg-rose-600/50',
  // Quiet destructive action for table rows (UI review M7): red text, no heavy fill
  'danger-quiet': 'text-rose-600 hover:bg-rose-50 disabled:text-rose-300',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-emerald-600/50',
  dark: 'bg-slate-900 text-white hover:bg-slate-800 disabled:bg-slate-400'
};

const SIZES = {
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-5 text-base gap-2 rounded-xl'
};
const ICON_SIZES = { sm: 'w-3.5 h-3.5', md: 'w-4 h-4', lg: 'w-5 h-5' };

/**
 * <Button variant="primary|secondary|ghost|danger|danger-quiet|success|dark" size="sm|md|lg"
 *         icon={LucideIcon} loading fullWidth>Label</Button>
 */
export const Button = React.forwardRef(function Button(
  { variant = 'primary', size = 'md', icon: Icon, iconRight: IconRight, loading = false, fullWidth = false,
    className = '', children, type = 'button', disabled, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={[
        'inline-flex items-center justify-center font-bold whitespace-nowrap transition-colors select-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed cursor-pointer',
        VARIANTS[variant] || VARIANTS.primary,
        SIZES[size] || SIZES.md,
        fullWidth ? 'w-full' : '',
        className
      ].join(' ')}
      {...props}
    >
      {loading ? <Loader2 className={`${ICON_SIZES[size]} animate-spin`} aria-hidden="true" />
        : Icon ? <Icon className={ICON_SIZES[size]} aria-hidden="true" /> : null}
      {children}
      {IconRight && !loading ? <IconRight className={ICON_SIZES[size]} aria-hidden="true" /> : null}
    </button>
  );
});
