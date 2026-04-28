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
        'pointer-events-auto bg-paper border-2 border-ink',
        'flex items-center gap-3 min-w-[260px] max-w-[420px]',
        'px-4 py-3 font-mono',
        toast.variant === 'error' && 'border-loss text-loss bg-paper'
      )}
    >
      <span className="text-[14px] font-extrabold w-4 flex-shrink-0">{prefix}</span>
      <span className="text-[12px] uppercase tracking-all font-bold flex-1 normal-case">
        {toast.message}
      </span>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className="text-[14px] hover:text-loss flex-shrink-0"
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
