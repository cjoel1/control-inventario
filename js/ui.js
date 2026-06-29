/**
 * ui.js
 * -------------------------------------------------------------
 * Componentes de interfaz reutilizables y sin dependencias:
 *  - notificaciones tipo "toast"
 *  - ventanas modales accesibles
 *  - diálogo de confirmación (Promise)
 *
 * Pensados para tablet: objetivos grandes y mensajes claros.
 * -------------------------------------------------------------
 */

import { esc } from './utils.js';
import { icono } from './icons.js';

/* ------------------------------- Notificaciones -------------------------- */

let _contenedorToast = null;

function contenedorToast() {
  if (!_contenedorToast) {
    _contenedorToast = document.createElement('div');
    _contenedorToast.className = 'toast-cont';
    _contenedorToast.setAttribute('aria-live', 'polite');
    document.body.appendChild(_contenedorToast);
  }
  return _contenedorToast;
}

/**
 * Muestra una notificación temporal.
 * @param {string} mensaje
 * @param {'info'|'exito'|'error'|'aviso'} [tipo='info']
 * @param {number} [ms=3500] Duración.
 */
export function toast(mensaje, tipo = 'info', ms = 3500) {
  const t = document.createElement('div');
  t.className = `toast toast-${tipo}`;
  t.setAttribute('role', tipo === 'error' ? 'alert' : 'status');
  t.textContent = mensaje;
  contenedorToast().appendChild(t);
  // Pequeño retraso para activar la animación de entrada.
  requestAnimationFrame(() => t.classList.add('visible'));
  const cerrar = () => {
    t.classList.remove('visible');
    setTimeout(() => t.remove(), 250);
  };
  const temporizador = setTimeout(cerrar, ms);
  t.addEventListener('click', () => { clearTimeout(temporizador); cerrar(); });
}

/* --------------------------------- Modal --------------------------------- */

/**
 * Abre una ventana modal con contenido HTML arbitrario.
 * @param {object} opciones
 * @param {string} opciones.titulo
 * @param {string} opciones.cuerpoHTML HTML del cuerpo (ya escapado por quien llama).
 * @param {(raiz:HTMLElement, cerrar:()=>void)=>void} [opciones.alAbrir] Para enlazar eventos.
 * @param {()=>void} [opciones.alCerrar] Se ejecuta al cerrarse por cualquier vía.
 * @param {string} [opciones.ancho] Ancho máximo CSS (ej. "640px").
 * @returns {{cerrar:()=>void, raiz:HTMLElement}}
 */
export function modal({ titulo, cuerpoHTML, alAbrir, alCerrar, ancho = '560px' }) {
  const fondo = document.createElement('div');
  fondo.className = 'modal-fondo';
  fondo.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-label="${esc(titulo)}" style="max-width:${ancho}">
      <div class="modal-cab">
        <h2 class="modal-titulo">${esc(titulo)}</h2>
        <button class="modal-cerrar" aria-label="Cerrar" type="button">${icono('cerrar')}</button>
      </div>
      <div class="modal-cuerpo">${cuerpoHTML}</div>
    </div>`;

  let cerrado = false;
  const cerrar = () => {
    if (cerrado) return;          // evita ejecutar alCerrar dos veces
    cerrado = true;
    document.removeEventListener('keydown', alPresionarTecla);
    fondo.classList.remove('visible');
    setTimeout(() => fondo.remove(), 200);
    if (alCerrar) alCerrar();
  };

  const alPresionarTecla = (e) => { if (e.key === 'Escape') cerrar(); };

  fondo.addEventListener('click', (e) => { if (e.target === fondo) cerrar(); });
  fondo.querySelector('.modal-cerrar').addEventListener('click', cerrar);
  document.addEventListener('keydown', alPresionarTecla);

  document.body.appendChild(fondo);
  requestAnimationFrame(() => fondo.classList.add('visible'));

  const raiz = fondo.querySelector('.modal-cuerpo');
  if (alAbrir) alAbrir(raiz, cerrar);

  // Llevamos el foco al primer campo o botón para accesibilidad.
  const foco = raiz.querySelector('input, select, textarea, button');
  if (foco) setTimeout(() => foco.focus(), 50);

  return { cerrar, raiz };
}

/* ----------------------------- Confirmación ------------------------------ */

/**
 * Diálogo de confirmación. Resuelve true/false según la elección.
 * @param {object} opciones
 * @param {string} opciones.mensaje
 * @param {string} [opciones.titulo='Confirmar']
 * @param {string} [opciones.textoSi='Aceptar']
 * @param {string} [opciones.textoNo='Cancelar']
 * @param {boolean} [opciones.peligroso=false] Resalta el botón de acción en rojo.
 * @returns {Promise<boolean>}
 */
export function confirmar({ mensaje, titulo = 'Confirmar', textoSi = 'Aceptar', textoNo = 'Cancelar', peligroso = false }) {
  return new Promise((resolve) => {
    let resuelto = false;
    const responder = (valor, cerrarModal) => {
      if (resuelto) return;
      resuelto = true;
      resolve(valor);
      if (cerrarModal) cerrarModal();
    };
    modal({
      titulo,
      ancho: '440px',
      cuerpoHTML: `
        <p class="modal-mensaje">${esc(mensaje)}</p>
        <div class="modal-acciones">
          <button type="button" class="btn btn-secundario" data-no>${esc(textoNo)}</button>
          <button type="button" class="btn ${peligroso ? 'btn-peligro' : 'btn-primario'}" data-si>${esc(textoSi)}</button>
        </div>`,
      alAbrir: (raiz, cerrarModal) => {
        raiz.querySelector('[data-no]').addEventListener('click', () => responder(false, cerrarModal));
        raiz.querySelector('[data-si]').addEventListener('click', () => responder(true, cerrarModal));
      },
      // Si se cierra con Escape o clic afuera, se considera "cancelar".
      alCerrar: () => responder(false, null),
    });
  });
}
