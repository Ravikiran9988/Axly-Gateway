import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from '../../lib/utils';

const ToastContext = createContext();

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const pushToast = useCallback((arg1, arg2, arg3) => {
    let title = '';
    let message = '';
    let type = 'info';
    let duration = 4500;

    if (typeof arg1 === 'object' && arg1 !== null) {
      title = arg1.title || '';
      message = arg1.message || '';
      type = arg1.type || 'info';
      duration = arg1.duration ?? 4500;
    } else {
      // Support legacy positional signature: addToast(message, type, title)
      message = String(arg1 || '');
      type = arg2 || 'info';
      title = arg3 || '';
    }

    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, title, message, type }]);

    if (duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    }
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useMemo(
    () => ({
      addToast: pushToast,
      success: (message, title = 'Completed') => pushToast({ title, message, type: 'success' }),
      error: (message, title = 'Error') => pushToast({ title, message, type: 'error', duration: 6000 }),
      warning: (message, title = 'Notice') => pushToast({ title, message, type: 'warning' }),
      info: (message, title = 'Info') => pushToast({ title, message, type: 'info' }),
    }),
    [pushToast]
  );

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div
        role="region"
        aria-label="Notifications"
        className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 max-w-sm w-[calc(100vw-2rem)] pointer-events-none"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cn(
              'pointer-events-auto flex items-start gap-3 rounded border p-3.5 shadow-md bg-popover text-popover-foreground transition-all duration-150',
              t.type === 'error' && 'border-status-err/40',
              t.type === 'success' && 'border-status-ok/40',
              t.type === 'warning' && 'border-status-warn/40',
              t.type === 'info' && 'border-border'
            )}
          >
            {t.type === 'error' && <AlertCircle className="h-4 w-4 shrink-0 text-status-err mt-0.5" />}
            {t.type === 'success' && <CheckCircle2 className="h-4 w-4 shrink-0 text-status-ok mt-0.5" />}
            {t.type === 'warning' && <AlertTriangle className="h-4 w-4 shrink-0 text-status-warn mt-0.5" />}
            {t.type === 'info' && <Info className="h-4 w-4 shrink-0 text-route mt-0.5" />}

            <div className="flex-1 min-w-0">
              {t.title && <div className="font-mono text-[11px] font-semibold uppercase tracking-wider text-foreground">{t.title}</div>}
              <p className="text-xs text-muted-foreground mt-0.5 break-words leading-relaxed">{t.message}</p>
            </div>

            <button
              type="button"
              onClick={() => removeToast(t.id)}
              aria-label="Dismiss notification"
              className="text-muted-foreground hover:text-foreground p-0.5 rounded-sm transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
