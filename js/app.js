/**
 * app.js — Main application entry point
 */

import { init as initStore, subscribe, getState, setTab } from './store.js';
import { renderIcons, ico } from './icons.js';
import { renderInicio, renderArticulos, renderCompras, renderHistorial, renderRespaldo, renderAjustes, renderOnboarding, renderProveedores, renderReportes } from './views.js';
import { toast, showPINScreen, showHelp } from './ui.js';
import { getTheme, setTheme, isOnboardingDone, getEmpresa, getPIN, removePIN, getRole } from './storage.js';
import { getActivationStatus, activateWithCode } from './activation.js';
import { crearSnapshot } from './backup.js';
import { openDB } from './db.js';
import { verificarAlertas } from './notifications.js';

// ── Service Worker ────────────────────────────────────────────────────────────

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(err => {
      console.warn('SW registration failed:', err);
    });
  });
}

// ── Activation check ──────────────────────────────────────────────────────────

function checkActivation() {
  const status = getActivationStatus();
  if (status.state === 'expired') {
    showLockScreen('Tu período de prueba ha vencido. Contacta al administrador para activar la aplicación.');
    return false;
  }
  if (status.state === 'inactive') {
    showActivationScreen();
    return false;
  }
  if (status.state === 'beta') {
    if (status.daysLeft <= 3) {
      toast(`Período de prueba: ${status.daysLeft} día${status.daysLeft !== 1 ? 's' : ''} restante${status.daysLeft !== 1 ? 's' : ''}`, 'error', 6000);
    } else if (status.daysLeft <= 7) {
      toast(`Período de prueba: ${status.daysLeft} días restantes`, 'aviso', 5000);
    }
  }
  return true;
}

function showLockScreen(msg) {
  const app = document.querySelector('.app');
  app.classList.add('app-bloqueada');
  document.getElementById('vista').innerHTML = `
    <div class="pantalla-lock">
      <div class="lock-card">
        <div class="lock-ico">${ico('candado', 48)}</div>
        <div class="lock-titulo">Aplicación bloqueada</div>
        <div class="lock-sub">${msg}</div>
        <div class="lock-campo">
          <span class="lock-etiqueta">ID del dispositivo</span>
          <div class="lock-id-fila">
            <div class="lock-id-val" id="lock-dev-id">Cargando…</div>
          </div>
          <div class="lock-ayuda">Proporciona este ID al administrador para recibir tu código de activación.</div>
        </div>
        <div class="lock-campo">
          <span class="lock-etiqueta">Código de activación</span>
          <input class="lock-input" type="text" id="lock-code" placeholder="XXXX-XXXX" autocomplete="off" spellcheck="false">
        </div>
        <button class="btn btn-primario lock-btn" id="lock-activate">Activar</button>
        <div class="lock-pie">Control de Inventario · Offline PWA</div>
      </div>
    </div>`;
  import('./storage.js').then(({ getDeviceId }) => {
    document.getElementById('lock-dev-id').textContent = getDeviceId();
  });
  document.getElementById('lock-activate').addEventListener('click', async () => {
    const code = document.getElementById('lock-code').value.trim();
    if (!code) return;
    const result = await activateWithCode(code);
    if (result.ok) {
      app.classList.remove('app-bloqueada');
      toast('Aplicación activada', 'exito');
      startApp();
    } else {
      document.getElementById('lock-code').classList.add('lock-input-error');
      toast(result.msg, 'error');
      setTimeout(() => document.getElementById('lock-code')?.classList.remove('lock-input-error'), 600);
    }
  });
}

function showActivationScreen() {
  showLockScreen('Activa la aplicación con el código proporcionado por el administrador.');
}

// ── Theme ─────────────────────────────────────────────────────────────────────

function applyTheme(tema) {
  document.documentElement.dataset.tema = tema;
  const btn = document.getElementById('tema-btn');
  if (btn) {
    const isDark = tema === 'oscuro';
    btn.innerHTML = `<span>${ico(isDark ? 'sol' : 'luna', 18)}</span><span class="tema-txt">${isDark ? 'Claro' : 'Oscuro'}</span>`;
  }
}

// ── Router ────────────────────────────────────────────────────────────────────

const TABS = ['inicio', 'articulos', 'compras', 'proveedores', 'historial', 'reportes', 'respaldo', 'ajustes'];
const ADMIN_TABS = ['reportes', 'respaldo', 'ajustes'];

async function renderTab(tab) {
  const vista = document.getElementById('vista');
  vista.innerHTML = '<div class="cargando"><span class="spinner"></span> Cargando…</div>';
  vista.scrollTo(0, 0);

  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.toggle('activo', link.dataset.ruta === tab);
  });

  document.title = {
    inicio: 'Inicio',
    articulos: 'Artículos',
    compras: 'Compras',
    proveedores: 'Proveedores',
    historial: 'Historial',
    reportes: 'Reportes',
    respaldo: 'Respaldo',
    ajustes: 'Ajustes',
  }[tab] + ' — Control de Inventario';

  switch (tab) {
    case 'inicio':       renderInicio(vista); break;
    case 'articulos':    renderArticulos(vista); break;
    case 'compras':      renderCompras(vista); break;
    case 'proveedores':  renderProveedores(vista); break;
    case 'historial':    renderHistorial(vista); break;
    case 'reportes':     renderReportes(vista); break;
    case 'respaldo':     await renderRespaldo(vista); break;
    case 'ajustes':      renderAjustes(vista); break;
  }
}

function handleRoute() {
  const hash = location.hash.replace('#/', '') || 'inicio';
  const tab = TABS.includes(hash) ? hash : 'inicio';
  if (ADMIN_TABS.includes(tab) && getRole() !== 'admin') {
    location.hash = '#/inicio';
    return;
  }
  setTab(tab);
}

// ── Brand bar ─────────────────────────────────────────────────────────────────

function updateBrand() {
  const { nombre, logo } = getEmpresa();
  document.getElementById('empresa-nombre').textContent = nombre;
  if (logo) {
    document.getElementById('empresa-logo').src = logo;
    document.getElementById('empresa-logo').hidden = false;
    document.getElementById('brand-mark').hidden = true;
  } else {
    const letra = nombre.trim().charAt(0).toUpperCase() || 'I';
    document.getElementById('brand-mark').textContent = letra;
    document.getElementById('brand-mark').hidden = false;
    document.getElementById('empresa-logo').hidden = true;
  }
}

// ── Daily snapshot ────────────────────────────────────────────────────────────

async function maybeAutoSnapshot() {
  try {
    const state = getState();
    if (state.articulos.length > 0) await crearSnapshot(false);
  } catch { /* silent */ }
}

// ── Command palette ───────────────────────────────────────────────────────────

function initCommandPalette() {
  const fondo = document.createElement('div');
  fondo.className = 'cmd-fondo';
  fondo.id = 'cmd-fondo';
  fondo.innerHTML = `
    <div class="cmd-box" role="dialog" aria-label="Búsqueda rápida">
      <div class="cmd-barra">
        ${ico('paleta', 20)}
        <input class="cmd-input" id="cmd-input" placeholder="Buscar artículos o ir a una sección…" autocomplete="off" spellcheck="false">
        <span class="cmd-kb">Esc</span>
      </div>
      <div class="cmd-resultados" id="cmd-resultados"></div>
    </div>`;
  document.body.appendChild(fondo);

  const SECCIONES = [
    { label: 'Inicio', ruta: 'inicio', icon: 'inicio' },
    { label: 'Artículos', ruta: 'articulos', icon: 'paquete' },
    { label: 'Compras', ruta: 'compras', icon: 'compras' },
    { label: 'Proveedores', ruta: 'proveedores', icon: 'proveedor' },
    { label: 'Historial', ruta: 'historial', icon: 'historial' },
    { label: 'Respaldo', ruta: 'respaldo', icon: 'respaldo' },
    { label: 'Ajustes', ruta: 'ajustes', icon: 'ajustes' },
  ];

  let activeIdx = -1;

  function open() {
    fondo.classList.add('visible');
    document.getElementById('cmd-input').value = '';
    renderResults('');
    setTimeout(() => document.getElementById('cmd-input')?.focus(), 60);
  }

  function close() {
    fondo.classList.remove('visible');
    activeIdx = -1;
  }

  function navigate(ruta) {
    close();
    location.hash = `#/${ruta}`;
  }

  function renderResults(q) {
    const res = document.getElementById('cmd-resultados');
    q = q.toLowerCase().trim();

    const secs = SECCIONES.filter(s => !q || s.label.toLowerCase().includes(q));
    const arts = getState().articulos
      .filter(a => !a.archived && (!q || a.name.toLowerCase().includes(q) || (a.code || '').toLowerCase().includes(q)))
      .slice(0, 8);

    let html = '';
    if (secs.length) {
      html += `<div class="cmd-grupo-titulo">Secciones</div>`;
      html += secs.map((s, i) => `<div class="cmd-item" data-ruta="${s.ruta}" data-idx="${i}">${ico(s.icon, 18)} ${s.label}</div>`).join('');
    }
    if (arts.length) {
      const off = secs.length;
      html += `<div class="cmd-grupo-titulo">Artículos</div>`;
      html += arts.map((a, i) => `<div class="cmd-item" data-art="${a.id}" data-idx="${off + i}">
        ${ico('paquete', 18)}
        <span>${a.name}</span>
        <span class="cmd-item-stock">${a.currentStock} ${a.unit}</span>
      </div>`).join('');
    }
    if (!html) html = `<div class="cmd-vacio">Sin resultados para "${q}"</div>`;
    res.innerHTML = html;
    activeIdx = -1;

    res.querySelectorAll('.cmd-item').forEach(el => {
      el.addEventListener('click', () => {
        if (el.dataset.ruta) navigate(el.dataset.ruta);
        else if (el.dataset.art) { navigate('articulos'); }
      });
    });
  }

  function moveActive(dir) {
    const items = document.querySelectorAll('.cmd-item');
    if (!items.length) return;
    items.forEach(el => el.classList.remove('activo'));
    activeIdx = (activeIdx + dir + items.length) % items.length;
    items[activeIdx].classList.add('activo');
    items[activeIdx].scrollIntoView({ block: 'nearest' });
  }

  document.getElementById('cmd-input').addEventListener('input', e => {
    renderResults(e.target.value);
  });

  document.getElementById('cmd-input').addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); moveActive(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); moveActive(-1); }
    else if (e.key === 'Enter') {
      const active = document.querySelector('.cmd-item.activo');
      if (active) {
        if (active.dataset.ruta) navigate(active.dataset.ruta);
        else if (active.dataset.art) { navigate('articulos'); }
      }
    } else if (e.key === 'Escape') close();
  });

  fondo.addEventListener('click', e => { if (e.target === fondo) close(); });

  window.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      fondo.classList.contains('visible') ? close() : open();
    }
    if (e.key === 'Escape' && fondo.classList.contains('visible')) close();
  });
}

// ── App start ─────────────────────────────────────────────────────────────────

async function startApp() {
  await openDB();
  await initStore();

  renderIcons();
  updateBrand();

  if (!isOnboardingDone()) {
    const vista = document.getElementById('vista');
    renderOnboarding(vista, () => {
      const pin = getPIN();
      if (pin) {
        showPINScreen(pin, (forgot) => {
          if (forgot) removePIN();
          location.hash = '#/inicio';
          continueAfterPin();
        });
      } else {
        location.hash = '#/inicio';
        continueAfterPin();
      }
    });
    return;
  }

  const pin = getPIN();
  if (pin) {
    showPINScreen(pin, (forgot) => {
      if (forgot) {
        removePIN();
        toast('PIN desactivado por seguridad', 'aviso');
      }
      continueAfterPin();
    });
    return;
  }

  continueAfterPin();
}

function updateSidebarForRole() {
  const isAdmin = getRole() === 'admin';
  document.querySelectorAll('[data-admin-only]').forEach(el => {
    el.style.display = isAdmin ? '' : 'none';
  });
  const roleEl = document.getElementById('rol-display');
  if (roleEl) {
    roleEl.textContent = isAdmin ? 'Admin' : 'Operador';
    roleEl.style.color = isAdmin ? 'var(--acento)' : 'var(--ambar)';
  }
}

function continueAfterPin() {
  subscribe((state) => {
    if (state.cargado) renderTab(state.tab);
  });

  window.addEventListener('hashchange', handleRoute);
  updateSidebarForRole();
  handleRoute();
  maybeAutoSnapshot();

  const state = getState();
  verificarAlertas(state);

  initCommandPalette();
}

// ── Theme + DOMContentLoaded ──────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const tema = getTheme();
  applyTheme(tema);
  renderIcons();

  document.getElementById('tema-btn').addEventListener('click', () => {
    const current = document.documentElement.dataset.tema || 'claro';
    const next = current === 'claro' ? 'oscuro' : 'claro';
    setTheme(next);
    applyTheme(next);
  });

  document.getElementById('ayuda-btn').addEventListener('click', () => showHelp());

  if (!checkActivation()) return;
  startApp();
});
