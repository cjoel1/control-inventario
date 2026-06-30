/**
 * views.js — All views: Inicio, Artículos, Historial, Respaldo, Ajustes + Onboarding
 */

import {
  getState, articulosActivos, articulosArchivados, articulosBajoStock,
  articulosSinStock, articulosPorVencer, articulosVencidos,
  filteredArticulos, filteredMovimientos, calcInventoryValue, topConsumidos,
  calcDiasRestantes, articulosPorAgotar, generarListaCompra,
  getProveedores, addProveedor, updateProveedor, deleteProveedor,
  getOrdenes, addOrden, updateOrden, deleteOrden, receiveOrden,
  addArticulo, updateArticulo, archiveArticulo, unarchiveArticulo,
  addMovimiento, bulkAjuste, setFiltroArticulos, setFiltroHistorial, resetData
} from './store.js';
import { ico } from './icons.js';
import { qrSVG } from './qr.js';
import { toast, openModal, closeModal, confirmacion, modalMovimiento } from './ui.js';
import {
  exportarJSON, importarJSON, exportarCSVArticulos, exportarCSVMovimientos,
  crearSnapshot, listarSnapshots, restaurarSnapshot, eliminarSnapshot,
  medirAlmacenamiento, importarCSVArticulos
} from './backup.js';
import {
  getCategories, setCategories, getUnits, setUnits,
  getEmpresa, setEmpresa, getPIN, setPIN, removePIN,
  defaultCategories, defaultUnits, markOnboardingDone,
  getRole, setRole
} from './storage.js';
import {
  notificacionesHabilitadas, notificacionesSoportadas,
  activarNotificaciones, desactivarNotificaciones
} from './notifications.js';
import {
  fmtFecha, fmtFechaHora, fmtMoneda, escape, stockClass,
  expiryClass, expiryDaysLeft, debounce, fileToBase64, resizeImage, parseCsvLine
} from './utils.js';

// ── Shared helpers ─────────────────────────────────────────────────────────────

function stockBadge(art) {
  const cls = stockClass(art.currentStock, art.minStock);
  const ins = { ok: 'ins-verde', bajo: 'ins-ambar', critico: 'ins-roja' };
  const labels = { ok: 'Normal', bajo: 'Bajo', critico: 'Sin stock' };
  return `<span class="insignia ${ins[cls]}">${labels[cls]}</span>`;
}

function expiryBadge(art) {
  if (!art.expiryDate) return '';
  const cls = expiryClass(art.expiryDate);
  const days = expiryDaysLeft(art.expiryDate);
  if (cls === 'vencido') return `<span class="insignia ins-roja">${ico('caducidad', 12)} Vencido</span>`;
  if (cls === 'critico') return `<span class="insignia ins-roja">${ico('caducidad', 12)} Vence en ${days}d</span>`;
  if (cls === 'proximo') return `<span class="insignia ins-ambar">${ico('caducidad', 12)} Vence en ${days}d</span>`;
  return `<span class="insignia ins-verde">${ico('caducidad', 12)} ${fmtFecha(art.expiryDate)}</span>`;
}

function tipoLabel(tipo) {
  if (tipo === 'entrada') return `<span class="badge-entrada">${ico('mas', 12)} Entrada</span>`;
  if (tipo === 'salida')  return `<span class="badge-salida">${ico('menos', 12)} Salida</span>`;
  return `<span class="badge-ajuste">${ico('ajustes', 12)} Ajuste</span>`;
}

// ── Chart helpers ──────────────────────────────────────────────────────────────

function donutSVG(ok, bajo, critico) {
  const r = 36, cx = 50, cy = 50, sw = 11;
  const C = 2 * Math.PI * r;
  const total = ok + bajo + critico;
  const t = total || 1;
  const seg = v => (v / t) * C;
  const okLen = seg(ok), bajoLen = seg(bajo), critLen = seg(critico);
  const circle = (len, offset, color) => len < 0.5 ? '' :
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${sw}"
      stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}"
      stroke-dashoffset="${offset.toFixed(2)}"
      transform="rotate(-90 ${cx} ${cy})"/>`;
  return `<svg width="104" height="104" viewBox="0 0 100 100">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--borde)" stroke-width="${sw}"/>
    ${circle(okLen, 0, 'var(--verde)')}
    ${circle(bajoLen, -okLen, 'var(--ambar)')}
    ${circle(critLen, -(okLen + bajoLen), 'var(--rojo)')}
    <text x="${cx}" y="47" text-anchor="middle" dominant-baseline="middle" font-size="22" font-weight="800" fill="currentColor">${total}</text>
    <text x="${cx}" y="63" text-anchor="middle" font-size="9" fill="var(--texto-tenue)">artículos</text>
  </svg>`;
}

function sparklineSVG(movimientos) {
  const days = 7, W = 196, H = 64, baseY = 46, chartH = 40;
  const colW = W / days;
  const labels = [], entradas = [], salidas = [];
  const now = Date.now();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now - i * 86400000);
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    labels.push(d.toLocaleDateString('es-MX', { weekday: 'short' }).slice(0, 2));
    const dm = movimientos.filter(m => m.at >= dayStart && m.at < dayStart + 86400000);
    entradas.push(dm.filter(m => m.type === 'entrada').reduce((s, m) => s + m.qty, 0));
    salidas.push(dm.filter(m => m.type === 'salida').reduce((s, m) => s + m.qty, 0));
  }
  const maxVal = Math.max(...entradas, ...salidas, 1);
  let bars = '';
  for (let i = 0; i < days; i++) {
    const cx = (i + 0.5) * colW;
    const eH = Math.max(2, (entradas[i] / maxVal) * chartH);
    const sH = Math.max(2, (salidas[i] / maxVal) * chartH);
    bars += `<rect x="${(cx-7).toFixed(1)}" y="${(baseY-eH).toFixed(1)}" width="6" height="${eH.toFixed(1)}" rx="1.5" fill="var(--verde)" opacity=".85"/>`;
    bars += `<rect x="${(cx+1).toFixed(1)}" y="${(baseY-sH).toFixed(1)}" width="6" height="${sH.toFixed(1)}" rx="1.5" fill="var(--rojo)" opacity=".75"/>`;
    bars += `<text x="${cx.toFixed(1)}" y="${H-3}" text-anchor="middle" font-size="8.5" fill="var(--texto-tenue)">${labels[i]}</text>`;
  }
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <line x1="0" y1="${baseY}" x2="${W}" y2="${baseY}" stroke="var(--borde)" stroke-width="1"/>
    ${bars}
  </svg>`;
}

// ── INICIO ─────────────────────────────────────────────────────────────────────

export function renderInicio(container) {
  const state = getState();
  const activos = articulosActivos();
  const bajoStock = articulosBajoStock();
  const sinStock = articulosSinStock();
  const vencidos = articulosVencidos();
  const porVencer = articulosPorVencer(30).filter(a => !vencidos.includes(a));
  const valor = calcInventoryValue();
  const top = topConsumidos(5);
  const artMap = {};
  activos.forEach(a => { artMap[a.id] = a; });
  const recientes = [...state.movimientos].sort((a, b) => b.at - a.at).slice(0, 6);

  const criticoCount = sinStock.length;
  const bajoCount = bajoStock.filter(a => a.currentStock > 0).length;
  const okCount = activos.length - bajoStock.length;

  const alertaVenc = (vencidos.length || porVencer.length) ? `
    <div class="alerta-stock" style="border-color:var(--ambar-borde);background:var(--ambar-suave)">
      <h3 style="color:var(--ambar)">${ico('caducidad', 16)} ${vencidos.length ? `${vencidos.length} artículo${vencidos.length>1?'s':''} vencido${vencidos.length>1?'s':''}` : ''}${vencidos.length && porVencer.length ? ' · ' : ''}${porVencer.length ? `${porVencer.length} por vencer` : ''}</h3>
      ${[...vencidos.map(a => ({a, label:'VENCIDO', color:'var(--rojo)'})), ...porVencer.map(a => ({a, label:`${expiryDaysLeft(a.expiryDate)}d`, color:'var(--ambar)'}))].map(({a, label, color}) => `
        <div class="alerta-stock-item">
          <span class="alerta-stock-nombre">${escape(a.name)}</span>
          <span style="color:${color};font-weight:700">${label}</span>
        </div>`).join('')}
    </div>` : '';

  const alertaStockHtml = bajoStock.length ? `
    <div class="alerta-stock">
      <h3>${ico('alerta', 16)} ${bajoStock.length} artículo${bajoStock.length>1?'s':''} con stock bajo</h3>
      ${bajoStock.map(a => `
        <div class="alerta-stock-item">
          <span class="alerta-stock-nombre">${escape(a.name)}</span>
          <span class="alerta-stock-qty">${a.currentStock} ${a.unit} <span style="color:var(--texto-tenue)">(mín. ${a.minStock})</span></span>
        </div>`).join('')}
    </div>` : '';

  const porAgotar = articulosPorAgotar(30);
  const pronosticoHtml = porAgotar.length ? `
    <div class="bloque">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:12px">
        <h2 style="margin:0">${ico('pronostico', 18)} Pronóstico de agotamiento</h2>
        <a href="#/compras" class="btn btn-sm btn-secundario">${ico('compras', 14)} Ver lista de pedido</a>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${porAgotar.slice(0, 6).map(({ art, dias, daily }) => {
          const urgente = dias <= 7;
          const proximo = dias <= 14;
          const color = urgente ? 'var(--rojo)' : proximo ? 'var(--ambar)' : 'var(--texto-suave)';
          const bg = urgente ? 'var(--rojo-suave)' : proximo ? 'var(--ambar-suave)' : 'var(--superficie-2)';
          return `<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:8px;background:${bg}">
            <div style="flex:1;min-width:0">
              <div style="font-weight:600;font-size:.88rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escape(art.name)}</div>
              <div style="font-size:.78rem;color:var(--texto-tenue)">${daily < 1 ? (daily * 7).toFixed(1)+'/sem' : daily.toFixed(1)+'/día'} · Stock: ${art.currentStock} ${art.unit}</div>
            </div>
            <div style="text-align:right;flex-shrink:0">
              <div style="font-weight:800;font-size:1rem;color:${color}">${dias}d</div>
              <div style="font-size:.72rem;color:${color}">restantes</div>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>` : '';

  const topHtml = top.length ? `
    <div class="bloque">
      <h2>${ico('tendencia', 18)} Top consumidos</h2>
      <div style="display:flex;flex-direction:column;gap:8px;margin-top:12px">
        ${top.map(({art, total}) => {
          const max = top[0].total;
          return `<div style="display:flex;align-items:center;gap:10px">
            <div style="min-width:130px;font-size:.88rem;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escape(art.name)}</div>
            <div style="flex:1;height:8px;background:var(--borde);border-radius:4px;overflow:hidden">
              <div style="height:100%;width:${Math.round(total/max*100)}%;background:var(--acento);border-radius:4px;transition:width .4s"></div>
            </div>
            <div style="font-size:.82rem;color:var(--texto-suave);min-width:40px;text-align:right">${total} ${art.unit}</div>
          </div>`;
        }).join('')}
      </div>
    </div>` : '';

  const recientesHtml = recientes.length ? `
    <div class="bloque">
      <h2>${ico('historial', 18)} Últimos movimientos</h2>
      <div class="tabla-scroll" style="margin-top:12px">
        <table class="tabla">
          <thead><tr><th>Artículo</th><th>Tipo</th><th class="num">Cant.</th><th>Hace</th></tr></thead>
          <tbody>
            ${recientes.map(m => {
              const art = artMap[m.articuloId];
              const hace = (() => {
                const mins = Math.floor((Date.now() - m.at) / 60000);
                if (mins < 60) return `${mins}m`;
                if (mins < 1440) return `${Math.floor(mins/60)}h`;
                return `${Math.floor(mins/1440)}d`;
              })();
              return `<tr>
                <td class="celda-nombre">${art ? escape(art.name) : '—'}</td>
                <td>${tipoLabel(m.type)}</td>
                <td class="num mono">${m.qty}</td>
                <td style="color:var(--texto-tenue);font-size:.82rem">${hace}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>` : '';

  const emptyState = !activos.length ? `
    <div class="estado-vacio">
      <div class="ev-ico">${ico('paquete', 30)}</div>
      <h3>Sin artículos aún</h3>
      <p>Ve a <strong>Artículos</strong> para agregar los productos de tu inventario.</p>
    </div>` : '';

  container.innerHTML = `
    <div class="vista">
      <h1 class="titulo-vista">${ico('inicio', 22)} Inicio</h1>
      <p class="subtitulo-vista">Resumen del inventario</p>

      <div class="tarjetas">
        <div class="tarjeta">
          <div class="tarjeta-ico">${ico('paquete', 22)}</div>
          <div class="tarjeta-cuerpo">
            <div class="tarjeta-valor">${activos.length}</div>
            <div class="tarjeta-etiqueta">Artículos activos</div>
          </div>
        </div>
        <div class="tarjeta${valor > 0 ? '' : ''}">
          <div class="tarjeta-ico" style="background:var(--verde-suave);color:var(--verde)">${ico('valor', 22)}</div>
          <div class="tarjeta-cuerpo">
            <div class="tarjeta-valor" style="font-size:1.35rem">$${fmtMoneda(valor)}</div>
            <div class="tarjeta-etiqueta">Valor del inventario</div>
          </div>
        </div>
        <div class="tarjeta${bajoStock.length ? ' t-aviso' : ' t-ok'}">
          <div class="tarjeta-ico">${ico('alerta', 22)}</div>
          <div class="tarjeta-cuerpo">
            <div class="tarjeta-valor">${bajoStock.length}</div>
            <div class="tarjeta-etiqueta">Stock bajo</div>
          </div>
        </div>
        <div class="tarjeta${vencidos.length ? ' t-alerta' : porVencer.length ? ' t-aviso' : ' t-ok'}">
          <div class="tarjeta-ico">${ico('caducidad', 22)}</div>
          <div class="tarjeta-cuerpo">
            <div class="tarjeta-valor">${vencidos.length + porVencer.length}</div>
            <div class="tarjeta-etiqueta">Vencidos / Por vencer</div>
          </div>
        </div>
      </div>

      ${activos.length ? `
      <div style="display:grid;grid-template-columns:auto 1fr;gap:14px;margin-bottom:4px;align-items:start">
        <div class="bloque" style="padding:16px 18px">
          <div style="font-size:.75rem;color:var(--texto-tenue);font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">Estado del stock</div>
          ${donutSVG(okCount, bajoCount, criticoCount)}
          <div style="display:flex;flex-direction:column;gap:5px;margin-top:10px;font-size:.8rem">
            <div style="display:flex;align-items:center;gap:6px"><span style="width:8px;height:8px;background:var(--verde);border-radius:50%;flex-shrink:0"></span>Normal: <strong>${okCount}</strong></div>
            <div style="display:flex;align-items:center;gap:6px"><span style="width:8px;height:8px;background:var(--ambar);border-radius:50%;flex-shrink:0"></span>Bajo: <strong>${bajoCount}</strong></div>
            <div style="display:flex;align-items:center;gap:6px"><span style="width:8px;height:8px;background:var(--rojo);border-radius:50%;flex-shrink:0"></span>Crítico: <strong>${criticoCount}</strong></div>
          </div>
        </div>
        <div class="bloque" style="padding:16px 18px">
          <div style="font-size:.75rem;color:var(--texto-tenue);font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">Movimientos — últimos 7 días</div>
          ${sparklineSVG(state.movimientos)}
          <div style="display:flex;gap:14px;margin-top:8px;font-size:.8rem">
            <div style="display:flex;align-items:center;gap:5px"><span style="width:10px;height:8px;background:var(--verde);border-radius:2px;flex-shrink:0;opacity:.85"></span>Entradas</div>
            <div style="display:flex;align-items:center;gap:5px"><span style="width:10px;height:8px;background:var(--rojo);border-radius:2px;flex-shrink:0;opacity:.75"></span>Salidas</div>
          </div>
        </div>
      </div>` : ''}

      ${alertaVenc}
      ${alertaStockHtml}
      ${pronosticoHtml}
      ${topHtml}
      ${recientesHtml}
      ${emptyState}
    </div>`;
}

// ── ARTÍCULOS ──────────────────────────────────────────────────────────────────

export function renderArticulos(container) {
  const isAdmin = getRole() === 'admin';
  const state = getState();
  const cats = ['todos', ...getCategories()];
  const { busqueda, categoria, orden, vista } = state.filtros.articulos;
  const lista = filteredArticulos();

  const chips = cats.map(c =>
    `<button class="cat-chip${(categoria || 'todos') === c ? ' activo' : ''}" data-cat="${c}">
      ${c === 'todos' ? 'Todos' : escape(c)}
    </button>`
  ).join('');

  const artCards = lista.map(a => {
    const cls = stockClass(a.currentStock, a.minStock);
    const expCls = expiryClass(a.expiryDate);
    const hasAlert = cls !== 'ok' || (expCls && expCls !== 'ok');
    return `
      <div class="art-card${cls === 'critico' ? ' sin-stock' : cls === 'bajo' ? ' bajo-min' : expCls === 'vencido' || expCls === 'critico' ? ' sin-stock' : ''}" data-id="${a.id}">
        <div class="art-cab">
          ${a.photo ? `<img src="${a.photo}" alt="${escape(a.name)}" class="art-foto" loading="lazy">` : ''}
          <div class="art-info">
            <div class="art-nombre">${escape(a.name)}${a.code ? ` <span class="art-codigo">#${escape(a.code)}</span>` : ''}</div>
            <div class="art-meta">
              ${escape(a.category)}${a.location ? ` · ${ico('ubicacion', 12)} ${escape(a.location)}` : ''}${a.supplier ? ` · ${ico('proveedor', 12)} ${escape(a.supplier)}` : ''}
            </div>
            <div class="art-badges" style="margin-top:4px;display:flex;gap:4px;flex-wrap:wrap">
              ${expiryBadge(a)}
              ${a.cost > 0 ? `<span class="insignia ins-azul">${ico('valor', 11)} $${fmtMoneda(a.cost)}</span>` : ''}
            </div>
          </div>
          <div class="art-stock-area">
            <div class="stock-val ${cls}">${a.currentStock}</div>
            <div style="font-size:.75rem;color:var(--texto-suave)">${escape(a.unit)}</div>
            ${a.minStock > 0 ? `<div class="stock-barra-cont" style="width:56px"><div class="stock-barra ${cls}" style="width:${Math.min(100, a.currentStock / (a.minStock * 2) * 100)}%"></div></div>` : ''}
          </div>
        </div>
        <div class="art-acciones">
          <button class="btn btn-sm btn-entrada" data-action="entrada" data-id="${a.id}">${ico('mas', 14)} Entrada</button>
          <button class="btn btn-sm btn-salida" data-action="salida" data-id="${a.id}">${ico('menos', 14)} Salida</button>
          ${isAdmin ? `<button class="btn btn-sm btn-icono" data-action="editar" data-id="${a.id}" title="Editar">${ico('editar', 16)}</button>` : ''}
          ${isAdmin ? `<button class="btn btn-sm btn-icono" data-action="archivar" data-id="${a.id}" title="Archivar">${ico('archivo', 16)}</button>` : ''}
        </div>
      </div>`;
  }).join('');

  container.innerHTML = `
    <div class="vista">
      <div class="cab-vista">
        <div>
          <h1 class="titulo-vista">${ico('paquete', 22)} Artículos</h1>
          <p class="subtitulo-vista">${lista.length} artículo${lista.length !== 1 ? 's' : ''}</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-secundario btn-sm" id="btn-escanear" title="Escanear QR">${ico('escaner', 16)} Escanear</button>
          ${isAdmin ? `<button class="btn btn-secundario btn-sm" id="btn-conteo" title="Modo conteo">${ico('conteo', 16)} Conteo</button>` : ''}
          ${isAdmin ? `<button class="btn btn-secundario btn-sm" id="btn-etiquetas" title="Imprimir etiquetas QR">${ico('qr', 16)} Etiquetas</button>` : ''}
          ${isAdmin ? `<button class="btn btn-primario" id="btn-nuevo">${ico('mas', 18)} Nuevo</button>` : ''}
        </div>
      </div>

      <div class="barra-busqueda">
        <span class="ico-busq ico">${ico('buscar', 18)}</span>
        <input type="search" id="busq-art" placeholder="Buscar por nombre, código, ubicación…" value="${escape(busqueda)}">
      </div>

      <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap">
        <div class="cat-filtros" style="flex:1;margin:0">${chips}</div>
        <select id="art-orden" style="width:auto;min-height:38px;font-size:.85rem;padding:6px 10px">
          <option value="nombre"${orden==='nombre'?' selected':''}>A–Z</option>
          <option value="stock_asc"${orden==='stock_asc'?' selected':''}>Stock ↑</option>
          <option value="stock_desc"${orden==='stock_desc'?' selected':''}>Stock ↓</option>
          <option value="vencimiento"${orden==='vencimiento'?' selected':''}>Vencimiento</option>
          <option value="categoria"${orden==='categoria'?' selected':''}>Categoría</option>
        </select>
      </div>

      <div class="art-lista" id="art-lista">
        ${lista.length ? artCards : `<div class="estado-vacio">
          <div class="ev-ico">${ico('paquete', 30)}</div>
          <h3>Sin resultados</h3>
          <p>${busqueda || categoria !== 'todos' ? 'Prueba con otros filtros.' : 'Agrega tu primer artículo.'}</p>
        </div>`}
      </div>
    </div>`;

  container.querySelector('#btn-nuevo')?.addEventListener('click', () => modalArticulo(null));
  container.querySelector('#btn-escanear').addEventListener('click', () => modalEscanear());
  container.querySelector('#btn-conteo')?.addEventListener('click', () => modalConteo());
  container.querySelector('#btn-etiquetas')?.addEventListener('click', () => imprimirEtiquetas(filteredArticulos()));

  container.querySelector('#busq-art').addEventListener('input', debounce(e => {
    setFiltroArticulos({ busqueda: e.target.value });
  }, 250));

  container.querySelector('#art-orden').addEventListener('change', e => {
    setFiltroArticulos({ orden: e.target.value });
  });

  container.querySelectorAll('.cat-chip').forEach(chip => {
    chip.addEventListener('click', () => setFiltroArticulos({ categoria: chip.dataset.cat }));
  });

  container.querySelector('#art-lista').addEventListener('click', async e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const { action, id } = btn.dataset;
    const art = getState().articulos.find(a => a.id === id);
    if (!art) return;
    if (action === 'entrada') modalMovimiento(art, 'entrada', async ({ tipo, qty, notas }) => {
      await addMovimiento({ articuloId: id, type: tipo, qty, notes: notas });
      toast(`+${qty} ${art.unit} registrado`, 'exito');
    });
    else if (action === 'salida') modalMovimiento(art, 'salida', async ({ tipo, qty, notas }) => {
      await addMovimiento({ articuloId: id, type: tipo, qty, notes: notas });
      toast(`−${qty} ${art.unit} registrado`, 'exito');
    });
    else if (action === 'editar') modalArticulo(art);
    else if (action === 'archivar') {
      const ok = await confirmacion(`¿Archivar "${art.name}"?`);
      if (ok) { await archiveArticulo(id); toast('Artículo archivado', 'info'); }
    }
  });
}

// ── Modal Artículo (nuevo/editar) ─────────────────────────────────────────────

function modalArticulo(art) {
  const cats = getCategories();
  const units = getUnits();
  const es_nuevo = !art;
  let fotoDataUrl = art?.photo || null;

  const cuerpo = `
    <form class="form" id="form-articulo" autocomplete="off">
      <div style="display:flex;gap:12px;align-items:flex-start">
        <label class="art-foto-upload" id="foto-upload-lbl" title="Subir foto" style="cursor:pointer;flex-shrink:0">
          <div id="foto-preview" style="width:72px;height:72px;border-radius:10px;border:2px dashed var(--borde);display:flex;align-items:center;justify-content:center;background:var(--superficie-2);overflow:hidden">
            ${fotoDataUrl ? `<img src="${fotoDataUrl}" style="width:100%;height:100%;object-fit:cover">` : `<span style="color:var(--texto-tenue)">${ico('foto', 24)}</span>`}
          </div>
          <input type="file" id="art-foto" accept="image/*" style="display:none">
        </label>
        <div class="campo" style="flex:1">
          <label>Nombre <span style="color:var(--rojo)">*</span></label>
          <input id="art-name" type="text" placeholder="Ej: Pañales Talla M" required value="${art ? escape(art.name) : ''}">
        </div>
      </div>

      <div class="fila-2">
        <div class="campo">
          <label>Categoría</label>
          <select id="art-cat">
            ${cats.map(c => `<option value="${escape(c)}"${art?.category===c?' selected':''}>${escape(c)}</option>`).join('')}
          </select>
        </div>
        <div class="campo">
          <label>Unidad</label>
          <select id="art-unit">
            ${units.map(u => `<option value="${escape(u)}"${art?.unit===u?' selected':''}>${escape(u)}</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="fila-3">
        <div class="campo">
          <label>${es_nuevo ? 'Stock inicial' : 'Stock actual'}</label>
          <input id="art-stock" type="number" min="0" step="1" value="${art?.currentStock ?? 0}" inputmode="numeric">
        </div>
        <div class="campo">
          <label>Stock mínimo</label>
          <input id="art-min" type="number" min="0" step="1" value="${art?.minStock ?? 0}" inputmode="numeric">
        </div>
        <div class="campo">
          <label>Costo unitario</label>
          <input id="art-cost" type="number" min="0" step="0.01" value="${art?.cost ?? 0}" inputmode="decimal" placeholder="0.00">
        </div>
      </div>

      <div class="fila-2">
        <div class="campo">
          <label>${ico('ubicacion', 14)} Ubicación</label>
          <input id="art-location" type="text" placeholder="Ej: Estante A3, Bodega 1" value="${art ? escape(art.location||'') : ''}">
        </div>
        <div class="campo">
          <label>${ico('proveedor', 14)} Proveedor</label>
          <input id="art-supplier" type="text" placeholder="Ej: Farmacia Central" value="${art ? escape(art.supplier||'') : ''}">
        </div>
      </div>

      <div class="fila-2">
        <div class="campo">
          <label>Código / SKU</label>
          <input id="art-code" type="text" placeholder="Ej: PAM-M" value="${art ? escape(art.code||'') : ''}">
        </div>
        <div class="campo">
          <label>${ico('caducidad', 14)} Fecha de vencimiento</label>
          <input id="art-expiry" type="date" value="${art?.expiryDate ? art.expiryDate.slice(0,10) : ''}">
        </div>
      </div>

      <div class="campo">
        <label>Notas</label>
        <textarea id="art-notes" rows="2" placeholder="Observaciones, instrucciones…">${art ? escape(art.notes||'') : ''}</textarea>
      </div>
    </form>`;

  const fondo = openModal({
    titulo: es_nuevo ? 'Nuevo artículo' : 'Editar artículo',
    cuerpo,
    acciones: `${!es_nuevo ? `<button class="btn btn-secundario btn-sm" id="art-qr" style="margin-right:auto">${ico('qr', 15)} Ver QR</button>` : ''}
               <button class="btn btn-secundario" id="art-cancel">Cancelar</button>
               <button class="btn btn-primario" id="art-save">${ico('guardar', 16)} ${es_nuevo ? 'Crear' : 'Guardar'}</button>`,
    ancho: 540,
  });

  // Photo upload
  fondo.querySelector('#art-foto').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    const b64 = await fileToBase64(file);
    fotoDataUrl = await resizeImage(b64);
    const prev = fondo.querySelector('#foto-preview');
    prev.innerHTML = `<img src="${fotoDataUrl}" style="width:100%;height:100%;object-fit:cover">`;
  });

  fondo.querySelector('#art-cancel').addEventListener('click', closeModal);
  fondo.querySelector('#art-save').addEventListener('click', async () => {
    const name = fondo.querySelector('#art-name').value.trim();
    if (!name) { toast('El nombre es requerido', 'error'); return; }
    const data = {
      name, photo: fotoDataUrl,
      category: fondo.querySelector('#art-cat').value,
      unit: fondo.querySelector('#art-unit').value,
      currentStock: Number(fondo.querySelector('#art-stock').value) || 0,
      minStock: Number(fondo.querySelector('#art-min').value) || 0,
      cost: Number(fondo.querySelector('#art-cost').value) || 0,
      location: fondo.querySelector('#art-location').value.trim(),
      supplier: fondo.querySelector('#art-supplier').value.trim(),
      code: fondo.querySelector('#art-code').value.trim(),
      expiryDate: fondo.querySelector('#art-expiry').value || null,
      notes: fondo.querySelector('#art-notes').value.trim(),
    };
    closeModal();
    if (es_nuevo) { await addArticulo(data); toast('Artículo creado', 'exito'); }
    else { await updateArticulo(art.id, data); toast('Artículo actualizado', 'exito'); }
  });

  fondo.querySelector('#art-qr')?.addEventListener('click', () => {
    closeModal();
    mostrarQRArt(art);
  });

  fondo.querySelector('#art-name').focus();
}

// ── QR Code display ───────────────────────────────────────────────────────────

function mostrarQRArt(art) {
  const qrSvg = qrSVG(art.code || art.id, 200);
  openModal({
    titulo: 'Código QR',
    cuerpo: `
      <div style="text-align:center;padding:8px 0">
        <div style="display:inline-block;background:#fff;padding:16px;border-radius:12px;border:1px solid var(--borde)">
          ${qrSvg}
        </div>
        <div style="margin-top:12px;font-weight:700;font-size:1rem">${escape(art.name)}</div>
        ${art.code ? `<div style="color:var(--texto-tenue);font-size:.85rem;margin-top:2px">#${escape(art.code)}</div>` : ''}
        <div style="margin-top:12px;font-size:.8rem;color:var(--texto-suave)">Escanea este código para localizar el artículo</div>
      </div>`,
    acciones: `<button class="btn btn-secundario" id="qr-print">${ico('imprimir', 16)} Imprimir</button>
               <button class="btn btn-primario" onclick="this.closest('.modal-fondo').remove()">Cerrar</button>`,
    ancho: 340,
  });
  document.querySelector('#qr-print')?.addEventListener('click', () => window.print());
}


// ── Scanner modal (BarcodeDetector / manual) ──────────────────────────────────

async function modalEscanear() {
  const hasBD = 'BarcodeDetector' in window;

  const cuerpo = `
    <div class="escaner">
      ${hasBD ? `
        <div class="escaner-video" id="scan-container">
          <video id="scan-video" autoplay playsinline muted></video>
          <div class="escaner-marco"></div>
        </div>
        <p class="escaner-estado" id="scan-estado">Apunta la cámara al código QR del artículo</p>
        <div class="escaner-botones">
          <button class="btn btn-secundario btn-sm" id="btn-scan-stop">${ico('cerrar', 15)} Detener</button>
        </div>
        <div style="text-align:center;color:var(--texto-suave);font-size:.82rem;margin:6px 0">— o ingresa manualmente —</div>` : `
        <p style="color:var(--texto-suave);font-size:.88rem;margin-bottom:12px">Tu navegador no soporta escaneo automático. Ingresa el código manualmente:</p>`}
      <div class="campo">
        <label>Código / ID del artículo</label>
        <input type="text" id="scan-manual" placeholder="Ej: PAM-M o escribe el nombre">
      </div>
      <div id="scan-resultados" class="lista-resultados"></div>
    </div>`;

  const fondo = openModal({ titulo: `${ico('escaner',18)} Escanear artículo`, cuerpo, ancho: 480 });

  let stream = null;
  let detector = null;
  let scanning = false;

  const estado = fondo.querySelector('#scan-estado');
  const resultados = fondo.querySelector('#scan-resultados');
  const manual = fondo.querySelector('#scan-manual');

  function mostrarResultados(q) {
    const arts = articulosActivos();
    const q2 = q.toLowerCase();
    const matches = arts.filter(a =>
      a.name.toLowerCase().includes(q2) ||
      (a.code && a.code.toLowerCase().includes(q2)) ||
      a.id === q
    ).slice(0, 5);
    resultados.innerHTML = matches.map(a => `
      <button class="resultado" data-id="${a.id}">
        ${a.photo ? `<img src="${a.photo}" style="width:40px;height:40px;object-fit:cover;border-radius:6px">` : ''}
        <div class="resultado-nombre">${escape(a.name)}</div>
        <div class="resultado-stock">${a.currentStock} ${a.unit}</div>
      </button>`).join('');
    resultados.querySelectorAll('.resultado').forEach(btn => {
      btn.addEventListener('click', () => {
        const art = articulosActivos().find(a => a.id === btn.dataset.id);
        if (!art) return;
        closeModal();
        modalMovimiento(art, 'salida', async ({ tipo, qty, notas }) => {
          await addMovimiento({ articuloId: art.id, type: tipo, qty, notes: notas });
          toast(`Movimiento registrado: ${art.name}`, 'exito');
        });
      });
    });
  }

  manual.addEventListener('input', debounce(e => {
    if (e.target.value.trim()) mostrarResultados(e.target.value.trim());
    else resultados.innerHTML = '';
  }, 200));

  if (hasBD) {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      const video = fondo.querySelector('#scan-video');
      video.srcObject = stream;
      detector = new BarcodeDetector({ formats: ['qr_code', 'code_128', 'ean_13', 'ean_8', 'code_39'] });
      scanning = true;

      const scanLoop = async () => {
        if (!scanning || !video.videoWidth) { if (scanning) requestAnimationFrame(scanLoop); return; }
        try {
          const barcodes = await detector.detect(video);
          if (barcodes.length) {
            const val = barcodes[0].rawValue;
            scanning = false;
            if (estado) estado.textContent = `Detectado: ${val}`;
            manual.value = val;
            mostrarResultados(val);
          }
        } catch {}
        if (scanning) requestAnimationFrame(scanLoop);
      };
      video.onloadedmetadata = () => requestAnimationFrame(scanLoop);
    } catch (e) {
      if (estado) estado.textContent = 'Sin acceso a la cámara. Usa la búsqueda manual.';
    }

    fondo.querySelector('#btn-scan-stop')?.addEventListener('click', () => {
      scanning = false;
      stream?.getTracks().forEach(t => t.stop());
    });
  }

  fondo._onClose = () => {
    scanning = false;
    stream?.getTracks().forEach(t => t.stop());
  };
}

// ── Modo Conteo (inventario físico) ────────────────────────────────────────────

function modalConteo() {
  const arts = articulosActivos().sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const rows = arts.map(a => `
    <tr>
      <td>
        <div style="font-weight:600;font-size:.92rem">${escape(a.name)}</div>
        ${a.location ? `<div style="font-size:.78rem;color:var(--texto-suave)">${ico('ubicacion',11)} ${escape(a.location)}</div>` : ''}
      </td>
      <td class="num" style="color:var(--texto-suave)">${a.currentStock} ${a.unit}</td>
      <td><input type="number" class="conteo-inp" data-id="${a.id}" min="0" step="1"
        value="${a.currentStock}" inputmode="numeric"
        style="width:90px;min-height:40px;text-align:center;padding:4px 8px"></td>
    </tr>`).join('');

  const fondo = openModal({
    titulo: `${ico('conteo',18)} Conteo de inventario`,
    cuerpo: `
      <p style="color:var(--texto-suave);font-size:.88rem;margin:0 0 14px">Ingresa el stock real contado. Solo se registran los artículos que cambiaron.</p>
      <div class="tabla-scroll">
        <table class="tabla">
          <thead><tr><th>Artículo</th><th class="num">Sistema</th><th class="num">Contado</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`,
    acciones: `<button class="btn btn-secundario" id="cont-cancel">Cancelar</button>
               <button class="btn btn-primario" id="cont-ok">${ico('check', 16)} Aplicar ajustes</button>`,
    ancho: 560,
  });

  fondo.querySelector('#cont-cancel').addEventListener('click', closeModal);
  fondo.querySelector('#cont-ok').addEventListener('click', async () => {
    const ajustes = [];
    fondo.querySelectorAll('.conteo-inp').forEach(inp => {
      ajustes.push({ id: inp.dataset.id, qty: Number(inp.value) });
    });
    const cambios = ajustes.filter(aj => {
      const art = articulosActivos().find(a => a.id === aj.id);
      return art && aj.qty !== art.currentStock;
    });
    if (!cambios.length) { toast('Sin cambios que aplicar', 'info'); closeModal(); return; }
    closeModal();
    await bulkAjuste(ajustes);
    toast(`${cambios.length} artículo${cambios.length>1?'s':''} ajustado${cambios.length>1?'s':''}`, 'exito');
  });
}

// ── HISTORIAL ──────────────────────────────────────────────────────────────────

export function renderHistorial(container) {
  const state = getState();
  const artActivos = articulosActivos();
  const { articuloId, tipo, desde, hasta } = state.filtros.historial;
  const movs = filteredMovimientos();
  const artMap = {};
  state.articulos.forEach(a => { artMap[a.id] = a; });

  const filas = movs.map(m => {
    const art = artMap[m.articuloId];
    const val = (m.cost || 0) * m.qty;
    return `<tr>
      <td style="white-space:nowrap;color:var(--texto-suave);font-size:.84rem">${fmtFechaHora(m.at)}</td>
      <td class="celda-nombre">
        ${art?.photo ? `<img src="${art.photo}" style="width:28px;height:28px;object-fit:cover;border-radius:4px;vertical-align:middle;margin-right:6px">` : ''}
        ${art ? escape(art.name) : '—'}
      </td>
      <td>${tipoLabel(m.type)}</td>
      <td class="num mono">${m.type === 'salida' ? '−' : '+'}${m.qty}</td>
      <td class="num" style="color:var(--texto-suave);font-size:.84rem">${val > 0 ? '$'+fmtMoneda(val) : '—'}</td>
      <td style="color:var(--texto-suave);font-size:.84rem;max-width:140px;overflow:hidden;text-overflow:ellipsis">${escape(m.notes)}</td>
    </tr>`;
  }).join('');

  container.innerHTML = `
    <div class="vista">
      <div class="cab-vista">
        <div>
          <h1 class="titulo-vista">${ico('historial', 22)} Historial</h1>
          <p class="subtitulo-vista">${movs.length} movimiento${movs.length!==1?'s':''}</p>
        </div>
        <button class="btn btn-secundario btn-sm" id="btn-exp-csv">${ico('exportar', 16)} CSV</button>
      </div>

      <div class="bloque" style="margin-bottom:16px">
        <div class="filtros">
          <select id="fil-art">
            <option value="">Todos los artículos</option>
            ${artActivos.map(a => `<option value="${a.id}"${articuloId===a.id?' selected':''}>${escape(a.name)}</option>`).join('')}
          </select>
          <select id="fil-tipo">
            <option value="">Todos los tipos</option>
            <option value="entrada"${tipo==='entrada'?' selected':''}>Entrada</option>
            <option value="salida"${tipo==='salida'?' selected':''}>Salida</option>
            <option value="ajuste"${tipo==='ajuste'?' selected':''}>Ajuste</option>
          </select>
          <span class="filtro-fecha">${ico('filtro',13)} Desde <input type="date" id="fil-desde" value="${desde}"></span>
          <span class="filtro-fecha">Hasta <input type="date" id="fil-hasta" value="${hasta}"></span>
          <button class="btn btn-sm btn-secundario" id="fil-limpiar">Limpiar</button>
        </div>
      </div>

      <div class="tabla-scroll">
        <table class="tabla">
          <thead>
            <tr>
              <th>Fecha</th><th>Artículo</th><th>Tipo</th>
              <th class="num">Cant.</th><th class="num">Valor</th><th>Notas</th>
            </tr>
          </thead>
          <tbody>${movs.length ? filas : `<tr><td colspan="6" class="vacio">Sin movimientos</td></tr>`}</tbody>
        </table>
      </div>
    </div>`;

  container.querySelector('#btn-exp-csv').addEventListener('click', async () => {
    await exportarCSVMovimientos(movs, state.articulos);
    toast('CSV exportado', 'exito');
  });

  const apply = () => setFiltroHistorial({
    articuloId: container.querySelector('#fil-art').value,
    tipo: container.querySelector('#fil-tipo').value,
    desde: container.querySelector('#fil-desde').value,
    hasta: container.querySelector('#fil-hasta').value,
  });

  ['#fil-art','#fil-tipo','#fil-desde','#fil-hasta'].forEach(sel => {
    container.querySelector(sel).addEventListener('change', apply);
  });
  container.querySelector('#fil-limpiar').addEventListener('click', () => {
    setFiltroHistorial({ articuloId:'', tipo:'', desde:'', hasta:'' });
  });
}

// ── REPORTES ──────────────────────────────────────────────────────────────────

export function renderReportes(container) {
  const state = getState();
  const activos = articulosActivos();
  const valor = calcInventoryValue();
  const criticos = articulosBajoStock();
  const vencidos = articulosVencidos();

  const now = new Date();
  const mesActual = now.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });

  container.innerHTML = `
    <div class="vista">
      <h1 class="titulo-vista">${ico('reportes', 22)} Reportes</h1>
      <p class="subtitulo-vista">Genera reportes imprimibles del inventario</p>

      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px;margin-top:8px">
        <div class="bloque reporte-card" id="rep-inventario" style="cursor:pointer;transition:box-shadow .15s">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
            <div style="width:44px;height:44px;border-radius:12px;background:var(--grad-acento);display:flex;align-items:center;justify-content:center;flex-shrink:0;color:#fff">${ico('paquete', 22)}</div>
            <div>
              <div style="font-weight:700;font-size:.95rem">Inventario general</div>
              <div style="font-size:.8rem;color:var(--texto-suave)">${activos.length} artículos · $${calcInventoryValue() ? fmtMoneda(calcInventoryValue()) : '0'}</div>
            </div>
          </div>
          <p style="font-size:.85rem;color:var(--texto-suave);margin:0 0 14px">Listado completo con stock, valor, ubicación y estado de vencimiento.</p>
          <button class="btn btn-primario btn-sm">${ico('imprimir', 14)} Generar PDF</button>
        </div>

        <div class="bloque reporte-card" id="rep-movimientos" style="cursor:pointer;transition:box-shadow .15s">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
            <div style="width:44px;height:44px;border-radius:12px;background:linear-gradient(135deg,#10b981,#059669);display:flex;align-items:center;justify-content:center;flex-shrink:0;color:#fff">${ico('historial', 22)}</div>
            <div>
              <div style="font-weight:700;font-size:.95rem">Movimientos del mes</div>
              <div style="font-size:.8rem;color:var(--texto-suave)">${mesActual}</div>
            </div>
          </div>
          <p style="font-size:.85rem;color:var(--texto-suave);margin:0 0 14px">Entradas, salidas y ajustes registrados durante el mes en curso.</p>
          <button class="btn btn-primario btn-sm">${ico('imprimir', 14)} Generar PDF</button>
        </div>

        <div class="bloque reporte-card" id="rep-criticos" style="cursor:pointer;transition:box-shadow .15s">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
            <div style="width:44px;height:44px;border-radius:12px;background:linear-gradient(135deg,#ef4444,#dc2626);display:flex;align-items:center;justify-content:center;flex-shrink:0;color:#fff">${ico('alerta', 22)}</div>
            <div>
              <div style="font-weight:700;font-size:.95rem">Artículos críticos</div>
              <div style="font-size:.8rem;color:var(--texto-suave)">${criticos.length + vencidos.length} alertas activas</div>
            </div>
          </div>
          <p style="font-size:.85rem;color:var(--texto-suave);margin:0 0 14px">Artículos con stock bajo, sin stock o con productos vencidos/por vencer.</p>
          <button class="btn btn-primario btn-sm">${ico('imprimir', 14)} Generar PDF</button>
        </div>
      </div>
    </div>`;

  container.querySelector('#rep-inventario').addEventListener('click', () => imprimirReporteInventario());
  container.querySelector('#rep-movimientos').addEventListener('click', () => imprimirReporteMovimientos());
  container.querySelector('#rep-criticos').addEventListener('click', () => imprimirReporteCriticos());
}

function imprimirReporteInventario() {
  const arts = articulosActivos().sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const valor = calcInventoryValue();
  const { nombre } = getEmpresa();
  const filas = arts.map(a => {
    const sc = stockClass(a.currentStock, a.minStock);
    const ec = expiryClass(a.expiryDate);
    const rowBg = sc === 'critico' ? '#fef2f2' : sc === 'bajo' ? '#fffbeb' : '';
    return `<tr style="${rowBg ? 'background:' + rowBg : ''}">
      <td>${escape(a.code || '')}</td>
      <td><strong>${escape(a.name)}</strong>${a.location ? `<br><small style="color:#64748b">${escape(a.location)}</small>` : ''}</td>
      <td>${escape(a.category)}</td>
      <td style="text-align:right;font-weight:700;color:${sc==='critico'?'#dc2626':sc==='bajo'?'#b45309':'#047857'}">${a.currentStock}</td>
      <td>${escape(a.unit)}</td>
      <td style="text-align:right">${a.minStock || '—'}</td>
      <td style="text-align:right">${a.cost ? '$' + fmtMoneda(a.cost) : '—'}</td>
      <td style="text-align:right">${a.cost ? '$' + fmtMoneda(a.cost * a.currentStock) : '—'}</td>
      <td style="color:${ec==='vencido'?'#dc2626':ec==='critico'||ec==='proximo'?'#b45309':'#047857'}">${a.expiryDate ? fmtFecha(a.expiryDate) : '—'}</td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
    <title>Reporte de Inventario — ${escape(nombre)}</title>
    <style>
      body{font-family:system-ui,sans-serif;font-size:11.5px;color:#0f172a;margin:20px}
      h1{font-size:18px;margin:0 0 3px;color:#1e3a8a} .sub{color:#64748b;font-size:11px;margin-bottom:16px}
      table{width:100%;border-collapse:collapse} th,td{padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:left;vertical-align:top}
      thead th{background:#1e3a8a;color:#fff;font-size:10px;text-transform:uppercase;letter-spacing:.05em}
      .total{margin-top:14px;font-size:13px;font-weight:700;text-align:right;color:#1e3a8a}
      @media print{body{margin:8mm}@page{margin:8mm}}
    </style></head><body>
    <h1>Reporte de Inventario General</h1>
    <div class="sub">${escape(nombre)} · ${new Date().toLocaleString('es-MX')} · ${arts.length} artículos</div>
    <table>
      <thead><tr><th>Código</th><th>Artículo</th><th>Cat.</th><th>Stock</th><th>Unidad</th><th>Mín.</th><th>Costo</th><th>Valor</th><th>Vence</th></tr></thead>
      <tbody>${filas}</tbody>
    </table>
    <div class="total">Valor total del inventario: $${fmtMoneda(valor)}</div>
    <script>window.onload=()=>window.print()<\/script>
    </body></html>`;
  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); }
}

function imprimirReporteMovimientos() {
  const { nombre } = getEmpresa();
  const now = new Date();
  const mesStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const state = getState();
  const artMap = {};
  state.articulos.forEach(a => { artMap[a.id] = a; });
  const movs = [...state.movimientos]
    .filter(m => m.at >= mesStart)
    .sort((a, b) => b.at - a.at);

  const totalEntradas = movs.filter(m => m.type === 'entrada').reduce((s, m) => s + m.qty, 0);
  const totalSalidas = movs.filter(m => m.type === 'salida').reduce((s, m) => s + m.qty, 0);
  const mesLabel = now.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });

  const filas = movs.map(m => {
    const art = artMap[m.articuloId];
    const val = (m.cost || 0) * m.qty;
    const color = m.type === 'entrada' ? '#047857' : m.type === 'salida' ? '#dc2626' : '#1d4ed8';
    return `<tr>
      <td style="white-space:nowrap;color:#64748b;font-size:10.5px">${fmtFechaHora(m.at)}</td>
      <td>${art ? escape(art.name) : '—'}</td>
      <td style="color:${color};font-weight:700;text-transform:capitalize">${m.type}</td>
      <td style="text-align:right;font-weight:700;color:${color}">${m.type === 'salida' ? '−' : '+'}${m.qty}</td>
      <td style="text-align:right;color:#64748b">${val > 0 ? '$' + fmtMoneda(val) : '—'}</td>
      <td style="color:#64748b;font-size:10.5px">${escape(m.notes)}</td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
    <title>Movimientos ${mesLabel} — ${escape(nombre)}</title>
    <style>
      body{font-family:system-ui,sans-serif;font-size:11.5px;color:#0f172a;margin:20px}
      h1{font-size:18px;margin:0 0 3px;color:#1e3a8a} .sub{color:#64748b;font-size:11px;margin-bottom:12px}
      .resumen{display:flex;gap:24px;margin-bottom:14px;padding:10px 14px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0}
      .res-item{display:flex;flex-direction:column} .res-lbl{font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.05em}
      .res-val{font-size:16px;font-weight:800}
      table{width:100%;border-collapse:collapse} th,td{padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:left}
      thead th{background:#1e3a8a;color:#fff;font-size:10px;text-transform:uppercase;letter-spacing:.05em}
      @media print{body{margin:8mm}@page{margin:8mm}}
    </style></head><body>
    <h1>Movimientos — ${escape(mesLabel)}</h1>
    <div class="sub">${escape(nombre)} · Generado: ${new Date().toLocaleString('es-MX')} · ${movs.length} registros</div>
    <div class="resumen">
      <div class="res-item"><span class="res-lbl">Total entradas</span><span class="res-val" style="color:#047857">+${totalEntradas}</span></div>
      <div class="res-item"><span class="res-lbl">Total salidas</span><span class="res-val" style="color:#dc2626">−${totalSalidas}</span></div>
      <div class="res-item"><span class="res-lbl">Registros</span><span class="res-val">${movs.length}</span></div>
    </div>
    <table>
      <thead><tr><th>Fecha</th><th>Artículo</th><th>Tipo</th><th>Cant.</th><th>Valor</th><th>Notas</th></tr></thead>
      <tbody>${movs.length ? filas : '<tr><td colspan="6" style="text-align:center;color:#94a3b8;padding:20px">Sin movimientos este mes</td></tr>'}</tbody>
    </table>
    <script>window.onload=()=>window.print()<\/script>
    </body></html>`;
  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); }
}

function imprimirReporteCriticos() {
  const { nombre } = getEmpresa();
  const criticos = articulosBajoStock().sort((a, b) => a.currentStock - b.currentStock);
  const vencidos = articulosVencidos();
  const porVencer = articulosPorVencer(30).filter(a => !vencidos.some(v => v.id === a.id));

  const filasCriticos = criticos.map(a => {
    const sc = stockClass(a.currentStock, a.minStock);
    const color = sc === 'critico' ? '#dc2626' : '#b45309';
    return `<tr style="background:${sc==='critico'?'#fef2f2':'#fffbeb'}">
      <td>${escape(a.code || '')}</td>
      <td><strong>${escape(a.name)}</strong>${a.location ? `<br><small style="color:#64748b">${escape(a.location)}</small>` : ''}</td>
      <td>${escape(a.category)}</td>
      <td style="text-align:right;font-weight:800;color:${color}">${a.currentStock}</td>
      <td>${escape(a.unit)}</td>
      <td style="text-align:right;color:#64748b">${a.minStock}</td>
      <td style="text-align:right;font-weight:700;color:${color}">${Math.max(0, a.minStock - a.currentStock)}</td>
      <td>${escape(a.supplier || '—')}</td>
    </tr>`;
  }).join('');

  const filasVenc = [...vencidos.map(a => ({ a, label: 'VENCIDO', color: '#dc2626', bg: '#fef2f2' })),
    ...porVencer.map(a => ({ a, label: `${expiryDaysLeft(a.expiryDate)}d`, color: '#b45309', bg: '#fffbeb' }))].map(({ a, label, color, bg }) =>
    `<tr style="background:${bg}">
      <td>${escape(a.code || '')}</td>
      <td><strong>${escape(a.name)}</strong></td>
      <td>${escape(a.category)}</td>
      <td style="text-align:right;font-weight:800;color:${color}">${label}</td>
      <td style="color:#64748b">${a.expiryDate ? fmtFecha(a.expiryDate) : '—'}</td>
      <td style="text-align:right;color:#64748b">${a.currentStock} ${a.unit}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
    <title>Artículos Críticos — ${escape(nombre)}</title>
    <style>
      body{font-family:system-ui,sans-serif;font-size:11.5px;color:#0f172a;margin:20px}
      h1{font-size:18px;margin:0 0 3px;color:#dc2626} h2{font-size:14px;margin:20px 0 8px;color:#1e3a8a}
      .sub{color:#64748b;font-size:11px;margin-bottom:16px}
      table{width:100%;border-collapse:collapse;margin-bottom:24px}
      th,td{padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:left}
      thead th{background:#dc2626;color:#fff;font-size:10px;text-transform:uppercase;letter-spacing:.05em}
      @media print{body{margin:8mm}@page{margin:8mm}}
    </style></head><body>
    <h1>Reporte de Artículos Críticos</h1>
    <div class="sub">${escape(nombre)} · ${new Date().toLocaleString('es-MX')}</div>
    ${criticos.length ? `
    <h2>Stock bajo / Sin stock (${criticos.length})</h2>
    <table>
      <thead><tr><th>Código</th><th>Artículo</th><th>Cat.</th><th>Stock</th><th>Unidad</th><th>Mín.</th><th>Faltante</th><th>Proveedor</th></tr></thead>
      <tbody>${filasCriticos}</tbody>
    </table>` : '<p style="color:#64748b">No hay artículos con stock bajo.</p>'}
    ${(vencidos.length || porVencer.length) ? `
    <h2>Vencidos / Por vencer (${vencidos.length + porVencer.length})</h2>
    <table>
      <thead><tr><th>Código</th><th>Artículo</th><th>Cat.</th><th>Estado</th><th>Vencimiento</th><th>Stock</th></tr></thead>
      <tbody>${filasVenc}</tbody>
    </table>` : ''}
    <script>window.onload=()=>window.print()<\/script>
    </body></html>`;
  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); }
}

// ── RESPALDO ───────────────────────────────────────────────────────────────────

export async function renderRespaldo(container) {
  const snaps = await listarSnapshots();
  const storage = await medirAlmacenamiento();
  const state = getState();
  const valor = calcInventoryValue();
  const activos = articulosActivos();

  const pct = storage?.pct ?? 0;
  const barClass = pct < 50 ? 'barra-verde' : pct < 80 ? 'barra-ambar' : 'barra-roja';

  container.innerHTML = `
    <div class="vista">
      <h1 class="titulo-vista">${ico('respaldo', 22)} Respaldo</h1>
      <p class="subtitulo-vista">Protege y restaura tus datos</p>

      <!-- Exportar -->
      <div class="bloque">
        <h2>${ico('descargar', 18)} Exportar</h2>
        <div class="botones-fila" style="margin-top:14px">
          <button class="btn btn-primario" id="btn-export-json">${ico('descargar', 16)} Respaldo JSON</button>
          <button class="btn btn-secundario" id="btn-export-csv-arts">${ico('exportar', 16)} CSV Artículos</button>
          <button class="btn btn-secundario" id="btn-export-csv-movs">${ico('exportar', 16)} CSV Movimientos</button>
        </div>
      </div>

      <!-- Reporte de inventario -->
      <div class="bloque">
        <h2>${ico('imprimir', 18)} Reporte de inventario</h2>
        <p style="color:var(--texto-suave);font-size:.9rem;margin:4px 0 14px">
          ${activos.length} artículos · Valor total: <strong>$${fmtMoneda(valor)}</strong>
        </p>
        <div class="botones-fila">
          <button class="btn btn-secundario" id="btn-reporte">${ico('imprimir', 16)} Imprimir reporte</button>
          <button class="btn btn-secundario" id="btn-snap-manual">${ico('guardar', 16)} Crear snapshot</button>
        </div>
      </div>

      <!-- Importar CSV -->
      <div class="bloque">
        <h2>${ico('importar', 18)} Importar artículos desde CSV</h2>
        <p style="color:var(--texto-suave);font-size:.9rem;margin:4px 0 8px">
          El CSV debe tener columnas: <code style="background:var(--superficie-2);padding:1px 6px;border-radius:4px">nombre,categoría,unidad,stock,mínimo,costo,ubicación,proveedor,código,vencimiento,notas</code>
        </p>
        <div class="botones-fila">
          <label class="btn btn-secundario archivo-btn">
            ${ico('importar', 16)} Importar CSV
            <input type="file" accept=".csv" id="file-import-csv" style="display:none">
          </label>
          <button class="btn btn-secundario" id="btn-plantilla-csv">${ico('descargar', 16)} Descargar plantilla</button>
        </div>
      </div>

      <!-- Restaurar JSON -->
      <div class="bloque">
        <h2>${ico('subir', 18)} Restaurar respaldo JSON</h2>
        <p style="color:var(--texto-suave);font-size:.9rem;margin:4px 0 14px"><strong>Reemplaza todos los datos actuales.</strong></p>
        <label class="btn btn-secundario archivo-btn">
          ${ico('subir', 16)} Seleccionar archivo JSON
          <input type="file" accept=".json" id="file-import" style="display:none">
        </label>
      </div>

      <!-- Snapshots -->
      <div class="bloque">
        <h2>${ico('historial', 18)} Snapshots <span class="insignia ins-azul" style="margin-left:6px">${snaps.length}/10</span></h2>
        <div class="tabla-scroll" style="margin-top:12px">
          <table class="tabla">
            <thead><tr><th>Fecha</th><th>Tipo</th><th>Artículos</th><th>Acciones</th></tr></thead>
            <tbody id="snaps-tbody">
              ${snaps.length ? snaps.map(s => `
                <tr>
                  <td style="font-size:.88rem">${fmtFechaHora(s.createdAt)}</td>
                  <td><span class="insignia ${s.manual?'ins-azul':'ins-verde'}">${s.manual?'Manual':'Auto'}</span></td>
                  <td>${s.articulosCount}</td>
                  <td>
                    <button class="btn btn-sm btn-secundario" data-snap-restore="${s.id}">${ico('restaurar',13)} Restaurar</button>
                    <button class="btn btn-sm btn-icono peligro" data-snap-del="${s.id}">${ico('eliminar',13)}</button>
                  </td>
                </tr>`).join('') : `<tr><td colspan="4" class="vacio">Sin snapshots</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>

      ${storage ? `
      <div class="bloque">
        <h2>${ico('estadisticas', 18)} Almacenamiento</h2>
        <div class="almacen-cab"><span>Espacio usado</span><span><strong>${(storage.used/1048576).toFixed(2)} MB</strong> de ${(storage.quota/1048576).toFixed(0)} MB</span></div>
        <div class="barra-uso"><div class="barra-uso-rel ${barClass}" style="width:${pct}%"></div></div>
        <div class="almacen-pie">${pct}% · ${activos.length} artículos · ${state.movimientos.length} movimientos</div>
      </div>` : ''}

      <div class="bloque bloque-peligro">
        <h2 style="color:var(--rojo)">${ico('alerta', 18)} Zona peligrosa</h2>
        <p style="color:var(--texto-suave);margin:4px 0 14px">Elimina permanentemente todos los datos del inventario.</p>
        <button class="btn btn-peligro" id="btn-reset">${ico('eliminar', 16)} Borrar todos los datos</button>
      </div>
    </div>`;

  container.querySelector('#btn-export-json').addEventListener('click', async () => { await exportarJSON(); toast('Respaldo descargado', 'exito'); });
  container.querySelector('#btn-export-csv-arts').addEventListener('click', async () => { await exportarCSVArticulos(); toast('CSV descargado', 'exito'); });
  container.querySelector('#btn-export-csv-movs').addEventListener('click', async () => { await exportarCSVMovimientos(); toast('CSV descargado', 'exito'); });

  container.querySelector('#btn-reporte').addEventListener('click', () => imprimirReporte());

  container.querySelector('#btn-snap-manual').addEventListener('click', async () => {
    await crearSnapshot(true);
    toast('Snapshot creado', 'exito');
    renderRespaldo(container);
  });

  container.querySelector('#btn-plantilla-csv').addEventListener('click', () => {
    const { descargaBlob: dl } = { descargaBlob: (b, n) => { const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href=u; a.download=n; a.click(); } };
    const csv = 'nombre,categoría,unidad,stock,mínimo,costo,ubicación,proveedor,código,vencimiento,notas\nPañales Talla M,Higiene,paquete,10,3,45.00,Bodega 1,Farmacia Central,PAM-M,2025-12-31,Ejemplo';
    dl(new Blob(['﻿'+csv],{type:'text/csv'}), 'plantilla-inventario.csv');
  });

  container.querySelector('#file-import-csv').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const result = await importarCSVArticulos(file);
      toast(`${result.importados} artículos importados`, 'exito');
      renderRespaldo(container);
    } catch (err) { toast(`Error: ${err.message}`, 'error'); }
  });

  container.querySelector('#file-import').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    const ok = await confirmacion('¿Restaurar respaldo? Se reemplazarán <strong>todos</strong> los datos.', { peligro: true });
    if (!ok) return;
    try {
      const result = await importarJSON(file);
      toast(`Restaurado: ${result.articulos} artículos`, 'exito');
      renderRespaldo(container);
    } catch (err) { toast(`Error: ${err.message}`, 'error'); }
  });

  container.querySelector('#snaps-tbody').addEventListener('click', async e => {
    const r = e.target.closest('[data-snap-restore]');
    const d = e.target.closest('[data-snap-del]');
    if (r) {
      const ok = await confirmacion('¿Restaurar este snapshot?');
      if (!ok) return;
      await restaurarSnapshot(r.dataset.snapRestore);
      toast('Snapshot restaurado', 'exito');
      renderRespaldo(container);
    } else if (d) {
      const ok = await confirmacion('¿Eliminar snapshot?', { peligro: true });
      if (!ok) return;
      await eliminarSnapshot(d.dataset.snapDel);
      renderRespaldo(container);
    }
  });

  container.querySelector('#btn-reset').addEventListener('click', async () => {
    const ok = await confirmacion('¿Borrar <strong>todos</strong> los datos? Esta acción no se puede deshacer.', { peligro: true });
    if (!ok) return;
    await resetData();
    toast('Datos eliminados', 'info');
    renderRespaldo(container);
  });
}

// ── Reporte imprimible ────────────────────────────────────────────────────────

function imprimirReporte() {
  const arts = articulosActivos().sort((a,b) => a.name.localeCompare(b.name,'es'));
  const valor = calcInventoryValue();
  const { nombre } = getEmpresa();
  const filas = arts.map(a => {
    const ec = expiryClass(a.expiryDate);
    const sc = stockClass(a.currentStock, a.minStock);
    return `<tr style="${sc==='critico'?'background:#fef2f2':sc==='bajo'?'background:#fffbeb':''}">
      <td>${escape(a.code||'')}</td>
      <td><strong>${escape(a.name)}</strong>${a.location?`<br><small style="color:#64748b">${escape(a.location)}</small>`:''}</td>
      <td>${escape(a.category)}</td>
      <td style="text-align:right">${a.currentStock}</td>
      <td>${escape(a.unit)}</td>
      <td style="text-align:right">${a.minStock||'—'}</td>
      <td style="text-align:right">${a.cost?'$'+fmtMoneda(a.cost):'—'}</td>
      <td style="text-align:right">${a.cost?'$'+fmtMoneda(a.cost*a.currentStock):'—'}</td>
      <td style="color:${ec==='vencido'?'#dc2626':ec==='critico'||ec==='proximo'?'#b45309':'#047857'}">${a.expiryDate?fmtFecha(a.expiryDate):'—'}</td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
    <title>Reporte de Inventario — ${escape(nombre)}</title>
    <style>
      body{font-family:system-ui,-apple-system,sans-serif;font-size:12px;color:#0f172a;margin:20px}
      h1{font-size:18px;margin:0 0 4px} .sub{color:#64748b;font-size:11px;margin-bottom:16px}
      table{width:100%;border-collapse:collapse} th,td{padding:7px 9px;border-bottom:1px solid #e2e8f0;text-align:left}
      thead th{background:#1e3a8a;color:#fff;font-size:11px;text-transform:uppercase;letter-spacing:.04em}
      .total{margin-top:16px;font-size:14px;font-weight:700;text-align:right}
      @media print{body{margin:8mm}}
    </style></head><body>
    <h1>Reporte de Inventario</h1>
    <div class="sub">${escape(nombre)} · ${new Date().toLocaleString('es-MX')} · ${arts.length} artículos</div>
    <table>
      <thead><tr><th>Código</th><th>Artículo</th><th>Cat.</th><th>Stock</th><th>Unidad</th><th>Mín.</th><th>Costo</th><th>Valor</th><th>Vence</th></tr></thead>
      <tbody>${filas}</tbody>
    </table>
    <div class="total">Valor total del inventario: $${fmtMoneda(valor)}</div>
    <script>window.onload=()=>window.print()<\/script>
    </body></html>`;

  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
}

// ── AJUSTES ────────────────────────────────────────────────────────────────────

export function renderAjustes(container) {
  const empresa = getEmpresa();
  const cats = getCategories();
  const units = getUnits();
  const pinActive = !!getPIN();
  const archivados = articulosArchivados();
  const currentRole = getRole();

  container.innerHTML = `
    <div class="vista">
      <h1 class="titulo-vista">${ico('ajustes', 22)} Ajustes</h1>
      <p class="subtitulo-vista">Configura la app</p>

      <div class="bloque">
        <h2>${ico('escudo', 18)} Rol de usuario</h2>
        <p style="color:var(--texto-suave);font-size:.88rem;margin:4px 0 14px">
          Controla qué funciones están disponibles en este dispositivo.
        </p>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn${currentRole === 'admin' ? ' btn-primario' : ' btn-secundario'}" id="btn-rol-admin">
            ${ico('escudo', 16)} Administrador
          </button>
          <button class="btn${currentRole === 'operador' ? ' btn-primario' : ' btn-secundario'}" id="btn-rol-operador">
            ${ico('persona', 16)} Operador
          </button>
        </div>
        <p style="color:var(--texto-tenue);font-size:.8rem;margin-top:10px">
          ${currentRole === 'admin'
            ? 'Acceso completo: todos los módulos, reportes, ajustes y respaldo.'
            : 'Acceso limitado: solo entradas, salidas e historial. Sin eliminaciones ni ajustes avanzados.'}
        </p>
      </div>

      <div class="bloque">
        <h2>${ico('empresa', 18)} Empresa</h2>
        <div class="form" style="margin-top:14px">
          <div class="campo">
            <label>Nombre de la empresa</label>
            <input id="emp-nombre" type="text" value="${escape(empresa.nombre)}" placeholder="Mi Empresa">
          </div>
          <div class="campo">
            <label>Logotipo <small style="color:var(--texto-tenue)">(opcional)</small></label>
            <label class="btn btn-sm btn-secundario archivo-btn" style="display:inline-flex">
              ${ico('foto', 15)} Subir imagen
              <input type="file" id="emp-logo-file" accept="image/*" style="display:none">
            </label>
            <div class="logo-previa" id="logo-previa">
              ${empresa.logo ? `<img src="${empresa.logo}" alt="logo" style="max-height:60px;border-radius:8px;border:1px solid var(--borde)">` : '<span style="color:var(--texto-tenue);font-size:.85rem">Sin logotipo</span>'}
            </div>
          </div>
          <div class="botones-fila">
            <button class="btn btn-primario btn-sm" id="btn-save-empresa">${ico('guardar', 15)} Guardar</button>
            ${empresa.logo ? `<button class="btn btn-secundario btn-sm" id="btn-del-logo">Quitar logo</button>` : ''}
          </div>
        </div>
      </div>

      <div class="bloque">
        <h2>${ico('etiqueta', 18)} Categorías y Unidades</h2>
        <div class="fila-2" style="margin-top:14px;gap:20px">
          <div>
            <h3 style="font-size:.95rem;margin-bottom:8px">Categorías</h3>
            <div id="cats-lista" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">
              ${cats.map(c => `<span class="insignia ins-azul">${escape(c)} <button style="background:none;border:none;cursor:pointer;color:inherit;padding:0 0 0 4px" data-rm-cat="${escape(c)}">×</button></span>`).join('')}
            </div>
            <div style="display:flex;gap:8px">
              <input type="text" id="new-cat" placeholder="Nueva categoría…" style="flex:1">
              <button class="btn btn-sm btn-primario" id="btn-add-cat">${ico('mas', 15)}</button>
            </div>
          </div>
          <div>
            <h3 style="font-size:.95rem;margin-bottom:8px">Unidades</h3>
            <div id="units-lista" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">
              ${units.map(u => `<span class="insignia ins-azul">${escape(u)} <button style="background:none;border:none;cursor:pointer;color:inherit;padding:0 0 0 4px" data-rm-unit="${escape(u)}">×</button></span>`).join('')}
            </div>
            <div style="display:flex;gap:8px">
              <input type="text" id="new-unit" placeholder="Nueva unidad…" style="flex:1">
              <button class="btn btn-sm btn-primario" id="btn-add-unit">${ico('mas', 15)}</button>
            </div>
          </div>
        </div>
        <button class="btn btn-sm btn-secundario" id="btn-reset-cats" style="margin-top:10px">Restablecer predeterminados</button>
      </div>

      <div class="bloque">
        <h2>${ico('candado', 18)} Seguridad y PIN</h2>
        <p style="color:var(--texto-suave);margin:4px 0 14px">PIN de 4 dígitos para bloquear la app al abrirla.</p>
        ${pinActive ? `
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <button class="btn btn-sm btn-secundario" id="btn-change-pin">${ico('editar', 15)} Cambiar PIN</button>
            <button class="btn btn-sm btn-peligro" id="btn-del-pin">${ico('eliminar', 15)} Desactivar PIN</button>
          </div>` : `
          <button class="btn btn-sm btn-primario" id="btn-set-pin">${ico('candado', 15)} Activar PIN</button>`}
      </div>

      <div class="bloque" id="bloque-notif">
        <h2>${ico('campanilla', 18)} Notificaciones</h2>
        <p style="color:var(--texto-suave);margin:4px 0 14px">Recibe alertas cuando el stock sea bajo o haya artículos por vencer.</p>
        ${!notificacionesSoportadas() ? `<p class="insignia ins-ambar">Tu navegador no soporta notificaciones.</p>` : `
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
          <span id="notif-estado" class="insignia ${notificacionesHabilitadas() ? 'ins-verde' : 'ins-ambar'}">
            ${notificacionesHabilitadas() ? `${ico('campanilla', 13)} Activas` : `${ico('campanilla', 13)} Inactivas`}
          </span>
          ${notificacionesHabilitadas()
            ? `<button class="btn btn-sm btn-secundario" id="btn-notif-desact">${ico('cerrar', 14)} Desactivar</button>`
            : `<button class="btn btn-sm btn-primario" id="btn-notif-act">${ico('campanilla', 14)} Activar notificaciones</button>`}
        </div>`}
      </div>

      <div class="bloque">
        <h2>${ico('archivo', 18)} Artículos archivados <span class="insignia ins-azul" style="margin-left:6px">${archivados.length}</span></h2>
        ${archivados.length ? `
          <div class="art-lista" style="margin-top:12px">
            ${archivados.map(a => `
              <div class="art-card" style="opacity:.75">
                <div class="art-cab">
                  ${a.photo ? `<img src="${a.photo}" class="art-foto">` : ''}
                  <div class="art-info">
                    <div class="art-nombre">${escape(a.name)}</div>
                    <div class="art-meta">${escape(a.category)} · Archivado ${fmtFecha(a.archivedAt)}</div>
                  </div>
                </div>
                <div class="art-acciones">
                  <button class="btn btn-sm btn-secundario" data-unarch="${a.id}">${ico('restaurar', 14)} Desarchivar</button>
                </div>
              </div>`).join('')}
          </div>` : '<p style="color:var(--texto-tenue);margin-top:8px">Sin artículos archivados.</p>'}
      </div>
    </div>`;

  container.querySelector('#btn-rol-admin').addEventListener('click', () => {
    setRole('admin');
    toast('Rol: Administrador', 'exito');
    document.querySelector('#rol-display')?.classList.remove('rol-operador');
    renderAjustes(container);
  });
  container.querySelector('#btn-rol-operador').addEventListener('click', async () => {
    const ok = await confirmacion('¿Cambiar a rol Operador? Perderás acceso a Ajustes y Respaldo desde este dispositivo.');
    if (!ok) return;
    setRole('operador');
    toast('Rol: Operador activo', 'info');
    document.querySelector('#rol-display')?.classList.add('rol-operador');
    location.hash = '#/inicio';
  });

  let logoDataUrl = empresa.logo || null;
  container.querySelector('#emp-logo-file').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    const b64 = await fileToBase64(file);
    logoDataUrl = await resizeImage(b64, 200, 200);
    container.querySelector('#logo-previa').innerHTML = `<img src="${logoDataUrl}" style="max-height:60px;border-radius:8px;border:1px solid var(--borde)">`;
  });
  container.querySelector('#btn-save-empresa').addEventListener('click', () => {
    const nombre = container.querySelector('#emp-nombre').value.trim() || 'Mi Empresa';
    setEmpresa(nombre, logoDataUrl);
    document.getElementById('empresa-nombre').textContent = nombre;
    if (logoDataUrl) {
      document.getElementById('empresa-logo').src = logoDataUrl;
      document.getElementById('empresa-logo').hidden = false;
      document.getElementById('brand-mark').hidden = true;
    }
    toast('Empresa actualizada', 'exito');
  });
  container.querySelector('#btn-del-logo')?.addEventListener('click', () => {
    logoDataUrl = null;
    setEmpresa(container.querySelector('#emp-nombre').value.trim(), null);
    container.querySelector('#logo-previa').innerHTML = '<span style="color:var(--texto-tenue);font-size:.85rem">Sin logotipo</span>';
    document.getElementById('empresa-logo').hidden = true;
    document.getElementById('brand-mark').hidden = false;
    toast('Logotipo eliminado', 'info');
  });

  const renderCats = () => {
    container.querySelector('#cats-lista').innerHTML = getCategories().map(c =>
      `<span class="insignia ins-azul">${escape(c)} <button style="background:none;border:none;cursor:pointer;color:inherit;padding:0 0 0 4px" data-rm-cat="${escape(c)}">×</button></span>`
    ).join('');
  };
  container.querySelector('#btn-add-cat').addEventListener('click', () => {
    const inp = container.querySelector('#new-cat');
    const v = inp.value.trim();
    if (!v) return;
    const c = getCategories();
    if (!c.includes(v)) { setCategories([...c, v]); renderCats(); }
    inp.value = '';
  });
  container.querySelector('#cats-lista').addEventListener('click', e => {
    const b = e.target.closest('[data-rm-cat]');
    if (b) { setCategories(getCategories().filter(c => c !== b.dataset.rmCat)); renderCats(); }
  });

  const renderUnits = () => {
    container.querySelector('#units-lista').innerHTML = getUnits().map(u =>
      `<span class="insignia ins-azul">${escape(u)} <button style="background:none;border:none;cursor:pointer;color:inherit;padding:0 0 0 4px" data-rm-unit="${escape(u)}">×</button></span>`
    ).join('');
  };
  container.querySelector('#btn-add-unit').addEventListener('click', () => {
    const inp = container.querySelector('#new-unit');
    const v = inp.value.trim();
    if (!v) return;
    const u = getUnits();
    if (!u.includes(v)) { setUnits([...u, v]); renderUnits(); }
    inp.value = '';
  });
  container.querySelector('#units-lista').addEventListener('click', e => {
    const b = e.target.closest('[data-rm-unit]');
    if (b) { setUnits(getUnits().filter(u => u !== b.dataset.rmUnit)); renderUnits(); }
  });
  container.querySelector('#btn-reset-cats')?.addEventListener('click', async () => {
    const ok = await confirmacion('¿Restablecer categorías y unidades?');
    if (!ok) return;
    setCategories(defaultCategories()); setUnits(defaultUnits());
    renderCats(); renderUnits(); toast('Restablecido', 'info');
  });

  const setupPIN = (isChange) => {
    const fondo = openModal({
      titulo: isChange ? 'Cambiar PIN' : 'Activar PIN',
      cuerpo: `<div class="form">
        ${isChange ? `<div class="campo"><label>PIN actual</label><input id="pin1" type="password" maxlength="4" inputmode="numeric" placeholder="••••"></div>` : ''}
        <div class="campo"><label>PIN nuevo (4 dígitos)</label><input id="pin2" type="password" maxlength="4" inputmode="numeric" placeholder="••••"></div>
        <div class="campo"><label>Confirmar PIN</label><input id="pin3" type="password" maxlength="4" inputmode="numeric" placeholder="••••"></div>
      </div>`,
      acciones: `<button class="btn btn-secundario" id="pin-cancel">Cancelar</button>
                 <button class="btn btn-primario" id="pin-save">Guardar</button>`,
    });
    fondo.querySelector('#pin-cancel').addEventListener('click', closeModal);
    fondo.querySelector('#pin-save').addEventListener('click', () => {
      if (isChange && fondo.querySelector('#pin1').value !== getPIN()) { toast('PIN actual incorrecto', 'error'); return; }
      const nuevo = fondo.querySelector('#pin2').value;
      const conf = fondo.querySelector('#pin3').value;
      if (!/^\d{4}$/.test(nuevo)) { toast('El PIN debe ser 4 dígitos numéricos', 'error'); return; }
      if (nuevo !== conf) { toast('Los PINs no coinciden', 'error'); return; }
      setPIN(nuevo); closeModal(); toast('PIN guardado', 'exito');
      if (!isChange) renderAjustes(container);
    });
  };
  container.querySelector('#btn-set-pin')?.addEventListener('click', () => setupPIN(false));
  container.querySelector('#btn-change-pin')?.addEventListener('click', () => setupPIN(true));
  container.querySelector('#btn-del-pin')?.addEventListener('click', async () => {
    const ok = await confirmacion('¿Desactivar el PIN?');
    if (!ok) return;
    removePIN(); toast('PIN desactivado', 'info'); renderAjustes(container);
  });

  container.querySelector('#btn-notif-act')?.addEventListener('click', async () => {
    const result = await activarNotificaciones();
    if (result.ok) {
      toast('Notificaciones activadas', 'exito');
      renderAjustes(container);
    } else {
      toast(result.msg, 'error');
    }
  });
  container.querySelector('#btn-notif-desact')?.addEventListener('click', () => {
    desactivarNotificaciones();
    toast('Notificaciones desactivadas', 'info');
    renderAjustes(container);
  });

  container.querySelectorAll('[data-unarch]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await unarchiveArticulo(btn.dataset.unarch);
      toast('Artículo desarchivado', 'exito'); renderAjustes(container);
    });
  });
}

// ── COMPRAS ────────────────────────────────────────────────────────────────────

let _comprasTab = 'lista';

export function renderCompras(container) {
  const isAdmin = getRole() === 'admin';
  const items = generarListaCompra();
  const ordenes = getOrdenes();
  const pendientes = ordenes.filter(o => o.estado !== 'recibida').length;

  function buildListaTab() {
    if (!items.length) {
      return `<div class="estado-vacio">
        <div class="ev-ico" style="background:var(--verde-suave);color:var(--verde)">${ico('check', 30)}</div>
        <h3>Todo al día</h3>
        <p>No hay artículos que necesiten reposición. Configura el <strong>stock mínimo</strong> de tus artículos para recibir sugerencias aquí.</p>
        ${isAdmin ? `<button class="btn btn-primario" id="btn-nueva-orden-manual">${ico('mas', 16)} Crear orden manual</button>` : ''}
      </div>`;
    }
    const porProv = {};
    items.forEach(item => {
      const prov = item.supplier || 'Sin proveedor';
      if (!porProv[prov]) porProv[prov] = [];
      porProv[prov].push(item);
    });
    const gruposHtml = Object.entries(porProv).map(([prov, grupo]) => `
      <div class="bloque">
        <div class="compra-prov-cab">
          ${ico('proveedor', 15)} <span>${escape(prov)}</span>
          <span class="insignia ins-azul">${grupo.length}</span>
        </div>
        ${grupo.map(item => `
          <div class="compra-item" data-id="${item.id}">
            <div class="compra-info">
              <div class="compra-nombre">${escape(item.name)}${item.code ? ` <span class="art-codigo">#${escape(item.code)}</span>` : ''}</div>
              <div class="compra-meta">
                ${item.motivo === 'bajo'
                  ? `<span class="insignia ins-roja">${ico('alerta', 11)} Stock: ${item.currentStock}/${item.minStock} ${item.unit}</span>`
                  : `<span class="insignia ins-ambar">${ico('pronostico', 11)} Se agota en ~${item.dias}d</span>`}
                ${item.cost > 0 ? `<span class="insignia ins-azul">${ico('valor', 11)} $${fmtMoneda(item.cost)}/u</span>` : ''}
              </div>
            </div>
            <div class="compra-qty-ctrl">
              <button class="compra-qty-btn" data-dir="-1" data-id="${item.id}">−</button>
              <input type="number" class="compra-qty" data-id="${item.id}" value="${item.sugerido}" min="1" step="1">
              <button class="compra-qty-btn" data-dir="1" data-id="${item.id}">+</button>
              <span class="compra-unit">${escape(item.unit)}</span>
            </div>
          </div>`).join('')}
      </div>`).join('');

    return `
      <p style="color:var(--texto-suave);font-size:.88rem;margin:0 0 16px">Artículos con stock bajo o que se agotarán pronto. Ajusta cantidades y genera la orden.</p>
      ${gruposHtml}
      <div class="compra-bar">
        <button class="btn btn-secundario" id="btn-compra-copiar">${ico('compartir', 16)} Copiar lista</button>
        <button class="btn btn-secundario" id="btn-compra-imprimir">${ico('imprimir', 16)} Imprimir</button>
        ${isAdmin ? `<button class="btn btn-primario" id="btn-crear-orden">${ico('compras', 16)} Crear orden de compra</button>` : ''}
      </div>`;
  }

  function estadoBadge(estado) {
    if (estado === 'borrador') return `<span class="insignia ins-azul">${ico('editar', 11)} Borrador</span>`;
    if (estado === 'enviada') return `<span class="insignia ins-ambar">${ico('enviar', 11)} Enviada</span>`;
    return `<span class="insignia ins-verde">${ico('check', 11)} Recibida</span>`;
  }

  function buildOrdenesTab() {
    if (!ordenes.length) {
      return `<div class="estado-vacio">
        <div class="ev-ico">${ico('compras', 30)}</div>
        <h3>Sin órdenes de compra</h3>
        <p>Las órdenes de compra te permiten gestionar pedidos a proveedores desde el borrador hasta la recepción de mercancía.</p>
        ${isAdmin ? `<button class="btn btn-primario" id="btn-nueva-orden-vacio">${ico('mas', 16)} Nueva orden</button>` : ''}
      </div>`;
    }
    return ordenes.map(o => {
      const totalCost = o.items.reduce((s, i) => s + (i.unitCost || 0) * (i.qty || 0), 0);
      return `<div class="bloque orden-card" data-id="${o.id}">
        <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:10px">
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px">
              <span style="font-weight:800;font-size:1rem">${escape(o.numero)}</span>
              ${estadoBadge(o.estado)}
            </div>
            <div style="font-size:.82rem;color:var(--texto-suave)">
              ${o.proveedor ? `${ico('proveedor', 12)} ${escape(o.proveedor)} · ` : ''}
              ${o.items.length} artículo${o.items.length !== 1 ? 's' : ''}
              ${totalCost > 0 ? ` · $${fmtMoneda(totalCost)}` : ''}
            </div>
            <div style="font-size:.78rem;color:var(--texto-tenue);margin-top:2px">${fmtFecha(o.createdAt)}</div>
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-sm btn-secundario" data-ord-ver="${o.id}">${ico('lista', 14)} Ver</button>
          ${isAdmin && o.estado === 'borrador' ? `
            <button class="btn btn-sm btn-secundario" data-ord-editar="${o.id}">${ico('editar', 14)} Editar</button>
            <button class="btn btn-sm btn-primario" data-ord-enviar="${o.id}" style="background:var(--ambar)">${ico('enviar', 14)} Enviar</button>
            <button class="btn btn-sm btn-secundario" data-ord-del="${o.id}" style="color:var(--rojo)">${ico('eliminar', 14)}</button>
          ` : ''}
          ${isAdmin && o.estado === 'enviada' ? `
            <button class="btn btn-sm btn-primario" data-ord-recibir="${o.id}">${ico('recibir', 14)} Recibir</button>
            <button class="btn btn-sm btn-secundario" data-ord-cancelar="${o.id}">Cancelar envío</button>
          ` : ''}
          ${o.estado === 'recibida' ? `<button class="btn btn-sm btn-secundario" data-ord-imprimir="${o.id}">${ico('imprimir', 14)} Imprimir</button>` : ''}
        </div>
      </div>`;
    }).join('');
  }

  container.innerHTML = `
    <div class="vista" style="padding-bottom:20px">
      <div class="cab-vista">
        <div>
          <h1 class="titulo-vista">${ico('compras', 22)} Compras</h1>
          <p class="subtitulo-vista">Pedidos y órdenes de compra</p>
        </div>
        ${isAdmin ? `<button class="btn btn-primario" id="btn-nueva-orden-cab">${ico('mas', 16)} Nueva orden</button>` : ''}
      </div>

      <div style="display:flex;gap:0;border-bottom:2px solid var(--borde);margin-bottom:20px">
        <button class="compras-tab${_comprasTab==='lista'?' compras-tab-activo':''}" data-tab="lista">
          ${ico('lista', 15)} Lista de pedido${items.length ? ` <span class="insignia ins-roja" style="margin-left:4px">${items.length}</span>` : ''}
        </button>
        <button class="compras-tab${_comprasTab==='ordenes'?' compras-tab-activo':''}" data-tab="ordenes">
          ${ico('compras', 15)} Órdenes${pendientes ? ` <span class="insignia ins-azul" style="margin-left:4px">${pendientes}</span>` : ''}
        </button>
      </div>

      <div id="tab-lista" ${_comprasTab !== 'lista' ? 'hidden' : ''}>${buildListaTab()}</div>
      <div id="tab-ordenes" ${_comprasTab !== 'ordenes' ? 'hidden' : ''}>${buildOrdenesTab()}</div>
    </div>`;

  // Tab switching
  container.querySelectorAll('.compras-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      _comprasTab = btn.dataset.tab;
      container.querySelectorAll('.compras-tab').forEach(b => b.classList.toggle('compras-tab-activo', b.dataset.tab === _comprasTab));
      container.querySelector('#tab-lista').hidden = _comprasTab !== 'lista';
      container.querySelector('#tab-ordenes').hidden = _comprasTab !== 'ordenes';
    });
  });

  // Lista: +/- qty
  container.addEventListener('click', e => {
    const btn = e.target.closest('.compra-qty-btn');
    if (!btn) return;
    const inp = container.querySelector(`.compra-qty[data-id="${btn.dataset.id}"]`);
    if (inp) inp.value = Math.max(1, (parseInt(inp.value) || 1) + parseInt(btn.dataset.dir));
  });

  // Lista: copiar
  container.querySelector('#btn-compra-copiar')?.addEventListener('click', () => {
    const lineas = [...container.querySelectorAll('.compra-item')].map(el => {
      const item = items.find(i => i.id === el.dataset.id);
      return `• ${item.name}: ${el.querySelector('.compra-qty')?.value} ${item.unit}${item.supplier ? ` (${item.supplier})` : ''}`;
    });
    const texto = `Lista de pedido — ${new Date().toLocaleDateString('es-MX')}\n\n${lineas.join('\n')}`;
    if (navigator.share) {
      navigator.share({ title: 'Lista de pedido', text: texto }).catch(() => {});
    } else {
      navigator.clipboard.writeText(texto)
        .then(() => toast('Lista copiada al portapapeles', 'exito'))
        .catch(() => toast('No se pudo copiar', 'error'));
    }
  });

  // Lista: imprimir
  container.querySelector('#btn-compra-imprimir')?.addEventListener('click', () => {
    const orden = [...container.querySelectorAll('.compra-item')].map(el => {
      const item = items.find(i => i.id === el.dataset.id);
      return { item, qty: parseInt(el.querySelector('.compra-qty')?.value) || 1 };
    });
    imprimirOrden(orden);
  });

  // Lista: crear orden desde sugerencias
  const getItemsFromLista = () => [...container.querySelectorAll('.compra-item')].map(el => {
    const item = items.find(i => i.id === el.dataset.id);
    const qty = parseInt(el.querySelector('.compra-qty')?.value) || item?.sugerido || 1;
    return { articuloId: item.id, nombre: item.name, qty, unitCost: item.cost || 0, unit: item.unit };
  });

  container.querySelector('#btn-crear-orden')?.addEventListener('click', () => {
    modalOrden(null, getItemsFromLista());
  });
  container.querySelector('#btn-nueva-orden-manual')?.addEventListener('click', () => modalOrden(null, []));
  container.querySelector('#btn-nueva-orden-vacio')?.addEventListener('click', () => modalOrden(null, []));
  container.querySelector('#btn-nueva-orden-cab')?.addEventListener('click', () => modalOrden(null, []));

  // Órdenes: event delegation
  container.querySelector('#tab-ordenes')?.addEventListener('click', async e => {
    const btn = e.target.closest('[data-ord-ver],[data-ord-editar],[data-ord-enviar],[data-ord-recibir],[data-ord-cancelar],[data-ord-del],[data-ord-imprimir]');
    if (!btn) return;
    const ord = ordenes.find(o => o.id === (btn.dataset.ordVer || btn.dataset.ordEditar || btn.dataset.ordEnviar || btn.dataset.ordRecibir || btn.dataset.ordCancelar || btn.dataset.ordDel || btn.dataset.ordImprimir));
    if (!ord) return;

    if (btn.dataset.ordVer !== undefined) { modalVerOrden(ord); return; }
    if (btn.dataset.ordEditar !== undefined) { modalOrden(ord, null); return; }
    if (btn.dataset.ordEnviar !== undefined) {
      const ok = await confirmacion(`¿Marcar ${ord.numero} como enviada?`);
      if (ok) { await updateOrden(ord.id, { estado: 'enviada' }); toast('Orden enviada', 'exito'); }
      return;
    }
    if (btn.dataset.ordCancelar !== undefined) {
      const ok = await confirmacion(`¿Cancelar el envío de ${ord.numero} y volver a Borrador?`);
      if (ok) { await updateOrden(ord.id, { estado: 'borrador' }); toast('Orden devuelta a borrador', 'info'); }
      return;
    }
    if (btn.dataset.ordRecibir !== undefined) { modalRecibirOrden(ord); return; }
    if (btn.dataset.ordDel !== undefined) {
      const ok = await confirmacion(`¿Eliminar ${ord.numero}?`, { peligro: true });
      if (ok) { await deleteOrden(ord.id); toast('Orden eliminada', 'info'); }
      return;
    }
    if (btn.dataset.ordImprimir !== undefined) { imprimirOrdenGuardada(ord); return; }
  });
}

function modalOrden(orden, preItems) {
  const arts = articulosActivos().sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const esNueva = !orden;
  let ordenItems = preItems ?? (orden?.items ? [...orden.items] : []);

  function renderItemsTable(fondo) {
    const tbody = fondo.querySelector('#ord-items-tbody');
    if (!tbody) return;
    if (!ordenItems.length) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--texto-tenue);padding:12px">Sin artículos. Agrega artículos abajo.</td></tr>`;
      return;
    }
    tbody.innerHTML = ordenItems.map((item, idx) => `
      <tr>
        <td style="font-size:.88rem">${escape(item.nombre)}</td>
        <td><input type="number" class="ord-item-qty" data-idx="${idx}" value="${item.qty}" min="1" style="width:70px;min-height:32px;text-align:center;padding:2px 6px"></td>
        <td style="font-size:.84rem;color:var(--texto-suave)">${item.unit || ''}</td>
        <td><button class="btn btn-sm btn-secundario ord-item-rm" data-idx="${idx}" style="padding:4px 8px;color:var(--rojo)">×</button></td>
      </tr>`).join('');
  }

  const cuerpo = `<div class="form" style="min-height:280px">
    <div class="fila-2">
      <div class="campo">
        <label>Proveedor</label>
        <input id="ord-prov" type="text" placeholder="Ej: Distribuidora Norte" value="${orden ? escape(orden.proveedor) : ''}">
      </div>
      <div class="campo">
        <label>Notas</label>
        <input id="ord-notas" type="text" placeholder="Ej: Entrega urgente" value="${orden ? escape(orden.notas) : ''}">
      </div>
    </div>
    <div class="campo">
      <label>Artículos a pedir</label>
      <div class="tabla-scroll" style="max-height:200px;overflow-y:auto">
        <table class="tabla" style="table-layout:fixed">
          <thead><tr><th>Artículo</th><th style="width:80px">Cantidad</th><th style="width:60px">Unidad</th><th style="width:40px"></th></tr></thead>
          <tbody id="ord-items-tbody"></tbody>
        </table>
      </div>
    </div>
    <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;align-items:flex-end">
      <div class="campo" style="flex:1;min-width:160px;margin:0">
        <label style="font-size:.8rem">Agregar artículo</label>
        <select id="ord-add-art" style="min-height:36px;font-size:.85rem">
          <option value="">Seleccionar…</option>
          ${arts.map(a => `<option value="${a.id}" data-name="${escape(a.name)}" data-unit="${escape(a.unit)}" data-cost="${a.cost||0}">${escape(a.name)}</option>`).join('')}
        </select>
      </div>
      <div class="campo" style="width:70px;margin:0">
        <label style="font-size:.8rem">Cant.</label>
        <input type="number" id="ord-add-qty" value="1" min="1" style="min-height:36px;text-align:center">
      </div>
      <button class="btn btn-sm btn-secundario" id="btn-ord-add" style="flex-shrink:0;align-self:flex-end">${ico('mas', 14)} Agregar</button>
    </div>
  </div>`;

  const fondo = openModal({
    titulo: esNueva ? `${ico('mas', 18)} Nueva orden de compra` : `${ico('editar', 18)} Editar ${orden.numero}`,
    cuerpo,
    acciones: `<button class="btn btn-secundario" id="ord-cancel">Cancelar</button>
               <button class="btn btn-primario" id="ord-guardar">${ico('guardar', 16)} Guardar borrador</button>`,
    ancho: 580,
  });

  renderItemsTable(fondo);

  fondo.querySelector('#ord-cancel').addEventListener('click', closeModal);

  fondo.querySelector('#btn-ord-add').addEventListener('click', () => {
    const sel = fondo.querySelector('#ord-add-art');
    const qtyInp = fondo.querySelector('#ord-add-qty');
    const opt = sel.options[sel.selectedIndex];
    if (!sel.value || !opt) return;
    const qty = parseInt(qtyInp.value) || 1;
    const existing = ordenItems.find(i => i.articuloId === sel.value);
    if (existing) { existing.qty += qty; }
    else {
      ordenItems.push({
        articuloId: sel.value,
        nombre: opt.dataset.name,
        qty,
        unitCost: parseFloat(opt.dataset.cost) || 0,
        unit: opt.dataset.unit,
      });
    }
    sel.value = '';
    qtyInp.value = 1;
    renderItemsTable(fondo);
  });

  fondo.querySelector('#ord-items-tbody').addEventListener('click', e => {
    const rmBtn = e.target.closest('.ord-item-rm');
    if (rmBtn) {
      ordenItems.splice(parseInt(rmBtn.dataset.idx), 1);
      renderItemsTable(fondo);
      return;
    }
    const qtyInp = e.target.closest('.ord-item-qty');
    if (qtyInp) {
      qtyInp.addEventListener('change', () => {
        const idx = parseInt(qtyInp.dataset.idx);
        if (ordenItems[idx]) ordenItems[idx].qty = parseInt(qtyInp.value) || 1;
      }, { once: true });
    }
  });

  fondo.querySelector('#ord-guardar').addEventListener('click', async () => {
    const proveedor = fondo.querySelector('#ord-prov').value.trim();
    const notas = fondo.querySelector('#ord-notas').value.trim();
    // capture current qty values before closing
    fondo.querySelectorAll('.ord-item-qty').forEach(inp => {
      const idx = parseInt(inp.dataset.idx);
      if (ordenItems[idx]) ordenItems[idx].qty = parseInt(inp.value) || 1;
    });
    closeModal();
    if (esNueva) {
      await addOrden({ items: ordenItems, proveedor, notas });
      toast('Orden creada', 'exito');
    } else {
      await updateOrden(orden.id, { items: ordenItems, proveedor, notas });
      toast('Orden actualizada', 'exito');
    }
  });
}

function modalVerOrden(orden) {
  const totalCost = orden.items.reduce((s, i) => s + (i.unitCost || 0) * (i.qty || 0), 0);
  const estadoColors = { borrador: 'ins-azul', enviada: 'ins-ambar', recibida: 'ins-verde' };
  const estadoLabel = { borrador: 'Borrador', enviada: 'Enviada', recibida: 'Recibida' };
  const filas = orden.items.map(item => `<tr>
    <td>${escape(item.nombre)}</td>
    <td class="num">${item.qty}</td>
    <td>${escape(item.unit || '')}</td>
    <td class="num">${item.unitCost ? '$' + fmtMoneda(item.unitCost) : '—'}</td>
    <td class="num">${item.unitCost ? '$' + fmtMoneda(item.unitCost * item.qty) : '—'}</td>
  </tr>`).join('');

  openModal({
    titulo: `${ico('compras', 18)} ${escape(orden.numero)}`,
    cuerpo: `
      <div style="margin-bottom:14px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <span class="insignia ${estadoColors[orden.estado]}">${estadoLabel[orden.estado]}</span>
        ${orden.proveedor ? `<span style="font-size:.85rem;color:var(--texto-suave)">${ico('proveedor', 13)} ${escape(orden.proveedor)}</span>` : ''}
        <span style="font-size:.82rem;color:var(--texto-tenue)">Creada: ${fmtFecha(orden.createdAt)}</span>
        ${orden.receivedAt ? `<span style="font-size:.82rem;color:var(--verde)">Recibida: ${fmtFecha(orden.receivedAt)}</span>` : ''}
      </div>
      ${orden.notas ? `<p style="font-size:.88rem;color:var(--texto-suave);margin:0 0 12px">${escape(orden.notas)}</p>` : ''}
      <div class="tabla-scroll">
        <table class="tabla">
          <thead><tr><th>Artículo</th><th class="num">Cant.</th><th>Unidad</th><th class="num">Precio</th><th class="num">Subtotal</th></tr></thead>
          <tbody>${filas.length ? filas : '<tr><td colspan="5" class="vacio">Sin artículos</td></tr>'}</tbody>
        </table>
      </div>
      ${totalCost > 0 ? `<div style="text-align:right;margin-top:10px;font-weight:700;font-size:.95rem">Total estimado: $${fmtMoneda(totalCost)}</div>` : ''}`,
    acciones: `<button class="btn btn-primario" onclick="this.closest('.modal-fondo').remove()">Cerrar</button>`,
    ancho: 520,
  });
}

async function modalRecibirOrden(orden) {
  const recItems = orden.items.map(item => ({ ...item, recibido: item.qty }));

  const filas = recItems.map((item, idx) => `<tr>
    <td style="font-size:.88rem">${escape(item.nombre)}</td>
    <td class="num">${item.qty}</td>
    <td><input type="number" class="rec-qty" data-idx="${idx}" value="${item.qty}" min="0" style="width:75px;min-height:32px;text-align:center;padding:2px 6px"></td>
    <td style="font-size:.82rem;color:var(--texto-suave)">${escape(item.unit || '')}</td>
  </tr>`).join('');

  const fondo = openModal({
    titulo: `${ico('recibir', 18)} Recibir ${escape(orden.numero)}`,
    cuerpo: `
      <p style="font-size:.88rem;color:var(--texto-suave);margin:0 0 14px">Confirma las cantidades recibidas. Se registrará una <strong>entrada de stock</strong> por cada artículo.</p>
      <div class="tabla-scroll">
        <table class="tabla">
          <thead><tr><th>Artículo</th><th class="num">Pedido</th><th class="num">Recibido</th><th>Unidad</th></tr></thead>
          <tbody>${filas.length ? filas : '<tr><td colspan="4" class="vacio">Sin artículos en esta orden</td></tr>'}</tbody>
        </table>
      </div>`,
    acciones: `<button class="btn btn-secundario" id="rec-cancel">Cancelar</button>
               <button class="btn btn-primario" id="rec-ok">${ico('check', 16)} Confirmar recepción</button>`,
    ancho: 500,
  });

  fondo.querySelector('#rec-cancel').addEventListener('click', closeModal);
  fondo.querySelector('#rec-ok').addEventListener('click', async () => {
    const receivedItems = [...fondo.querySelectorAll('.rec-qty')].map(inp => {
      const idx = parseInt(inp.dataset.idx);
      return { ...recItems[idx], qty: parseInt(inp.value) || 0 };
    });
    closeModal();
    await receiveOrden(orden.id, receivedItems);
    toast(`Orden ${orden.numero} recibida — stock actualizado`, 'exito');
  });
}

function imprimirOrdenGuardada(orden) {
  const { nombre } = getEmpresa();
  const totalCost = orden.items.reduce((s, i) => s + (i.unitCost || 0) * (i.qty || 0), 0);
  const filas = orden.items.map(item => `<tr>
    <td><strong>${escape(item.nombre)}</strong></td>
    <td style="text-align:right">${item.qty}</td>
    <td>${escape(item.unit || '')}</td>
    <td style="text-align:right">${item.unitCost ? '$' + fmtMoneda(item.unitCost) : '—'}</td>
    <td style="text-align:right;font-weight:600">${item.unitCost ? '$' + fmtMoneda(item.unitCost * item.qty) : '—'}</td>
  </tr>`).join('');

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
    <title>${escape(orden.numero)} — ${escape(nombre)}</title>
    <style>
      body{font-family:system-ui,sans-serif;font-size:12px;color:#0f172a;margin:20px}
      h1{font-size:18px;margin:0 0 2px;color:#1e3a8a} .sub{color:#64748b;font-size:11px;margin-bottom:16px}
      table{width:100%;border-collapse:collapse} th,td{padding:7px 9px;border-bottom:1px solid #e2e8f0;text-align:left}
      thead th{background:#1e3a8a;color:#fff;font-size:10.5px;text-transform:uppercase;letter-spacing:.04em}
      .total{margin-top:14px;font-size:14px;font-weight:700;text-align:right;color:#1e3a8a}
      .info{display:flex;gap:24px;margin-bottom:14px;font-size:11px;color:#64748b}
      .firm{margin-top:36px;display:grid;grid-template-columns:1fr 1fr;gap:32px}
      .firm-box{border-top:1px solid #94a3b8;padding-top:6px;color:#64748b;font-size:11px}
      @media print{body{margin:8mm}}
    </style></head><body>
    <h1>${escape(orden.numero)}</h1>
    <div class="sub">${escape(nombre)} · Generada: ${fmtFecha(orden.createdAt)}</div>
    <div class="info">
      ${orden.proveedor ? `<span><strong>Proveedor:</strong> ${escape(orden.proveedor)}</span>` : ''}
      <span><strong>Estado:</strong> ${orden.estado}</span>
      ${orden.receivedAt ? `<span><strong>Recibida:</strong> ${fmtFecha(orden.receivedAt)}</span>` : ''}
    </div>
    <table>
      <thead><tr><th>Artículo</th><th style="text-align:right">Cantidad</th><th>Unidad</th><th style="text-align:right">Precio unit.</th><th style="text-align:right">Subtotal</th></tr></thead>
      <tbody>${filas}</tbody>
    </table>
    ${totalCost > 0 ? `<div class="total">Total: $${fmtMoneda(totalCost)}</div>` : ''}
    <div class="firm">
      <div class="firm-box">Solicitado por: ___________________________</div>
      <div class="firm-box">Recibido por: ___________________________</div>
    </div>
    <script>window.onload=()=>window.print()<\/script>
    </body></html>`;
  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); }
}

function imprimirOrden(orden) {
  const { nombre } = getEmpresa();
  const total = orden.reduce((s, { item, qty }) => s + (item.cost || 0) * qty, 0);
  const filas = orden.map(({ item, qty }) => `
    <tr>
      <td>${escape(item.code || '')}</td>
      <td><strong>${escape(item.name)}</strong></td>
      <td>${escape(item.category)}</td>
      <td>${escape(item.supplier || '—')}</td>
      <td style="text-align:right">${item.currentStock} ${item.unit}</td>
      <td style="text-align:right;font-weight:700;color:#1d4ed8">${qty} ${item.unit}</td>
      <td style="text-align:right">${item.cost ? '$' + fmtMoneda(item.cost) : '—'}</td>
      <td style="text-align:right;font-weight:600">${item.cost ? '$' + fmtMoneda(item.cost * qty) : '—'}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
    <title>Orden de Pedido — ${escape(nombre)}</title>
    <style>
      body{font-family:system-ui,sans-serif;font-size:12px;color:#0f172a;margin:20px}
      h1{font-size:18px;margin:0 0 2px} .sub{color:#64748b;font-size:11px;margin-bottom:16px}
      table{width:100%;border-collapse:collapse}
      th,td{padding:7px 9px;border-bottom:1px solid #e2e8f0;text-align:left;vertical-align:top}
      thead th{background:#1e3a8a;color:#fff;font-size:10.5px;text-transform:uppercase;letter-spacing:.04em}
      .total{margin-top:14px;font-size:14px;font-weight:700;text-align:right;color:#1e3a8a}
      .firm{margin-top:36px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:32px}
      .firm-box{border-top:1px solid #94a3b8;padding-top:6px;color:#64748b;font-size:11px}
      @media print{body{margin:8mm}}
    </style></head><body>
    <h1>Orden de Pedido</h1>
    <div class="sub">${escape(nombre)} · Generada: ${new Date().toLocaleString('es-MX')} · ${orden.length} artículo${orden.length !== 1 ? 's' : ''}</div>
    <table>
      <thead><tr><th>Código</th><th>Artículo</th><th>Cat.</th><th>Proveedor</th><th>Stock actual</th><th>Cantidad pedida</th><th>Precio unit.</th><th>Subtotal</th></tr></thead>
      <tbody>${filas}</tbody>
    </table>
    ${total > 0 ? `<div class="total">Total estimado: $${fmtMoneda(total)}</div>` : ''}
    <div class="firm">
      <div class="firm-box">Solicitado por: ___________________________</div>
      <div class="firm-box">Autorizado por: ___________________________</div>
      <div class="firm-box">Fecha de entrega esperada: ________________</div>
    </div>
    <script>window.onload=()=>window.print()<\/script>
    </body></html>`;

  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); }
}

// ── Etiquetas QR ──────────────────────────────────────────────────────────────

function imprimirEtiquetas(arts) {
  if (!arts.length) { toast('No hay artículos para imprimir', 'aviso'); return; }
  const { nombre } = getEmpresa();

  const etiquetas = arts.map(a => {
    const qrSvg = qrSVG(a.code || a.name, 120);
    const sc = stockClass(a.currentStock, a.minStock);
    const color = sc === 'critico' ? '#dc2626' : sc === 'bajo' ? '#b45309' : '#047857';
    return `<div class="etiqueta">
      <div class="etiqueta-qr">${qrSvg}</div>
      <div class="etiqueta-nombre">${escape(a.name)}</div>
      ${a.code ? `<div class="etiqueta-codigo">${escape(a.code)}</div>` : ''}
      <div class="etiqueta-stock" style="color:${color}">${a.currentStock} ${a.unit}</div>
      ${a.location ? `<div class="etiqueta-ubicacion">${escape(a.location)}</div>` : ''}
    </div>`;
  }).join('');

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
    <title>Etiquetas — ${escape(nombre)}</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:system-ui,sans-serif;font-size:11px;background:#fff}
      .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;padding:10px}
      .etiqueta{border:1px solid #cbd5e1;border-radius:8px;padding:8px;text-align:center;page-break-inside:avoid;background:#fff}
      .etiqueta-qr{display:flex;justify-content:center;margin-bottom:4px}
      .etiqueta-qr svg{width:90px;height:90px}
      .etiqueta-nombre{font-weight:700;font-size:11px;line-height:1.3;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
      .etiqueta-codigo{color:#64748b;font-size:9.5px;margin-top:2px}
      .etiqueta-stock{font-weight:700;font-size:12px;margin-top:3px}
      .etiqueta-ubicacion{color:#94a3b8;font-size:9px;margin-top:2px}
      @media print{@page{margin:6mm} body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
    </style></head><body>
    <div class="grid">${etiquetas}</div>
    <script>window.onload=()=>window.print()<\/script>
    </body></html>`;

  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); }
}

// ── ONBOARDING ─────────────────────────────────────────────────────────────────

export function renderOnboarding(container, onDone) {
  container.innerHTML = `
    <div class="vista" style="max-width:520px;margin:0 auto">
      <div class="bienvenida">
        <div class="bv-ico">${ico('paquete', 36)}</div>
        <h2>¡Bienvenido a Control de Inventario!</h2>
        <p>Configura tu espacio en dos pasos rápidos.</p>
      </div>
      <div id="ob-paso1">
        <div class="ob-paso">Paso 1 de 2</div>
        <div class="bloque">
          <h3 style="margin-bottom:12px">${ico('empresa', 16)} ¿Cómo se llama tu empresa o lugar?</h3>
          <div class="campo">
            <input id="ob-nombre" type="text" placeholder="Ej: Hogar de Ancianos San José" maxlength="60">
          </div>
        </div>
        <div style="display:flex;justify-content:flex-end;margin-top:16px">
          <button class="btn btn-primario" id="ob-paso1-sig">Siguiente ${ico('chevron_der', 16)}</button>
        </div>
      </div>
      <div id="ob-paso2" hidden>
        <div class="ob-paso">Paso 2 de 2</div>
        <div class="bloque">
          <h3 style="margin-bottom:12px">${ico('paquete', 16)} ¿Con qué datos quieres empezar?</h3>
          <div style="display:flex;flex-direction:column;gap:10px">
            <button class="btn btn-secundario" id="ob-muestra" style="text-align:left;justify-content:flex-start;padding:16px">
              <div><div style="font-weight:700">${ico('check', 16)} Cargar datos de muestra</div>
              <div style="font-weight:400;color:var(--texto-suave);font-size:.88rem;margin-top:3px">8 artículos de hogar de ancianos listos para explorar</div></div>
            </button>
            <button class="btn btn-secundario" id="ob-vacio" style="text-align:left;justify-content:flex-start;padding:16px">
              <div><div style="font-weight:700">${ico('mas', 16)} Empezar vacío</div>
              <div style="font-weight:400;color:var(--texto-suave);font-size:.88rem;margin-top:3px">Agrega tus propios artículos desde cero</div></div>
            </button>
          </div>
        </div>
      </div>
    </div>`;

  container.querySelector('#ob-paso1-sig').addEventListener('click', () => {
    const nombre = container.querySelector('#ob-nombre').value.trim();
    setEmpresa(nombre || 'Mi Empresa', null);
    document.getElementById('empresa-nombre').textContent = nombre || 'Mi Empresa';
    container.querySelector('#ob-paso1').hidden = true;
    container.querySelector('#ob-paso2').hidden = false;
  });

  const samples = [
    { name:'Pañales Pampers Talla M', category:'Higiene', unit:'paquete', currentStock:15, minStock:5, cost:85, code:'PAM-M', location:'Bodega A', supplier:'Farmacia del Ahorro', expiryDate:'2026-12-31', notes:'Adultos mayores con incontinencia' },
    { name:'Jabón líquido antibacterial', category:'Higiene', unit:'litro', currentStock:8, minStock:3, cost:32, code:'JAB-LIQ', location:'Estante B2', supplier:'Distribuidora Central', expiryDate:null, notes:'' },
    { name:'Guantes de látex S', category:'Higiene', unit:'caja', currentStock:4, minStock:2, cost:95, code:'GUA-S', location:'Enfermería', supplier:'MediSupply', expiryDate:'2026-06-30', notes:'Caja x 100 unidades' },
    { name:'Cloro líquido', category:'Limpieza', unit:'litro', currentStock:6, minStock:2, cost:18, code:'CLO-LIQ', location:'Cuarto de limpieza', supplier:'Distribuidora Central', expiryDate:null, notes:'' },
    { name:'Papel higiénico doble hoja', category:'Higiene', unit:'paquete', currentStock:12, minStock:4, cost:55, code:'PAP-HIG', location:'Bodega A', supplier:'Costco', expiryDate:null, notes:'Paquete x 12 rollos' },
    { name:'Paracetamol 500mg', category:'Medicamentos', unit:'caja', currentStock:3, minStock:2, cost:28, code:'PAR-500', location:'Farmacito', supplier:'Farmacia del Ahorro', expiryDate:'2025-11-30', notes:'Revisar fecha de vencimiento' },
    { name:'Bolsas de basura negras', category:'Limpieza', unit:'paquete', currentStock:5, minStock:2, cost:35, code:'BOL-NEG', location:'Cuarto de limpieza', supplier:'Distribuidora Central', expiryDate:null, notes:'Paquete x 25 bolsas' },
    { name:'Mascarillas quirúrgicas', category:'Higiene', unit:'caja', currentStock:2, minStock:2, cost:65, code:'MAS-QUI', location:'Enfermería', supplier:'MediSupply', expiryDate:'2026-03-31', notes:'Caja x 50 unidades' },
  ];

  container.querySelector('#ob-muestra').addEventListener('click', async () => {
    for (const s of samples) await addArticulo(s);
    markOnboardingDone(); onDone();
  });
  container.querySelector('#ob-vacio').addEventListener('click', () => { markOnboardingDone(); onDone(); });
}

// ── PROVEEDORES ───────────────────────────────────────────────────────────────

export function renderProveedores(container) {
  const provs = getProveedores();
  const state = getState();

  function artsByProv(name) {
    return state.articulos.filter(a => a.supplier === name && !a.archived);
  }

  function avatarLetter(name) {
    return escape(name.trim().charAt(0).toUpperCase()) || 'P';
  }

  function renderCards() {
    const list = getProveedores();
    const grid = container.querySelector('#prov-grid');
    if (!grid) return;
    if (!list.length) {
      grid.innerHTML = `<div class="estado-vacio" style="grid-column:1/-1">
        <div class="ev-ico">${ico('proveedor', 32)}</div>
        <h3>Sin proveedores registrados</h3>
        <p>Agrega tus proveedores para vincularlos a tus artículos y generar órdenes de compra más completas.</p>
        <button class="btn btn-primario" id="prov-add-empty">${ico('mas', 16)} Agregar proveedor</button>
      </div>`;
      grid.querySelector('#prov-add-empty')?.addEventListener('click', modalProv);
      return;
    }
    grid.innerHTML = list.map(p => {
      const arts = artsByProv(p.name);
      return `<div class="prov-card" data-id="${p.id}">
        <div class="prov-cab">
          <div class="prov-avatar">${avatarLetter(p.name)}</div>
          <div class="prov-info">
            <div class="prov-nombre">${escape(p.name)}</div>
            ${p.contacto ? `<div class="prov-contacto">${escape(p.contacto)}</div>` : ''}
          </div>
        </div>
        <div class="prov-meta">
          ${p.telefono ? `<div class="prov-fila">${ico('telefono', 14)} ${escape(p.telefono)}</div>` : ''}
          ${p.email ? `<div class="prov-fila">${ico('correo', 14)} ${escape(p.email)}</div>` : ''}
          ${p.direccion ? `<div class="prov-fila">${ico('ubicacion', 14)} ${escape(p.direccion)}</div>` : ''}
        </div>
        <div class="prov-foot">
          <span class="prov-count">${arts.length} artículo${arts.length !== 1 ? 's' : ''}</span>
          <div class="acciones-celda">
            <button class="btn-icono prov-edit" data-id="${p.id}" title="Editar">${ico('editar', 16)}</button>
            <button class="btn-icono peligro prov-del" data-id="${p.id}" title="Eliminar">${ico('eliminar', 16)}</button>
          </div>
        </div>
      </div>`;
    }).join('');

    grid.querySelectorAll('.prov-edit').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const p = getProveedores().find(x => x.id === btn.dataset.id);
        if (p) modalProv(p);
      });
    });
    grid.querySelectorAll('.prov-del').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const p = getProveedores().find(x => x.id === btn.dataset.id);
        if (!p) return;
        const ok = await confirmacion(`¿Eliminar al proveedor "${p.name}"?`, { peligro: true });
        if (ok) { await deleteProveedor(p.id); renderCards(); toast('Proveedor eliminado', 'aviso'); }
      });
    });
  }

  function modalProv(existing) {
    const esEdicion = !!existing;
    const cuerpo = `<div class="form">
      <div class="fila-2">
        <div class="campo"><label>Nombre *</label><input id="pv-nombre" value="${existing ? escape(existing.name) : ''}" placeholder="Ej: Distribuidora Norte"></div>
        <div class="campo"><label>Persona de contacto</label><input id="pv-contacto" value="${existing ? escape(existing.contacto) : ''}" placeholder="Ej: Juan Pérez"></div>
      </div>
      <div class="fila-2">
        <div class="campo"><label>Teléfono</label><input id="pv-tel" type="tel" value="${existing ? escape(existing.telefono) : ''}" placeholder="+52 55 1234 5678"></div>
        <div class="campo"><label>Correo electrónico</label><input id="pv-email" type="email" value="${existing ? escape(existing.email) : ''}" placeholder="ventas@proveedor.com"></div>
      </div>
      <div class="campo"><label>Dirección</label><input id="pv-dir" value="${existing ? escape(existing.direccion) : ''}" placeholder="Calle, Ciudad"></div>
      <div class="campo"><label>Notas</label><textarea id="pv-notas" rows="2" placeholder="Condiciones de pago, tiempos de entrega…">${existing ? escape(existing.notas) : ''}</textarea></div>
    </div>`;
    const fondo = openModal({
      titulo: `${ico(esEdicion ? 'editar' : 'mas', 18)} ${esEdicion ? 'Editar' : 'Nuevo'} proveedor`,
      cuerpo,
      acciones: `<button class="btn btn-secundario" id="pv-cancel">Cancelar</button>
                 <button class="btn btn-primario" id="pv-guardar">${ico('guardar', 16)} Guardar</button>`,
      ancho: 560,
    });
    fondo.querySelector('#pv-cancel').addEventListener('click', closeModal);
    fondo.querySelector('#pv-guardar').addEventListener('click', async () => {
      const nombre = fondo.querySelector('#pv-nombre').value.trim();
      if (!nombre) { toast('El nombre es obligatorio', 'error'); return; }
      const data = {
        name: nombre,
        contacto: fondo.querySelector('#pv-contacto').value.trim(),
        telefono: fondo.querySelector('#pv-tel').value.trim(),
        email: fondo.querySelector('#pv-email').value.trim(),
        direccion: fondo.querySelector('#pv-dir').value.trim(),
        notas: fondo.querySelector('#pv-notas').value.trim(),
      };
      if (esEdicion) { await updateProveedor(existing.id, data); toast('Proveedor actualizado', 'exito'); }
      else { await addProveedor(data); toast('Proveedor agregado', 'exito'); }
      closeModal();
      renderCards();
    });
  }

  container.innerHTML = `<div class="vista">
    <div class="cab-vista">
      <div>
        <h1 class="titulo-vista">${ico('proveedor', 26)} Proveedores</h1>
        <p class="subtitulo-vista">Gestiona tus contactos y empresas proveedoras</p>
      </div>
      <button class="btn btn-primario" id="prov-nuevo">${ico('mas', 16)} Nuevo proveedor</button>
    </div>
    <div class="prov-grid" id="prov-grid"></div>
  </div>`;

  container.querySelector('#prov-nuevo').addEventListener('click', () => modalProv());
  renderCards();
}
