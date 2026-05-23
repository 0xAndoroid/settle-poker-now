import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface ConfirmDialogOptions {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'accent' | 'danger';
}

export interface PendingConfirm extends ConfirmDialogOptions {
  resolve: (confirmed: boolean) => void;
}

export function ConfirmDialog({
  request,
  onClose,
}: {
  request: PendingConfirm;
  onClose: (confirmed: boolean) => void;
}) {
  const tone = request.tone ?? 'accent';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4 py-8">
      <button
        type="button"
        aria-label="Cancel"
        className="absolute inset-0 cursor-default bg-bg/75"
        onClick={() => onClose(false)}
      />
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-body"
        className="card relative z-[61] w-full max-w-md"
      >
        <div className="card-header">
          <span id="confirm-dialog-title" className="ticker-label-strong">
            {request.title}
          </span>
          {tone === 'danger' && <span className="pill pill-loss">destructive</span>}
        </div>
        <div id="confirm-dialog-body" className="px-5 py-4 text-[13px] leading-relaxed text-fg-dim">
          {request.body}
        </div>
        <div className="grid grid-cols-2 gap-2 border-t border-line p-4">
          <button type="button" className="btn h-11" onClick={() => onClose(false)}>
            {request.cancelLabel ?? 'cancel'}
          </button>
          <button
            type="button"
            className={cn(
              'btn h-11',
              tone === 'danger'
                ? 'border-loss/60 text-loss hover:border-loss hover:text-loss'
                : 'btn-fill'
            )}
            onClick={() => onClose(true)}
          >
            {request.confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
