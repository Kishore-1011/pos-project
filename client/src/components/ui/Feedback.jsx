import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { CheckCircle2, AlertTriangle, Info, XCircle, X, HelpCircle } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';
import { TextInput } from './Field';

// Replaces the browser's alert / confirm / prompt (UI review: 39 pop-ups) with in-app versions:
//   const toast = useToast();      toast.success('Saved'); toast.error('Could not save', { title })
//   const dialogs = useDialogs();  if (await dialogs.confirm({ title, message, tone: 'danger' })) ...
//                                  const reason = await dialogs.prompt({ title, label, required: true })

const ToastContext = createContext(null);
const DialogContext = createContext(null);

const TOAST_STYLE = {
  success: { icon: CheckCircle2, cls: 'border-emerald-200 bg-emerald-50 text-emerald-900', iconCls: 'text-emerald-600' },
  error: { icon: XCircle, cls: 'border-rose-200 bg-rose-50 text-rose-900', iconCls: 'text-rose-600' },
  warning: { icon: AlertTriangle, cls: 'border-amber-200 bg-amber-50 text-amber-900', iconCls: 'text-amber-600' },
  info: { icon: Info, cls: 'border-brand-200 bg-brand-50 text-slate-900', iconCls: 'text-brand-600' }
};

export function FeedbackProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id) => setToasts((list) => list.filter((t) => t.id !== id)), []);
  const show = useCallback((tone, message, { title, duration } = {}) => {
    const id = nextId.current++;
    setToasts((list) => [...list.slice(-3), { id, tone, message, title }]);
    const ms = duration ?? (tone === 'error' ? 6000 : 3000);
    if (ms > 0) setTimeout(() => dismiss(id), ms);
    return id;
  }, [dismiss]);

  const toast = useMemo(() => ({
    success: (m, o) => show('success', m, o),
    error: (m, o) => show('error', m, o),
    warning: (m, o) => show('warning', m, o),
    info: (m, o) => show('info', m, o),
    dismiss
  }), [show, dismiss]);

  // One dialog at a time; resolves the promise returned by confirm()/prompt()
  const [dialog, setDialog] = useState(null);
  const [inputValue, setInputValue] = useState('');
  const [inputError, setInputError] = useState('');

  const confirm = useCallback((opts) => new Promise((resolve) => {
    setDialog({ kind: 'confirm', ...opts, resolve });
  }), []);
  const prompt = useCallback((opts) => new Promise((resolve) => {
    setInputValue(opts.defaultValue || '');
    setInputError('');
    setDialog({ kind: 'prompt', ...opts, resolve });
  }), []);
  const dialogs = useMemo(() => ({ confirm, prompt }), [confirm, prompt]);

  const close = (result) => {
    dialog?.resolve(result);
    setDialog(null);
  };
  const submit = (e) => {
    e?.preventDefault();
    if (dialog.kind === 'prompt') {
      const v = inputValue.trim();
      const min = dialog.minLength || (dialog.required ? 1 : 0);
      if (v.length < min) {
        setInputError(dialog.required && !v ? 'This is required' : `At least ${min} characters`);
        return;
      }
      close(v);
    } else {
      close(true);
    }
  };

  return (
    <ToastContext.Provider value={toast}>
      <DialogContext.Provider value={dialogs}>
        {children}

        {/* Toasts: bottom-right, newest last; errors are announced immediately */}
        <div className="fixed bottom-4 right-4 z-[110] flex flex-col gap-2 w-[22rem] max-w-[calc(100vw-2rem)]">
          {toasts.map((t) => {
            const s = TOAST_STYLE[t.tone] || TOAST_STYLE.info;
            const Icon = s.icon;
            return (
              <div key={t.id} role={t.tone === 'error' ? 'alert' : 'status'}
                className={`flex items-start gap-2.5 p-3 rounded-xl border shadow-lg ${s.cls}`}>
                <Icon className={`w-5 h-5 flex-shrink-0 ${s.iconCls}`} aria-hidden="true" />
                <div className="flex-1 min-w-0 text-sm">
                  {t.title && <p className="font-bold">{t.title}</p>}
                  <p className={t.title ? 'text-ink-muted' : 'font-semibold'}>{t.message}</p>
                </div>
                <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss"
                  className="p-0.5 rounded text-ink-subtle hover:text-ink cursor-pointer"><X className="w-4 h-4" /></button>
              </div>
            );
          })}
        </div>

        <Modal
          open={Boolean(dialog)}
          onClose={() => close(dialog?.kind === 'prompt' ? null : false)}
          title={dialog?.title}
          description={dialog?.message}
          icon={dialog?.tone === 'danger' ? AlertTriangle : HelpCircle}
          size="sm"
          footer={dialog && (
            <>
              <Button variant="secondary" onClick={() => close(dialog.kind === 'prompt' ? null : false)}>
                {dialog.cancelLabel || 'Cancel'}
              </Button>
              <Button variant={dialog.tone === 'danger' ? 'danger' : 'primary'} onClick={submit}>
                {dialog.confirmLabel || 'OK'}
              </Button>
            </>
          )}
        >
          {dialog?.kind === 'prompt' && (
            <form onSubmit={submit}>
              <TextInput
                label={dialog.label}
                placeholder={dialog.placeholder}
                value={inputValue}
                onChange={(e) => { setInputValue(e.target.value); setInputError(''); }}
                error={inputError}
                required={dialog.required}
                maxLength={dialog.maxLength || 200}
                data-autofocus
              />
            </form>
          )}
        </Modal>
      </DialogContext.Provider>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <FeedbackProvider>');
  return ctx;
}

export function useDialogs() {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialogs must be used inside <FeedbackProvider>');
  return ctx;
}
