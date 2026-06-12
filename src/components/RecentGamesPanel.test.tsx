import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RecentGamesPanel } from './RecentGamesPanel';
import { upsertRecentGame } from '@/lib/recentGames';
import { navigate } from '@/lib/routing';

vi.mock('@/lib/routing', () => ({
  navigate: vi.fn<(path: string) => void>(),
}));

let root: Root | null = null;
let storage: MemoryStorage;

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  storage = new MemoryStorage();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: storage,
  });
});

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
    root = null;
  }
  document.body.innerHTML = '';
  storage.clear();
  vi.clearAllMocks();
});

describe('RecentGamesPanel', () => {
  it('opens ledger entries through the home analyzer after navigation', async () => {
    upsertRecentGame(window.localStorage, {
      kind: 'ledger',
      id: 'abc123',
      path: '/#ledger-state',
      label: 'Jun 11 · 6 players · $1,200 buy-in',
      status: 'inactive',
      lastVisitedAt: 1_700_000_000_000,
    });
    const onOpenLedger = vi.fn<(gameId: string) => void>();
    const container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<RecentGamesPanel onOpenLedger={onOpenLedger} />);
    });

    const openButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Open Jun 11 · 6 players · $1,200 buy-in"]'
    );
    expect(openButton).not.toBeNull();

    await act(async () => {
      openButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(navigate).toHaveBeenCalledWith('/#ledger-state');
    expect(onOpenLedger).toHaveBeenCalledWith('abc123');
  });
});
