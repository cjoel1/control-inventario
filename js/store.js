/**
 * store.js — Control de Inventario
 * -------------------------------------------------------------
 * Lógica de dominio: artículos consumibles y movimientos de stock.
 * Mantiene copia en memoria para respuesta rápida de la UI y persiste
 * cada cambio en IndexedDB (capa db.js).
 *
 * Modelo:
 *  - Artículo: tiene un stock actual que sube (Entrada) o baja (Salida).
 *  - Movimiento: registro permanente de cada cambio de stock.
 *  - Ajuste: corrección directa del stock (ej. inventario físico).
 * -------------------------------------------------------------
 */

import {
  ALMACENES, obtenerTodos, obtener, guardar, eliminar, guardarLote,
  leerConfig, escribirConfig,
} from './db.js';
import { uid, ahora } from './utils.js';

/** Valores por defecto de los ajustes de la empresa. */
const CONFIG_DEFECTO = {
  nombreEmpresa: 'Mi Empresa',
  logo: '',
  tema: 'claro',
  altoContraste: false,
  bienvenidaVista: false,
  categorias: ['General','Higiene','Alimentos','Limpieza','Medicamentos','Papelería','Mantenimiento','Otros'],
  unidades: ['unidades','cajas','bolsas','litros','galones','kg','metros','rollos','paquetes'],
};

/* --------------------------- Estado en memoria --------------------------- */

const estado = {
  articulos: [],
  movimientos: [],
  config: { ...CONFIG_DEFECTO },
  listo: false,
};

/** Suscriptores que se notifican tras cada cambio para re-renderizar. */
const suscriptores = new Set();

/** Registra un callback que se ejecuta cuando cambian los datos. */
export function suscribir(fn) {
  suscriptores.add(fn);
  return () => suscriptores.delete(fn);
}

/** Notifica a todos los suscriptores. */
function notificar() {
  for (const fn of suscriptores) {
    try { fn(); } catch (e) { console.error('Error en suscriptor:', e); }
  }
}

/* ------------------------------ Inicialización --------------------------- */

/**
 * Carga todos los datos desde IndexedDB a memoria.
 * Debe llamarse una vez al arrancar, antes de renderizar.
 */
export async function cargar() {
  const [arts, movs] = await Promise.all([
    obtenerTodos(ALMACENES.ARTICULOS),
    obtenerTodos(ALMACENES.MOVIMIENTOS),
  ]);
  estado.articulos = arts || [];
  estado.movimientos = movs || [];

  const cfg = { ...CONFIG_DEFECTO };
  for (const clave of Object.keys(CONFIG_DEFECTO)) {
    const v = await leerConfig(clave, undefined);
    if (v !== undefined && v !== null) cfg[clave] = v;
  }
  estado.config = cfg;
  estado.listo = true;
}

/* ------------------------------- Lectores -------------------------------- */

/** Artículos activos (no archivados). */
export function articulos() {
  return estado.articulos.filter((a) => !a.archivado);
}

/** Artículos archivados. */
export function articulosArchivados() {
  return estado.articulos.filter((a) => !!a.archivado);
}

/** Todos los movimientos. */
export function movimientos() {
  return estado.movimientos;
}

/** Configuración actual. */
export function config() {
  return estado.config;
}

/** Busca un artículo por id (incluye archivados). */
export function articuloPorId(id) {
  return estado.articulos.find((a) => a.id === id) || null;
}

/* ------------------------------- Ajustes --------------------------------- */

export async function actualizarConfig(cambios) {
  estado.config = { ...estado.config, ...cambios };
  for (const [clave, valor] of Object.entries(cambios)) {
    await escribirConfig(clave, valor);
  }
  notificar();
}

/* -------------------------- CRUD de artículos ---------------------------- */

/**
 * Crea un artículo nuevo.
 * @param {object} datos - nombre*, referencia, categoria, unidad, stockMinimo, stock, ubicacion, notas
 */
export async function agregarArticulo(datos) {
  const t = ahora();
  const art = {
    id: uid(),
    nombre: (datos.nombre || '').trim() || 'Sin nombre',
    referencia: (datos.referencia || '').trim(),
    categoria: (datos.categoria || 'General').trim(),
    unidad: (datos.unidad || 'unidades').trim(),
    stock: Math.max(0, parseInt(datos.stock, 10) || 0),
    stockMinimo: Math.max(0, parseInt(datos.stockMinimo, 10) || 5),
    ubicacion: (datos.ubicacion || '').trim(),
    notas: (datos.notas || '').trim(),
    archivado: false,
    creadoEn: t,
  };
  estado.articulos.push(art);
  await guardar(ALMACENES.ARTICULOS, art);

  // Si hay stock inicial, registrar como entrada
  if (art.stock > 0) {
    const mov = {
      id: uid(),
      articuloId: art.id,
      tipo: 'entrada',
      cantidad: art.stock,
      stockAntes: 0,
      stockDespues: art.stock,
      persona: '',
      motivo: 'Stock inicial',
      at: t,
    };
    estado.movimientos.push(mov);
    await guardar(ALMACENES.MOVIMIENTOS, mov);
  }

  notificar();
  return art;
}

/**
 * Actualiza campos editables de un artículo.
 */
export async function editarArticulo(id, cambios) {
  const art = articuloPorId(id);
  if (!art) throw new Error('Artículo no encontrado.');

  if (cambios.nombre !== undefined) art.nombre = String(cambios.nombre).trim() || 'Sin nombre';
  if (cambios.referencia !== undefined) art.referencia = String(cambios.referencia).trim();
  if (cambios.categoria !== undefined) art.categoria = String(cambios.categoria).trim();
  if (cambios.unidad !== undefined) art.unidad = String(cambios.unidad).trim();
  if (cambios.stockMinimo !== undefined) art.stockMinimo = Math.max(0, parseInt(cambios.stockMinimo, 10) || 0);
  if (cambios.ubicacion !== undefined) art.ubicacion = String(cambios.ubicacion).trim();
  if (cambios.notas !== undefined) art.notas = String(cambios.notas).trim();

  await guardar(ALMACENES.ARTICULOS, art);
  notificar();
  return art;
}

/** Archiva un artículo (lo saca del uso diario, conserva historial). */
export async function archivarArticulo(id) {
  const art = articuloPorId(id);
  if (!art) throw new Error('Artículo no encontrado.');
  art.archivado = true;
  await guardar(ALMACENES.ARTICULOS, art);
  notificar();
}

/** Restaura un artículo archivado. */
export async function restaurarArticulo(id) {
  const art = articuloPorId(id);
  if (!art) throw new Error('Artículo no encontrado.');
  art.archivado = false;
  await guardar(ALMACENES.ARTICULOS, art);
  notificar();
}

/** Elimina permanentemente un artículo y sus movimientos. */
export async function eliminarArticulo(id) {
  estado.articulos = estado.articulos.filter((a) => a.id !== id);
  await eliminar(ALMACENES.ARTICULOS, id);

  const propios = estado.movimientos.filter((m) => m.articuloId === id);
  estado.movimientos = estado.movimientos.filter((m) => m.articuloId !== id);
  for (const m of propios) await eliminar(ALMACENES.MOVIMIENTOS, m.id);

  notificar();
}

/* ----------------------- Movimientos de stock ---------------------------- */

/**
 * Registra una ENTRADA (aumenta stock).
 * @param {string} articuloId
 * @param {number} cantidad
 * @param {{ persona?: string, motivo?: string }} opts
 */
export async function registrarEntrada(articuloId, cantidad, { persona = '', motivo = '' } = {}) {
  const art = articuloPorId(articuloId);
  if (!art) throw new Error('Artículo no encontrado.');

  const cant = Math.max(1, parseInt(cantidad, 10) || 1);
  const stockAntes = art.stock;
  const stockDespues = art.stock + cant;

  art.stock = stockDespues;
  await guardar(ALMACENES.ARTICULOS, art);

  const mov = {
    id: uid(),
    articuloId,
    tipo: 'entrada',
    cantidad: cant,
    stockAntes,
    stockDespues,
    persona: (persona || '').trim(),
    motivo: (motivo || '').trim(),
    at: ahora(),
  };
  estado.movimientos.push(mov);
  await guardar(ALMACENES.MOVIMIENTOS, mov);

  notificar();
  return mov;
}

/**
 * Registra una SALIDA (disminuye stock, mínimo 0).
 * @param {string} articuloId
 * @param {number} cantidad
 * @param {{ persona?: string, motivo?: string }} opts
 */
export async function registrarSalida(articuloId, cantidad, { persona = '', motivo = '' } = {}) {
  const art = articuloPorId(articuloId);
  if (!art) throw new Error('Artículo no encontrado.');
  if (art.stock <= 0) throw new Error(`"${art.nombre}" no tiene stock disponible.`);

  const cant = Math.max(1, parseInt(cantidad, 10) || 1);
  if (cant > art.stock) {
    throw new Error(`Solo hay ${art.stock} ${art.unidad} disponibles de "${art.nombre}".`);
  }

  const stockAntes = art.stock;
  const stockDespues = Math.max(0, art.stock - cant);

  art.stock = stockDespues;
  await guardar(ALMACENES.ARTICULOS, art);

  const mov = {
    id: uid(),
    articuloId,
    tipo: 'salida',
    cantidad: cant,
    stockAntes,
    stockDespues,
    persona: (persona || '').trim(),
    motivo: (motivo || '').trim(),
    at: ahora(),
  };
  estado.movimientos.push(mov);
  await guardar(ALMACENES.MOVIMIENTOS, mov);

  notificar();
  return mov;
}

/**
 * Ajusta el stock a un valor exacto (ej. después de un conteo físico).
 * @param {string} articuloId
 * @param {number} nuevoStock
 * @param {string} motivo
 */
export async function ajustarStock(articuloId, nuevoStock, motivo = 'Ajuste manual') {
  const art = articuloPorId(articuloId);
  if (!art) throw new Error('Artículo no encontrado.');

  const stockAntes = art.stock;
  const stockDespues = Math.max(0, parseInt(nuevoStock, 10) || 0);

  art.stock = stockDespues;
  await guardar(ALMACENES.ARTICULOS, art);

  const mov = {
    id: uid(),
    articuloId,
    tipo: 'ajuste',
    cantidad: Math.abs(stockDespues - stockAntes),
    stockAntes,
    stockDespues,
    persona: '',
    motivo: (motivo || 'Ajuste manual').trim(),
    at: ahora(),
  };
  estado.movimientos.push(mov);
  await guardar(ALMACENES.MOVIMIENTOS, mov);

  notificar();
  return mov;
}

/* ----------------------- Cálculos derivados ------------------------------ */

/** Artículos activos con stock igual o menor al mínimo (incluyendo cero). */
export function articulosBajoMinimo() {
  return articulos().filter((a) => a.stock <= a.stockMinimo);
}

/** Clase de color para el stock de un artículo. */
export function claseStock(art) {
  if (art.stock === 0) return 'cero';
  if (art.stock <= art.stockMinimo) return 'critico';
  if (art.stock <= art.stockMinimo * 1.5) return 'bajo';
  return 'ok';
}

/* ----------------------------- Respaldo total ---------------------------- */

export function construirRespaldo() {
  return {
    app: 'control-inventario',
    version: 1,
    exportadoEn: ahora(),
    config: estado.config,
    articulos: estado.articulos,
    movimientos: estado.movimientos,
  };
}

export async function restaurarRespaldo(datos) {
  if (!datos || typeof datos !== 'object') {
    throw new Error('El archivo de respaldo no es válido.');
  }
  if (!Array.isArray(datos.articulos) || !Array.isArray(datos.movimientos)) {
    throw new Error('El respaldo no contiene "articulos" y "movimientos".');
  }

  // Red de seguridad antes de sobrescribir
  await crearSnapshot('Antes de restaurar');

  await guardarLote(ALMACENES.ARTICULOS, datos.articulos, true);
  await guardarLote(ALMACENES.MOVIMIENTOS, datos.movimientos, true);

  if (datos.config && typeof datos.config === 'object') {
    estado.config = { ...CONFIG_DEFECTO, ...datos.config };
    for (const [clave, valor] of Object.entries(estado.config)) {
      await escribirConfig(clave, valor);
    }
  }

  estado.articulos = datos.articulos;
  estado.movimientos = datos.movimientos;
  notificar();
}

/** Borra todo el inventario e historial (conserva ajustes y snapshots). */
export async function borrarTodo() {
  await crearSnapshot('Antes de borrar todo');
  await guardarLote(ALMACENES.ARTICULOS, [], true);
  await guardarLote(ALMACENES.MOVIMIENTOS, [], true);
  estado.articulos = [];
  estado.movimientos = [];
  notificar();
}

/* --------------- Copias de seguridad automáticas (snapshots) ------------- */

const MAX_SNAPSHOTS = 10;

export async function crearSnapshot(motivo = 'Manual') {
  if (estado.articulos.length === 0 && estado.movimientos.length === 0) return null;
  const snap = {
    id: uid(),
    at: ahora(),
    motivo,
    articulos: estado.articulos,
    movimientos: estado.movimientos,
    config: estado.config,
  };
  await guardar(ALMACENES.SNAPSHOTS, snap);
  await podarSnapshots();
  return snap;
}

async function podarSnapshots() {
  const todas = await obtenerTodos(ALMACENES.SNAPSHOTS);
  todas.sort((a, b) => b.at - a.at);
  for (const vieja of todas.slice(MAX_SNAPSHOTS)) {
    await eliminar(ALMACENES.SNAPSHOTS, vieja.id);
  }
}

export async function listarSnapshots() {
  const todas = await obtenerTodos(ALMACENES.SNAPSHOTS);
  return todas.sort((a, b) => b.at - a.at);
}

export async function restaurarSnapshot(id) {
  const snap = await obtener(ALMACENES.SNAPSHOTS, id);
  if (!snap) throw new Error('La copia de seguridad ya no existe.');
  await restaurarRespaldo({
    articulos: snap.articulos,
    movimientos: snap.movimientos,
    config: snap.config,
  });
}

export async function eliminarSnapshot(id) {
  await eliminar(ALMACENES.SNAPSHOTS, id);
}

/**
 * Crea una snapshot automática si no hay ninguna del último día.
 */
export async function snapshotAutomaticoDiario() {
  try {
    const todas = await obtenerTodos(ALMACENES.SNAPSHOTS);
    const UN_DIA = 24 * 60 * 60 * 1000;
    const reciente = todas.some((s) => ahora() - s.at < UN_DIA);
    if (!reciente) await crearSnapshot('Automática diaria');
  } catch (_) { /* sin bloqueo */ }
}

/**
 * Carga datos de ejemplo realistas (residencia geriátrica / enfermería).
 */
export async function cargarDatosEjemplo() {
  const UN_DIA_MS = 24 * 60 * 60 * 1000;
  const base = [
    { nombre: 'Pampers Talla M', categoria: 'Higiene', unidad: 'paquetes', stock: 8, stockMinimo: 10, ubicacion: 'Bodega A', notas: 'Marca Pampers' },
    { nombre: 'Jabón líquido dispensador', categoria: 'Higiene', unidad: 'litros', stock: 5, stockMinimo: 3, ubicacion: 'Baños', notas: '' },
    { nombre: 'Guantes de látex M', categoria: 'Higiene', unidad: 'cajas', stock: 3, stockMinimo: 5, ubicacion: 'Enfermería', notas: '100 unidades por caja' },
    { nombre: 'Cloro líquido', categoria: 'Limpieza', unidad: 'galones', stock: 6, stockMinimo: 4, ubicacion: 'Bodega B', notas: '' },
    { nombre: 'Papel higiénico doble hoja', categoria: 'Higiene', unidad: 'paquetes', stock: 12, stockMinimo: 8, ubicacion: 'Bodega A', notas: 'Paquetes de 24 rollos' },
    { nombre: 'Paracetamol 500mg', categoria: 'Medicamentos', unidad: 'cajas', stock: 2, stockMinimo: 4, ubicacion: 'Enfermería', notas: 'Solo con prescripción' },
    { nombre: 'Bolsas de basura negras', categoria: 'Limpieza', unidad: 'rollos', stock: 4, stockMinimo: 2, ubicacion: 'Bodega B', notas: '' },
    { nombre: 'Mascarillas quirúrgicas', categoria: 'Higiene', unidad: 'cajas', stock: 1, stockMinimo: 3, ubicacion: 'Enfermería', notas: '50 unidades por caja' },
  ];

  for (const b of base) {
    const art = {
      id: uid(),
      nombre: b.nombre,
      referencia: '',
      categoria: b.categoria,
      unidad: b.unidad,
      stock: b.stock,
      stockMinimo: b.stockMinimo,
      ubicacion: b.ubicacion,
      notas: b.notas,
      archivado: false,
      creadoEn: ahora() - 30 * UN_DIA_MS,
    };
    estado.articulos.push(art);
    await guardar(ALMACENES.ARTICULOS, art);

    // Entrada inicial
    const movInicial = {
      id: uid(),
      articuloId: art.id,
      tipo: 'entrada',
      cantidad: b.stock + Math.floor(Math.random() * 5) + 2,
      stockAntes: 0,
      stockDespues: b.stock + Math.floor(Math.random() * 5) + 2,
      persona: 'Sistema',
      motivo: 'Stock inicial',
      at: ahora() - 30 * UN_DIA_MS,
    };
    estado.movimientos.push(movInicial);
    await guardar(ALMACENES.MOVIMIENTOS, movInicial);

    // Algunas salidas de ejemplo
    const cantSalida = Math.floor(Math.random() * 3) + 1;
    const personas = ['María López', 'Carlos Ruiz', 'Ana García', 'Juan Pérez'];
    const persona = personas[Math.floor(Math.random() * personas.length)];
    const movSalida = {
      id: uid(),
      articuloId: art.id,
      tipo: 'salida',
      cantidad: cantSalida,
      stockAntes: movInicial.stockDespues,
      stockDespues: movInicial.stockDespues - cantSalida,
      persona,
      motivo: 'Uso diario',
      at: ahora() - Math.floor(Math.random() * 10 + 1) * UN_DIA_MS,
    };
    estado.movimientos.push(movSalida);
    await guardar(ALMACENES.MOVIMIENTOS, movSalida);
  }

  notificar();
}
