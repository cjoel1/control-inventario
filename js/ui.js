/**
 * ui.js — Toast, modal, confirm, PIN screen helpers
 */

import { ico } from './icons.js';

// ── Toast ─────────────────────────────────────────────────────────────────────

let toastCont = null;

function getToastCont() {
  if (!toastCont) {
    toastCont = document.createElement('div');
    toastCont.className = 'toast-cont';
    document.body.appendChild(toastCont);
  }
  return toastCont;
}

export function toast(msg, tipo = 'info', duracion = 3500) {
  const cont = getToastCont();
  const t = document.createElement('div');
  t.className = `toast toast-${tipo}`;
  const icMap = { exito: 'check', error: 'alerta', aviso: 'alerta', info: 'info' };
  t.innerHTML = `<span class="ico">${ico(icMap[tipo] || 'info', 18)}</span><span>${msg}</span>`;
  cont.appendChild(t);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => t.classList.add('visible'));
  });
  const dismiss = () => {
    t.classList.remove('visible');
    t.addEventListener('transitionend', () => t.remove(), { once: true });
  };
  t.addEventListener('click', dismiss);
  setTimeout(dismiss, duracion);
}

// ── Modal ─────────────────────────────────────────────────────────────────────

let activeModal = null;

export function openModal({ titulo, cuerpo, acciones = '', ancho = 480, onClose } = {}) {
  closeModal();

  const fondo = document.createElement('div');
  fondo.className = 'modal-fondo';
  fondo.innerHTML = `
    <div class="modal" style="max-width:${ancho}px" role="dialog" aria-modal="true" aria-label="${titulo || 'Diálogo'}">
      ${titulo ? `<div class="modal-cab">
        <h2 class="modal-titulo">${titulo}</h2>
        <button class="modal-cerrar" aria-label="Cerrar">${ico('cerrar', 20)}</button>
      </div>` : ''}
      <div class="modal-cuerpo">${cuerpo || ''}</div>
      ${acciones ? `<div class="modal-acciones">${acciones}</div>` : ''}
    </div>`;

  document.body.appendChild(fondo);
  activeModal = fondo;

  fondo.querySelector('.modal-cerrar')?.addEventListener('click', () => closeModal());
  fondo.addEventListener('click', (e) => { if (e.target === fondo) closeModal(); });
  document.addEventListener('keydown', handleEsc);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => fondo.classList.add('visible'));
  });

  fondo._onClose = onClose;
  return fondo;
}

export function closeModal() {
  if (!activeModal) return;
  const m = activeModal;
  activeModal = null;
  m.classList.remove('visible');
  document.removeEventListener('keydown', handleEsc);
  m.addEventListener('transitionend', () => m.remove(), { once: true });
  if (m._onClose) m._onClose();
}

function handleEsc(e) {
  if (e.key === 'Escape') closeModal();
}

export function getModalBody() {
  return activeModal?.querySelector('.modal-cuerpo') || null;
}

// ── Confirm ───────────────────────────────────────────────────────────────────

export function confirmacion(msg, { peligro = false } = {}) {
  return new Promise(resolve => {
    const fondo = openModal({
      titulo: 'Confirmar',
      cuerpo: `<p class="modal-mensaje">${msg}</p>`,
      acciones: `<button class="btn btn-secundario" id="conf-no">Cancelar</button>
                 <button class="btn ${peligro ? 'btn-peligro' : 'btn-primario'}" id="conf-si">${peligro ? 'Eliminar' : 'Aceptar'}</button>`,
      onClose: () => resolve(false),
    });
    fondo.querySelector('#conf-si').addEventListener('click', () => { activeModal = fondo; closeModal(); resolve(true); });
    fondo.querySelector('#conf-no').addEventListener('click', () => { activeModal = fondo; closeModal(); resolve(false); });
  });
}

// ── Movement modal ────────────────────────────────────────────────────────────

export function modalMovimiento(art, tipoDefault, onConfirm) {
  const tipos = [
    { v: 'entrada', l: 'Entrada (+)', cls: 'btn-entrada' },
    { v: 'salida',  l: 'Salida (−)',  cls: 'btn-salida'  },
    { v: 'ajuste',  l: 'Ajuste',      cls: ''            },
  ];
  const segs = tipos.map(t =>
    `<button class="seg${t.v === tipoDefault ? ' activo' : ''}" data-tipo="${t.v}">${t.l}</button>`
  ).join('');

  const cuerpo = `
    <div class="accion-cab">
      <div class="accion-nombre">${art.name}</div>
      <div class="accion-stock">
        <span class="insignia ins-azul">Stock: <strong>${art.currentStock}</strong> ${art.unit}</span>
      </div>
    </div>
    <div class="seg-control" id="seg-tipo">${segs}</div>
    <div class="form" style="margin-top:16px">
      <div class="campo">
        <label id="qty-lbl">Cantidad</label>
        <input type="number" id="mov-qty" min="0" step="1" value="1" inputmode="numeric" placeholder="0">
      </div>
      <div class="campo">
        <label>Notas <small style="color:var(--texto-tenue)">(opcional)</small></label>
        <textarea id="mov-notas" rows="2" placeholder="Ej: Compra de reposición..."></textarea>
      </div>
    </div>`;

  const fondo = openModal({
    titulo: 'Registrar movimiento',
    cuerpo,
    acciones: `<button class="btn btn-secundario" id="mov-cancel">Cancelar</button>
               <button class="btn btn-primario" id="mov-ok">Registrar</button>`,
  });

  let tipo = tipoDefault;
  fondo.querySelectorAll('.seg').forEach(btn => {
    btn.addEventListener('click', () => {
      fondo.querySelectorAll('.seg').forEach(b => b.classList.remove('activo'));
      btn.classList.add('activo');
      tipo = btn.dataset.tipo;
      const lbl = fondo.querySelector('#qty-lbl');
      if (tipo === 'ajuste') lbl.textContent = 'Nuevo stock total';
      else lbl.textContent = 'Cantidad';
    });
  });

  fondo.querySelector('#mov-cancel').addEventListener('click', closeModal);
  fondo.querySelector('#mov-ok').addEventListener('click', () => {
    const qty = Number(fondo.querySelector('#mov-qty').value);
    const notas = fondo.querySelector('#mov-notas').value.trim();
    if (!qty || qty < 0) { toast('Ingresa una cantidad válida', 'error'); return; }
    closeModal();
    onConfirm({ tipo, qty, notas });
  });

  fondo.querySelector('#mov-qty').focus();
}

// ── PIN overlay ───────────────────────────────────────────────────────────────

export function showPINScreen(storedPIN, onUnlock) {
  const overlay = document.createElement('div');
  overlay.className = 'pin-overlay';
  overlay.innerHTML = `
    <div class="pin-card">
      <div class="pin-logo"><span class="pin-logo-marca">I</span></div>
      <h2 class="pin-titulo">Control de Inventario</h2>
      <p class="pin-sub">Ingresa tu PIN para continuar</p>
      <div class="pin-puntos" id="pin-puntos">
        <div class="pin-punto" data-i="0"></div>
        <div class="pin-punto" data-i="1"></div>
        <div class="pin-punto" data-i="2"></div>
        <div class="pin-punto" data-i="3"></div>
      </div>
      <p class="pin-error-msg" id="pin-error"></p>
      <div class="pin-teclado">
        ${[1,2,3,4,5,6,7,8,9].map(n => `<button class="pin-tecla" data-n="${n}">${n}</button>`).join('')}
        <div class="pin-tecla-vacia"></div>
        <button class="pin-tecla" data-n="0">0</button>
        <button class="pin-tecla" data-n="del">⌫</button>
      </div>
      <button class="pin-olv" id="pin-forgot">¿Olvidaste el PIN?</button>
    </div>`;

  document.body.appendChild(overlay);

  let entrada = '';
  let intentos = 0;
  const MAX = 5;
  const TIMEOUT = 30000;
  let bloqueado = false;

  const puntos = overlay.querySelectorAll('.pin-punto');
  const errorEl = overlay.querySelector('#pin-error');
  const teclas = overlay.querySelectorAll('.pin-tecla');

  function updateDots() {
    puntos.forEach((p, i) => p.classList.toggle('lleno', i < entrada.length));
  }

  function shake() {
    const puntosCont = overlay.querySelector('#pin-puntos');
    puntosCont.classList.add('agitando');
    puntosCont.addEventListener('animationend', () => puntosCont.classList.remove('agitando'), { once: true });
  }

  function lockOut() {
    bloqueado = true;
    teclas.forEach(t => { t.disabled = true; });
    let secs = 30;
    errorEl.textContent = `Demasiados intentos. Espera ${secs}s.`;
    const iv = setInterval(() => {
      secs--;
      if (secs <= 0) {
        clearInterval(iv);
        bloqueado = false;
        intentos = 0;
        entrada = '';
        updateDots();
        errorEl.textContent = '';
        teclas.forEach(t => { t.disabled = false; });
      } else {
        errorEl.textContent = `Demasiados intentos. Espera ${secs}s.`;
      }
    }, 1000);
  }

  overlay.querySelectorAll('.pin-tecla').forEach(btn => {
    btn.addEventListener('click', () => {
      if (bloqueado) return;
      const n = btn.dataset.n;
      if (n === 'del') { entrada = entrada.slice(0, -1); updateDots(); return; }
      if (entrada.length >= 4) return;
      entrada += n;
      updateDots();
      if (entrada.length === 4) {
        if (entrada === storedPIN) {
          overlay.classList.add('desbloqueando');
          overlay.addEventListener('transitionend', () => { overlay.remove(); onUnlock(); }, { once: true });
        } else {
          intentos++;
          shake();
          errorEl.textContent = intentos >= MAX ? '' : `PIN incorrecto (${MAX - intentos} intentos restantes)`;
          entrada = '';
          updateDots();
          if (intentos >= MAX) lockOut();
        }
      }
    });
  });

  overlay.querySelector('#pin-forgot').addEventListener('click', () => {
    overlay.remove();
    onUnlock(true);
  });
}

// ── Help / FAQ modal ──────────────────────────────────────────────────────────

export function showHelp() {
  const faqs = [
    { cat: 'General', q: '¿Qué es Control de Inventario?', a: 'Una PWA offline para gestionar el stock de consumibles como pañales, medicamentos y artículos de limpieza. Funciona sin internet.' },
    { cat: 'General', q: '¿Necesito crear una cuenta?', a: 'No. La app funciona completamente offline y almacena todo en tu dispositivo. No requiere registro ni internet.' },
    { cat: 'General', q: '¿Cómo instalo la app en mi teléfono?', a: 'En Android: abre la app en Chrome y toca el menú → "Instalar aplicación". En iOS: toca el botón de compartir → "Agregar a pantalla de inicio".' },
    { cat: 'Artículos', q: '¿Cómo agrego un artículo nuevo?', a: 'Ve a la sección Artículos y toca el botón "+ Nuevo artículo". Completa el nombre, categoría, unidad y stock inicial.' },
    { cat: 'Artículos', q: '¿Cómo registro una entrada de stock?', a: 'En la lista de artículos, toca el botón verde "+ Entrada" junto al artículo. Ingresa la cantidad recibida y confirma.' },
    { cat: 'Artículos', q: '¿Cómo registro una salida de stock?', a: 'Toca el botón rojo "− Salida" junto al artículo. Ingresa la cantidad consumida y confirma.' },
    { cat: 'Artículos', q: '¿Qué es un ajuste de stock?', a: 'Un ajuste establece el stock total directamente. Úsalo para correcciones después de un conteo físico.' },
    { cat: 'Artículos', q: '¿Cómo archivo un artículo?', a: 'Edita el artículo y usa la opción "Archivar". Los artículos archivados no aparecen en la lista principal pero se conservan en el historial.' },
    { cat: 'Alertas', q: '¿Qué es el stock mínimo?', a: 'Es el nivel de alerta. Cuando el stock cae por debajo de ese valor, el artículo aparece resaltado en Inicio y en la lista de artículos.' },
    { cat: 'Alertas', q: '¿Por qué el Inicio muestra alertas de stock?', a: 'El dashboard muestra los artículos con stock igual o inferior al mínimo configurado para que tomes acción rápidamente.' },
    { cat: 'Historial', q: '¿Puedo ver todos los movimientos de un artículo?', a: 'Sí. En la sección Historial filtra por artículo para ver todas sus entradas, salidas y ajustes con fecha y hora.' },
    { cat: 'Historial', q: '¿Cómo exporto el historial a Excel?', a: 'En la sección Historial toca "Exportar CSV". El archivo se puede abrir directamente en Excel o Google Sheets.' },
    { cat: 'Respaldo', q: '¿Cómo hago una copia de seguridad?', a: 'Ve a Respaldo → "Descargar respaldo JSON". Guarda el archivo en Google Drive, WhatsApp o correo para tenerlo seguro.' },
    { cat: 'Respaldo', q: '¿Cómo restauro mis datos?', a: 'Ve a Respaldo → "Restaurar respaldo" y selecciona el archivo JSON descargado previamente. Esto reemplazará todos los datos actuales.' },
    { cat: 'Respaldo', q: '¿Qué son los snapshots automáticos?', a: 'La app guarda automáticamente una copia diaria de tus datos (hasta 10 snapshots). Puedes restaurar cualquiera desde la sección Respaldo.' },
    { cat: 'Ajustes', q: '¿Cómo cambio el nombre de mi empresa?', a: 'Ve a Ajustes → "Empresa". Cambia el nombre y, opcionalmente, sube un logotipo. Aparecerá en la barra superior.' },
    { cat: 'Ajustes', q: '¿Cómo agrego categorías personalizadas?', a: 'Ve a Ajustes → "Categorías y unidades". Agrega o elimina categorías según las necesidades de tu negocio.' },
    { cat: 'Ajustes', q: '¿Puedo proteger la app con un PIN?', a: 'Sí. Ve a Ajustes → "Seguridad y PIN". Establece un PIN de 4 dígitos. Se pedirá cada vez que abras la app.' },
    { cat: 'Seguridad', q: '¿Qué pasa si olvido mi PIN?', a: 'En la pantalla del PIN toca "¿Olvidaste el PIN?" para acceder de emergencia. Esto desactiva el PIN.' },
    { cat: 'Seguridad', q: '¿Los datos se envían a algún servidor?', a: 'No. Todo se almacena localmente en tu dispositivo usando IndexedDB. No hay servidores ni conexiones externas.' },
  ];

  const grouped = {};
  faqs.forEach(f => {
    if (!grouped[f.cat]) grouped[f.cat] = [];
    grouped[f.cat].push(f);
  });

  let html = '<div class="faq-lista">';
  Object.entries(grouped).forEach(([cat, items]) => {
    html += `<div class="faq-cat">${cat}</div>`;
    items.forEach(f => {
      html += `<div class="faq-item">
        <button class="faq-q">${f.q} <span class="faq-chevron ico">${ico('chevron_abajo', 18)}</span></button>
        <div class="faq-r"><div class="faq-r-inner">${f.a}</div></div>
      </div>`;
    });
  });
  html += '</div>';

  const fondo = openModal({ titulo: 'Centro de Ayuda', cuerpo: html, ancho: 560 });
  fondo.querySelectorAll('.faq-q').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.faq-item');
      const wasOpen = item.classList.contains('abierto');
      fondo.querySelectorAll('.faq-item').forEach(i => i.classList.remove('abierto'));
      if (!wasOpen) item.classList.add('abierto');
    });
  });
}
