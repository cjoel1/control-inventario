/**
 * icons.js
 * -------------------------------------------------------------
 * Sistema de íconos SVG (trazo, estilo lineal) incluidos en el código,
 * sin emojis ni dependencias externas. Todos heredan el color del texto
 * (currentColor), por lo que se adaptan al tema y al contraste.
 *
 * Uso:  icono('inventario', { size: 22 })  ->  string <svg>…</svg>
 * -------------------------------------------------------------
 */

/* Cada entrada es el contenido interno de un <svg viewBox="0 0 24 24">. */
const TRAZOS = {
  // --- Navegación ---
  inicio: '<path d="M3 10.8 12 3l9 7.8"/><path d="M5.5 9.5V20a1 1 0 0 0 1 1H10v-5a2 2 0 0 1 4 0v5h3.5a1 1 0 0 0 1-1V9.5"/>',
  inventario: '<path d="M3 8.5h18v10a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5Z"/><path d="M8.5 8.5V6a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v2.5"/><path d="M3 13h18"/><path d="M10.5 13v1.5h3V13"/>',
  escanear: '<path d="M4 8V6a2 2 0 0 1 2-2h2"/><path d="M16 4h2a2 2 0 0 1 2 2v2"/><path d="M20 16v2a2 2 0 0 1-2 2h-2"/><path d="M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M4 12h16"/>',
  etiquetas: '<path d="M3.5 11.3V5a1.5 1.5 0 0 1 1.5-1.5h6.3a1.5 1.5 0 0 1 1.06.44l7.2 7.2a1.5 1.5 0 0 1 0 2.12l-6.3 6.3a1.5 1.5 0 0 1-2.12 0l-7.2-7.2A1.5 1.5 0 0 1 3.5 11.3Z"/><circle cx="7.8" cy="7.8" r="1.3"/>',
  historial: '<path d="M3.05 11a9 9 0 1 1 .5 4"/><path d="M3 21v-5h5"/><path d="M12 7.5V12l3 2"/>',
  reportes: '<path d="M4 20V12"/><path d="M9.3 20V5"/><path d="M14.7 20v-6"/><path d="M20 20V9"/><path d="M3 20h18"/>',
  respaldo: '<ellipse cx="12" cy="5.5" rx="7.5" ry="2.8"/><path d="M4.5 5.5v6c0 1.55 3.36 2.8 7.5 2.8s7.5-1.25 7.5-2.8v-6"/><path d="M4.5 11.5v6c0 1.55 3.36 2.8 7.5 2.8s7.5-1.25 7.5-2.8v-6"/>',
  ajustes: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v2.2M12 19.3v2.2M4.2 7l1.9 1.1M17.9 15.9l1.9 1.1M19.8 7l-1.9 1.1M6.1 15.9 4.2 17M2.5 12h2.2M19.3 12h2.2"/>',

  // --- Acciones ---
  agregar: '<path d="M12 5v14M5 12h14"/>',
  editar: '<path d="M4 20h4.2L19 9.2a1.8 1.8 0 0 0 0-2.5l-1.7-1.7a1.8 1.8 0 0 0-2.5 0L4 15.8Z"/><path d="M13.5 6.5 17.5 10.5"/>',
  archivar: '<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8"/><path d="M9.5 12h5"/>',
  eliminar: '<path d="M4 7h16"/><path d="M9.5 7V5.2A1.2 1.2 0 0 1 10.7 4h2.6a1.2 1.2 0 0 1 1.2 1.2V7"/><path d="M6 7l.9 12.1a1 1 0 0 0 1 .9h8.2a1 1 0 0 0 1-.9L18 7"/>',
  restaurar: '<path d="M3.05 11a9 9 0 1 1 .5 4"/><path d="M3 21v-5h5"/>',
  descargar: '<path d="M12 4v11"/><path d="M8 11l4 4 4-4"/><path d="M5 19.5h14"/>',
  subir: '<path d="M12 20V9"/><path d="M8 13l4-4 4 4"/><path d="M5 4.5h14"/>',
  buscar: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.2-4.2"/>',
  cerrar: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  sacar: '<path d="M14 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 8l4 4-4 4"/><path d="M14 12H4"/>',
  devolver: '<path d="M10 4H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3"/><path d="M14 8l-4 4 4 4"/><path d="M10 12h10"/>',
  alerta: '<path d="M12 3.2 2.3 20a1 1 0 0 0 .87 1.5h17.66A1 1 0 0 0 21.7 20Z"/><path d="M12 9.5v5"/><path d="M12 17.6h.01"/>',
  calibrar: '<circle cx="12" cy="12" r="8.5"/><path d="M12 12 15.5 8.5"/><path d="M12 3.5v2M20.5 12h-2M12 20.5v-2M3.5 12h2"/>',
  reloj: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 1.8"/>',
  paquete: '<path d="M21 8.2 12 3 3 8.2v7.6L12 21l9-5.2Z"/><path d="M3 8.2 12 13.4l9-5.2"/><path d="M12 13.4V21"/>',
  empresa: '<path d="M3 21h18"/><path d="M5 21V6a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v15"/><path d="M14 21V10h4a1 1 0 0 1 1 1v10"/><path d="M8 9h3M8 13h3M8 17h3"/>',
  rayo: '<path d="M13 2 4.5 13.5H11l-1 8.5L19.5 10H13Z"/>',
  estrella: '<path d="m12 3 2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.9 6.7 19.5l1.2-6L3.4 9.3l6-.7Z"/>',
  candado: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  llave: '<circle cx="7.5" cy="12" r="4.5"/><path d="m10.5 14.5 8-8"/><path d="M18 10.5 19.5 12"/><path d="M16.5 8 18 9.5"/>',
  ayuda: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.2a2.9 2.9 0 0 1 5.5.9c0 1.9-2.8 2.6-2.8 4.1"/><path d="M12 17.5h.01"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',

  // --- Inventario de consumibles ---
  entrada: '<path d="M12 4v12"/><path d="M8 12l4 4 4-4"/><rect x="3" y="18" width="18" height="3" rx="1"/>',
  salida:  '<path d="M12 20V8"/><path d="M8 12l4-4 4 4"/><rect x="3" y="3" width="18" height="3" rx="1"/>',
  articulo: '<path d="M21 8.2 12 3 3 8.2v7.6L12 21l9-5.2Z"/><path d="M3 8.2 12 13.4l9-5.2"/><path d="M12 13.4V21"/>',
  'alerta-stock': '<path d="M12 2.5 2 20.5h20Z"/><path d="M12 9v5"/><circle cx="12" cy="17.5" r=".6" fill="currentColor"/>',
};

/**
 * Devuelve el SVG de un ícono como cadena lista para insertar en HTML.
 * @param {string} nombre Clave del ícono (ver TRAZOS).
 * @param {object} [opts]
 * @param {number} [opts.size=20] Tamaño en px.
 * @param {string} [opts.clase=''] Clases CSS extra.
 * @returns {string}
 */
export function icono(nombre, { size = 20, clase = '' } = {}) {
  const inner = TRAZOS[nombre];
  if (!inner) return '';
  return (
    `<svg class="ico ${clase}" width="${size}" height="${size}" viewBox="0 0 24 24" ` +
    `fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" ` +
    `stroke-linejoin="round" aria-hidden="true" focusable="false">${inner}</svg>`
  );
}
