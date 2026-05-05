export interface PaymentLike {
  fromId: string;
  toId: string;
  amountCents: number;
}

export interface OrderedPayment<T extends PaymentLike> {
  payment: T;
  originalIndex: number;
}

/**
 * Display settlement rows grouped by sender, ordered by how much each sender
 * pays in total. This keeps a player's outgoing payments together while
 * putting the biggest losers first.
 */
export function orderPaymentsBySenderTotal<T extends PaymentLike>(
  payments: ReadonlyArray<T>
): OrderedPayment<T>[] {
  const totalBySender = new Map<string, number>();
  for (const payment of payments) {
    totalBySender.set(
      payment.fromId,
      (totalBySender.get(payment.fromId) ?? 0) + payment.amountCents
    );
  }

  return payments
    .map((payment, originalIndex) => ({ payment, originalIndex }))
    .sort((a, b) => {
      const aTotal = totalBySender.get(a.payment.fromId) ?? 0;
      const bTotal = totalBySender.get(b.payment.fromId) ?? 0;
      const bySenderTotal = bTotal - aTotal;
      if (bySenderTotal !== 0) return bySenderTotal;

      const bySenderId = a.payment.fromId.localeCompare(b.payment.fromId);
      if (bySenderId !== 0) return bySenderId;

      const byAmount = b.payment.amountCents - a.payment.amountCents;
      if (byAmount !== 0) return byAmount;

      const byRecipientId = a.payment.toId.localeCompare(b.payment.toId);
      if (byRecipientId !== 0) return byRecipientId;

      return a.originalIndex - b.originalIndex;
    });
}
