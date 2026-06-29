/**
 * backup.js — Control de Inventario
 * -------------------------------------------------------------
 * Respaldo y restauración 100% local:
 *  - Exportar TODO a un archivo .json (descarga al dispositivo).
 *  - Restaurar desde un .json válido (con validación de estructura).
 *  - Exportar historial de movimientos a CSV.
 *  - Recordatorio de respaldo escalado por días.
 *
 * No hay nube: los archivos se descargan/leen en el propio dispositivo.
 * -------------------------------------------------------------
 */

import {
  construirRespaldo, restaurarRespaldo, articulos, movimientos, articuloPorId,
} from './store.js';
import { leerConfig, escribirConfig } from './db.js';
import {
  aCSV, descargarBlob, selloArchivo, fechaHora, fechaCorta, ahora,
} from './utils.js';

const CLAVE_ULTIMO_RESPALDO = 'ultimoRespaldo';

/* ------------------------------ Exportar JSON ---------------------------- */

/** Descarga el respaldo completo como archivo .json y marca la fecha. */
export async function exportarJSON() {
  const datos = construirRespaldo();
  const texto = JSON.stringify(datos, null, 2);
  const blob = new Blob([texto], { type: 'application/json' });
  descargarBlob(blob, `inventario_stock_${selloArchivo()}.json`);
  await marcarRespaldoHecho();
}

/* ------------------------------ Importar JSON ---------------------------- */

/**
 * Lee y valida un archivo de respaldo, luego restaura el estado.
 * @param {File} archivo Archivo seleccionado por el usuario.
 * @returns {Promise<{articulos:number, movimientos:number}>}
 */
export async function importarJSON(archivo) {
  if (!archivo) throw new Error('No se seleccionó ningún archivo.');

  let texto;
  try {
    texto = await archivo.text();
  } catch (_) {
    throw new Error('No se pudo leer el archivo.');
  }

  let datos;
  try {
    datos = JSON.parse(texto);
  } catch (_) {
    throw new Error('El archivo no es un JSON válido.');
  }

  await restaurarRespaldo(datos);
  return {
    articulos: datos.articulos.length,
    movimientos: datos.movimientos.length,
  };
}

/* ------------------------------- Exportar CSV ---------------------------- */

/** Exporta el historial completo de movimientos a CSV. */
export function exportarHistorialCSV() {
  const artsMap = {};
  for (const a of articulos()) artsMap[a.id] = a;

  const filas = movimientos()
    .slice()
    .sort((a, b) => b.at - a.at)
    .map((m) => {
      const art = artsMap[m.articuloId] || {};
      return {
        fecha: fechaHora(m.at),
        tipo: m.tipo === 'entrada' ? 'Entrada' : m.tipo === 'salida' ? 'Salida' : 'Ajuste',
        articulo: art.nombre || m.articuloId,
        categoria: art.categoria || '',
        unidad: art.unidad || '',
        cantidad: m.cantidad,
        stockAntes: m.stockAntes,
        stockDespues: m.stockDespues,
        persona: m.persona,
        motivo: m.motivo,
      };
    });

  const csv = aCSV(
    ['fecha', 'tipo', 'articulo', 'categoria', 'unidad', 'cantidad', 'stockAntes', 'stockDespues', 'persona', 'motivo'],
    ['Fecha', 'Tipo', 'Artículo', 'Categoría', 'Unidad', 'Cantidad', 'Stock antes', 'Stock después', 'Persona', 'Motivo'],
    filas
  );
  descargarBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `historial_stock_${selloArchivo()}.csv`);
}

/** Exporta el inventario actual a CSV. */
export function exportarInventarioCSV() {
  const filas = articulos().map((a) => ({
    nombre: a.nombre,
    referencia: a.referencia,
    categoria: a.categoria,
    unidad: a.unidad,
    stock: a.stock,
    stockMinimo: a.stockMinimo,
    ubicacion: a.ubicacion,
    notas: a.notas,
  }));
  const csv = aCSV(
    ['nombre', 'referencia', 'categoria', 'unidad', 'stock', 'stockMinimo', 'ubicacion', 'notas'],
    ['Nombre', 'Referencia', 'Categoría', 'Unidad', 'Stock actual', 'Stock mínimo', 'Ubicación', 'Notas'],
    filas
  );
  descargarBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `inventario_${selloArchivo()}.csv`);
}

/* --------------------------- Recordatorio diario ------------------------- */

/** Marca que se hizo un respaldo justo ahora. */
export async function marcarRespaldoHecho() {
  await escribirConfig(CLAVE_ULTIMO_RESPALDO, ahora());
}

/** Devuelve la marca de tiempo del último respaldo (o null). */
export async function ultimoRespaldo() {
  return leerConfig(CLAVE_ULTIMO_RESPALDO, null);
}

/**
 * Detalle del estado de respaldo para un recordatorio escalado.
 * Devuelve null si no hay nada que recordar.
 * @returns {Promise<{dias:number, nivel:'info'|'aviso'|'error', mensaje:string}|null>}
 */
export async function estadoRecordatorioRespaldo() {
  if (articulos().length === 0 && movimientos().length === 0) return null;
  const ultimo = await ultimoRespaldo();
  const UN_DIA = 24 * 60 * 60 * 1000;

  if (!ultimo) {
    return {
      dias: Infinity,
      nivel: 'aviso',
      mensaje: 'Aún no has hecho ningún respaldo. Descarga uno hoy para proteger tus datos.',
    };
  }

  const dias = Math.floor((ahora() - ultimo) / UN_DIA);
  if (dias < 1) return null;

  if (dias >= 7) {
    return {
      dias,
      nivel: 'error',
      mensaje: `Hace ${dias} días que no respaldas. Si la tablet falla, perderás todo. Respalda ahora (sección Respaldo).`,
    };
  }
  if (dias >= 3) {
    return {
      dias,
      nivel: 'aviso',
      mensaje: `Llevas ${dias} días sin respaldar. Conviene descargar un respaldo hoy.`,
    };
  }
  return {
    dias,
    nivel: 'info',
    mensaje: 'Recuerda hacer un respaldo hoy (sección Respaldo).',
  };
}
