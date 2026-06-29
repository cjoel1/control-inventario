/**
 * activation.js
 * -------------------------------------------------------------
 * Controla si esta instalación está activada (licencia de una tablet).
 *
 * Formatos de código:
 *  - Permanente : XXXX-XXXX
 *      HMAC-SHA256(deviceId) con SECRETO
 *  - Beta/prueba: YYYYMMDD:XXXX-XXXX
 *      Fecha de vencimiento + HMAC-SHA256(deviceId + '|' + YYYYMMDD)
 *
 * El ID y el estado de activación se guardan con claves internas (__),
 * que el sistema de respaldo ignora deliberadamente.
 * -------------------------------------------------------------
 */

import { leerConfig, escribirConfig } from './db.js';

const CLAVE_ID  = '__device_id';
const CLAVE_ACT = '__act';
const SECRETO   = 'SHH-STOCK-2025'; // Debe coincidir con activar.html

/* -------------------------------------------------------------------------- */

/** Genera o recupera el ID único de este dispositivo. */
export async function obtenerDeviceId() {
  let id = await leerConfig(CLAVE_ID);
  if (!id) {
    const uuid = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : (Math.random().toString(36).slice(2) + Date.now().toString(36)).padStart(20, '0');
    id = uuid.replace(/-/g, '').slice(0, 16).toUpperCase();
    await escribirConfig(CLAVE_ID, id);
  }
  return id;
}

/** Calcula HMAC-SHA256 del payload dado y devuelve XXXX-XXXX. */
async function hmac(payload) {
  const enc = new TextEncoder();
  const clave = await crypto.subtle.importKey(
    'raw', enc.encode(SECRETO),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  );
  const firma = await crypto.subtle.sign('HMAC', clave, enc.encode(payload));
  const hex = Array.from(new Uint8Array(firma))
    .map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 4).toUpperCase()}-${hex.slice(4, 8).toUpperCase()}`;
}

/** Código permanente para un dispositivo. */
export async function calcularCodigo(deviceId) {
  return hmac(deviceId);
}

/** Código de beta con vencimiento. Devuelve 'YYYYMMDD:XXXX-XXXX'. */
export async function calcularCodigoBeta(deviceId, fechaExpiry) {
  // fechaExpiry: Date object o string YYYYMMDD
  const fecha = typeof fechaExpiry === 'string'
    ? fechaExpiry
    : fechaExpiry.toISOString().slice(0, 10).replace(/-/g, '');
  const codigo = await hmac(`${deviceId}|${fecha}`);
  return `${fecha}:${codigo}`;
}

/* -------------------------------------------------------------------------- */

/**
 * Estado detallado de la activación de este dispositivo.
 * @returns {{ estado: 'inactivo'|'activo'|'beta'|'expirado', diasRestantes?: number }}
 */
export async function obtenerEstadoActivacion() {
  const act = await leerConfig(CLAVE_ACT);
  if (!act) return { estado: 'inactivo' };

  if (act.expira) {
    const ahora = Date.now();
    if (ahora > act.expira) return { estado: 'expirado' };
    const diasRestantes = Math.ceil((act.expira - ahora) / 86400000);
    return { estado: 'beta', diasRestantes };
  }

  return { estado: 'activo' };
}

/** Comprueba si esta instalación puede usarse (activa o beta vigente). */
export async function estaActivado() {
  const { estado } = await obtenerEstadoActivacion();
  return estado === 'activo' || estado === 'beta';
}

/**
 * Intenta activar la app con el código ingresado.
 * Soporta tanto códigos permanentes (XXXX-XXXX) como de beta (YYYYMMDD:XXXX-XXXX).
 * @returns {boolean} true si el código es correcto.
 */
export async function activar(deviceId, codigoIngresado) {
  const raw = codigoIngresado.trim().toUpperCase();
  const limpiar = (s) => s.replace(/[-\s]/g, '');

  // ¿Es un código beta? Formato: YYYYMMDD:XXXX-XXXX
  const esBeta = /^\d{8}:/.test(raw);

  if (esBeta) {
    const sepIdx = raw.indexOf(':');
    const fecha = raw.slice(0, sepIdx);          // YYYYMMDD
    const codigoParte = raw.slice(sepIdx + 1);   // XXXX-XXXX

    const esperado = await hmac(`${deviceId}|${fecha}`);
    if (limpiar(codigoParte) !== limpiar(esperado)) return false;

    // Calcular timestamp de vencimiento (fin del día en UTC)
    const anio = parseInt(fecha.slice(0, 4), 10);
    const mes  = parseInt(fecha.slice(4, 6), 10) - 1;
    const dia  = parseInt(fecha.slice(6, 8), 10);
    const expira = Date.UTC(anio, mes, dia, 23, 59, 59, 999);

    await escribirConfig(CLAVE_ACT, { at: Date.now(), expira, tipo: 'beta' });
    return true;
  }

  // Código permanente
  const esperado = await calcularCodigo(deviceId);
  if (limpiar(raw) !== limpiar(esperado)) return false;
  await escribirConfig(CLAVE_ACT, { at: Date.now() });
  return true;
}
