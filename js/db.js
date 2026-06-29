/**
 * db.js — IndexedDB wrapper
 * DB: control-inventario
 * Stores: articulos, movimientos, config, snapshots
 */

const DB_NAME = 'control-inventario';
const DB_VERSION = 1;

let _db = null;

export function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;

      if (!db.objectStoreNames.contains('articulos')) {
        const artStore = db.createObjectStore('articulos', { keyPath: 'id' });
        artStore.createIndex('code', 'code', { unique: false });
        artStore.createIndex('category', 'category', { unique: false });
      }

      if (!db.objectStoreNames.contains('movimientos')) {
        const movStore = db.createObjectStore('movimientos', { keyPath: 'id' });
        movStore.createIndex('articuloId', 'articuloId', { unique: false });
        movStore.createIndex('at', 'at', { unique: false });
        movStore.createIndex('type', 'type', { unique: false });
      }

      if (!db.objectStoreNames.contains('config')) {
        db.createObjectStore('config', { keyPath: 'key' });
      }

      if (!db.objectStoreNames.contains('snapshots')) {
        const snapStore = db.createObjectStore('snapshots', { keyPath: 'id' });
        snapStore.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };

    req.onsuccess = (e) => {
      _db = e.target.result;
      resolve(_db);
    };

    req.onerror = () => reject(req.error);
  });
}

function tx(storeName, mode = 'readonly') {
  return _db.transaction(storeName, mode);
}

export async function getAll(storeName) {
  await openDB();
  return new Promise((resolve, reject) => {
    const req = tx(storeName).objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getById(storeName, id) {
  await openDB();
  return new Promise((resolve, reject) => {
    const req = tx(storeName).objectStore(storeName).get(id);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function put(storeName, obj) {
  await openDB();
  return new Promise((resolve, reject) => {
    const req = tx(storeName, 'readwrite').objectStore(storeName).put(obj);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function del(storeName, id) {
  await openDB();
  return new Promise((resolve, reject) => {
    const req = tx(storeName, 'readwrite').objectStore(storeName).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function clearStore(storeName) {
  await openDB();
  return new Promise((resolve, reject) => {
    const req = tx(storeName, 'readwrite').objectStore(storeName).clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function countStore(storeName) {
  await openDB();
  return new Promise((resolve, reject) => {
    const req = tx(storeName).objectStore(storeName).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllByIndex(storeName, indexName, value) {
  await openDB();
  return new Promise((resolve, reject) => {
    const req = tx(storeName).objectStore(storeName).index(indexName).getAll(value);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getConfig(key) {
  const row = await getById('config', key);
  return row ? row.value : null;
}

export async function setConfig(key, value) {
  return put('config', { key, value });
}

export async function bulkPut(storeName, items) {
  await openDB();
  return new Promise((resolve, reject) => {
    const t = tx(storeName, 'readwrite');
    const store = t.objectStore(storeName);
    items.forEach(item => store.put(item));
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export async function getAllConfig() {
  const rows = await getAll('config');
  const obj = {};
  rows.forEach(r => { obj[r.key] = r.value; });
  return obj;
}
