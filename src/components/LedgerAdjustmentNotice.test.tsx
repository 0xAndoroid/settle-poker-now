import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LedgerAdjustmentNotice } from './LedgerAdjustmentNotice';
import type { LedgerBalancing } from '@/lib/types';

describe('LedgerAdjustmentNotice', () => {
  it.each<{ balancing: LedgerBalancing; description: string }>([
    {
      balancing: { method: 'winnings' },
      description: 'among winners in proportion to their winnings',
    },
    { balancing: { method: 'cashout' }, description: 'in proportion to cash-outs' },
    { balancing: { method: 'player', playerId: 'a' }, description: 'assigned entirely to Alice' },
  ])(
    'displays the recorded $balancing.method method and stored corrections',
    ({ balancing, description }) => {
      const html = renderToStaticMarkup(
        <LedgerAdjustmentNotice
          adjustments={[{ playerId: 'a', amountCents: -3000 }]}
          players={[{ playerId: 'a', nickname: 'Alice', netCents: 27000 }]}
          balancing={balancing}
        />
      );
      expect(html).toContain(description);
      expect(html).toContain('$30.00 missing');
      expect(html).toContain('-$30.00');
    }
  );

  it('does not infer a method for a legacy finalized game', () => {
    const html = renderToStaticMarkup(
      <LedgerAdjustmentNotice
        adjustments={[{ playerId: 'a', amountCents: 3000 }]}
        players={[{ playerId: 'a', nickname: 'Alice', netCents: -27000 }]}
      />
    );
    expect(html).toContain('method was not recorded');
    expect(html).toContain('$30.00 surplus');
    expect(html).not.toContain('in proportion');
  });
});
