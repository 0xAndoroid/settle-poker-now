import { describe, expect, it } from 'vitest';
import {
  buildCanonicalMap,
  canonicalize,
  canonicalOf,
  collapseAdjustments,
  collapseIsolations,
  collapseRows,
} from './aliases';
import { applyAdjustments, buildSettlementPlan } from './settle';
import type { Adjustment, IsolationRule, LedgerRow } from './types';

const row = (playerId: string, nickname: string, netCents: number): LedgerRow => ({
  playerId,
  nickname,
  netCents,
  buyInCents: 0,
  buyOutCents: 0,
});

describe('canonicalize', () => {
  it('walks a one-hop alias to its target', () => {
    const aliases = new Map([['andrew2', 'andrew']]);
    expect(canonicalize('andrew2', aliases)).toBe('andrew');
    expect(canonicalize('andrew', aliases)).toBe('andrew');
  });

  it('compresses multi-hop chains (defensive — chain compression is on-write)', () => {
    const aliases = new Map([
      ['andrew2', 'andrew1'],
      ['andrew1', 'andrew'],
    ]);
    expect(canonicalize('andrew2', aliases)).toBe('andrew');
  });

  it('returns null on a cycle', () => {
    const aliases = new Map([
      ['a', 'b'],
      ['b', 'a'],
    ]);
    expect(canonicalize('a', aliases)).toBeNull();
    expect(canonicalize('b', aliases)).toBeNull();
  });

  it('returns null on a self-loop', () => {
    const aliases = new Map([['a', 'a']]);
    expect(canonicalize('a', aliases)).toBeNull();
  });
});

describe('buildCanonicalMap', () => {
  it('produces a chain-compressed map from raw alias rules', () => {
    const m = buildCanonicalMap([
      { playerId: 'andrew2', aliasToPlayerId: 'andrew1' },
      { playerId: 'andrew1', aliasToPlayerId: 'andrew' },
      { playerId: 'kev', aliasToPlayerId: 'kevin' },
    ]);
    expect(canonicalOf('andrew2', m)).toBe('andrew');
    expect(canonicalOf('andrew1', m)).toBe('andrew');
    expect(canonicalOf('kev', m)).toBe('kevin');
    expect(canonicalOf('andrew', m)).toBe('andrew');
    expect(canonicalOf('stranger', m)).toBe('stranger');
  });

  it('drops cyclic edges silently', () => {
    const m = buildCanonicalMap([
      { playerId: 'a', aliasToPlayerId: 'b' },
      { playerId: 'b', aliasToPlayerId: 'a' },
    ]);
    expect(canonicalOf('a', m)).toBe('a');
    expect(canonicalOf('b', m)).toBe('b');
  });
});

describe('collapseRows', () => {
  it('folds an aliased player into the canonical and drops the duplicate', () => {
    const rows = [
      row('andrew', 'Andrew', -10000),
      row('andrew2', 'Andrew (resumed)', -3000),
      row('kevin', 'Kevin', 13000),
    ];
    const canonical = new Map([['andrew2', 'andrew']]);
    const collapsed = collapseRows(rows, canonical);
    expect(collapsed).toHaveLength(2);
    const a = collapsed.find((r) => r.playerId === 'andrew')!;
    expect(a.netCents).toBe(-13000);
    expect(a.nickname).toBe('Andrew');
    const k = collapsed.find((r) => r.playerId === 'kevin')!;
    expect(k.netCents).toBe(13000);
  });
});

describe('collapseAdjustments', () => {
  it('rewrites both endpoints to canonical ids', () => {
    const adjustments: Adjustment[] = [
      { id: 'a1', fromId: 'andrew2', toId: 'kevin', amountCents: 500 },
    ];
    const canonical = new Map([['andrew2', 'andrew']]);
    const collapsed = collapseAdjustments(adjustments, canonical);
    expect(collapsed).toEqual([
      { id: 'a1', fromId: 'andrew', toId: 'kevin', amountCents: 500 },
    ]);
  });

  it('drops adjustments where source and target collapse to the same canonical', () => {
    const adjustments: Adjustment[] = [
      { id: 'a1', fromId: 'andrew2', toId: 'andrew', amountCents: 500 },
    ];
    const canonical = new Map([['andrew2', 'andrew']]);
    expect(collapseAdjustments(adjustments, canonical)).toEqual([]);
  });
});

describe('collapseIsolations', () => {
  it('rewrites a rule whose source aliases through to the canonical', () => {
    const rules: IsolationRule[] = [
      { playerId: 'andrew2', counterpartId: 'kevin' },
    ];
    const canonical = new Map([['andrew2', 'andrew']]);
    const { rules: out, dropped } = collapseIsolations(rules, canonical);
    expect(out).toEqual([{ playerId: 'andrew', counterpartId: 'kevin' }]);
    expect(dropped).toEqual([]);
  });

  it('drops a rule that becomes a self-loop after collapse', () => {
    const rules: IsolationRule[] = [
      { playerId: 'andrew2', counterpartId: 'andrew' },
    ];
    const canonical = new Map([['andrew2', 'andrew']]);
    const { rules: out, dropped } = collapseIsolations(rules, canonical);
    expect(out).toEqual([]);
    expect(dropped).toEqual(['andrew2']);
  });

  it('prefers the canonical-authored rule when there is a collision', () => {
    const rules: IsolationRule[] = [
      { playerId: 'andrew2', counterpartId: 'kevin' },
      { playerId: 'andrew', counterpartId: 'sam' },
    ];
    const canonical = new Map([['andrew2', 'andrew']]);
    const { rules: out, dropped } = collapseIsolations(rules, canonical);
    expect(out).toEqual([{ playerId: 'andrew', counterpartId: 'sam' }]);
    expect(dropped).toContain('andrew2');
  });
});


describe('alias × settlement — end-to-end via collapse + buildSettlementPlan', () => {
  it('two-player merge with adjustments collapses to a single canonical', () => {
    const rows = [
      row('andrew', 'Andrew', -2000),
      row('andrew2', 'Andrew (resumed)', -3000),
      row('kevin', 'Kevin', 5000),
    ];
    const adjustments: Adjustment[] = [
      { id: 'a1', fromId: 'andrew2', toId: 'kevin', amountCents: 1000 },
    ];
    const canonical = new Map([['andrew2', 'andrew']]);

    const collapsedRows = collapseRows(rows, canonical);
    const collapsedAdj = collapseAdjustments(adjustments, canonical);
    const balances = applyAdjustments(collapsedRows, collapsedAdj);

    const a = balances.find((b) => b.playerId === 'andrew')!;
    const k = balances.find((b) => b.playerId === 'kevin')!;
    expect(a.effectiveNetCents).toBe(-4000);
    expect(k.effectiveNetCents).toBe(4000);

    const plan = buildSettlementPlan(balances, []);
    expect(plan.txns).toEqual([
      { fromId: 'andrew', toId: 'kevin', amountCents: 4000 },
    ]);
  });

  it('three-player chain X → Y → Z (canonicalized on write) folds all into Z', () => {
    const rows = [
      row('x', 'X', -2000),
      row('y', 'Y', -3000),
      row('z', 'Z', 5000),
      row('w', 'W', 0),
    ];
    const canonical = buildCanonicalMap([
      { playerId: 'x', aliasToPlayerId: 'z' },
      { playerId: 'y', aliasToPlayerId: 'z' },
    ]);
    expect(canonicalOf('x', canonical)).toBe('z');
    expect(canonicalOf('y', canonical)).toBe('z');

    const collapsed = collapseRows(rows, canonical);
    expect(collapsed).toHaveLength(2);
    expect(collapsed.find((r) => r.playerId === 'z')!.netCents).toBe(0);
    expect(collapsed.find((r) => r.playerId === 'w')!.netCents).toBe(0);
  });

  it('alias × isolation: rule transferred to canonical, no cycle', () => {
    const rows = [
      row('andrew', 'Andrew', -1000),
      row('andrew2', 'Andrew (resumed)', -4000),
      row('kevin', 'Kevin', 5000),
    ];
    const isolations: IsolationRule[] = [
      { playerId: 'andrew2', counterpartId: 'kevin' },
    ];
    const canonical = new Map([['andrew2', 'andrew']]);

    const collapsedRows = collapseRows(rows, canonical);
    const { rules: collapsedIsolations } = collapseIsolations(isolations, canonical);
    const balances = applyAdjustments(collapsedRows, []);

    expect(balances.find((b) => b.playerId === 'andrew')!.effectiveNetCents).toBe(-5000);
    expect(balances.find((b) => b.playerId === 'kevin')!.effectiveNetCents).toBe(5000);
    expect(collapsedIsolations).toEqual([
      { playerId: 'andrew', counterpartId: 'kevin' },
    ]);

    const plan = buildSettlementPlan(balances, collapsedIsolations);
    expect(plan.txns).toEqual([
      { fromId: 'andrew', toId: 'kevin', amountCents: 5000, forced: true },
    ]);
    expect(plan.isFullyBalanced).toBe(true);
  });
});
