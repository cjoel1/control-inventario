/**
 * store.js — Reactive state store
 */

import { getAll, put, del, clearStore, bulkPut } from './db.js';
import { getCategories, getUnits, getEmpresa } from './storage.js';
import { genId } from './utils.js';

let state = {
  tab: 'inicio',
  articulos: [],
  movimientos: [],
  proveedores: [],
  config: {},
  categorias: [],
  unidades: [],
  empresa: { nombre: 'Inventario', logo: null },
  filtros: {
    articulos: { busqueda: '', categoria: 'todos', orden: 'nombre', vista: 'lista' },
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
  const [articulos, movimientos, proveedores] = await Promise.all([
    getAll('articulos'),
    getAll('movimientos'),
    getAll('proveedores'),
  ]);
  state = {
    ...state,
    articulos,
    movimientos,
    proveedores,
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

// ── Articles ──────────────────────────────────────────────────────────────────

export async function addArticulo(data) {
  const art = {
    id: genId(),
    code: data.code || '',
    name: data.name,
    category: data.category || 'General',
    unit: data.unit || 'unidad',
    currentStock: Number(data.currentStock) || 0,
    minStock: Number(data.minStock) || 0,
    cost: Number(data.cost) || 0,
    location: data.location || '',
    supplier: data.supplier || '',
    photo: data.photo || null,
    expiryDate: data.expiryDate || null,
    notes: data.notes || '',
    createdAt: Date.now(),
    archivedAt: null,
  };
  await put('articulos', art);
  if (art.currentStock > 0) {
    await addMovimiento({ articuloId: art.id, type: 'entrada', qty: art.currentStock, notes: 'Stock inicial' });
    return art;
  }
  await reload();
  return art;
}

export async function updateArticulo(id, data) {
  const existing = state.articulos.find(a => a.id === id);
  if (!existing) return;
  const updated = {
    ...existing,
    code: data.code ?? existing.code,
    name: data.name ?? existing.name,
    category: data.category ?? existing.category,
    unit: data.unit ?? existing.unit,
    currentStock: data.currentStock !== undefined ? Number(data.currentStock) : existing.currentStock,
    minStock: data.minStock !== undefined ? Number(data.minStock) : existing.minStock,
    cost: data.cost !== undefined ? Number(data.cost) : existing.cost,
    location: data.location !== undefined ? data.location : existing.location,
    supplier: data.supplier !== undefined ? data.supplier : existing.supplier,
    photo: data.photo !== undefined ? data.photo : existing.photo,
    expiryDate: data.expiryDate !== undefined ? data.expiryDate : existing.expiryDate,
    notes: data.notes !== undefined ? data.notes : existing.notes,
  };
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
    type: data.type,
    qty: Number(data.qty),
    notes: data.notes || '',
    cost: art.cost || 0,
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

// ── Bulk stock count ──────────────────────────────────────────────────────────

export async function bulkAjuste(ajustes) {
  for (const { id, qty } of ajustes) {
    const art = state.articulos.find(a => a.id === id);
    if (!art || qty === art.currentStock) continue;
    await put('movimientos', {
      id: genId(), articuloId: id, type: 'ajuste',
      qty, notes: 'Conteo de inventario', cost: art.cost || 0, at: Date.now(),
    });
    await put('articulos', { ...art, currentStock: qty });
  }
  await reload();
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

// ── Selectors ─────────────────────────────────────────────────────────────────

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

export function articulosPorVencer(dias = 30) {
  const limite = Date.now() + dias * 86400000;
  return articulosActivos().filter(a => a.expiryDate && new Date(a.expiryDate).getTime() <= limite);
}

export function articulosVencidos() {
  return articulosActivos().filter(a => a.expiryDate && new Date(a.expiryDate) < new Date());
}

export function filteredArticulos() {
  const { busqueda, categoria, orden } = state.filtros.articulos;
  let list = articulosActivos();
  if (categoria && categoria !== 'todos') list = list.filter(a => a.category === categoria);
  if (busqueda) {
    const q = busqueda.toLowerCase();
    list = list.filter(a =>
      a.name.toLowerCase().includes(q) ||
      (a.code && a.code.toLowerCase().includes(q)) ||
      (a.supplier && a.supplier.toLowerCase().includes(q)) ||
      (a.location && a.location.toLowerCase().includes(q)) ||
      (a.notes && a.notes.toLowerCase().includes(q))
    );
  }
  const sortFns = {
    nombre: (a, b) => a.name.localeCompare(b.name, 'es'),
    stock_asc: (a, b) => a.currentStock - b.currentStock,
    stock_desc: (a, b) => b.currentStock - a.currentStock,
    vencimiento: (a, b) => {
      if (!a.expiryDate && !b.expiryDate) return 0;
      if (!a.expiryDate) return 1;
      if (!b.expiryDate) return -1;
      return new Date(a.expiryDate) - new Date(b.expiryDate);
    },
    categoria: (a, b) => a.category.localeCompare(b.category, 'es'),
  };
  return list.sort(sortFns[orden] || sortFns.nombre);
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

export function calcInventoryValue() {
  return articulosActivos().reduce((sum, a) => sum + (a.cost || 0) * (a.currentStock || 0), 0);
}

// ── Consumption analytics ──────────────────────────────────────────────────────

export function calcDailyConsumption(articuloId, dias = 30) {
  const desde = Date.now() - dias * 86400000;
  const total = state.movimientos
    .filter(m => m.articuloId === articuloId && m.type === 'salida' && m.at >= desde)
    .reduce((s, m) => s + m.qty, 0);
  return total / dias;
}

export function calcDiasRestantes(articuloId) {
  const art = state.articulos.find(a => a.id === articuloId);
  if (!art || art.currentStock <= 0) return 0;
  const daily = calcDailyConsumption(articuloId);
  if (daily <= 0) return null;
  return Math.floor(art.currentStock / daily);
}

export function articulosPorAgotar(limite = 30) {
  return articulosActivos()
    .map(a => {
      const daily = calcDailyConsumption(a.id);
      if (daily <= 0) return null;
      const dias = Math.floor(a.currentStock / daily);
      return { art: a, daily: Number(daily.toFixed(3)), dias };
    })
    .filter(x => x !== null && x.dias <= limite)
    .sort((a, b) => a.dias - b.dias);
}

export function generarListaCompra() {
  const porAgotar = articulosPorAgotar(14);
  const ids = new Set();
  const items = [];

  articulosActivos()
    .filter(a => a.minStock > 0 && a.currentStock <= a.minStock)
    .forEach(a => {
      ids.add(a.id);
      const agotamiento = porAgotar.find(x => x.art.id === a.id);
      items.push({
        ...a,
        sugerido: Math.max(1, (a.minStock * 2) - a.currentStock),
        motivo: 'bajo',
        dias: agotamiento?.dias ?? null,
      });
    });

  porAgotar.forEach(({ art, dias, daily }) => {
    if (!ids.has(art.id)) {
      items.push({
        ...art,
        sugerido: Math.max(1, Math.round(daily * 30)),
        motivo: 'agotamiento',
        dias,
      });
    }
  });

  return items.sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

export function topConsumidos(n = 5) {
  const artMap = {};
  state.movimientos
    .filter(m => m.type === 'salida')
    .forEach(m => { artMap[m.articuloId] = (artMap[m.articuloId] || 0) + m.qty; });
  return Object.entries(artMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([id, total]) => ({ art: state.articulos.find(a => a.id === id), total }))
    .filter(x => x.art);
}

export async function resetData() {
  await Promise.all([clearStore('articulos'), clearStore('movimientos'), clearStore('snapshots'), clearStore('proveedores')]);
  await reload();
}

// ── Suppliers ─────────────────────────────────────────────────────────────────

export function getProveedores() {
  return [...state.proveedores].sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

export async function addProveedor(data) {
  const prov = {
    id: genId(),
    name: data.name,
    contacto: data.contacto || '',
    email: data.email || '',
    telefono: data.telefono || '',
    direccion: data.direccion || '',
    notas: data.notas || '',
    createdAt: Date.now(),
  };
  await put('proveedores', prov);
  state = { ...state, proveedores: [...state.proveedores, prov] };
  notify();
  return prov;
}

export async function updateProveedor(id, data) {
  const existing = state.proveedores.find(p => p.id === id);
  if (!existing) return;
  const updated = { ...existing, ...data };
  await put('proveedores', updated);
  state = { ...state, proveedores: state.proveedores.map(p => p.id === id ? updated : p) };
  notify();
}

export async function deleteProveedor(id) {
  await del('proveedores', id);
  state = { ...state, proveedores: state.proveedores.filter(p => p.id !== id) };
  notify();
}
