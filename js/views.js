/**
 * views.js — All 5 tab views + onboarding
 */

import {
  getState, articulosActivos, articulosArchivados, articulosBajoStock,
  articulosSinStock, filteredArticulos, filteredMovimientos,
  addArticulo, updateArticulo, archiveArticulo, unarchiveArticulo,
  addMovimiento, setFiltroArticulos, setFiltroHistorial, resetData
} from './store.js';
import { ico } from './icons.js';
import { toast, openModal, closeModal, confirmacion, modalMovimiento } from './ui.js';
import {
  exportarJSON, importarJSON, exportarCSVArticulos, exportarCSVMovimientos,
  crearSnapshot, listarSnapshots, restaurarSnapshot, eliminarSnapshot, medirAlmacenamiento
} from './backup.js';
import {
  getCategories, setCategories, getUnits, setUnits,
  getEmpresa, setEmpresa, getPIN, setPIN, removePIN,
  defaultCategories, defaultUnits, markOnboardingDone, isOnboardingDone
} from './storage.js';
import { fmtFecha, fmtFechaHora, escape, stockClass, debounce, fileToBase64 } from './utils.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function stockBadge(art) {
  const cls = stockClass(art.currentStock, art.minStock);
  const labels = { ok: 'Normal', bajo: 'Bajo', critico: 'Crítico' };
  const ins = { ok: 'ins-verde', bajo: 'ins-ambar', critico: 'ins-roja' };
  return `<span class="insignia ${ins[cls]}">${labels[cls]}</span>`;
}

function tipoLabel(tipo) {
  if (tipo === 'entrada') return `<span class="badge-entrada">${ico('mas', 13)} Entrada</span>`;
  if (tipo === 'salida')  return `<span class="badge-salida">${ico('menos', 13)} Salida</span>`;
  return `<span class="badge-ajuste">${ico('ajustes', 13)} Ajuste</span>`;
}

// ── Vista INICIO ──────────────────────────────────────────────────────────────

export function renderInicio(container) {
  const state = getState();
  const activos = articulosActivos();
  const bajoStock = articulosBajoStock();
  const sinStock = articulosSinStock();
  const normal = activos.filter(a => a.minStock === 0 || a.currentStock > a.minStock);
  const recientes = [...state.movimientos].sort((a, b) => b.at - a.at).slice(0, 8);
  const artMap = {};
  activos.forEach(a => { artMap[a.id] = a; });

  const alertasHtml = bajoStock.length ? `
    <div class="alerta-stock">
      <h3>${ico('alerta', 16)} ${bajoStock.length} artículo${bajoStock.length > 1 ? 's' : ''} con stock bajo</h3>
      ${bajoStock.map(a => `
        <div class="alerta-stock-item">
          <span class="alerta-stock-nombre">${escape(a.name)}</span>
          <span class="alerta-stock-qty">${a.currentStock} ${a.unit} (mín. ${a.minStock})</span>
        </div>`).join('')}
    </div>` : '';

  const recientesHtml = recientes.length ? `
    <div class="bloque">
      <h2>${ico('historial', 18)} Movimientos recientes</h2>
      <div class="tabla-scroll" style="margin-top:12px">
        <table class="tabla">
          <thead><tr><th>Artículo</th><th>Tipo</th><th class="num">Cantidad</th><th>Fecha</th></tr></thead>
          <tbody>
            ${recientes.map(m => {
              const art = artMap[m.articuloId];
              return `<tr>
                <td class="celda-nombre">${art ? escape(art.name) : '—'}</td>
                <td>${tipoLabel(m.type)}</td>
                <td class="num mono">${m.qty}</td>
                <td style="white-space:nowrap;color:var(--texto-suave);font-size:.85rem">${fmtFechaHora(m.at)}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>` : '';

  container.innerHTML = `
    <div class="vista">
      <h1 class="titulo-vista">${ico('inicio', 22)} Inicio</h1>
      <p class="subtitulo-vista">Resumen del inventario</p>
      <div class="tarjetas">
        <div class="tarjeta${sinStock.length ? ' t-alerta' : ''}">
          <div class="tarjeta-ico">${ico('paquete', 22)}</div>
          <div class="tarjeta-cuerpo">
            <div class="tarjeta-valor">${activos.length}</div>
            <div class="tarjeta-etiqueta">Artículos activos</div>
          </div>
        </div>
        <div class="tarjeta${bajoStock.length ? ' t-aviso' : ' t-ok'}">
          <div class="tarjeta-ico">${ico('alerta', 22)}</div>
          <div class="tarjeta-cuerpo">
            <div class="tarjeta-valor">${bajoStock.length}</div>
            <div class="tarjeta-etiqueta">Stock bajo</div>
          </div>
        </div>
        <div class="tarjeta${sinStock.length ? ' t-alerta' : ' t-ok'}">
          <div class="tarjeta-ico">${ico('alerta', 22)}</div>
          <div class="tarjeta-cuerpo">
            <div class="tarjeta-valor">${sinStock.length}</div>
            <div class="tarjeta-etiqueta">Sin stock</div>
          </div>
        </div>
        <div class="tarjeta t-ok">
          <div class="tarjeta-ico">${ico('check', 22)}</div>
          <div class="tarjeta-cuerpo">
            <div class="tarjeta-valor">${normal.length}</div>
            <div class="tarjeta-etiqueta">Stock normal</div>
          </div>
        </div>
      </div>
      ${alertasHtml}
      ${recientesHtml}
      ${!activos.length ? `
        <div class="estado-vacio">
          <div class="ev-ico">${ico('paquete', 30)}</div>
          <h3>Sin artículos aún</h3>
          <p>Ve a la sección <strong>Artículos</strong> para agregar los productos de tu inventario.</p>
        </div>` : ''}
    </div>`;
}

// ── Vista ARTÍCULOS ───────────────────────────────────────────────────────────

export function renderArticulos(container) {
  const state = getState();
  const cats = ['todos', ...getCategories()];
  const { busqueda, categoria } = state.filtros.articulos;
  const lista = filteredArticulos();

  const chips = cats.map(c =>
    `<button class="cat-chip${(categoria || 'todos') === c ? ' activo' : ''}" data-cat="${c}">
      ${c === 'todos' ? 'Todos' : escape(c)}
    </button>`
  ).join('');

  const filas = lista.map(a => {
    const cls = stockClass(a.currentStock, a.minStock);
    return `
      <div class="art-card${cls === 'critico' ? ' sin-stock' : cls === 'bajo' ? ' bajo-min' : ''}" data-id="${a.id}">
        <div class="art-cab">
          <div class="art-info">
            <div class="art-nombre">${escape(a.name)}${a.code ? ` <span style="color:var(--texto-tenue);font-weight:500;font-size:.8rem">#${escape(a.code)}</span>` : ''}</div>
            <div class="art-meta">${escape(a.category)} · ${escape(a.unit)}</div>
          </div>
          <div class="art-stock-area">
            <div class="stock-val ${cls}">${a.currentStock}</div>
            <div style="font-size:.75rem;color:var(--texto-suave)">${a.unit}</div>
            ${a.minStock > 0 ? `<div class="stock-barra-cont" style="width:60px"><div class="stock-barra ${cls}" style="width:${Math.min(100, a.currentStock / a.minStock * 100)}%"></div></div>` : ''}
          </div>
        </div>
        <div class="art-acciones">
          <button class="btn btn-sm btn-entrada" data-action="entrada" data-id="${a.id}">${ico('mas', 15)} Entrada</button>
          <button class="btn btn-sm btn-salida" data-action="salida" data-id="${a.id}">${ico('menos', 15)} Salida</button>
          <button class="btn btn-sm btn-icono" data-action="editar" data-id="${a.id}" title="Editar">${ico('editar', 16)}</button>
          <button class="btn btn-sm btn-icono" data-action="archivar" data-id="${a.id}" title="Archivar">${ico('archivo', 16)}</button>
        </div>
      </div>`;
  }).join('');

  container.innerHTML = `
    <div class="vista">
      <div class="cab-vista">
        <div>
          <h1 class="titulo-vista">${ico('paquete', 22)} Artículos</h1>
          <p class="subtitulo-vista">Gestiona tu inventario</p>
        </div>
        <button class="btn btn-primario" id="btn-nuevo">${ico('mas', 18)} Nuevo artículo</button>
      </div>
      <div class="barra-busqueda">
        <span class="ico-busq ico">${ico('buscar', 18)}</span>
        <input type="search" id="busq-art" placeholder="Buscar por nombre o código…" value="${escape(busqueda)}">
      </div>
      <div class="cat-filtros">${chips}</div>
      <div class="art-lista" id="art-lista">
        ${lista.length ? filas : `<div class="estado-vacio">
          <div class="ev-ico">${ico('paquete', 30)}</div>
          <h3>Sin resultados</h3>
          <p>${busqueda || categoria !== 'todos' ? 'Prueba con otros filtros.' : 'Agrega tu primer artículo con el botón de arriba.'}</p>
        </div>`}
      </div>
    </div>`;

  // Events
  container.querySelector('#btn-nuevo').addEventListener('click', () => modalArticulo(null));

  const busqInput = container.querySelector('#busq-art');
  busqInput.addEventListener('input', debounce(e => setFiltroArticulos({ busqueda: e.target.value }), 250));

  container.querySelectorAll('.cat-chip').forEach(chip => {
    chip.addEventListener('click', () => setFiltroArticulos({ categoria: chip.dataset.cat }));
  });

  container.querySelector('#art-lista').addEventListener('click', async e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const { action, id } = btn.dataset;
    const state = getState();
    const art = state.articulos.find(a => a.id === id);
    if (!art) return;

    if (action === 'entrada') modalMovimiento(art, 'entrada', async ({ tipo, qty, notas }) => {
      await addMovimiento({ articuloId: id, type: tipo, qty, notes: notas });
      toast(`Entrada registrada: +${qty} ${art.unit}`, 'exito');
    });
    else if (action === 'salida') modalMovimiento(art, 'salida', async ({ tipo, qty, notas }) => {
      await addMovimiento({ articuloId: id, type: tipo, qty, notes: notas });
      toast(`Salida registrada: −${qty} ${art.unit}`, 'exito');
    });
    else if (action === 'editar') modalArticulo(art);
    else if (action === 'archivar') {
      const ok = await confirmacion(`¿Archivar "${art.name}"? No aparecerá en la lista activa.`);
      if (ok) { await archiveArticulo(id); toast('Artículo archivado', 'info'); }
    }
  });
}

function modalArticulo(art) {
  const cats = getCategories();
  const units = getUnits();
  const es_nuevo = !art;

  const cuerpo = `
    <form class="form" id="form-articulo" autocomplete="off">
      <div class="campo">
        <label>Nombre <span style="color:var(--rojo)">*</span></label>
        <input id="art-name" type="text" placeholder="Ej: Pañales Talla M" required value="${art ? escape(art.name) : ''}">
      </div>
      <div class="fila-2">
        <div class="campo">
          <label>Categoría</label>
          <select id="art-cat">
            ${cats.map(c => `<option value="${escape(c)}"${art && art.category === c ? ' selected' : ''}>${escape(c)}</option>`).join('')}
          </select>
        </div>
        <div class="campo">
          <label>Unidad</label>
          <select id="art-unit">
            ${units.map(u => `<option value="${escape(u)}"${art && art.unit === u ? ' selected' : ''}>${escape(u)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="fila-2">
        <div class="campo">
          <label>${es_nuevo ? 'Stock inicial' : 'Stock actual'}</label>
          <input id="art-stock" type="number" min="0" step="1" value="${art ? art.currentStock : '0'}" inputmode="numeric">
        </div>
        <div class="campo">
          <label>Stock mínimo</label>
          <input id="art-min" type="number" min="0" step="1" value="${art ? art.minStock : '0'}" inputmode="numeric">
          <span class="ayuda">Umbral de alerta</span>
        </div>
      </div>
      <div class="campo">
        <label>Código <small style="color:var(--texto-tenue)">(opcional)</small></label>
        <input id="art-code" type="text" placeholder="Ej: PAM-M" value="${art ? escape(art.code) : ''}">
      </div>
      <div class="campo">
        <label>Notas <small style="color:var(--texto-tenue)">(opcional)</small></label>
        <textarea id="art-notes" rows="2">${art ? escape(art.notes) : ''}</textarea>
      </div>
    </form>`;

  const fondo = openModal({
    titulo: es_nuevo ? 'Nuevo artículo' : 'Editar artículo',
    cuerpo,
    acciones: `<button class="btn btn-secundario" id="art-cancel">Cancelar</button>
               <button class="btn btn-primario" id="art-save">${ico('guardar', 16)} ${es_nuevo ? 'Crear' : 'Guardar'}</button>`,
  });

  fondo.querySelector('#art-cancel').addEventListener('click', closeModal);
  fondo.querySelector('#art-save').addEventListener('click', async () => {
    const name = fondo.querySelector('#art-name').value.trim();
    if (!name) { toast('El nombre es requerido', 'error'); return; }
    const data = {
      name,
      category: fondo.querySelector('#art-cat').value,
      unit: fondo.querySelector('#art-unit').value,
      currentStock: Number(fondo.querySelector('#art-stock').value) || 0,
      minStock: Number(fondo.querySelector('#art-min').value) || 0,
      code: fondo.querySelector('#art-code').value.trim(),
      notes: fondo.querySelector('#art-notes').value.trim(),
    };
    closeModal();
    if (es_nuevo) {
      await addArticulo(data);
      toast('Artículo creado', 'exito');
    } else {
      await updateArticulo(art.id, data);
      toast('Artículo actualizado', 'exito');
    }
  });

  fondo.querySelector('#art-name').focus();
}

// ── Vista HISTORIAL ───────────────────────────────────────────────────────────

export function renderHistorial(container) {
  const state = getState();
  const artActivos = articulosActivos();
  const { articuloId, tipo, desde, hasta } = state.filtros.historial;
  const movs = filteredMovimientos();
  const artMap = {};
  state.articulos.forEach(a => { artMap[a.id] = a; });

  const filas = movs.map(m => {
    const art = artMap[m.articuloId];
    return `<tr>
      <td style="white-space:nowrap;color:var(--texto-suave);font-size:.85rem">${fmtFechaHora(m.at)}</td>
      <td class="celda-nombre">${art ? escape(art.name) : '—'}</td>
      <td>${tipoLabel(m.type)}</td>
      <td class="num mono">${m.type === 'salida' ? '−' : '+'}${m.qty}</td>
      <td style="color:var(--texto-suave);font-size:.85rem">${escape(m.notes)}</td>
    </tr>`;
  }).join('');

  container.innerHTML = `
    <div class="vista">
      <div class="cab-vista">
        <div>
          <h1 class="titulo-vista">${ico('historial', 22)} Historial</h1>
          <p class="subtitulo-vista">${movs.length} movimiento${movs.length !== 1 ? 's' : ''}</p>
        </div>
        <button class="btn btn-secundario btn-sm" id="btn-exp-csv">${ico('exportar', 16)} Exportar CSV</button>
      </div>
      <div class="bloque" style="margin-bottom:16px">
        <div class="filtros">
          <select id="fil-art">
            <option value="">Todos los artículos</option>
            ${artActivos.map(a => `<option value="${a.id}"${articuloId === a.id ? ' selected' : ''}>${escape(a.name)}</option>`).join('')}
          </select>
          <select id="fil-tipo">
            <option value="">Todos los tipos</option>
            <option value="entrada"${tipo === 'entrada' ? ' selected' : ''}>Entrada</option>
            <option value="salida"${tipo === 'salida' ? ' selected' : ''}>Salida</option>
            <option value="ajuste"${tipo === 'ajuste' ? ' selected' : ''}>Ajuste</option>
          </select>
          <span class="filtro-fecha">
            ${ico('filtro', 14)} Desde
            <input type="date" id="fil-desde" value="${desde}">
          </span>
          <span class="filtro-fecha">
            Hasta
            <input type="date" id="fil-hasta" value="${hasta}">
          </span>
          <button class="btn btn-sm btn-secundario" id="fil-limpiar">Limpiar</button>
        </div>
      </div>
      <div class="tabla-scroll">
        <table class="tabla">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Artículo</th>
              <th>Tipo</th>
              <th class="num">Cantidad</th>
              <th>Notas</th>
            </tr>
          </thead>
          <tbody>
            ${movs.length ? filas : `<tr><td colspan="5" class="vacio">Sin movimientos con estos filtros</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>`;

  container.querySelector('#btn-exp-csv').addEventListener('click', async () => {
    await exportarCSVMovimientos(movs, state.articulos);
    toast('CSV exportado', 'exito');
  });

  const applyFiltros = () => setFiltroHistorial({
    articuloId: container.querySelector('#fil-art').value,
    tipo: container.querySelector('#fil-tipo').value,
    desde: container.querySelector('#fil-desde').value,
    hasta: container.querySelector('#fil-hasta').value,
  });

  container.querySelector('#fil-art').addEventListener('change', applyFiltros);
  container.querySelector('#fil-tipo').addEventListener('change', applyFiltros);
  container.querySelector('#fil-desde').addEventListener('change', applyFiltros);
  container.querySelector('#fil-hasta').addEventListener('change', applyFiltros);
  container.querySelector('#fil-limpiar').addEventListener('click', () => {
    setFiltroHistorial({ articuloId: '', tipo: '', desde: '', hasta: '' });
  });
}

// ── Vista RESPALDO ────────────────────────────────────────────────────────────

export async function renderRespaldo(container) {
  const snaps = await listarSnapshots();
  const storage = await medirAlmacenamiento();
  const state = getState();

  const pct = storage?.pct ?? 0;
  const barClass = pct < 50 ? 'barra-verde' : pct < 80 ? 'barra-ambar' : 'barra-roja';
  const usedMB = storage ? (storage.used / 1024 / 1024).toFixed(2) : '—';
  const quotaMB = storage ? (storage.quota / 1024 / 1024).toFixed(0) : '—';

  const snapsHtml = snaps.length ? snaps.map(s => `
    <tr>
      <td>${fmtFechaHora(s.createdAt)}</td>
      <td>${s.manual ? 'Manual' : 'Automático'}</td>
      <td>${s.articulosCount} artículos</td>
      <td>
        <button class="btn btn-sm btn-secundario" data-snap-restore="${s.id}">${ico('restaurar', 14)} Restaurar</button>
        <button class="btn btn-sm btn-icono peligro" data-snap-del="${s.id}" title="Eliminar">${ico('eliminar', 14)}</button>
      </td>
    </tr>`).join('') :
    `<tr><td colspan="4" class="vacio">Sin snapshots guardados</td></tr>`;

  container.innerHTML = `
    <div class="vista">
      <h1 class="titulo-vista">${ico('respaldo', 22)} Respaldo</h1>
      <p class="subtitulo-vista">Protege y restaura tus datos</p>

      <div class="bloque">
        <h2>${ico('descargar', 18)} Exportar</h2>
        <p style="color:var(--texto-suave);margin:4px 0 16px">Descarga una copia completa de todos tus datos.</p>
        <div class="botones-fila">
          <button class="btn btn-primario" id="btn-export-json">${ico('descargar', 16)} Respaldo JSON</button>
          <button class="btn btn-secundario" id="btn-export-csv-arts">${ico('exportar', 16)} CSV Artículos</button>
          <button class="btn btn-secundario" id="btn-export-csv-movs">${ico('exportar', 16)} CSV Movimientos</button>
          <button class="btn btn-secundario" id="btn-snap-manual">${ico('guardar', 16)} Crear snapshot</button>
        </div>
      </div>

      <div class="bloque">
        <h2>${ico('subir', 18)} Restaurar</h2>
        <p style="color:var(--texto-suave);margin:4px 0 16px">Importa un respaldo JSON previamente descargado. <strong>Reemplaza todos los datos actuales.</strong></p>
        <label class="btn btn-secundario archivo-btn">
          ${ico('subir', 16)} Seleccionar archivo JSON
          <input type="file" accept=".json" id="file-import" style="display:none">
        </label>
      </div>

      <div class="bloque">
        <h2>${ico('historial', 18)} Snapshots automáticos <span class="insignia ins-azul" style="margin-left:6px">${snaps.length}/${10}</span></h2>
        <div class="tabla-scroll" style="margin-top:12px">
          <table class="tabla">
            <thead><tr><th>Fecha</th><th>Tipo</th><th>Artículos</th><th>Acciones</th></tr></thead>
            <tbody id="snaps-tbody">${snapsHtml}</tbody>
          </table>
        </div>
      </div>

      ${storage ? `
      <div class="bloque">
        <h2>${ico('estadisticas', 18)} Almacenamiento</h2>
        <div class="almacen-cab">
          <span>Espacio usado</span>
          <span><strong>${usedMB} MB</strong> de ${quotaMB} MB</span>
        </div>
        <div class="barra-uso">
          <div class="barra-uso-rel ${barClass}" style="width:${pct}%"></div>
        </div>
        <div class="almacen-pie">${pct}% utilizado · ${state.articulos.length} artículos · ${state.movimientos.length} movimientos</div>
      </div>` : ''}

      <div class="bloque bloque-peligro">
        <h2 style="color:var(--rojo)">${ico('alerta', 18)} Zona peligrosa</h2>
        <p style="color:var(--texto-suave);margin:4px 0 16px">Esta acción elimina permanentemente todos los datos del inventario.</p>
        <button class="btn btn-peligro" id="btn-reset">${ico('eliminar', 16)} Borrar todos los datos</button>
      </div>
    </div>`;

  container.querySelector('#btn-export-json').addEventListener('click', async () => {
    await exportarJSON();
    toast('Respaldo descargado', 'exito');
  });
  container.querySelector('#btn-export-csv-arts').addEventListener('click', async () => {
    await exportarCSVArticulos();
    toast('CSV artículos descargado', 'exito');
  });
  container.querySelector('#btn-export-csv-movs').addEventListener('click', async () => {
    await exportarCSVMovimientos();
    toast('CSV movimientos descargado', 'exito');
  });
  container.querySelector('#btn-snap-manual').addEventListener('click', async () => {
    await crearSnapshot(true);
    toast('Snapshot creado', 'exito');
    renderRespaldo(container);
  });

  container.querySelector('#file-import').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    const ok = await confirmacion('¿Restaurar este respaldo? Se reemplazarán <strong>todos</strong> los datos actuales.', { peligro: true });
    if (!ok) return;
    try {
      const result = await importarJSON(file);
      toast(`Respaldo restaurado: ${result.articulos} artículos, ${result.movimientos} movimientos`, 'exito');
      renderRespaldo(container);
    } catch (err) {
      toast(`Error al restaurar: ${err.message}`, 'error');
    }
  });

  container.querySelector('#snaps-tbody').addEventListener('click', async e => {
    const restoreBtn = e.target.closest('[data-snap-restore]');
    const delBtn = e.target.closest('[data-snap-del]');
    if (restoreBtn) {
      const ok = await confirmacion('¿Restaurar este snapshot? Se reemplazarán los datos actuales.');
      if (!ok) return;
      await restaurarSnapshot(restoreBtn.dataset.snapRestore);
      toast('Snapshot restaurado', 'exito');
      renderRespaldo(container);
    } else if (delBtn) {
      const ok = await confirmacion('¿Eliminar este snapshot?', { peligro: true });
      if (!ok) return;
      await eliminarSnapshot(delBtn.dataset.snapDel);
      renderRespaldo(container);
    }
  });

  container.querySelector('#btn-reset').addEventListener('click', async () => {
    const ok = await confirmacion('¿Borrar <strong>todos</strong> los datos del inventario? Esta acción no se puede deshacer.', { peligro: true });
    if (!ok) return;
    await resetData();
    toast('Datos eliminados', 'info');
    renderRespaldo(container);
  });
}

// ── Vista AJUSTES ─────────────────────────────────────────────────────────────

export function renderAjustes(container) {
  const empresa = getEmpresa();
  const cats = getCategories();
  const units = getUnits();
  const pinActive = !!getPIN();
  const archivados = articulosArchivados();

  container.innerHTML = `
    <div class="vista">
      <h1 class="titulo-vista">${ico('ajustes', 22)} Ajustes</h1>
      <p class="subtitulo-vista">Configura la app</p>

      <!-- Empresa -->
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
              ${empresa.logo ? `<img src="${empresa.logo}" alt="logo">` : '<span style="color:var(--texto-tenue);font-size:.85rem">Sin logotipo</span>'}
            </div>
          </div>
          <div class="botones-fila">
            <button class="btn btn-primario btn-sm" id="btn-save-empresa">${ico('guardar', 15)} Guardar</button>
            ${empresa.logo ? `<button class="btn btn-secundario btn-sm" id="btn-del-logo">Quitar logotipo</button>` : ''}
          </div>
        </div>
      </div>

      <!-- Categorías y Unidades -->
      <div class="bloque">
        <h2>${ico('etiqueta', 18)} Categorías y Unidades</h2>
        <div class="fila-2" style="margin-top:14px;gap:20px">
          <div>
            <h3 style="font-size:.95rem;margin-bottom:8px">Categorías</h3>
            <div id="cats-lista" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">
              ${cats.map(c => `<span class="insignia ins-azul" data-cat="${escape(c)}">${escape(c)} <button style="background:none;border:none;cursor:pointer;color:inherit;padding:0 0 0 4px;font-size:.9em" data-rm-cat="${escape(c)}">×</button></span>`).join('')}
            </div>
            <div style="display:flex;gap:8px">
              <input type="text" id="new-cat" placeholder="Nueva categoría…" style="flex:1">
              <button class="btn btn-sm btn-primario" id="btn-add-cat">${ico('mas', 15)}</button>
            </div>
          </div>
          <div>
            <h3 style="font-size:.95rem;margin-bottom:8px">Unidades</h3>
            <div id="units-lista" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">
              ${units.map(u => `<span class="insignia ins-azul" data-unit="${escape(u)}">${escape(u)} <button style="background:none;border:none;cursor:pointer;color:inherit;padding:0 0 0 4px;font-size:.9em" data-rm-unit="${escape(u)}">×</button></span>`).join('')}
            </div>
            <div style="display:flex;gap:8px">
              <input type="text" id="new-unit" placeholder="Nueva unidad…" style="flex:1">
              <button class="btn btn-sm btn-primario" id="btn-add-unit">${ico('mas', 15)}</button>
            </div>
          </div>
        </div>
        <button class="btn btn-sm btn-secundario" id="btn-reset-cats" style="margin-top:10px">Restablecer predeterminados</button>
      </div>

      <!-- PIN -->
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

      <!-- Archivados -->
      <div class="bloque">
        <h2>${ico('archivo', 18)} Artículos archivados <span class="insignia ins-azul" style="margin-left:6px">${archivados.length}</span></h2>
        ${archivados.length ? `
          <div class="art-lista" style="margin-top:12px" id="arch-lista">
            ${archivados.map(a => `
              <div class="art-card" style="opacity:.75">
                <div class="art-cab">
                  <div class="art-info">
                    <div class="art-nombre">${escape(a.name)}</div>
                    <div class="art-meta">${escape(a.category)} · Archivado el ${fmtFecha(a.archivedAt)}</div>
                  </div>
                </div>
                <div class="art-acciones">
                  <button class="btn btn-sm btn-secundario" data-unarch="${a.id}">${ico('restaurar', 14)} Desarchivar</button>
                </div>
              </div>`).join('')}
          </div>` : '<p style="color:var(--texto-tenue);margin-top:8px">Sin artículos archivados.</p>'}
      </div>
    </div>`;

  // Empresa
  let logoDataUrl = empresa.logo || null;
  container.querySelector('#emp-logo-file').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    logoDataUrl = await fileToBase64(file);
    container.querySelector('#logo-previa').innerHTML = `<img src="${logoDataUrl}" alt="logo" style="max-height:60px;border-radius:8px;border:1px solid var(--borde)">`;
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

  // Categorías
  function renderCatsList() {
    const c = getCategories();
    container.querySelector('#cats-lista').innerHTML = c.map(cat =>
      `<span class="insignia ins-azul">${escape(cat)} <button style="background:none;border:none;cursor:pointer;color:inherit;padding:0 0 0 4px" data-rm-cat="${escape(cat)}">×</button></span>`
    ).join('');
  }
  container.querySelector('#btn-add-cat').addEventListener('click', () => {
    const inp = container.querySelector('#new-cat');
    const v = inp.value.trim();
    if (!v) return;
    const c = getCategories();
    if (!c.includes(v)) { setCategories([...c, v]); renderCatsList(); }
    inp.value = '';
  });
  container.querySelector('#cats-lista').addEventListener('click', e => {
    const btn = e.target.closest('[data-rm-cat]');
    if (!btn) return;
    const cat = btn.dataset.rmCat;
    setCategories(getCategories().filter(c => c !== cat));
    renderCatsList();
  });

  // Unidades
  function renderUnitsList() {
    const u = getUnits();
    container.querySelector('#units-lista').innerHTML = u.map(un =>
      `<span class="insignia ins-azul">${escape(un)} <button style="background:none;border:none;cursor:pointer;color:inherit;padding:0 0 0 4px" data-rm-unit="${escape(un)}">×</button></span>`
    ).join('');
  }
  container.querySelector('#btn-add-unit').addEventListener('click', () => {
    const inp = container.querySelector('#new-unit');
    const v = inp.value.trim();
    if (!v) return;
    const u = getUnits();
    if (!u.includes(v)) { setUnits([...u, v]); renderUnitsList(); }
    inp.value = '';
  });
  container.querySelector('#units-lista').addEventListener('click', e => {
    const btn = e.target.closest('[data-rm-unit]');
    if (!btn) return;
    setUnits(getUnits().filter(u => u !== btn.dataset.rmUnit));
    renderUnitsList();
  });
  container.querySelector('#btn-reset-cats').addEventListener('click', async () => {
    const ok = await confirmacion('¿Restablecer categorías y unidades predeterminadas?');
    if (!ok) return;
    setCategories(defaultCategories());
    setUnits(defaultUnits());
    renderCatsList();
    renderUnitsList();
    toast('Restablecido', 'info');
  });

  // PIN
  const setupPIN = (isChange) => {
    const cuerpo = `
      <div class="form">
        <div class="campo">
          <label>${isChange ? 'PIN actual' : 'PIN nuevo (4 dígitos)'}</label>
          <input id="pin-inp1" type="password" maxlength="4" inputmode="numeric" pattern="[0-9]{4}" placeholder="••••" autocomplete="new-password">
        </div>
        ${isChange ? `<div class="campo"><label>PIN nuevo</label><input id="pin-inp2" type="password" maxlength="4" inputmode="numeric" pattern="[0-9]{4}" placeholder="••••" autocomplete="new-password"></div>
        <div class="campo"><label>Confirmar PIN nuevo</label><input id="pin-inp3" type="password" maxlength="4" inputmode="numeric" placeholder="••••" autocomplete="new-password"></div>` :
        `<div class="campo"><label>Confirmar PIN</label><input id="pin-inp3" type="password" maxlength="4" inputmode="numeric" placeholder="••••" autocomplete="new-password"></div>`}
      </div>`;
    const fondo = openModal({
      titulo: isChange ? 'Cambiar PIN' : 'Activar PIN',
      cuerpo,
      acciones: `<button class="btn btn-secundario" id="pin-cancel">Cancelar</button>
                 <button class="btn btn-primario" id="pin-save">Guardar</button>`,
    });
    fondo.querySelector('#pin-cancel').addEventListener('click', closeModal);
    fondo.querySelector('#pin-save').addEventListener('click', () => {
      if (isChange) {
        const current = fondo.querySelector('#pin-inp1').value;
        if (current !== getPIN()) { toast('PIN actual incorrecto', 'error'); return; }
        const nuevo = fondo.querySelector('#pin-inp2').value;
        const conf = fondo.querySelector('#pin-inp3').value;
        if (nuevo.length !== 4 || !/^\d{4}$/.test(nuevo)) { toast('El PIN debe ser 4 dígitos', 'error'); return; }
        if (nuevo !== conf) { toast('Los PINs no coinciden', 'error'); return; }
        setPIN(nuevo); closeModal(); toast('PIN cambiado', 'exito');
      } else {
        const nuevo = fondo.querySelector('#pin-inp1').value;
        const conf = fondo.querySelector('#pin-inp3').value;
        if (nuevo.length !== 4 || !/^\d{4}$/.test(nuevo)) { toast('El PIN debe ser 4 dígitos', 'error'); return; }
        if (nuevo !== conf) { toast('Los PINs no coinciden', 'error'); return; }
        setPIN(nuevo); closeModal(); toast('PIN activado', 'exito');
        renderAjustes(container);
      }
    });
  };

  container.querySelector('#btn-set-pin')?.addEventListener('click', () => setupPIN(false));
  container.querySelector('#btn-change-pin')?.addEventListener('click', () => setupPIN(true));
  container.querySelector('#btn-del-pin')?.addEventListener('click', async () => {
    const ok = await confirmacion('¿Desactivar el PIN de seguridad?');
    if (!ok) return;
    removePIN(); toast('PIN desactivado', 'info'); renderAjustes(container);
  });

  // Archivados
  container.querySelector('#arch-lista')?.addEventListener('click', async e => {
    const btn = e.target.closest('[data-unarch]');
    if (!btn) return;
    await unarchiveArticulo(btn.dataset.unarch);
    toast('Artículo desarchivado', 'exito');
    renderAjustes(container);
  });
}

// ── Onboarding ────────────────────────────────────────────────────────────────

export function renderOnboarding(container, onDone) {
  container.innerHTML = `
    <div class="vista" style="max-width:520px;margin:0 auto">
      <div class="bienvenida">
        <div class="bv-ico">${ico('paquete', 36)}</div>
        <h2>¡Bienvenido a Control de Inventario!</h2>
        <p>Configura tu espacio de trabajo en dos pasos.</p>
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
              <div>
                <div style="font-weight:700">${ico('check', 16)} Cargar datos de muestra</div>
                <div style="font-weight:400;color:var(--texto-suave);font-size:.88rem;margin-top:3px">8 artículos de hogar de ancianos para explorar la app</div>
              </div>
            </button>
            <button class="btn btn-secundario" id="ob-vacio" style="text-align:left;justify-content:flex-start;padding:16px">
              <div>
                <div style="font-weight:700">${ico('mas', 16)} Empezar vacío</div>
                <div style="font-weight:400;color:var(--texto-suave);font-size:.88rem;margin-top:3px">Agrega tus propios artículos desde cero</div>
              </div>
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

  const loadSample = async () => {
    const samples = [
      { name: 'Pañales Pampers Talla M', category: 'Higiene', unit: 'paquete', currentStock: 15, minStock: 5, code: 'PAM-M', notes: 'Para adultos mayores con incontinencia' },
      { name: 'Jabón líquido antibacterial', category: 'Higiene', unit: 'litro', currentStock: 8, minStock: 3, code: 'JAB-LIQ', notes: '' },
      { name: 'Guantes de látex S', category: 'Higiene', unit: 'caja', currentStock: 4, minStock: 2, code: 'GUA-S', notes: 'Caja x 100 unidades' },
      { name: 'Cloro líquido', category: 'Limpieza', unit: 'litro', currentStock: 6, minStock: 2, code: 'CLO-LIQ', notes: '' },
      { name: 'Papel higiénico', category: 'Higiene', unit: 'paquete', currentStock: 12, minStock: 4, code: 'PAP-HIG', notes: 'Paquete x 12 rollos' },
      { name: 'Paracetamol 500mg', category: 'Medicamentos', unit: 'caja', currentStock: 3, minStock: 2, code: 'PAR-500', notes: 'Revisar fecha de vencimiento' },
      { name: 'Bolsas de basura negras', category: 'Limpieza', unit: 'paquete', currentStock: 5, minStock: 2, code: 'BOL-NEG', notes: 'Paquete x 25' },
      { name: 'Mascarillas quirúrgicas', category: 'Higiene', unit: 'caja', currentStock: 2, minStock: 2, code: 'MAS-QUI', notes: 'Caja x 50 unidades' },
    ];
    for (const s of samples) {
      await addArticulo(s);
    }
  };

  container.querySelector('#ob-muestra').addEventListener('click', async () => {
    await loadSample();
    markOnboardingDone();
    onDone();
  });
  container.querySelector('#ob-vacio').addEventListener('click', () => {
    markOnboardingDone();
    onDone();
  });
}
