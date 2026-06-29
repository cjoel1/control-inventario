/**
 * backup.js — Backup, restore, CSV export, and snapshots
 */

import { getAll, clearStore, bulkPut, put, del } from './db.js';
import { exportPrefs, importPrefs } from './storage.js';
import { descargaBlob, fmtFechaHora, fmtFecha, csvField, todayISO, genId } from './utils.js';
import { reload } from './store.js';

const SNAPSHOT_MAX = 10;

// ── JSON Backup ───────────────────────────────────────────────────────────────

export async function exportarJSON() {
  const [articulos, movimientos] = await Promise.all([
    getAll('articulos'), getAll('movimientos')
  ]);
  const prefs = exportPrefs();
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    articulos,
    movimientos,
    prefs,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const fecha = todayISO();
  descargaBlob(blob, `inventario-respaldo-${fecha}.json`);
  return payload;
}

export async function importarJSON(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!data.articulos || !data.movimientos) {
          reject(new Error('Archivo JSON inválido: faltan articulos o movimientos'));
          return;
        }
        await clearStore('articulos');
        await clearStore('movimientos');
        await bulkPut('articulos', data.articulos);
        await bulkPut('movimientos', data.movimientos);
        if (data.prefs) importPrefs(data.prefs);
        await reload();
        resolve({ articulos: data.articulos.length, movimientos: data.movimientos.length });
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

// ── CSV Export ────────────────────────────────────────────────────────────────

export async function exportarCSVArticulos() {
  const articulos = await getAll('articulos');
  const headers = ['ID', 'Código', 'Nombre', 'Categoría', 'Unidad', 'Stock actual', 'Stock mínimo', 'Notas', 'Creado', 'Archivado'];
  const rows = articulos.map(a => [
    a.id, a.code, a.name, a.category, a.unit,
    a.currentStock, a.minStock, a.notes,
    fmtFecha(a.createdAt), a.archivedAt ? fmtFecha(a.archivedAt) : ''
  ].map(csvField).join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  descargaBlob(blob, `inventario-articulos-${todayISO()}.csv`);
}

export async function exportarCSVMovimientos(movimientos = null, articulos = null) {
  const movs = movimientos || await getAll('movimientos');
  const arts = articulos || await getAll('articulos');
  const artMap = {};
  arts.forEach(a => { artMap[a.id] = a; });

  const headers = ['ID', 'Artículo', 'Código', 'Tipo', 'Cantidad', 'Notas', 'Fecha y hora'];
  const rows = movs.map(m => {
    const art = artMap[m.articuloId] || {};
    return [
      m.id, art.name || m.articuloId, art.code || '',
      m.type, m.qty, m.notes, fmtFechaHora(m.at)
    ].map(csvField).join(',');
  });
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  descargaBlob(blob, `inventario-movimientos-${todayISO()}.csv`);
}

// ── Snapshots ─────────────────────────────────────────────────────────────────

export async function crearSnapshot(manual = false) {
  const [articulos, movimientos, existingSnaps] = await Promise.all([
    getAll('articulos'), getAll('movimientos'), getAll('snapshots')
  ]);

  // Keep max SNAPSHOT_MAX; delete oldest if needed
  const sorted = existingSnaps.sort((a, b) => a.createdAt - b.createdAt);
  if (sorted.length >= SNAPSHOT_MAX) {
    await del('snapshots', sorted[0].id);
  }

  // Don't create duplicate daily auto snapshots
  if (!manual) {
    const hoy = todayISO();
    const existing = existingSnaps.find(s => !s.manual && s.date === hoy);
    if (existing) return existing;
  }

  const snap = {
    id: genId(),
    date: todayISO(),
    createdAt: Date.now(),
    manual,
    articulosCount: articulos.length,
    movimientosCount: movimientos.length,
    data: { articulos, movimientos },
  };
  await put('snapshots', snap);
  return snap;
}

export async function listarSnapshots() {
  const snaps = await getAll('snapshots');
  return snaps.sort((a, b) => b.createdAt - a.createdAt);
}

export async function restaurarSnapshot(id) {
  const snaps = await getAll('snapshots');
  const snap = snaps.find(s => s.id === id);
  if (!snap) throw new Error('Snapshot no encontrado');
  await clearStore('articulos');
  await clearStore('movimientos');
  await bulkPut('articulos', snap.data.articulos);
  await bulkPut('movimientos', snap.data.movimientos);
  await reload();
  return snap;
}

export async function eliminarSnapshot(id) {
  await del('snapshots', id);
}

// ── Storage usage ─────────────────────────────────────────────────────────────

export async function medirAlmacenamiento() {
  if (!navigator.storage?.estimate) return null;
  const est = await navigator.storage.estimate();
  return {
    used: est.usage || 0,
    quota: est.quota || 0,
    pct: est.quota ? Math.round((est.usage / est.quota) * 100) : 0,
  };
}
