import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

const WIDTHS = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg', xl: 'max-w-2xl' };

/**
 * Accessible dialog: Esc closes, focus moves inside and returns afterwards, backdrop click closes
 * (unless dismissible={false}). <Modal open onClose title description footer size>body</Modal>
 */
export function Modal({ open, onClose, title, description, icon: Icon, footer, size = 'md', dismissible = true, children }) {
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef(null);
  const previousFocus = useRef(null);
  // Callers usually pass a new onClose function on every render; keep the latest in a ref so the
  // effect below runs only when the dialog opens/closes (otherwise focus would jump on each keystroke).
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  useEffect(() => {
    if (!open) return undefined;
    previousFocus.current = document.activeElement;
    const panel = panelRef.current;
    const focusable = panel?.querySelector('[data-autofocus], input:not([disabled]), select, textarea, button:not([disabled])');
    (focusable || panel)?.focus();

    const onKey = (e) => {
      if (e.key === 'Escape' && dismissible) {
        e.stopPropagation();
        onCloseRef.current?.();
      } else if (e.key === 'Tab' && panel) {
        // keep Tab inside the dialog
        const items = [...panel.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')];
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      previousFocus.current?.focus?.();
    };
  }, [open, dismissible]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={dismissible ? onClose : undefined} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={`relative w-full ${WIDTHS[size] || WIDTHS.md} bg-surface rounded-2xl shadow-2xl border border-line outline-none max-h-[calc(100vh-2rem)] flex flex-col`}
      >
        {(title || dismissible) && (
          <div className="flex items-start gap-3 px-5 pt-5 pb-3">
            {Icon && (
              <div className="w-9 h-9 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center flex-shrink-0">
                <Icon className="w-5 h-5" aria-hidden="true" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              {title && <h2 id={titleId} className="text-base font-bold text-ink">{title}</h2>}
              {description && <p id={descId} className="text-sm text-ink-muted mt-0.5">{description}</p>}
            </div>
            {dismissible && (
              <button type="button" onClick={onClose} aria-label="Close"
                className="p-1.5 -m-1 rounded-lg text-ink-subtle hover:text-ink hover:bg-slate-100 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
        <div className="px-5 pb-4 overflow-y-auto min-h-0">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-line flex items-center justify-end gap-2 bg-slate-50/60 rounded-b-2xl">{footer}</div>}
      </div>
    </div>
  );
}
