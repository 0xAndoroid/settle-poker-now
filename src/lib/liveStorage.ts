import type { LiveOutboxRequest } from './liveApiClient';
import type { LiveGameSnapshot } from './types';

export type LiveOutboxStatus = 'pending' | 'syncing' | 'synced' | 'error';

export interface LiveOutboxItem {
  clientEventId: string;
  gameId: string;
  request: LiveOutboxRequest;
  createdAt: number;
  attempts: number;
  status: LiveOutboxStatus;
  lastError: string | null;
}

interface SnapshotRecord {
  gameId: string;
  snapshot: LiveGameSnapshot;
  updatedAt: number;
}

const DB_NAME = 'settle-live-game';
const DB_VERSION = 1;
const SNAPSHOT_STORE = 'liveSnapshots';
const OUTBOX_STORE = 'liveOutbox';

function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openDb(): Promise<IDBDatabase> {
  if (!hasIndexedDb()) {
    return Promise.reject(new Error('IndexedDB is not available.'));
  }
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) {
        db.createObjectStore(SNAPSHOT_STORE, { keyPath: 'gameId' });
      }
      if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
        const store = db.createObjectStore(OUTBOX_STORE, {
          keyPath: 'clientEventId',
        });
        store.createIndex('gameId', 'gameId', { unique: false });
        store.createIndex('status', 'status', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Could not open IndexedDB.'));
  });
}

async function tx<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | void
): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const req = fn(store);
    let result: T | undefined;
    if (req) {
      req.onsuccess = () => {
        result = req.result;
      };
      req.onerror = () => reject(req.error);
    }
    transaction.oncomplete = () => {
      db.close();
      resolve(result);
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
    };
  });
}

export async function getCachedLiveSnapshot(
  gameId: string
): Promise<LiveGameSnapshot | null> {
  if (!hasIndexedDb()) return null;
  const record = await tx<SnapshotRecord | undefined>(
    SNAPSHOT_STORE,
    'readonly',
    (store) => store.get(gameId)
  );
  return record?.snapshot ?? null;
}

export async function putCachedLiveSnapshot(
  snapshot: LiveGameSnapshot
): Promise<void> {
  if (!hasIndexedDb()) return;
  await tx<IDBValidKey>(SNAPSHOT_STORE, 'readwrite', (store) =>
    store.put({
      gameId: snapshot.game.id,
      snapshot,
      updatedAt: Date.now(),
    })
  );
}

export async function listLiveOutboxItems(
  gameId: string
): Promise<LiveOutboxItem[]> {
  if (!hasIndexedDb()) return [];
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(OUTBOX_STORE, 'readonly');
    const store = transaction.objectStore(OUTBOX_STORE);
    const index = store.index('gameId');
    const req = index.getAll(gameId);
    req.onsuccess = () => {
      const rows = (req.result as LiveOutboxItem[]).sort(
        (a, b) => a.createdAt - b.createdAt
      );
      resolve(rows);
    };
    req.onerror = () => reject(req.error);
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => {
      db.close();
      reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
    };
  });
}

export async function putLiveOutboxItem(item: LiveOutboxItem): Promise<void> {
  if (!hasIndexedDb()) return;
  await tx<IDBValidKey>(OUTBOX_STORE, 'readwrite', (store) => store.put(item));
}

export async function updateLiveOutboxItem(
  clientEventId: string,
  patch: Partial<Omit<LiveOutboxItem, 'clientEventId'>>
): Promise<void> {
  if (!hasIndexedDb()) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(OUTBOX_STORE, 'readwrite');
    const store = transaction.objectStore(OUTBOX_STORE);
    const getReq = store.get(clientEventId);
    getReq.onsuccess = () => {
      const existing = getReq.result as LiveOutboxItem | undefined;
      if (!existing) return;
      store.put({ ...existing, ...patch });
    };
    getReq.onerror = () => reject(getReq.error);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
    };
  });
}

export function newClientEventId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `ce_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}
