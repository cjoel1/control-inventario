/**
 * utils.js
 * -------------------------------------------------------------
 * Funciones de utilidad puras y reutilizables en toda la app.
 * No dependen del DOM ni de la base de datos: son fáciles de
 * probar y de razonar.
 * -------------------------------------------------------------
 */

/** Milisegundos en un día. Útil para cálculos de atrasos y calibración. */
export const UN_DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Genera el siguiente código interno de herramienta con formato HRM-0001.
 * @param {Array<{code:string}>} herramientas Lista actual de herramientas.
 * @param {string} prefijo Prefijo configurable (por defecto "HRM").
 * @returns {string} Código nuevo, p. ej. "HRM-0007".
 */
export function siguienteCodigo(herramientas, prefijo = 'HRM') {
  let maximo = 0;
  const re = new RegExp(`^${prefijo}-(\\d+)$`, 'i');
  for (const h of herramientas) {
    const m = re.exec(h.code || '');
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > maximo) maximo = n;
    }
  }
  const siguiente = String(maximo + 1).padStart(4, '0');
  return `${prefijo}-${siguiente}`;
}

/**
 * Identificador único razonablemente seguro sin dependencias externas.
 * Usa crypto.randomUUID cuando existe; si no, un respaldo simple.
 */
export function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

/** Devuelve la marca de tiempo actual en milisegundos. */
export function ahora() {
  return Date.now();
}

/**
 * Convierte una fecha (ms o ISO) a texto local corto: 25/06/2026.
 * Devuelve cadena vacía si la entrada es nula.
 */
export function fechaCorta(valor) {
  if (valor === null || valor === undefined || valor === '') return '';
  const d = new Date(valor);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Convierte una fecha a texto con hora: 25/06/2026 14:30.
 */
export function fechaHora(valor) {
  if (valor === null || valor === undefined || valor === '') return '';
  const d = new Date(valor);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('es-MX', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/**
 * Convierte un valor de <input type="date"> (AAAA-MM-DD) a milisegundos
 * a mediodía local, para evitar saltos por zona horaria. Null si vacío.
 */
export function fechaInputAMs(texto) {
  if (!texto) return null;
  const partes = texto.split('-').map(Number);
  if (partes.length !== 3 || partes.some(isNaN)) return null;
  const [a, m, d] = partes;
  return new Date(a, m - 1, d, 12, 0, 0, 0).getTime();
}

/**
 * Convierte milisegundos a formato AAAA-MM-DD para <input type="date">.
 * Cadena vacía si el valor es nulo o inválido.
 */
export function msAFechaInput(ms) {
  if (ms === null || ms === undefined || ms === '') return '';
  const d = new Date(ms);
  if (isNaN(d.getTime())) return '';
  const a = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${a}-${m}-${dia}`;
}

/**
 * Días completos transcurridos entre dos marcas de tiempo (desde -> hasta).
 * Redondea hacia abajo. Útil para "lleva X días afuera".
 */
export function diasEntre(desde, hasta = ahora()) {
  return Math.floor((hasta - desde) / UN_DIA_MS);
}

/**
 * Escapa texto para insertarlo de forma segura como contenido HTML.
 * Previene inyección de marcado al construir vistas con plantillas.
 */
export function esc(texto) {
  if (texto === null || texto === undefined) return '';
  return String(texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Normaliza un texto para búsquedas: minúsculas y sin acentos.
 */
export function normaliza(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/**
 * Convierte un arreglo de objetos a CSV con comillas seguras.
 * @param {string[]} columnas Llaves a exportar, en orden.
 * @param {string[]} encabezados Títulos legibles para la primera fila.
 * @param {object[]} filas Datos.
 * @returns {string} Contenido CSV con BOM para abrir bien en Excel.
 */
export function aCSV(columnas, encabezados, filas) {
  const escaparCampo = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    if (/[",\n;]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const lineas = [];
  lineas.push(encabezados.map(escaparCampo).join(','));
  for (const fila of filas) {
    lineas.push(columnas.map((c) => escaparCampo(fila[c])).join(','));
  }
  // BOM (﻿) para que Excel reconozca UTF-8 y muestre acentos bien.
  return '﻿' + lineas.join('\r\n');
}

/**
 * Dispara la descarga de un Blob en el navegador, 100% local.
 * @param {Blob} blob Contenido a descargar.
 * @param {string} nombreArchivo Nombre sugerido.
 */
export function descargarBlob(blob, nombreArchivo) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Liberamos el objeto URL para no fugar memoria.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Sello de fecha compacto para nombres de archivo: 2026-06-25_1430.
 */
export function selloArchivo(fecha = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return (
    fecha.getFullYear() + '-' + p(fecha.getMonth() + 1) + '-' + p(fecha.getDate()) +
    '_' + p(fecha.getHours()) + p(fecha.getMinutes())
  );
}
