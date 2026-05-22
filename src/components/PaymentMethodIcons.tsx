import type { PersistedPaymentMethod } from '@/lib/types';

interface PaymentMethodIconsProps {
  recipientName: string;
  method: PersistedPaymentMethod | null;
  /** When false, the slot is rendered for layout but icons are hidden. */
  visible: boolean;
  onVenmoClick: () => void;
  onZelleClick: () => void;
}

export function PaymentMethodIcons({
  recipientName,
  method,
  visible,
  onVenmoClick,
  onZelleClick,
}: PaymentMethodIconsProps) {
  const hasVenmo = !!method?.venmoUsername;
  const hasZelle = !!method?.zelleHandle;
  return (
    <span className="payment-icons-slot">
      {visible && hasVenmo && (
        <button
          type="button"
          onClick={onVenmoClick}
          className="payment-icon"
          aria-label={`Open Venmo to pay ${recipientName} (@${method!.venmoUsername})`}
          title={`venmo @${method!.venmoUsername}`}
        >
          <VenmoMark />
        </button>
      )}
      {visible && hasZelle && (
        <button
          type="button"
          onClick={onZelleClick}
          className="payment-icon"
          aria-label={`Copy ${recipientName}'s Zelle handle to clipboard`}
          title={`zelle: ${method!.zelleHandle}`}
        >
          <ZelleMark />
        </button>
      )}
    </span>
  );
}

function VenmoMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M19.6 4.5c.7 1.2 1 2.4 1 3.9 0 4.8-4.1 11-7.4 15.4H5.5L2.4 5.4l6.7-.6 1.7 13.2c1.5-2.5 3.4-6.4 3.4-9.1 0-1.5-.3-2.5-.7-3.3l5.7-.6.4-.5z"
      />
    </svg>
  );
}

function ZelleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M5 4h14v2.5l-7 11h7V20H5v-2.5l7-11H5z"
      />
    </svg>
  );
}
