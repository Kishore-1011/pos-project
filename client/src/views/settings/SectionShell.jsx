import React from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '../../components/ui';

/**
 * Frame for one Settings section: header (icon, title, description), scrolling body, and a sticky
 * footer with Cancel / Save that only lights up when there are unsaved changes.
 */
export function SectionShell({ icon: Icon, title, description, loading, dirty, saving, onSave, onCancel, saveLabel = 'Save changes', footerNote, hideFooter, children }) {
  return (
    <div className="h-full flex flex-col bg-surface border border-line rounded-2xl shadow-sm overflow-hidden">
      <div className="flex items-start gap-3 px-6 pt-5 pb-4 border-b border-line">
        {Icon && (
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-brand-50 to-brand-100 text-brand-600 flex items-center justify-center flex-shrink-0">
            <Icon className="w-5 h-5" aria-hidden="true" />
          </div>
        )}
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-ink tracking-tight">{title}</h2>
          {description && <p className="text-sm text-ink-muted mt-0.5">{description}</p>}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
        {loading ? (
          <div className="h-40 flex items-center justify-center text-ink-muted gap-2 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Loading…
          </div>
        ) : children}
      </div>

      {!hideFooter && (
        <div className="flex items-center justify-between gap-3 px-6 py-3 border-t border-line bg-slate-50/70">
          <p className="text-xs text-ink-muted">
            {dirty ? <span className="font-semibold text-amber-700">Unsaved changes</span> : footerNote || 'All changes saved'}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onCancel} disabled={!dirty || saving}>Cancel</Button>
            <Button onClick={onSave} loading={saving} disabled={!dirty}>{saveLabel}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
