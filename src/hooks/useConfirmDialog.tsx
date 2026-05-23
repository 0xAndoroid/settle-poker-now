import { useCallback, useState, type ReactNode } from 'react';
import {
  ConfirmDialog,
  type ConfirmDialogOptions,
  type PendingConfirm,
} from '@/components/ConfirmDialog';

export type ConfirmFn = (options: ConfirmDialogOptions) => Promise<boolean>;

export function useConfirmDialog(): {
  confirm: ConfirmFn;
  dialog: ReactNode;
} {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const close = useCallback((confirmed: boolean) => {
    setPending((current) => {
      current?.resolve(confirmed);
      return null;
    });
  }, []);

  const confirm = useCallback<ConfirmFn>((options) => {
    return new Promise<boolean>((resolve) => {
      setPending((current) => {
        current?.resolve(false);
        return { ...options, resolve };
      });
    });
  }, []);

  return {
    confirm,
    dialog: pending ? <ConfirmDialog request={pending} onClose={close} /> : null,
  };
}
