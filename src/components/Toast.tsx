import { useEffect } from 'react';
import { cn } from '@/lib/cn';

export type ToastVariant = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastProps {
  toast: ToastMessage;
  onDismiss: (id: number) => void;
}

export function Toast({ toast, onDismiss }: ToastProps) {
  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(toast.id), 3000);
    return () => window.clearTimeout(timer);
  }, [toast.id, onDismiss]);

  const prefix =
    toast.variant === 'success'
      ? '✓'
      : toast.variant === 'error'
        ? '⚠'
        : '·';

  return (
    <div
      role={toast.variant === 'error' ? 'alert' : 'status'}
      className={cn(
        'pointer-events-auto flex items-center gap-3 min-w-[260px] max-w-[420px]',
        'px-3.5 py-2.5 font-sans bg-surface border',
        toast.variant === 'success' && 'border-gain/60 text-gain',
        toast.variant === 'error' && 'border-loss/60 text-loss',
        toast.variant === 'info' && 'border-line-strong text-fg'
      )}
    >
      <span className="text-[14px] font-bold w-4 flex-shrink-0">{prefix}</span>
      <span className="text-[12.5px] font-semibold flex-1 leading-tight">
        {toast.message}
      </span>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className="text-[14px] hover:text-loss flex-shrink-0 opacity-60 hover:opacity-100"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}

interface ToastViewportProps {
  toasts: ToastMessage[];
  onDismiss: (id: number) => void;
}

export function ToastViewport({ toasts, onDismiss }: ToastViewportProps) {
  return (
    <div
      aria-live="polite"
      className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 flex flex-col gap-2 pointer-events-none safe-bottom"
    >
      {toasts.map((t) => (
        <Toast key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
