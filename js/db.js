/**
 * db.js — Control de Inventario
 * Persistencia en IndexedDB. 100% local, sin red.
 */

const NOMBRE_DB  = 'control-inventario';
const VERSION_DB = 1;

export const ALMACENES = {
  ARTICULOS:   'articulos',
  MOVIMIENTOS: 'movimientos',
  CONFIG:      'config',
  SNAPSHOTS:   'snapshots',
};

let _dbPromise = null;

export function abrirDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('IndexedDB no disponible.')); return; }
    const req = indexedDB.open(NOMBRE_DB, VERSION_DB);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(ALMACENES.ARTICULOS))
        db.createObjectStore(ALMACENES.ARTICULOS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(ALMACENES.MOVIMIENTOS)) {
        const m = db.createObjectStore(ALMACENES.MOVIMIENTOS, { keyPath: 'id' });
        m.createIndex('articuloId', 'articuloId', { unique: false });
        m.createIndex('at', 'at', { unique: false });
      }
      if (!db.objectStoreNames.contains(ALMACENES.CONFIG))
        db.createObjectStore(ALMACENES.CONFIG, { keyPath: 'clave' });
      if (!db.objectStoreNames.contains(ALMACENES.SNAPSHOTS)) {
        const s = db.createObjectStore(ALMACENES.SNAPSHOTS, { keyPath: 'id' });
        s.createIndex('at', 'at', { unique: false });
      }
    };
    req.onsuccess  = () => resolve(req.result);
    req.onerror    = () => reject(req.error);
    req.onblocked  = () => reject(new Error('Base de datos bloqueada.'));
  });
  return _dbPromise;
}

async function conTx(almacenes, modo, trabajo) {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    let resultado;
    let tx;
    try { tx = db.transaction(almacenes, modo); } catch (e) { reject(e); return; }
    const r = trabajo(tx);
    if (r && 'onsuccess' in r) { r.onsuccess = () => { resultado = r.result; }; r.onerror = () => reject(r.error); }
    tx.oncomplete = () => resolve(resultado);
    tx.onerror    = () => reject(tx.error);
    tx.onabort    = () => reject(tx.error || new Error('Transacción cancelada.'));
  });
}

export const obtenerTodos = (a)    => conTx(a, 'readonly',  (tx) => tx.objectStore(a).getAll());
export const obtener      = (a, k) => conTx(a, 'readonly',  (tx) => tx.objectStore(a).get(k));
export const guardar      = (a, v) => conTx(a, 'readwrite', (tx) => tx.objectStore(a).put(v));
export const eliminar     = (a, k) => conTx(a, 'readwrite', (tx) => tx.objectStore(a).delete(k));
export const vaciar       = (a)    => conTx(a, 'readwrite', (tx) => tx.objectStore(a).clear());

export function guardarLote(almacen, registros, reemplazar = false) {
  return conTx(almacen, 'readwrite', (tx) => {
    const store = tx.objectStore(almacen);
    if (reemplazar) store.clear();
    for (const r of registros) store.put(r);
  });
}

export async function leerConfig(clave, predeterminado = null) {
  const fila = await obtener(ALMACENES.CONFIG, clave);
  return fila ? fila.valor : predeterminado;
}
export const escribirConfig = (clave, valor) => guardar(ALMACENES.CONFIG, { clave, valor });
