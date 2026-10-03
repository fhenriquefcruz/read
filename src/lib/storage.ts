import type { KnowledgeNote, LibraryEntry, Workspace } from '../types';

type StoreName = 'library' | 'workspaces' | 'notes' | 'settings' | 'searchHistory' | 'metadataCache';

const DB_NAME = 'readplus';
const DB_VERSION = 1;
const STORES: StoreName[] = ['library', 'workspaces', 'notes', 'settings', 'searchHistory', 'metadataCache'];

let dbPromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      for (const store of STORES) {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store, { keyPath: 'id' });
        }
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Falha ao abrir IndexedDB.'));
    request.onblocked = () => reject(new Error('Atualização do banco bloqueada por outra aba.'));
  });

  return dbPromise;
}

export async function getAll<T>(storeName: StoreName): Promise<T[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly');
    const request = transaction.objectStore(storeName).getAll();
    request.onsuccess = () => resolve((request.result ?? []) as T[]);
    request.onerror = () => reject(request.error ?? new Error('Falha ao ler dados locais.'));
  });
}

export async function put<T extends { id: string }>(storeName: StoreName, value: T): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).put(value);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Falha ao salvar dados locais.'));
  });
}

export async function remove(storeName: StoreName, id: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Falha ao remover dados locais.'));
  });
}

export const libraryStore = {
  list: () => getAll<LibraryEntry>('library'),
  save: (entry: LibraryEntry) => put('library', entry),
  remove: (id: string) => remove('library', id),
};

export const workspaceStore = {
  list: () => getAll<Workspace>('workspaces'),
  save: (workspace: Workspace) => put('workspaces', workspace),
  remove: (id: string) => remove('workspaces', id),
};

export const noteStore = {
  list: () => getAll<KnowledgeNote>('notes'),
  save: (note: KnowledgeNote) => put('notes', note),
  remove: (id: string) => remove('notes', id),
};
