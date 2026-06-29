/**
 * storage.js
 * -------------------------------------------------------------
 * Gestión del almacenamiento del dispositivo (sin nube):
 *  - Solicitar almacenamiento PERSISTENTE para que el navegador no
 *    borre los datos del inventario cuando el disco esté bajo presión.
 *  - Estimar cuánto espacio se está usando, para anticipar el techo.
 *
 * Todo es local: usa la API estándar navigator.storage. Si el navegador
 * no la soporta, los métodos devuelven valores neutros sin romper nada.
 * -------------------------------------------------------------
 */

/**
 * Solicita que el almacenamiento sea persistente (no desalojable).
 * Conviene llamarlo al arrancar. Es idempotente: si ya es persistente,
 * no vuelve a pedirlo.
 * @returns {Promise<boolean>} true si el almacenamiento es persistente.
 */
export async function asegurarPersistencia() {
  try {
    if (!navigator.storage || !navigator.storage.persist) return false;
    // Si ya es persistente, no hace falta volver a pedirlo.
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch (_) {
    return false;
  }
}

/** ¿El almacenamiento ya es persistente? (sin solicitarlo). */
export async function esPersistente() {
  try {
    if (!navigator.storage || !navigator.storage.persisted) return false;
    return await navigator.storage.persisted();
  } catch (_) {
    return false;
  }
}

/**
 * Estima el uso de almacenamiento del sitio.
 * @returns {Promise<{usado:number, total:number, porcentaje:number, soportado:boolean}>}
 *   Tamaños en bytes. Si no se soporta, soportado=false.
 */
export async function estimarAlmacenamiento() {
  try {
    if (!navigator.storage || !navigator.storage.estimate) {
      return { usado: 0, total: 0, porcentaje: 0, soportado: false };
    }
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    const porcentaje = quota > 0 ? Math.min(100, (usage / quota) * 100) : 0;
    return { usado: usage, total: quota, porcentaje, soportado: true };
  } catch (_) {
    return { usado: 0, total: 0, porcentaje: 0, soportado: false };
  }
}

/** Formatea bytes a una unidad legible (KB, MB, GB). */
export function formatearBytes(bytes) {
  if (!bytes || bytes < 1024) return `${bytes || 0} B`;
  const unidades = ['KB', 'MB', 'GB', 'TB'];
  let valor = bytes / 1024;
  let i = 0;
  while (valor >= 1024 && i < unidades.length - 1) { valor /= 1024; i++; }
  return `${valor.toFixed(valor >= 10 ? 0 : 1)} ${unidades[i]}`;
}
