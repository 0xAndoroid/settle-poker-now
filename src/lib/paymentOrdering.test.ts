import { describe, expect, it } from 'vitest';
import { orderPaymentsBySenderTotal } from './paymentOrdering';

describe('orderPaymentsBySenderTotal', () => {
  it('groups by sender and orders senders by total outgoing amount', () => {
    const payments = [
      { fromId: 'sam', toId: 'winner1', amountCents: 2000 },
      { fromId: 'pranav', toId: 'winner2', amountCents: 3000 },
      { fromId: 'kedar', toId: 'winner1', amountCents: 4000 },
      { fromId: 'pranav', toId: 'winner1', amountCents: 2500 },
      { fromId: 'sam', toId: 'winner2', amountCents: 1000 },
    ];

    const ordered = orderPaymentsBySenderTotal(payments);

    expect(ordered.map((entry) => entry.payment.fromId)).toEqual([
      'pranav',
      'pranav',
      'kedar',
      'sam',
      'sam',
    ]);
    expect(ordered.map((entry) => entry.payment.amountCents)).toEqual([
      3000,
      2500,
      4000,
      2000,
      1000,
    ]);
    expect(ordered.map((entry) => entry.originalIndex)).toEqual([1, 3, 2, 0, 4]);
  });

  it('uses deterministic tie breakers', () => {
    const payments = [
      { fromId: 'b', toId: 'z', amountCents: 1000 },
      { fromId: 'a', toId: 'z', amountCents: 1000 },
      { fromId: 'a', toId: 'y', amountCents: 1000 },
    ];

    const ordered = orderPaymentsBySenderTotal(payments);

    expect(ordered.map((entry) => `${entry.payment.fromId}->${entry.payment.toId}`)).toEqual([
      'a->y',
      'a->z',
      'b->z',
    ]);
  });
});
