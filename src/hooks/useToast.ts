import { useCallback, useState } from 'react';
import type { ToastMessage, ToastVariant } from '@/components/Toast';

let toastCounter = 0;

export function useToast() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const push = useCallback((message: string, variant: ToastVariant = 'info') => {
    const id = ++toastCounter;
    setToasts((current) => [...current, { id, message, variant }]);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  return { toasts, push, dismiss };
}
