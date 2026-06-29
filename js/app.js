/**
 * app.js — Control de Inventario
 * -------------------------------------------------------------
 * Punto de entrada: arranca la app, aplica ajustes, registra el
 * Service Worker (para funcionar OFFLINE), construye el encabezado
 * y gestiona el enrutado por hash (#/inicio, #/articulos, …).
 * -------------------------------------------------------------
 */

import * as store from './store.js';
import * as vistas from './views.js';
import { toast, modal } from './ui.js';
import { estadoRecordatorioRespaldo } from './backup.js';
import { icono } from './icons.js';
import { esc } from './utils.js';
import { asegurarPersistencia } from './storage.js';
import { obtenerDeviceId, estaActivado, activar, obtenerEstadoActivacion } from './activation.js';
import { leerConfig } from './db.js';

/** Definición de rutas: hash → render. */
const RUTAS = {
  inicio:    { titulo: 'Inicio',    render: vistas.inicio },
  articulos: { titulo: 'Artículos', render: vistas.articulos },
  historial: { titulo: 'Historial', render: vistas.historial },
  respaldo:  { titulo: 'Respaldo',  render: vistas.respaldo },
  ajustes:   { titulo: 'Ajustes',   render: vistas.ajustes },
  ayuda:     { titulo: 'Ayuda',     render: vistas.ayuda },
};

let limpiarVistaActual = null;

function rutaActual() {
  const h = (location.hash || '').replace(/^#\/?/, '').trim();
  return RUTAS[h] ? h : 'inicio';
}

function enrutar() {
  if (typeof limpiarVistaActual === 'function') {
    try { limpiarVistaActual(); } catch (_) {}
    limpiarVistaActual = null;
  }

  const ruta = rutaActual();
  const main = document.getElementById('vista');
  main.scrollTop = 0;

  try {
    const resultado = RUTAS[ruta].render(main);
    if (typeof resultado === 'function') limpiarVistaActual = resultado;
  } catch (e) {
    console.error('Error al renderizar la vista:', e);
    main.innerHTML = `<div class="error-vista">Ocurrió un error al mostrar esta sección.<br><small>${esc(e.message)}</small></div>`;
  }

  document.querySelectorAll('.nav-link').forEach((a) => {
    a.classList.toggle('activo', a.dataset.ruta === ruta);
    if (a.dataset.ruta === ruta) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

function pintarIconos(raiz = document) {
  raiz.querySelectorAll('[data-ico]').forEach((el) => {
    if (!el.dataset.icoListo) {
      el.innerHTML = icono(el.dataset.ico);
      el.dataset.icoListo = '1';
    }
  });
}

function pintarEncabezado() {
  const c = store.config();
  const nombreTxt = (c.nombreEmpresa || 'Inventario').trim();

  const nombre = document.getElementById('empresa-nombre');
  if (nombre) nombre.textContent = nombreTxt;

  const logoEl = document.getElementById('empresa-logo');
  const marca = document.getElementById('brand-mark');
  if (c.logo) {
    if (logoEl) { logoEl.src = c.logo; logoEl.hidden = false; }
    if (marca) marca.hidden = true;
  } else {
    if (logoEl) { logoEl.removeAttribute('src'); logoEl.hidden = true; }
    if (marca) { marca.hidden = false; marca.textContent = (nombreTxt[0] || 'I').toUpperCase(); }
  }
}

function aplicarApariencia() {
  const c = store.config();
  vistas.aplicarTema(c.tema || 'claro');
  document.documentElement.classList.toggle('alto-contraste', !!c.altoContraste);
}

function registrarSW() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').catch((e) =>
    console.warn('No se pudo registrar el Service Worker:', e));
}

async function recordarRespaldo() {
  try {
    const estado = await estadoRecordatorioRespaldo();
    if (!estado) return;
    if (estado.nivel === 'error') {
      modal({
        titulo: '⚠️ Respaldo urgente',
        ancho: '420px',
        cuerpoHTML: `
          <div style="text-align:center;padding:8px 0">
            <p style="color:var(--rojo);font-weight:700;font-size:1.05rem;margin:0 0 10px">
              Llevas ${estado.dias} días sin hacer un respaldo
            </p>
            <p style="color:var(--texto-suave);margin:0 0 20px;line-height:1.6">
              Si la tablet falla hoy, <strong>perderías todo el inventario</strong>.
              Un respaldo tarda menos de 10 segundos.
            </p>
            <div class="modal-acciones" style="justify-content:center;gap:10px">
              <button class="btn btn-secundario" data-posponer>Recordarme mañana</button>
              <button class="btn btn-primario" data-ir-respaldo>Ir a Respaldo ahora</button>
            </div>
          </div>`,
        alAbrir: (raiz, cerrar) => {
          raiz.querySelector('[data-posponer]').addEventListener('click', cerrar);
          raiz.querySelector('[data-ir-respaldo]').addEventListener('click', () => {
            cerrar();
            location.hash = '#/respaldo';
            enrutar();
          });
        },
      });
    } else {
      const duracion = estado.nivel === 'aviso' ? 8000 : 5000;
      toast(estado.mensaje, estado.nivel, duracion);
    }
  } catch (_) { /* sin bloqueo */ }
}

async function verificarPINSiNecesario() {
  const pin = await leerConfig('__pin', null);
  if (!pin) return;

  return new Promise((resolve) => {
    const c = store.config();
    const inicial = (c.nombreEmpresa || 'I')[0].toUpperCase();
    const overlay = document.createElement('div');
    overlay.className = 'pin-overlay';
    overlay.innerHTML = `
      <div class="pin-card">
        <div class="pin-logo"><span class="pin-logo-marca">${esc(inicial)}</span></div>
        <p class="pin-titulo">${esc(c.nombreEmpresa || 'Control de Inventario')}</p>
        <p class="pin-sub">Ingresa tu PIN para continuar</p>
        <div class="pin-puntos" id="pin-puntos">
          ${'<span class="pin-punto"></span>'.repeat(4)}
        </div>
        <p class="pin-error-msg" id="pin-err"></p>
        <div class="pin-teclado">
          ${[1,2,3,4,5,6,7,8,9].map((n) => `<button class="pin-tecla" data-k="${n}">${n}</button>`).join('')}
          <div class="pin-tecla-vacia"></div>
          <button class="pin-tecla" data-k="0">0</button>
          <button class="pin-tecla" data-k="⌫">⌫</button>
        </div>
        <button class="pin-olv" id="pin-olv">¿Olvidé el PIN</button>
      </div>`;

    document.body.appendChild(overlay);

    let entrada = '';
    let intentos = 0;
    let bloqueado = false;

    const puntos = overlay.querySelectorAll('.pin-punto');
    const errEl = overlay.querySelector('#pin-err');
    const puntosDiv = overlay.querySelector('#pin-puntos');

    const actualizar = () => puntos.forEach((p, i) => p.classList.toggle('lleno', i < entrada.length));

    const intentarPIN = () => {
      if (entrada === pin) {
        overlay.classList.add('desbloqueando');
        setTimeout(() => { overlay.remove(); resolve(); }, 350);
      } else {
        intentos++;
        errEl.textContent = intentos >= 5
          ? 'Demasiados intentos. Espera 30 segundos.'
          : 'PIN incorrecto, intenta de nuevo.';
        puntosDiv.classList.add('agitando');
        setTimeout(() => puntosDiv.classList.remove('agitando'), 420);
        entrada = '';
        actualizar();
        if (intentos >= 5) {
          bloqueado = true;
          overlay.querySelectorAll('.pin-tecla').forEach((b) => { b.disabled = true; });
          setTimeout(() => {
            bloqueado = false;
            intentos = 0;
            errEl.textContent = '';
            overlay.querySelectorAll('.pin-tecla').forEach((b) => { b.disabled = false; });
          }, 30000);
        }
      }
    };

    overlay.addEventListener('click', (e) => {
      if (bloqueado) return;
      const btn = e.target.closest('.pin-tecla');
      if (!btn) return;
      const k = btn.dataset.k;
      if (k === '⌫') { entrada = entrada.slice(0, -1); errEl.textContent = ''; actualizar(); return; }
      if (entrada.length >= 4) return;
      entrada += k;
      actualizar();
      if (entrada.length === 4) setTimeout(intentarPIN, 80);
    });

    overlay.querySelector('#pin-olv').addEventListener('click', () => {
      errEl.textContent = 'Contacta al proveedor: 787-955-3363';
    });
  });
}

function configurarBotonTema() {
  const btn = document.getElementById('tema-btn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const nuevo = store.config().tema === 'oscuro' ? 'claro' : 'oscuro';
    await store.actualizarConfig({ tema: nuevo });
  });
}

function configurarBotonAyuda() {
  const btn = document.getElementById('ayuda-btn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    location.hash = '#/ayuda';
    enrutar();
  });
}

function mostrarBienvenidaSiAplica() {
  const c = store.config();
  if (c.bienvenidaVista || store.articulos().length > 0) return;

  const nombreEsDefault = !c.nombreEmpresa || c.nombreEmpresa === 'Mi Empresa';
  if (nombreEsDefault) {
    mostrarSetupEmpresa();
  } else {
    mostrarSeleccionDatos();
  }
}

function mostrarSetupEmpresa() {
  modal({
    titulo: '',
    ancho: '460px',
    cuerpoHTML: `
      <div class="bienvenida">
        <div class="ob-paso">Paso 1 de 2</div>
        <div class="bv-ico">${icono('empresa', { size: 30 })}</div>
        <h2>Configuración inicial</h2>
        <p>¿Cómo se llama la empresa, clínica o institución que usará este inventario?</p>
        <div class="campo">
          <label for="ob-empresa">Nombre de la empresa</label>
          <input id="ob-empresa" type="text" placeholder="Ej. Residencia Los Pinos"
            maxlength="60" autocomplete="organization" autocorrect="off" spellcheck="false">
        </div>
        <div class="modal-acciones" style="margin-top:18px">
          <button class="btn btn-primario btn-grande ob-continuar" style="width:100%">Continuar →</button>
        </div>
      </div>`,
    alAbrir: (raiz, cerrar) => {
      const input = raiz.querySelector('#ob-empresa');
      setTimeout(() => input.focus(), 150);
      const siguiente = async () => {
        const nombre = input.value.trim();
        if (!nombre) { input.focus(); return; }
        await store.actualizarConfig({ nombreEmpresa: nombre });
        cerrar();
        mostrarSeleccionDatos();
      };
      raiz.querySelector('.ob-continuar').addEventListener('click', siguiente);
      input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') siguiente(); });
    },
  });
}

function mostrarSeleccionDatos() {
  const c = store.config();
  const cerrarYMarcar = async (cerrar) => {
    await store.actualizarConfig({ bienvenidaVista: true });
    cerrar();
  };

  modal({
    titulo: '',
    ancho: '460px',
    cuerpoHTML: `
      <div class="bienvenida">
        <div class="ob-paso">Paso 2 de 2</div>
        <div class="bv-ico">${icono('articulo', { size: 30 })}</div>
        <h2>¡Listo, ${esc(c.nombreEmpresa || 'bienvenido')}!</h2>
        <p>Puedes cargar artículos de ejemplo para explorar la app, o empezar
           directamente con tu inventario real.</p>
        <div class="modal-acciones">
          <button class="btn btn-secundario" data-vacio>Empezar de cero</button>
          <button class="btn btn-primario" data-demo>Ver datos de ejemplo</button>
        </div>
      </div>`,
    alAbrir: (raiz, cerrar) => {
      raiz.querySelector('[data-vacio]').addEventListener('click', () => cerrarYMarcar(cerrar));
      raiz.querySelector('[data-demo]').addEventListener('click', async () => {
        try {
          await store.cargarDatosEjemplo();
          toast('Datos de ejemplo cargados. Puedes borrarlos cuando quieras.', 'exito', 5000);
        } catch (e) { toast('No se pudieron cargar los ejemplos.', 'error'); }
        await cerrarYMarcar(cerrar);
        location.hash = '#/inicio';
        enrutar();
      });
    },
  });
}

async function mostrarAvisoBetaSiAplica() {
  try {
    const est = await obtenerEstadoActivacion();
    if (est.estado !== 'beta') return;
    const d = est.diasRestantes;
    if (d <= 3) {
      toast(`⚠️ Tu período de prueba vence en ${d} día${d === 1 ? '' : 's'}. Contacta al proveedor para activar la licencia.`, 'error', 12000);
    } else if (d <= 7) {
      toast(`Tu período de prueba vence en ${d} días. Contacta al proveedor: 787-955-3363`, 'aviso', 9000);
    }
  } catch (_) { /* sin bloqueo */ }
}

async function mostrarPantallaActivacion() {
  registrarSW();

  const app = document.querySelector('.app');
  if (app) app.classList.add('app-bloqueada');

  const deviceId = await obtenerDeviceId();
  const est = await obtenerEstadoActivacion();
  const vista = document.getElementById('vista');

  const tituloLock = est.estado === 'expirado'
    ? 'Período de prueba vencido'
    : 'Instalación no activada';
  const subLock = est.estado === 'expirado'
    ? 'Tu período de prueba ha terminado. Contacta al proveedor para activar la licencia completa.'
    : 'Esta app requiere un código de activación del proveedor para funcionar.';

  vista.innerHTML = `
    <div class="pantalla-lock">
      <div class="lock-card">
        <div class="lock-ico">${icono(est.estado === 'expirado' ? 'reloj' : 'candado', { size: 32 })}</div>
        <h1 class="lock-titulo">${esc(tituloLock)}</h1>
        <p class="lock-sub">${esc(subLock)}</p>

        <div class="lock-campo">
          <span class="lock-etiqueta">ID del dispositivo</span>
          <div class="lock-id-fila">
            <code class="lock-id-val" id="lock-device-id">${esc(deviceId)}</code>
            <button class="btn btn-secundario btn-sm" id="lock-copiar">Copiar</button>
          </div>
          <span class="lock-ayuda">Comparte este ID con el proveedor para recibir tu código.</span>
        </div>

        <div class="lock-campo">
          <label class="lock-etiqueta" for="lock-codigo">Código de activación</label>
          <input class="lock-input" type="text" id="lock-codigo"
            placeholder="XXXX-XXXX  o  YYYYMMDD:XXXX-XXXX" maxlength="20"
            autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
        </div>

        <button class="btn btn-primario lock-btn" id="lock-activar">Activar</button>
        <p class="lock-pie">Control de Inventario · Licencia para una tablet</p>
      </div>
    </div>`;

  vista.querySelector('#lock-copiar').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(deviceId);
      const btn = vista.querySelector('#lock-copiar');
      btn.textContent = '✓ Copiado';
      setTimeout(() => { btn.textContent = 'Copiar'; }, 2000);
    } catch (_) {}
  });

  const inputCodigo = vista.querySelector('#lock-codigo');
  inputCodigo.addEventListener('input', () => {
    inputCodigo.value = inputCodigo.value.toUpperCase();
  });

  vista.querySelector('#lock-activar').addEventListener('click', async () => {
    const codigo = inputCodigo.value.trim();
    if (!codigo) { inputCodigo.focus(); return; }
    const ok = await activar(deviceId, codigo);
    if (ok) {
      location.reload();
    } else {
      inputCodigo.classList.add('lock-input-error');
      inputCodigo.value = '';
      inputCodigo.placeholder = 'Código incorrecto, intenta de nuevo';
      setTimeout(() => {
        inputCodigo.classList.remove('lock-input-error');
        inputCodigo.placeholder = 'XXXX-XXXX';
      }, 3000);
    }
  });
}

async function iniciar() {
  try {
    await store.cargar();
  } catch (e) {
    document.getElementById('vista').innerHTML =
      `<div class="error-vista">No se pudo abrir el almacenamiento del dispositivo.<br>
       <small>${esc(e.message)}</small><br>
       Verifica que el navegador no esté en modo privado.</div>`;
    return;
  }

  if (!(await estaActivado())) {
    mostrarPantallaActivacion();
    return;
  }

  await verificarPINSiNecesario();
  mostrarAvisoBetaSiAplica();

  aplicarApariencia();
  pintarIconos();
  pintarEncabezado();
  configurarBotonTema();
  configurarBotonAyuda();

  asegurarPersistencia();
  store.snapshotAutomaticoDiario();

  store.suscribir(() => {
    pintarEncabezado();
    aplicarApariencia();
  });

  window.addEventListener('hashchange', enrutar);
  enrutar();

  registrarSW();
  recordarRespaldo();
  mostrarBienvenidaSiAplica();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', iniciar);
} else {
  iniciar();
}
