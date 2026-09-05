import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';

/** Matches the `.toast-out` keyframe duration in globals.css. */
const EXIT_MS = 180;

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
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setLeaving(true), 3000);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(() => onDismiss(toast.id), EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [leaving, toast.id, onDismiss]);

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
        leaving ? 'toast-out' : 'toast-in',
        'pointer-events-auto flex items-center gap-3 min-w-[260px] max-w-[420px]',
        'px-4 py-3 font-sans rounded-[10px] border bg-surface-2 shadow-[var(--shadow-float)]',
        toast.variant === 'success' && 'border-gain/40 text-gain',
        toast.variant === 'error' && 'border-loss/40 text-loss',
        toast.variant === 'info' && 'border-line-strong text-fg'
      )}
    >
      <span className="text-[14px] font-bold w-4 flex-shrink-0">{prefix}</span>
      <span className="min-w-0 break-words text-[12.5px] font-semibold flex-1 leading-tight">
        {toast.message}
      </span>
      <button
        type="button"
        onClick={() => setLeaving(true)}
        className="text-[14px] flex-shrink-0 opacity-60 transition-opacity hover:opacity-100"
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
      className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 max-w-[calc(100%-2rem)] z-50 flex flex-col gap-2 pointer-events-none safe-bottom"
    >
      {toasts.map((t) => (
        <Toast key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
