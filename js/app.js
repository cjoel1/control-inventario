/**
 * app.js — Main application entry point
 */

import { init as initStore, subscribe, getState, setTab } from './store.js';
import { renderIcons, ico } from './icons.js';
import { renderInicio, renderArticulos, renderCompras, renderHistorial, renderRespaldo, renderAjustes, renderOnboarding } from './views.js';
import { toast, showPINScreen, showHelp } from './ui.js';
import { getTheme, setTheme, isOnboardingDone, getEmpresa, getPIN, removePIN } from './storage.js';
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

const TABS = ['inicio', 'articulos', 'compras', 'historial', 'respaldo', 'ajustes'];

async function renderTab(tab) {
  const vista = document.getElementById('vista');
  vista.innerHTML = '<div class="cargando"><span class="spinner"></span> Cargando…</div>';

  // Scroll to top on tab change
  vista.scrollTo(0, 0);

  // Update nav
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.toggle('activo', link.dataset.ruta === tab);
  });

  document.title = {
    inicio: 'Inicio',
    articulos: 'Artículos',
    compras: 'Compras',
    historial: 'Historial',
    respaldo: 'Respaldo',
    ajustes: 'Ajustes',
  }[tab] + ' — Control de Inventario';

  switch (tab) {
    case 'inicio':     renderInicio(vista); break;
    case 'articulos':  renderArticulos(vista); break;
    case 'compras':    renderCompras(vista); break;
    case 'historial':  renderHistorial(vista); break;
    case 'respaldo':   await renderRespaldo(vista); break;
    case 'ajustes':    renderAjustes(vista); break;
  }
}

function handleRoute() {
  const hash = location.hash.replace('#/', '') || 'inicio';
  const tab = TABS.includes(hash) ? hash : 'inicio';
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
    if (state.articulos.length > 0) {
      await crearSnapshot(false);
    }
  } catch { /* silent */ }
}

// ── App start ─────────────────────────────────────────────────────────────────

async function startApp() {
  await openDB();
  await initStore();

  const state = getState();

  // Icons
  renderIcons();

  // Brand
  updateBrand();

  // Onboarding
  if (!isOnboardingDone()) {
    const vista = document.getElementById('vista');
    renderOnboarding(vista, () => {
      // After onboarding, check PIN then start normal app flow
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

  // PIN check
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

function continueAfterPin() {
  // Subscribe to state changes → re-render current tab
  subscribe((state) => {
    if (state.cargado) renderTab(state.tab);
  });

  // Hash routing
  window.addEventListener('hashchange', handleRoute);
  handleRoute();

  // Daily snapshot
  maybeAutoSnapshot();

  // Notifications (check once per day)
  const state = getState();
  verificarAlertas(state);
}

// ── Theme toggle ──────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const tema = getTheme();
  applyTheme(tema);

  // Icons in nav (rendered statically in HTML but need SVG)
  renderIcons();

  document.getElementById('tema-btn').addEventListener('click', () => {
    const current = document.documentElement.dataset.tema || 'claro';
    const next = current === 'claro' ? 'oscuro' : 'claro';
    setTheme(next);
    applyTheme(next);
  });

  document.getElementById('ayuda-btn').addEventListener('click', () => showHelp());

  // Activation check then start
  if (!checkActivation()) return;
  startApp();
});
