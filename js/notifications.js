/**
 * notifications.js — Browser notification alerts for stock and expiry
 */

const KEY_ENABLED = '__notif_enabled';
const KEY_LAST = '__notif_last';

export function notificacionesHabilitadas() {
  return localStorage.getItem(KEY_ENABLED) === '1' &&
    typeof Notification !== 'undefined' &&
    Notification.permission === 'granted';
}

export function notificacionesSoportadas() {
  return typeof Notification !== 'undefined';
}

export async function activarNotificaciones() {
  if (!notificacionesSoportadas()) {
    return { ok: false, msg: 'Tu navegador no soporta notificaciones.' };
  }
  if (Notification.permission === 'denied') {
    return { ok: false, msg: 'Permiso bloqueado. Actívalo desde la configuración del navegador.' };
  }
  const perm = await Notification.requestPermission();
  if (perm === 'granted') {
    localStorage.setItem(KEY_ENABLED, '1');
    return { ok: true };
  }
  return { ok: false, msg: 'Permiso no concedido.' };
}

export function desactivarNotificaciones() {
  localStorage.removeItem(KEY_ENABLED);
}

function mostrarNotificacion(titulo, cuerpo, tag) {
  if (!notificacionesHabilitadas()) return;
  try {
    const n = new Notification(titulo, {
      body: cuerpo,
      icon: './icons/icono-192.png',
      tag: tag || 'inventario',
      requireInteraction: false,
    });
    n.onclick = () => { window.focus(); n.close(); };
  } catch { /* silent */ }
}

export function verificarAlertas(state) {
  if (!notificacionesHabilitadas()) return;

  // Only notify once per day
  const hoy = new Date().toISOString().slice(0, 10);
  if (localStorage.getItem(KEY_LAST) === hoy) return;
  localStorage.setItem(KEY_LAST, hoy);

  const activos = state.articulos.filter(a => !a.archivedAt);

  const bajoStock = activos.filter(a => a.minStock > 0 && a.currentStock <= a.minStock);
  const vencidos = activos.filter(a => a.expiryDate && new Date(a.expiryDate) < new Date());
  const porVencer7 = activos.filter(a => {
    if (!a.expiryDate) return false;
    const dias = Math.ceil((new Date(a.expiryDate) - new Date()) / 86400000);
    return dias >= 0 && dias <= 7;
  });

  if (vencidos.length > 0) {
    mostrarNotificacion(
      `🚨 ${vencidos.length} artículo${vencidos.length > 1 ? 's' : ''} vencido${vencidos.length > 1 ? 's' : ''}`,
      vencidos.slice(0, 3).map(a => `• ${a.name}`).join('\n'),
      'vencidos'
    );
  }

  if (bajoStock.length > 0) {
    setTimeout(() => {
      mostrarNotificacion(
        `⚠️ ${bajoStock.length} artículo${bajoStock.length > 1 ? 's' : ''} con stock bajo`,
        bajoStock.slice(0, 3).map(a => `• ${a.name}: ${a.currentStock}/${a.minStock} ${a.unit}`).join('\n'),
        'stock-bajo'
      );
    }, vencidos.length ? 1500 : 0);
  }

  if (!vencidos.length && !bajoStock.length && porVencer7.length > 0) {
    mostrarNotificacion(
      `⏰ Por vencer esta semana`,
      porVencer7.slice(0, 3).map(a => `• ${a.name}`).join('\n'),
      'por-vencer'
    );
  }
}
