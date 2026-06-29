/**
 * store.js — Reactive state store
 * Simple pub/sub pattern: dispatch actions → state updates → subscribers notified.
 */

import { getAll, getAllByIndex, getConfig, setConfig, put, del, clearStore, bulkPut } from './db.js';
import { getCategories, getUnits, getEmpresa } from './storage.js';
import { genId } from './utils.js';

let state = {
  tab: 'inicio',
  articulos: [],
  movimientos: [],
  config: {},
  categorias: [],
  unidades: [],
  empresa: { nombre: 'Inventario', logo: null },
  filtros: {
    articulos: { busqueda: '', categoria: 'todos' },
    historial: { articuloId: '', tipo: '', desde: '', hasta: '' },
  },
  cargado: false,
};

const listeners = new Set();

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  listeners.forEach(fn => fn(state));
}

export function getState() {
  return state;
}

async function loadData() {
  const [articulos, movimientos] = await Promise.all([
    getAll('articulos'),
    getAll('movimientos'),
  ]);
  state = {
    ...state,
    articulos,
    movimientos,
    categorias: getCategories(),
    unidades: getUnits(),
    empresa: getEmpresa(),
    cargado: true,
  };
  notify();
}

export async function init() {
  await loadData();
}

export async function reload() {
  await loadData();
}

// ── Articles ─────────────────────────────────────────────────────────────────

export async function addArticulo(data) {
  const art = {
    id: genId(),
    code: data.code || '',
    name: data.name,
    category: data.category || 'General',
    unit: data.unit || 'unidad',
    currentStock: Number(data.currentStock) || 0,
    minStock: Number(data.minStock) || 0,
    notes: data.notes || '',
    createdAt: Date.now(),
    archivedAt: null,
  };
  await put('articulos', art);
  if (art.currentStock > 0) {
    await addMovimiento({ articuloId: art.id, type: 'entrada', qty: art.currentStock, notes: 'Stock inicial' });
    return; // addMovimiento calls reload
  }
  await reload();
  return art;
}

export async function updateArticulo(id, data) {
  const existing = state.articulos.find(a => a.id === id);
  if (!existing) return;
  const updated = { ...existing, ...data };
  await put('articulos', updated);
  await reload();
  return updated;
}

export async function archiveArticulo(id) {
  const art = state.articulos.find(a => a.id === id);
  if (!art) return;
  await put('articulos', { ...art, archivedAt: Date.now() });
  await reload();
}

export async function unarchiveArticulo(id) {
  const art = state.articulos.find(a => a.id === id);
  if (!art) return;
  await put('articulos', { ...art, archivedAt: null });
  await reload();
}

// ── Movements ─────────────────────────────────────────────────────────────────

export async function addMovimiento(data) {
  const art = state.articulos.find(a => a.id === data.articuloId);
  if (!art) return;

  const mov = {
    id: genId(),
    articuloId: data.articuloId,
    type: data.type, // 'entrada' | 'salida' | 'ajuste'
    qty: Number(data.qty),
    notes: data.notes || '',
    at: Date.now(),
  };

  let newStock = art.currentStock;
  if (mov.type === 'entrada') newStock += mov.qty;
  else if (mov.type === 'salida') newStock = Math.max(0, newStock - mov.qty);
  else if (mov.type === 'ajuste') newStock = mov.qty;

  await put('movimientos', mov);
  await put('articulos', { ...art, currentStock: newStock });
  await reload();
  return mov;
}

// ── Filters ───────────────────────────────────────────────────────────────────

export function setFiltroArticulos(filtros) {
  state = { ...state, filtros: { ...state.filtros, articulos: { ...state.filtros.articulos, ...filtros } } };
  notify();
}

export function setFiltroHistorial(filtros) {
  state = { ...state, filtros: { ...state.filtros, historial: { ...state.filtros.historial, ...filtros } } };
  notify();
}

export function setTab(tab) {
  state = { ...state, tab };
  notify();
}

// ── Derived selectors ─────────────────────────────────────────────────────────

export function articulosActivos() {
  return state.articulos.filter(a => !a.archivedAt);
}

export function articulosArchivados() {
  return state.articulos.filter(a => a.archivedAt);
}

export function articulosBajoStock() {
  return articulosActivos().filter(a => a.minStock > 0 && a.currentStock <= a.minStock);
}

export function articulosSinStock() {
  return articulosActivos().filter(a => a.currentStock <= 0);
}

export function movimientosDeArticulo(artId) {
  return state.movimientos.filter(m => m.articuloId === artId);
}

export function filteredArticulos() {
  const { busqueda, categoria } = state.filtros.articulos;
  let list = articulosActivos();
  if (categoria && categoria !== 'todos') {
    list = list.filter(a => a.category === categoria);
  }
  if (busqueda) {
    const q = busqueda.toLowerCase();
    list = list.filter(a =>
      a.name.toLowerCase().includes(q) ||
      (a.code && a.code.toLowerCase().includes(q)) ||
      (a.notes && a.notes.toLowerCase().includes(q))
    );
  }
  return list.sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

export function filteredMovimientos() {
  const { articuloId, tipo, desde, hasta } = state.filtros.historial;
  let list = [...state.movimientos];
  if (articuloId) list = list.filter(m => m.articuloId === articuloId);
  if (tipo) list = list.filter(m => m.type === tipo);
  if (desde) list = list.filter(m => m.at >= new Date(desde).getTime());
  if (hasta) list = list.filter(m => m.at <= new Date(hasta + 'T23:59:59').getTime());
  return list.sort((a, b) => b.at - a.at);
}

export async function resetData() {
  await Promise.all([clearStore('articulos'), clearStore('movimientos'), clearStore('snapshots')]);
  await reload();
}
