/**
 * views.js — Control de Inventario
 * -------------------------------------------------------------
 * Renderizado de cada pantalla de la app. Cada vista es una función
 * que recibe el contenedor <main> y lo llena, enlazando sus eventos.
 *
 * El estado vive en store.js; aquí solo presentamos y disparamos acciones.
 * -------------------------------------------------------------
 */

import * as store from './store.js';
import * as backup from './backup.js';
import { estimarAlmacenamiento, esPersistente, formatearBytes } from './storage.js';
import { modal, toast, confirmar } from './ui.js';
import { icono } from './icons.js';
import { leerConfig, escribirConfig } from './db.js';
import {
  esc, normaliza, fechaHora, fechaCorta, descargarBlob, selloArchivo,
} from './utils.js';

/** Estado vacío grande y amable. */
function estadoVacio(ico, titulo, texto, accionHTML = '') {
  return `<div class="estado-vacio">
    <div class="ev-ico">${icono(ico, { size: 30 })}</div>
    <h3>${esc(titulo)}</h3>
    <p>${esc(texto)}</p>
    ${accionHTML}
  </div>`;
}

/** Devuelve la clase CSS para el valor de stock de un artículo. */
function claseStock(art) {
  if (art.stock === 0) return 'cero';
  if (art.stock <= art.stockMinimo) return 'critico';
  if (art.stock <= art.stockMinimo * 1.5) return 'bajo';
  return 'ok';
}

/* ------------------------------ Inicio ----------------------------------- */

export function inicio(main) {
  const arts = store.articulos();
  const bajosMin = store.articulosBajoMinimo();
  const sinStock = arts.filter((a) => a.stock === 0);
  const hoyInicio = new Date(); hoyInicio.setHours(0, 0, 0, 0);
  const movsHoy = store.movimientos().filter((m) => m.at >= hoyInicio.getTime());

  const tarjeta = (ico2, etiqueta, valor, clase, destino) => `
    <a class="tarjeta ${clase}" href="#/${destino}">
      <div class="tarjeta-ico">${icono(ico2, { size: 22 })}</div>
      <div class="tarjeta-cuerpo">
        <div class="tarjeta-valor">${valor}</div>
        <div class="tarjeta-etiqueta">${etiqueta}</div>
      </div>
    </a>`;

  const alertaHTML = bajosMin.length
    ? `<div class="alerta-stock">
        <h3>${icono('alerta-stock', { size: 16 })} ${bajosMin.length} artículo${bajosMin.length > 1 ? 's' : ''} bajo el mínimo</h3>
        ${bajosMin.slice(0, 8).map((a) => `
          <div class="alerta-stock-item">
            <span class="alerta-stock-nombre">${esc(a.nombre)}</span>
            <span class="alerta-stock-qty">${a.stock} / mín ${a.stockMinimo} ${esc(a.unidad)}</span>
          </div>`).join('')}
        ${bajosMin.length > 8 ? `<div style="font-size:.82rem;color:var(--rojo);margin-top:6px">…y ${bajosMin.length - 8} más</div>` : ''}
      </div>`
    : '';

  main.innerHTML = `
    <section class="vista">
      <h1 class="titulo-vista">Tablero</h1>
      <p class="subtitulo-vista">Resumen del inventario de un vistazo.</p>

      ${alertaHTML}

      <div class="tarjetas">
        ${tarjeta('articulo', 'Artículos', arts.length, '', 'articulos')}
        ${tarjeta('historial', 'Movimientos hoy', movsHoy.length, '', 'historial')}
        ${tarjeta('alerta-stock', 'Sin stock', sinStock.length, sinStock.length ? 't-alerta' : '', 'articulos')}
        ${tarjeta('alerta', 'Bajo mínimo', bajosMin.length, bajosMin.length ? 't-aviso' : '', 'articulos')}
      </div>

      <div class="bloque">
        <div class="bloque-cab">
          <h2>Acciones rápidas</h2>
        </div>
        <div class="botones-fila">
          <a class="btn btn-primario" href="#/articulos">${icono('entrada', { size: 18 })} Registrar entrada</a>
          <a class="btn btn-secundario" href="#/articulos">${icono('salida', { size: 18 })} Registrar salida</a>
        </div>
      </div>

      ${bajosMin.length ? `
      <div class="bloque">
        <h2>Artículos bajo mínimo (${bajosMin.length})</h2>
        <div class="tabla-scroll">
          <table class="tabla">
            <thead><tr><th>Artículo</th><th>Categoría</th><th class="num">Stock</th><th class="num">Mínimo</th><th>Unidad</th></tr></thead>
            <tbody>${bajosMin.map((a) => `
              <tr class="${a.stock === 0 ? 'fila-atrasada' : ''}">
                <td class="celda-nombre">${esc(a.nombre)}</td>
                <td>${esc(a.categoria)}</td>
                <td class="num" style="color:var(--${a.stock === 0 ? 'rojo' : 'ambar'})">${a.stock}</td>
                <td class="num">${a.stockMinimo}</td>
                <td>${esc(a.unidad)}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>` : ''}
    </section>`;
}

/* ----------------------------- Artículos --------------------------------- */

export function articulos(main) {
  let filtro = '';
  let categoriaActiva = '';

  const abrirModalMovimiento = (art, tipoMovimiento) => {
    if (!art) return;
    const esEntrada = tipoMovimiento === 'entrada';

    modal({
      titulo: esEntrada ? `Entrada — ${art.nombre}` : `Salida — ${art.nombre}`,
      ancho: '420px',
      cuerpoHTML: `
        <div class="form">
          ${!esEntrada ? `<p style="margin:0 0 4px;font-size:.9rem;color:var(--texto-suave)">Stock actual: <strong>${art.stock} ${esc(art.unidad)}</strong></p>` : ''}
          <div class="campo">
            <label for="mov-cant">Cantidad *</label>
            <input id="mov-cant" type="number" min="1" ${!esEntrada ? `max="${art.stock}"` : ''} value="1" autocomplete="off">
          </div>
          <div class="campo">
            <label for="mov-persona">Persona (opcional)</label>
            <input id="mov-persona" type="text" maxlength="80" placeholder="Ej. María López" autocomplete="off">
          </div>
          <div class="campo">
            <label for="mov-motivo">Motivo (opcional)</label>
            <input id="mov-motivo" type="text" maxlength="120" placeholder="${esEntrada ? 'Ej. Compra de reposición' : 'Ej. Uso diario enfermería'}" autocomplete="off">
          </div>
        </div>
        <div class="modal-acciones">
          <button class="btn btn-secundario" data-cerrar>Cancelar</button>
          <button class="btn ${esEntrada ? 'btn-primario' : 'btn-peligro'}" data-confirmar>
            ${icono(esEntrada ? 'entrada' : 'salida', { size: 16 })} ${esEntrada ? 'Registrar entrada' : 'Registrar salida'}
          </button>
        </div>`,
      alAbrir: (raiz, cerrar) => {
        raiz.querySelector('[data-cerrar]').addEventListener('click', cerrar);
        setTimeout(() => raiz.querySelector('#mov-cant').focus(), 100);

        raiz.querySelector('[data-confirmar]').addEventListener('click', async () => {
          const cant = parseInt(raiz.querySelector('#mov-cant').value, 10);
          if (!cant || cant < 1) { toast('Ingresa una cantidad válida.', 'aviso'); return; }
          if (!esEntrada && cant > art.stock) {
            toast(`Stock insuficiente. Solo hay ${art.stock} ${art.unidad}.`, 'error'); return;
          }
          const persona = raiz.querySelector('#mov-persona').value.trim();
          const motivo = raiz.querySelector('#mov-motivo').value.trim();
          try {
            if (esEntrada) {
              await store.registrarEntrada(art.id, cant, { persona, motivo });
              toast(`Entrada registrada: +${cant} ${art.unidad}.`, 'exito');
            } else {
              await store.registrarSalida(art.id, cant, { persona, motivo });
              toast(`Salida registrada: -${cant} ${art.unidad}.`, 'exito');
            }
            cerrar();
            render();
          } catch (err) {
            toast(err.message || 'No se pudo registrar.', 'error', 5000);
          }
        });
      },
    });
  };

  const abrirFormularioArticulo = (art = null) => {
    const cfg = store.config();
    const esNuevo = !art;

    modal({
      titulo: esNuevo ? 'Nuevo artículo' : 'Editar artículo',
      ancho: '480px',
      cuerpoHTML: `
        <div class="form">
          <div class="campo">
            <label for="af-nombre">Nombre *</label>
            <input id="af-nombre" type="text" maxlength="100" value="${esc(art ? art.nombre : '')}" autocomplete="off">
          </div>
          <div class="fila-2">
            <div class="campo">
              <label for="af-referencia">Referencia / código</label>
              <input id="af-referencia" type="text" maxlength="60" value="${esc(art ? art.referencia : '')}" autocomplete="off">
            </div>
            <div class="campo">
              <label for="af-categoria">Categoría</label>
              <select id="af-categoria">
                ${cfg.categorias.map((c) => `<option value="${esc(c)}" ${art && art.categoria === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="fila-2">
            <div class="campo">
              <label for="af-unidad">Unidad</label>
              <select id="af-unidad">
                ${cfg.unidades.map((u) => `<option value="${esc(u)}" ${art && art.unidad === u ? 'selected' : ''}>${esc(u)}</option>`).join('')}
              </select>
            </div>
            <div class="campo">
              <label for="af-min">Stock mínimo</label>
              <input id="af-min" type="number" min="0" value="${art ? art.stockMinimo : 5}" autocomplete="off">
            </div>
          </div>
          ${esNuevo ? `
          <div class="campo">
            <label for="af-stock">Stock inicial</label>
            <input id="af-stock" type="number" min="0" value="0" autocomplete="off">
          </div>` : ''}
          <div class="campo">
            <label for="af-ubicacion">Ubicación</label>
            <input id="af-ubicacion" type="text" maxlength="80" value="${esc(art ? art.ubicacion : '')}" autocomplete="off" placeholder="Ej. Bodega A, Enfermería…">
          </div>
          <div class="campo">
            <label for="af-notas">Notas</label>
            <textarea id="af-notas" maxlength="200">${esc(art ? art.notas : '')}</textarea>
          </div>
        </div>
        <div class="modal-acciones">
          <button class="btn btn-secundario" data-cerrar>Cancelar</button>
          <button class="btn btn-primario" data-guardar>${esNuevo ? 'Agregar artículo' : 'Guardar cambios'}</button>
        </div>`,
      alAbrir: (raiz, cerrar) => {
        raiz.querySelector('[data-cerrar]').addEventListener('click', cerrar);
        setTimeout(() => raiz.querySelector('#af-nombre').focus(), 100);

        raiz.querySelector('[data-guardar]').addEventListener('click', async () => {
          const nombre = raiz.querySelector('#af-nombre').value.trim();
          if (!nombre) { raiz.querySelector('#af-nombre').focus(); toast('El nombre es obligatorio.', 'aviso'); return; }
          const datos = {
            nombre,
            referencia: raiz.querySelector('#af-referencia').value.trim(),
            categoria: raiz.querySelector('#af-categoria').value,
            unidad: raiz.querySelector('#af-unidad').value,
            stockMinimo: parseInt(raiz.querySelector('#af-min').value, 10) || 0,
            ubicacion: raiz.querySelector('#af-ubicacion').value.trim(),
            notas: raiz.querySelector('#af-notas').value.trim(),
          };
          if (esNuevo) {
            datos.stock = parseInt(raiz.querySelector('#af-stock').value, 10) || 0;
          }
          try {
            if (esNuevo) {
              await store.agregarArticulo(datos);
              toast('Artículo agregado.', 'exito');
            } else {
              await store.editarArticulo(art.id, datos);
              toast('Artículo actualizado.', 'exito');
            }
            cerrar();
            render();
          } catch (err) {
            toast(err.message || 'No se pudo guardar.', 'error', 5000);
          }
        });
      },
    });
  };

  const abrirAjusteStock = (art) => {
    modal({
      titulo: `Ajustar stock — ${art.nombre}`,
      ancho: '380px',
      cuerpoHTML: `
        <div class="form">
          <p style="margin:0 0 8px;font-size:.9rem;color:var(--texto-suave)">Stock actual: <strong>${art.stock} ${esc(art.unidad)}</strong></p>
          <div class="campo">
            <label for="aj-stock">Nuevo stock (conteo físico)</label>
            <input id="aj-stock" type="number" min="0" value="${art.stock}" autocomplete="off">
          </div>
          <div class="campo">
            <label for="aj-motivo">Motivo del ajuste</label>
            <input id="aj-motivo" type="text" maxlength="120" value="Conteo físico" autocomplete="off">
          </div>
        </div>
        <div class="modal-acciones">
          <button class="btn btn-secundario" data-cerrar>Cancelar</button>
          <button class="btn btn-primario" data-guardar>Aplicar ajuste</button>
        </div>`,
      alAbrir: (raiz, cerrar) => {
        raiz.querySelector('[data-cerrar]').addEventListener('click', cerrar);
        setTimeout(() => { const i = raiz.querySelector('#aj-stock'); i.focus(); i.select(); }, 100);
        raiz.querySelector('[data-guardar]').addEventListener('click', async () => {
          const nuevo = parseInt(raiz.querySelector('#aj-stock').value, 10);
          if (isNaN(nuevo) || nuevo < 0) { toast('Ingresa un valor válido.', 'aviso'); return; }
          const motivo = raiz.querySelector('#aj-motivo').value.trim() || 'Conteo físico';
          try {
            await store.ajustarStock(art.id, nuevo, motivo);
            toast(`Stock ajustado a ${nuevo} ${art.unidad}.`, 'exito');
            cerrar();
            render();
          } catch (err) {
            toast(err.message || 'No se pudo ajustar.', 'error', 5000);
          }
        });
      },
    });
  };

  const render = () => {
    const cfg = store.config();
    const todos = store.articulos();
    const categorias = cfg.categorias;

    const lista = todos
      .filter((a) => {
        if (categoriaActiva && a.categoria !== categoriaActiva) return false;
        if (filtro) {
          const t = normaliza(`${a.nombre} ${a.referencia} ${a.categoria} ${a.ubicacion}`);
          return t.includes(normaliza(filtro));
        }
        return true;
      })
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

    const chipsHTML = `
      <div class="cat-filtros">
        <button class="cat-chip ${!categoriaActiva ? 'activo' : ''}" data-cat="">Todos</button>
        ${categorias.map((c) => `<button class="cat-chip ${categoriaActiva === c ? 'activo' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}
      </div>`;

    const artCardHTML = (a) => {
      const cls = claseStock(a);
      const maxBar = Math.max(a.stockMinimo * 2, a.stock, 1);
      const pct = Math.min(100, Math.round((a.stock / maxBar) * 100));
      return `
        <div class="art-card ${a.stock === 0 ? 'sin-stock' : a.stock <= a.stockMinimo ? 'bajo-min' : ''}">
          <div class="art-cab">
            <div class="art-info">
              <p class="art-nombre">${esc(a.nombre)}</p>
              <p class="art-meta">${esc(a.categoria)}${a.ubicacion ? ' · ' + esc(a.ubicacion) : ''}${a.referencia ? ' · ' + esc(a.referencia) : ''}</p>
            </div>
            <div class="art-stock-area">
              <span class="stock-val ${cls}">${a.stock}</span>
              <span style="font-size:.72rem;color:var(--texto-tenue);margin-top:1px">${esc(a.unidad)}</span>
              <div class="stock-barra-cont" style="width:70px">
                <div class="stock-barra ${cls}" style="width:${pct}%"></div>
              </div>
            </div>
          </div>
          <div class="art-acciones">
            <button class="btn btn-sm btn-entrada" data-entrada="${a.id}">${icono('entrada', { size: 14 })} Entrada</button>
            <button class="btn btn-sm btn-salida" data-salida="${a.id}" ${a.stock === 0 ? 'disabled' : ''}>${icono('salida', { size: 14 })} Salida</button>
            <button class="btn-icono" data-editar="${a.id}" title="Editar">${icono('editar')}</button>
            <button class="btn-icono" data-ajustar="${a.id}" title="Ajustar stock">${icono('calibrar')}</button>
            <button class="btn-icono" data-archivar="${a.id}" title="Archivar">${icono('archivar')}</button>
          </div>
        </div>`;
    };

    let cuerpo;
    if (!lista.length && !filtro && !categoriaActiva) {
      cuerpo = estadoVacio('articulo', 'Sin artículos',
        'Agrega tu primer artículo para empezar a controlar el inventario.',
        `<button class="btn btn-primario" data-agregar>${icono('agregar', { size: 18 })} Agregar artículo</button>`);
    } else {
      cuerpo = `
        <div class="barra-busqueda">
          <span class="ico-busq">${icono('buscar')}</span>
          <input type="search" id="buscar-arts" placeholder="Buscar por nombre, referencia, categoría…" value="${esc(filtro)}" autocomplete="off">
        </div>
        ${lista.length
          ? `<div class="art-lista">${lista.map(artCardHTML).join('')}</div>`
          : `<p class="vacio">Sin resultados para tu búsqueda.</p>`}`;
    }

    const numArchivados = store.articulosArchivados().length;

    main.innerHTML = `
      <section class="vista">
        <div class="cab-vista">
          <h1 class="titulo-vista">Artículos</h1>
          <div class="botones-fila">
            ${numArchivados ? `<a class="btn btn-secundario btn-sm" href="#/ajustes">Archivados (${numArchivados})</a>` : ''}
            <button class="btn btn-primario" data-agregar>${icono('agregar', { size: 18 })} Artículo</button>
          </div>
        </div>
        ${chipsHTML}
        ${cuerpo}
      </section>`;

    // Chips de categoría
    main.querySelectorAll('.cat-chip').forEach((btn) =>
      btn.addEventListener('click', () => { categoriaActiva = btn.dataset.cat; render(); }));

    // Buscador
    const buscarEl = main.querySelector('#buscar-arts');
    if (buscarEl) buscarEl.addEventListener('input', (ev) => {
      filtro = ev.target.value;
      const pos = ev.target.selectionStart;
      render();
      const nuevo = main.querySelector('#buscar-arts');
      if (nuevo) { nuevo.focus(); try { nuevo.setSelectionRange(pos, pos); } catch (_) {} }
    });

    // Botones agregar
    main.querySelectorAll('[data-agregar]').forEach((b) =>
      b.addEventListener('click', () => abrirFormularioArticulo(null)));

    // Entrada / Salida
    main.querySelectorAll('[data-entrada]').forEach((b) =>
      b.addEventListener('click', () => abrirModalMovimiento(store.articuloPorId(b.dataset.entrada), 'entrada')));
    main.querySelectorAll('[data-salida]').forEach((b) =>
      b.addEventListener('click', () => abrirModalMovimiento(store.articuloPorId(b.dataset.salida), 'salida')));

    // Editar
    main.querySelectorAll('[data-editar]').forEach((b) =>
      b.addEventListener('click', () => abrirFormularioArticulo(store.articuloPorId(b.dataset.editar))));

    // Ajustar
    main.querySelectorAll('[data-ajustar]').forEach((b) =>
      b.addEventListener('click', () => abrirAjusteStock(store.articuloPorId(b.dataset.ajustar))));

    // Archivar
    main.querySelectorAll('[data-archivar]').forEach((b) =>
      b.addEventListener('click', async () => {
        const a = store.articuloPorId(b.dataset.archivar);
        const ok = await confirmar({
          titulo: 'Archivar artículo',
          mensaje: `¿Archivar "${a.nombre}"? Saldrá del inventario activo pero conservará su historial.`,
          textoSi: 'Archivar',
        });
        if (!ok) return;
        try {
          await store.archivarArticulo(a.id);
          toast('Artículo archivado.', 'info');
          render();
        } catch (err) {
          toast(err.message || 'No se pudo archivar.', 'error', 5000);
        }
      }));
  };

  render();
}

/* ------------------------------- Historial ------------------------------- */

export function historial(main) {
  const f = { tipo: '', texto: '', desde: '', hasta: '' };

  const render = () => {
    let movs = store.movimientos().slice().sort((a, b) => b.at - a.at);
    const artsMap = {};
    for (const a of [...store.articulos(), ...store.articulosArchivados()]) artsMap[a.id] = a;

    if (f.tipo) movs = movs.filter((m) => m.tipo === f.tipo);
    if (f.texto) {
      const q = normaliza(f.texto);
      movs = movs.filter((m) => {
        const a = artsMap[m.articuloId];
        return normaliza(`${a ? a.nombre : ''} ${m.persona} ${m.motivo}`).includes(q);
      });
    }
    if (f.desde) {
      const d = new Date(f.desde); d.setHours(0, 0, 0, 0);
      movs = movs.filter((m) => m.at >= d.getTime());
    }
    if (f.hasta) {
      const h = new Date(f.hasta); h.setHours(23, 59, 59, 999);
      movs = movs.filter((m) => m.at <= h.getTime());
    }

    const badgeTipo = (tipo) => {
      if (tipo === 'entrada') return '<span class="badge-entrada">Entrada</span>';
      if (tipo === 'salida') return '<span class="badge-salida">Salida</span>';
      return '<span class="badge-ajuste">Ajuste</span>';
    };

    const filasHTML = movs.length
      ? movs.map((m) => {
          const a = artsMap[m.articuloId];
          return `<tr>
            <td style="white-space:nowrap">${esc(fechaHora(m.at))}</td>
            <td>${badgeTipo(m.tipo)}</td>
            <td>${esc(a ? a.nombre : '(borrado)')}</td>
            <td class="num">${m.cantidad} ${esc(a ? a.unidad : '')}</td>
            <td class="num">${m.stockAntes} → ${m.stockDespues}</td>
            <td>${esc(m.persona || '—')}</td>
            <td>${esc(m.motivo || '—')}</td>
          </tr>`;
        }).join('')
      : `<tr><td colspan="7" class="vacio">No hay movimientos con estos filtros.</td></tr>`;

    main.innerHTML = `
      <section class="vista">
        <div class="cab-vista">
          <h1 class="titulo-vista">Historial</h1>
          <button class="btn btn-secundario" data-csv>CSV</button>
        </div>
        <div class="filtros">
          <select id="h-tipo">
            <option value="">Todos los tipos</option>
            <option value="entrada" ${f.tipo === 'entrada' ? 'selected' : ''}>Entradas</option>
            <option value="salida" ${f.tipo === 'salida' ? 'selected' : ''}>Salidas</option>
            <option value="ajuste" ${f.tipo === 'ajuste' ? 'selected' : ''}>Ajustes</option>
          </select>
          <input type="search" id="h-texto" placeholder="Artículo, persona, motivo…" value="${esc(f.texto)}">
          <label class="filtro-fecha">Desde <input type="date" id="h-desde" value="${esc(f.desde)}"></label>
          <label class="filtro-fecha">Hasta <input type="date" id="h-hasta" value="${esc(f.hasta)}"></label>
        </div>
        <div class="tabla-scroll">
          <table class="tabla">
            <thead><tr><th>Fecha</th><th>Tipo</th><th>Artículo</th><th class="num">Cantidad</th><th class="num">Antes→Después</th><th>Persona</th><th>Motivo</th></tr></thead>
            <tbody>${filasHTML}</tbody>
          </table>
        </div>
      </section>`;

    const reactivar = (id, prop, evento = 'input') => {
      const el = main.querySelector(id);
      if (!el) return;
      el.addEventListener(evento, () => {
        f[prop] = el.value;
        const activo = document.activeElement === el;
        const pos = el.type !== 'select-one' ? el.selectionStart : null;
        render();
        if (activo) {
          const nuevo = main.querySelector(id);
          if (nuevo) { nuevo.focus(); if (pos !== null) try { nuevo.setSelectionRange(pos, pos); } catch (_) {} }
        }
      });
    };
    reactivar('#h-tipo', 'tipo', 'change');
    reactivar('#h-texto', 'texto');
    reactivar('#h-desde', 'desde', 'change');
    reactivar('#h-hasta', 'hasta', 'change');

    main.querySelector('[data-csv]').addEventListener('click', () => {
      backup.exportarHistorialCSV();
      toast('Historial exportado a CSV.', 'exito');
    });
  };

  render();
}

/* -------------------------------- Respaldo ------------------------------- */

export function respaldo(main) {
  main.innerHTML = `
    <section class="vista">
      <h1 class="titulo-vista">Respaldo</h1>

      <div class="bloque">
        <h2>Respaldo completo (.json)</h2>
        <p class="ayuda">Guarda TODO (artículos, historial y ajustes) en un archivo en este dispositivo.
          Restáuralo cuando quieras o pásalo a otra tablet.</p>
        <div class="botones-fila">
          <button class="btn btn-primario" data-exportar>Descargar respaldo</button>
          <label class="btn btn-secundario archivo-btn">
            Restaurar desde archivo
            <input type="file" id="file-restaurar" accept="application/json,.json" hidden>
          </label>
        </div>
        <p class="info-respaldo" id="info-respaldo"></p>
      </div>

      <div class="bloque">
        <h2>Exportar a CSV</h2>
        <p class="ayuda">Para abrir en Excel o Google Sheets. El CSV es solo lectura: no sirve para restaurar.</p>
        <div class="botones-fila">
          <button class="btn btn-secundario" data-csv-inv>Inventario</button>
          <button class="btn btn-secundario" data-csv-hist>Historial</button>
        </div>
      </div>

      <div class="bloque">
        <h2>Copias de seguridad automáticas</h2>
        <p class="ayuda">La app guarda copias en este dispositivo (una al día y antes de borrar/restaurar).
          Sirven para deshacer un cambio o borrado accidental, sin internet.</p>
        <div id="lista-snapshots"><p class="ayuda">Cargando…</p></div>
      </div>

      <div class="bloque">
        <h2>Almacenamiento del dispositivo</h2>
        <div id="almacen-info-r"><p class="ayuda">Calculando…</p></div>
      </div>

      <div class="bloque bloque-peligro">
        <h2>Zona de peligro</h2>
        <p class="ayuda">Borra TODO el inventario y el historial de este dispositivo. Haz un respaldo antes.</p>
        <button class="btn btn-peligro" data-borrar>Borrar todos los datos</button>
      </div>
    </section>`;

  // Lista de snapshots
  const pintarSnapshots = async () => {
    const cont = main.querySelector('#lista-snapshots');
    if (!cont) return;
    const snaps = await store.listarSnapshots();
    if (!snaps.length) {
      cont.innerHTML = '<p class="vacio">Aún no hay copias automáticas.</p>';
      return;
    }
    cont.innerHTML = `<div class="tabla-scroll"><table class="tabla">
      <thead><tr><th>Fecha</th><th>Motivo</th><th class="num">Arts.</th><th class="num">Movs.</th><th>Acciones</th></tr></thead>
      <tbody>${snaps.map((s) => `
        <tr>
          <td>${esc(fechaHora(s.at))}</td>
          <td>${esc(s.motivo || '')}</td>
          <td class="num">${(s.articulos || []).length}</td>
          <td class="num">${(s.movimientos || []).length}</td>
          <td class="acciones-celda">
            <button class="btn btn-secundario btn-sm" data-snap-restaurar="${s.id}">Restaurar</button>
            <button class="btn-icono" data-snap-descargar="${s.id}" title="Descargar">${icono('descargar')}</button>
            <button class="btn-icono peligro" data-snap-eliminar="${s.id}" title="Eliminar">${icono('eliminar')}</button>
          </td>
        </tr>`).join('')}</tbody></table></div>`;

    cont.querySelectorAll('[data-snap-restaurar]').forEach((b) =>
      b.addEventListener('click', async () => {
        const ok = await confirmar({
          titulo: 'Restaurar copia',
          mensaje: 'Esto REEMPLAZARÁ los datos actuales por los de esta copia. ¿Continuar?',
          textoSi: 'Restaurar', peligroso: true,
        });
        if (!ok) return;
        try {
          await store.restaurarSnapshot(b.dataset.snapRestaurar);
          toast('Copia restaurada.', 'exito');
          pintarSnapshots();
        } catch (err) {
          toast(err.message || 'No se pudo restaurar.', 'error', 5000);
        }
      }));

    cont.querySelectorAll('[data-snap-descargar]').forEach((b) =>
      b.addEventListener('click', async () => {
        const snap = snaps.find((s) => s.id === b.dataset.snapDescargar);
        if (!snap) return;
        const datos = {
          app: 'control-inventario', version: 1, exportadoEn: snap.at,
          config: snap.config, articulos: snap.articulos, movimientos: snap.movimientos,
        };
        descargarBlob(new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' }),
          `inventario_copia_${selloArchivo(new Date(snap.at))}.json`);
      }));

    cont.querySelectorAll('[data-snap-eliminar]').forEach((b) =>
      b.addEventListener('click', async () => {
        await store.eliminarSnapshot(b.dataset.snapEliminar);
        pintarSnapshots();
      }));
  };
  pintarSnapshots();

  // Almacenamiento
  (async () => {
    const cont = main.querySelector('#almacen-info-r');
    if (!cont) return;
    const [est, persistente] = await Promise.all([estimarAlmacenamiento(), esPersistente()]);
    if (!est.soportado) {
      cont.innerHTML = `<p class="ayuda">Este navegador no informa el uso de almacenamiento. Tus datos siguen guardados localmente.</p>`;
      return;
    }
    const pct = Math.round(est.porcentaje);
    const nivelBarra = pct >= 85 ? 'barra-roja' : (pct >= 60 ? 'barra-ambar' : 'barra-verde');
    const insigniaP = persistente
      ? '<span class="insignia ins-verde">Protegido</span>'
      : '<span class="insignia ins-ambar">No protegido</span>';
    cont.innerHTML = `
      <div class="almacen-cab">
        <span><strong>${formatearBytes(est.usado)}</strong> usados de ${formatearBytes(est.total)}</span>
        <span>${pct}%</span>
      </div>
      <div class="barra-uso"><div class="barra-uso-rel ${nivelBarra}" style="width:${Math.max(2, pct)}%"></div></div>
      <div class="almacen-pie">Protección contra borrado: ${insigniaP}</div>`;
  })();

  // Info último respaldo
  backup.ultimoRespaldo().then((ts) => {
    const el = main.querySelector('#info-respaldo');
    if (el) el.textContent = ts ? `Último respaldo: ${fechaHora(ts)}` : 'Aún no has hecho ningún respaldo.';
  });

  main.querySelector('[data-exportar]').addEventListener('click', async () => {
    await backup.exportarJSON();
    toast('Respaldo descargado.', 'exito');
    backup.ultimoRespaldo().then((ts) => {
      const el = main.querySelector('#info-respaldo');
      if (el) el.textContent = `Último respaldo: ${fechaHora(ts)}`;
    });
  });

  main.querySelector('#file-restaurar').addEventListener('change', async (e) => {
    const archivo = e.target.files[0];
    if (!archivo) return;
    const ok = await confirmar({
      titulo: 'Restaurar respaldo',
      mensaje: 'Esto REEMPLAZARÁ todos los datos actuales por los del archivo. ¿Continuar?',
      textoSi: 'Restaurar', peligroso: true,
    });
    if (!ok) { e.target.value = ''; return; }
    try {
      const r = await backup.importarJSON(archivo);
      toast(`Restaurado: ${r.articulos} artículos, ${r.movimientos} movimientos.`, 'exito', 5000);
    } catch (err) {
      toast(err.message || 'No se pudo restaurar.', 'error', 6000);
    } finally { e.target.value = ''; }
  });

  main.querySelector('[data-csv-inv]').addEventListener('click', () => { backup.exportarInventarioCSV(); toast('Inventario exportado.', 'exito'); });
  main.querySelector('[data-csv-hist]').addEventListener('click', () => { backup.exportarHistorialCSV(); toast('Historial exportado.', 'exito'); });

  main.querySelector('[data-borrar]').addEventListener('click', async () => {
    const ok = await confirmar({
      titulo: 'Borrar todo',
      mensaje: 'Se borrarán TODOS los artículos y el historial de este dispositivo. Esta acción no se puede deshacer.',
      textoSi: 'Borrar todo', peligroso: true,
    });
    if (!ok) return;
    const ok2 = await confirmar({
      titulo: '¿Seguro?',
      mensaje: '¿De verdad quieres borrar todo? Asegúrate de tener un respaldo.',
      textoSi: 'Sí, borrar', peligroso: true,
    });
    if (!ok2) return;
    await store.borrarTodo();
    toast('Todos los datos fueron borrados. (Se guardó una copia por si fue un error.)', 'info', 5000);
    pintarSnapshots();
  });
}

/* --------------------------------- Ajustes ------------------------------- */

/** Teclado numérico de PIN en un modal. onComplete recibe PIN y devuelve true si correcto. */
function pedirPIN(subtitulo, onComplete) {
  const dotHTML = '<span class="pin-punto"></span>'.repeat(4);
  modal({
    titulo: '',
    ancho: '320px',
    cuerpoHTML: `
      <div style="text-align:center;padding:8px 0 4px">
        <div style="font-size:.95rem;font-weight:700;margin-bottom:6px">${esc(subtitulo)}</div>
        <div class="pin-puntos" id="mp-puntos" style="justify-content:center;margin:16px 0 6px">${dotHTML}</div>
        <div class="pin-error-msg" id="mp-err" style="color:var(--rojo);min-height:18px;margin-bottom:12px"></div>
        <div class="pin-teclado" style="margin:0 auto">
          ${[1,2,3,4,5,6,7,8,9].map((n) => `<button class="pin-tecla" data-k="${n}">${n}</button>`).join('')}
          <div class="pin-tecla-vacia"></div>
          <button class="pin-tecla" data-k="0">0</button>
          <button class="pin-tecla" data-k="⌫">⌫</button>
        </div>
      </div>`,
    alAbrir: (raiz, cerrar) => {
      let entrada = '';
      const puntos = raiz.querySelectorAll('.pin-punto');
      const errEl = raiz.querySelector('#mp-err');
      const puntosDiv = raiz.querySelector('#mp-puntos');
      const actualizar = () => puntos.forEach((p, i) => p.classList.toggle('lleno', i < entrada.length));

      raiz.addEventListener('click', async (e) => {
        const btn = e.target.closest('.pin-tecla');
        if (!btn) return;
        const k = btn.dataset.k;
        if (k === '⌫') { entrada = entrada.slice(0, -1); errEl.textContent = ''; actualizar(); return; }
        if (entrada.length >= 4) return;
        entrada += k;
        actualizar();
        if (entrada.length === 4) {
          const ok = await onComplete(entrada);
          if (ok) { cerrar(); }
          else {
            puntosDiv.classList.add('agitando');
            setTimeout(() => puntosDiv.classList.remove('agitando'), 400);
            entrada = ''; actualizar();
          }
        }
      });
    },
  });
}

/** Flujo de 2 pasos para establecer un nuevo PIN. */
function configurarNuevoPIN(onGuardado) {
  let primerPIN = null;
  const flujo = () => {
    const esPrimero = primerPIN === null;
    pedirPIN(
      esPrimero ? 'Elige un PIN de 4 dígitos' : 'Confirma tu nuevo PIN',
      async (pin) => {
        if (esPrimero) { primerPIN = pin; setTimeout(flujo, 200); return true; }
        if (pin !== primerPIN) { primerPIN = null; setTimeout(flujo, 200); return false; }
        await escribirConfig('__pin', pin);
        await onGuardado();
        toast('PIN activado. La app lo pedirá al abrirse.', 'exito', 5000);
        return true;
      },
    );
  };
  flujo();
}

export function ajustes(main) {
  const c = store.config();

  main.innerHTML = `
    <section class="vista">
      <h1 class="titulo-vista">Ajustes</h1>

      <div class="bloque">
        <h2>Empresa</h2>
        <div class="campo">
          <label for="s-empresa">Nombre de la empresa</label>
          <input id="s-empresa" type="text" maxlength="60" value="${esc(c.nombreEmpresa)}">
        </div>
        <div class="campo">
          <label for="s-logo">Logo (se guarda en el dispositivo)</label>
          <input id="s-logo" type="file" accept="image/*">
          <div class="logo-previa" id="logo-previa">${c.logo ? `<img src="${esc(c.logo)}" alt="Logo">` : '<span class="ayuda">Sin logo</span>'}</div>
          ${c.logo ? '<button class="btn btn-secundario btn-sm" data-quitar-logo>Quitar logo</button>' : ''}
        </div>
      </div>

      <div class="bloque">
        <h2>Categorías</h2>
        <p class="ayuda">Aparecen como filtros en la lista de artículos.</p>
        <div id="lista-categorias" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px">
          ${c.categorias.map((cat) => `
            <span class="insignia ins-azul" style="gap:6px">
              ${esc(cat)}
              <button data-quitar-cat="${esc(cat)}" style="background:none;border:none;cursor:pointer;padding:0;line-height:1;color:inherit;font-size:1rem" title="Quitar">×</button>
            </span>`).join('')}
        </div>
        <div style="display:flex;gap:8px">
          <input id="nueva-cat" type="text" maxlength="40" placeholder="Nueva categoría" style="flex:1">
          <button class="btn btn-secundario btn-sm" data-agregar-cat>Agregar</button>
        </div>
      </div>

      <div class="bloque">
        <h2>Unidades</h2>
        <p class="ayuda">Lista de unidades disponibles al crear artículos.</p>
        <div id="lista-unidades" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px">
          ${c.unidades.map((u) => `
            <span class="insignia ins-azul" style="gap:6px">
              ${esc(u)}
              <button data-quitar-uni="${esc(u)}" style="background:none;border:none;cursor:pointer;padding:0;line-height:1;color:inherit;font-size:1rem" title="Quitar">×</button>
            </span>`).join('')}
        </div>
        <div style="display:flex;gap:8px">
          <input id="nueva-uni" type="text" maxlength="30" placeholder="Nueva unidad" style="flex:1">
          <button class="btn btn-secundario btn-sm" data-agregar-uni>Agregar</button>
        </div>
      </div>

      <div class="bloque">
        <h2>Apariencia</h2>
        <label class="check-fila">
          <input type="checkbox" id="s-oscuro" ${c.tema === 'oscuro' ? 'checked' : ''}> Modo oscuro
        </label>
        <label class="check-fila">
          <input type="checkbox" id="s-contraste" ${c.altoContraste ? 'checked' : ''}> Alto contraste
        </label>
      </div>

      <div class="bloque">
        <h2>Almacenamiento del dispositivo</h2>
        <div id="almacen-info"><p class="ayuda">Calculando…</p></div>
      </div>

      <div class="bloque">
        <h2>Seguridad — Bloqueo con PIN</h2>
        <p class="ayuda">Si activas un PIN, la app lo pedirá cada vez que se abra. Recomendado para tablets compartidas.</p>
        <div id="pin-estado-txt" style="margin-bottom:12px"></div>
        <button class="btn btn-secundario" id="btn-pin-accion">Cargando…</button>
      </div>

      <div class="bloque">
        <h2>Artículos archivados</h2>
        <p class="ayuda">Los artículos archivados conservan su historial pero no aparecen en el inventario activo.</p>
        <div id="lista-archivados"></div>
      </div>

      <div class="bloque">
        <h2>Guía de inicio rápido</h2>
        <p class="ayuda">Resumen de los flujos principales de la aplicación.</p>
        <button class="btn btn-secundario" data-abrir-guia>Ver guía de uso</button>
      </div>

      <div class="botones-fila">
        <button class="btn btn-primario" data-guardar-ajustes>Guardar ajustes</button>
      </div>
    </section>`;

  let logoTemporal = c.logo;
  let categoriasTemp = [...c.categorias];
  let unidadesTemp = [...c.unidades];

  // Almacenamiento
  (async () => {
    const cont = main.querySelector('#almacen-info');
    if (!cont) return;
    const [est, persistente] = await Promise.all([estimarAlmacenamiento(), esPersistente()]);
    if (!est.soportado) { cont.innerHTML = `<p class="ayuda">Este navegador no informa el uso de almacenamiento.</p>`; return; }
    const pct = Math.round(est.porcentaje);
    const nivelBarra = pct >= 85 ? 'barra-roja' : (pct >= 60 ? 'barra-ambar' : 'barra-verde');
    const insigniaP = persistente
      ? '<span class="insignia ins-verde">Protegido</span>'
      : '<span class="insignia ins-ambar">No protegido</span>';
    cont.innerHTML = `
      <div class="almacen-cab"><span><strong>${formatearBytes(est.usado)}</strong> usados de ${formatearBytes(est.total)}</span><span>${pct}%</span></div>
      <div class="barra-uso"><div class="barra-uso-rel ${nivelBarra}" style="width:${Math.max(2, pct)}%"></div></div>
      <div class="almacen-pie">Protección: ${insigniaP}</div>`;
  })();

  // Artículos archivados
  const pintarArchivados = () => {
    const cont = main.querySelector('#lista-archivados');
    if (!cont) return;
    const arch = store.articulosArchivados();
    if (!arch.length) { cont.innerHTML = '<p class="ayuda">No hay artículos archivados.</p>'; return; }
    cont.innerHTML = `<div class="art-lista">${arch.map((a) => `
      <div class="art-card" style="opacity:.8">
        <div class="art-cab">
          <div class="art-info">
            <p class="art-nombre">${esc(a.nombre)}</p>
            <p class="art-meta">${esc(a.categoria)} · ${a.stock} ${esc(a.unidad)}</p>
          </div>
        </div>
        <div class="art-acciones">
          <button class="btn btn-secundario btn-sm" data-restaurar-art="${a.id}">${icono('restaurar', { size: 14 })} Restaurar</button>
          <button class="btn-icono peligro" data-eliminar-art="${a.id}" title="Eliminar permanentemente">${icono('eliminar')}</button>
        </div>
      </div>`).join('')}</div>`;

    cont.querySelectorAll('[data-restaurar-art]').forEach((b) =>
      b.addEventListener('click', async () => {
        await store.restaurarArticulo(b.dataset.restaurarArt);
        toast('Artículo restaurado.', 'exito');
        pintarArchivados();
      }));
    cont.querySelectorAll('[data-eliminar-art]').forEach((b) =>
      b.addEventListener('click', async () => {
        const a = store.articuloPorId(b.dataset.eliminarArt);
        const ok = await confirmar({
          titulo: 'Eliminar permanentemente',
          mensaje: `¿Eliminar "${a ? a.nombre : ''}" y todo su historial para siempre?`,
          textoSi: 'Eliminar', peligroso: true,
        });
        if (ok) {
          await store.eliminarArticulo(b.dataset.eliminarArt);
          toast('Artículo eliminado permanentemente.', 'info');
          pintarArchivados();
        }
      }));
  };
  pintarArchivados();

  // Logo
  main.querySelector('#s-logo').addEventListener('change', (e) => {
    const archivo = e.target.files[0];
    if (!archivo) return;
    if (archivo.size > 500 * 1024) { toast('El logo debe pesar menos de 500 KB.', 'aviso'); e.target.value = ''; return; }
    const lector = new FileReader();
    lector.onload = () => {
      logoTemporal = lector.result;
      main.querySelector('#logo-previa').innerHTML = `<img src="${logoTemporal}" alt="Logo">`;
    };
    lector.readAsDataURL(archivo);
  });
  const btnQuitar = main.querySelector('[data-quitar-logo]');
  if (btnQuitar) btnQuitar.addEventListener('click', () => {
    logoTemporal = '';
    main.querySelector('#logo-previa').innerHTML = '<span class="ayuda">Sin logo</span>';
  });

  // Categorías
  const actualizarChipsCats = () => {
    main.querySelector('#lista-categorias').innerHTML = categoriasTemp.map((cat) => `
      <span class="insignia ins-azul" style="gap:6px">
        ${esc(cat)}
        <button data-quitar-cat="${esc(cat)}" style="background:none;border:none;cursor:pointer;padding:0;line-height:1;color:inherit;font-size:1rem" title="Quitar">×</button>
      </span>`).join('');
    main.querySelectorAll('[data-quitar-cat]').forEach((b) =>
      b.addEventListener('click', () => { categoriasTemp = categoriasTemp.filter((c) => c !== b.dataset.quitarCat); actualizarChipsCats(); }));
  };
  main.querySelectorAll('[data-quitar-cat]').forEach((b) =>
    b.addEventListener('click', () => { categoriasTemp = categoriasTemp.filter((c) => c !== b.dataset.quitarCat); actualizarChipsCats(); }));
  main.querySelector('[data-agregar-cat]').addEventListener('click', () => {
    const input = main.querySelector('#nueva-cat');
    const val = input.value.trim();
    if (!val) return;
    if (!categoriasTemp.includes(val)) { categoriasTemp.push(val); actualizarChipsCats(); }
    input.value = '';
  });

  // Unidades
  const actualizarChipsUnis = () => {
    main.querySelector('#lista-unidades').innerHTML = unidadesTemp.map((u) => `
      <span class="insignia ins-azul" style="gap:6px">
        ${esc(u)}
        <button data-quitar-uni="${esc(u)}" style="background:none;border:none;cursor:pointer;padding:0;line-height:1;color:inherit;font-size:1rem" title="Quitar">×</button>
      </span>`).join('');
    main.querySelectorAll('[data-quitar-uni]').forEach((b) =>
      b.addEventListener('click', () => { unidadesTemp = unidadesTemp.filter((u) => u !== b.dataset.quitarUni); actualizarChipsUnis(); }));
  };
  main.querySelectorAll('[data-quitar-uni]').forEach((b) =>
    b.addEventListener('click', () => { unidadesTemp = unidadesTemp.filter((u) => u !== b.dataset.quitarUni); actualizarChipsUnis(); }));
  main.querySelector('[data-agregar-uni]').addEventListener('click', () => {
    const input = main.querySelector('#nueva-uni');
    const val = input.value.trim();
    if (!val) return;
    if (!unidadesTemp.includes(val)) { unidadesTemp.push(val); actualizarChipsUnis(); }
    input.value = '';
  });

  // Tema
  main.querySelector('#s-oscuro').addEventListener('change', (e) =>
    aplicarTema(e.target.checked ? 'oscuro' : 'claro'));
  main.querySelector('#s-contraste').addEventListener('change', (e) =>
    document.documentElement.classList.toggle('alto-contraste', e.target.checked));

  // Guardar
  main.querySelector('[data-guardar-ajustes]').addEventListener('click', async () => {
    await store.actualizarConfig({
      nombreEmpresa: main.querySelector('#s-empresa').value.trim() || 'Mi Empresa',
      logo: logoTemporal || '',
      tema: main.querySelector('#s-oscuro').checked ? 'oscuro' : 'claro',
      altoContraste: main.querySelector('#s-contraste').checked,
      categorias: categoriasTemp,
      unidades: unidadesTemp,
    });
    toast('Ajustes guardados.', 'exito');
  });

  // PIN
  (async () => {
    const estadoEl = main.querySelector('#pin-estado-txt');
    const btnPin = main.querySelector('#btn-pin-accion');
    if (!estadoEl || !btnPin) return;

    const refrescarEstado = async () => {
      const p = await leerConfig('__pin', null);
      estadoEl.innerHTML = p
        ? '<span class="insignia ins-verde">PIN activo</span> El acceso está protegido con un código de 4 dígitos.'
        : '<span class="insignia ins-ambar">Sin PIN</span> Cualquier persona con esta tablet puede abrir la app.';
      btnPin.textContent = p ? 'Cambiar / desactivar PIN' : 'Activar PIN de acceso';
      return p;
    };
    await refrescarEstado();

    btnPin.addEventListener('click', async () => {
      const pin = await leerConfig('__pin', null);
      if (pin) {
        pedirPIN('Confirma el PIN actual para continuar', async (pinIntroducido) => {
          if (pinIntroducido !== pin) { toast('PIN incorrecto.', 'error'); return false; }
          modal({
            titulo: 'Cambiar o desactivar PIN',
            cuerpoHTML: `<div style="display:flex;flex-direction:column;gap:12px;padding:4px 0">
              <button class="btn btn-secundario" id="opt-cambiar">Cambiar PIN</button>
              <button class="btn btn-secundario" id="opt-desactivar" style="color:var(--rojo);border-color:var(--rojo-borde)">Desactivar PIN</button>
            </div>`,
            alAbrir: (raiz, cerrar) => {
              raiz.querySelector('#opt-cambiar').addEventListener('click', () => {
                cerrar();
                setTimeout(() => configurarNuevoPIN(refrescarEstado), 150);
              });
              raiz.querySelector('#opt-desactivar').addEventListener('click', async () => {
                await escribirConfig('__pin', null);
                cerrar();
                await refrescarEstado();
                toast('PIN desactivado.', 'exito');
              });
            },
          });
          return true;
        });
      } else {
        configurarNuevoPIN(refrescarEstado);
      }
    });
  })();

  // Guía
  main.querySelector('[data-abrir-guia]').addEventListener('click', () => {
    const paso = (n, titulo, desc) => `
      <div class="guia-paso">
        <div class="guia-num">${n}</div>
        <div class="guia-cont"><h3>${titulo}</h3><p>${desc}</p></div>
      </div>`;
    modal({
      titulo: 'Guía de inicio rápido',
      ancho: '520px',
      cuerpoHTML: `<div class="guia">
        ${paso(1, 'Agregar artículos', 'Ve a <strong>Artículos</strong> → botón <strong>+ Artículo</strong> → completa el nombre, categoría y stock mínimo → <strong>Agregar</strong>.')}
        ${paso(2, 'Registrar una entrada', 'En la lista de artículos, toca <strong>+ Entrada</strong> junto al artículo → ingresa la cantidad recibida → <strong>Registrar entrada</strong>.')}
        ${paso(3, 'Registrar una salida', 'Toca <strong>- Salida</strong> junto al artículo → ingresa la cantidad usada y quién la tomó → <strong>Registrar salida</strong>.')}
        ${paso(4, 'Alertas de stock bajo', 'Cuando el stock esté por debajo del mínimo aparece en rojo. Ve a <strong>Ajustes</strong> para cambiar el umbral de cada artículo.')}
        ${paso(5, 'Hacer un respaldo', 'Ve a <strong>Respaldo</strong> → <strong>Descargar respaldo</strong> → guarda el archivo <em>.json</em> en un lugar seguro.')}
        ${paso(6, 'Ver el historial', 'Ve a <strong>Historial</strong> para ver todos los movimientos filtrados por fecha, tipo o artículo. Exporta a CSV para Excel.')}
      </div>`,
    });
  });
}

/* ─────────────────────── Centro de Ayuda ────────────────────────── */

export function ayuda(main) {
  const cat = (titulo) => `<p class="faq-cat">${titulo}</p>`;
  const q = (pregunta, respuesta) => `
    <div class="faq-item">
      <button class="faq-q">
        <span>${pregunta}</span>
        <span class="faq-chevron">${icono('chevron', { size: 18 })}</span>
      </button>
      <div class="faq-r"><div class="faq-r-inner">${respuesta}</div></div>
    </div>`;

  main.innerHTML = `
    <section class="vista">
      <h1 class="titulo-vista">Centro de ayuda</h1>
      <p class="subtitulo-vista">Respuestas a las dudas más comunes. Toca una pregunta para expandirla.</p>
      <div class="bloque">
        <div class="faq-lista">

          ${cat('Mis datos')}
          ${q('¿Dónde están guardados mis datos?',
            'En <strong>esta tablet, solo en esta tablet</strong>. No hay nube, no hay servidor externo, no hay cuenta. Los datos viven en el almacenamiento interno del dispositivo. Nadie más puede acceder a ellos.')}
          ${q('¿Qué pasa si se daña el dispositivo?',
            'Si tienes un respaldo descargado (archivo <em>.json</em>), puedes restaurarlo en una tablet nueva desde la sección <strong>Respaldo → Restaurar desde archivo</strong>. Por eso es importante respaldar con regularidad.')}
          ${q('¿Cuántos artículos puedo tener?',
            'Sin límite práctico. La app usa el almacenamiento interno de la tablet, que normalmente tiene espacio para miles de artículos con su historial completo de movimientos.')}

          ${cat('Movimientos de stock')}
          ${q('¿Cómo registro que recibí mercancía?',
            'Ve a <strong>Artículos</strong> → toca el botón <strong>+ Entrada</strong> junto al artículo → ingresa la cantidad recibida y opcionalmente quién la trajo → <strong>Registrar entrada</strong>. El stock sube automáticamente.')}
          ${q('¿Cómo registro que usé un artículo?',
            'Ve a <strong>Artículos</strong> → toca el botón <strong>- Salida</strong> junto al artículo → ingresa la cantidad usada → <strong>Registrar salida</strong>. Los artículos consumidos no vuelven al stock (son consumibles).')}
          ${q('¿Qué pasa si el stock llega a cero?',
            'El artículo aparece en rojo y el botón de salida se desactiva. Aparece en la alerta del <strong>Inicio</strong> y en el resumen de bajo mínimo. Necesitas registrar una entrada para volver a usar el artículo.')}
          ${q('¿Cómo ajusto el stock si hice un conteo físico?',
            'En la lista de artículos, toca el ícono de <strong>calibrar</strong> (reloj) → ingresa el nuevo conteo real → <strong>Aplicar ajuste</strong>. Se registra un movimiento de tipo "Ajuste" en el historial.')}

          ${cat('Alertas y configuración')}
          ${q('¿Cómo agrego un artículo nuevo?',
            'Ve a <strong>Artículos</strong> → botón <strong>+ Artículo</strong> → completa el nombre, categoría, unidad y stock mínimo → <strong>Agregar artículo</strong>. Puedes indicar un stock inicial si ya tienes unidades.')}
          ${q('¿Qué significa el color rojo en el stock?',
            'Rojo significa que el stock está en <strong>cero</strong> o <strong>por debajo del mínimo</strong> configurado. Ámbar significa que está cerca del mínimo. Verde significa que hay suficiente stock.')}
          ${q('¿Cómo configuro el stock mínimo?',
            'Al agregar o editar un artículo, hay un campo <strong>"Stock mínimo"</strong>. Cuando el stock actual sea igual o menor a ese número, el artículo aparecerá como alerta. Por defecto es 5 unidades.')}

          ${cat('Respaldo y recuperación')}
          ${q('¿Cómo exporto a Excel?',
            'Ve a <strong>Respaldo</strong> → sección <strong>Exportar a CSV</strong> → elige <strong>Inventario</strong> o <strong>Historial</strong>. El archivo CSV se abre directamente en Excel o Google Sheets.')}
          ${q('¿Cada cuánto debo hacer un respaldo?',
            'Mínimo <strong>una vez por semana</strong>. Si registras muchos movimientos diariamente, hazlo cada día. La app te avisa cuando llevas varios días sin respaldar. El proceso tarda menos de 10 segundos.')}

          ${cat('Uso general')}
          ${q('¿Puedo usar la app sin internet?',
            'Sí. La app funciona <strong>100% sin conexión</strong> una vez instalada. Solo necesitas internet para la instalación inicial. Después, funciona igual sin WiFi ni datos móviles.')}
          ${q('¿Cómo actualizo la app?',
            'Las actualizaciones se instalan <strong>automáticamente</strong> la próxima vez que abras la app con conexión a internet. No necesitas descargar nada ni ir a ninguna tienda.')}

          ${cat('Seguridad y soporte')}
          ${q('¿Qué hago si olvidé el PIN?',
            'Contacta al proveedor por WhatsApp: <a href="https://wa.me/17879553363">787-955-3363</a>. Por seguridad, no hay forma de recuperar el PIN sin asistencia. Guárdalo en un lugar seguro.')}
          ${q('¿Qué hago si la app no carga o muestra un error?',
            '(1) Verifica que no estés en modo privado del navegador. (2) Abre la app desde el ícono instalado en la pantalla de inicio. (3) Si sigue fallando, contacta al proveedor: <a href="https://wa.me/17879553363">787-955-3363</a>.')}

        </div>
      </div>
    </section>`;

  main.querySelectorAll('.faq-item').forEach((item) => {
    item.querySelector('.faq-q').addEventListener('click', () => {
      const abierto = item.classList.toggle('abierto');
      if (abierto) {
        main.querySelectorAll('.faq-item.abierto').forEach((otro) => {
          if (otro !== item) otro.classList.remove('abierto');
        });
      }
    });
  });
}

/* ------------------------- Utilidades de presentación -------------------- */

/** Aplica el tema claro/oscuro al documento. */
export function aplicarTema(tema) {
  document.documentElement.dataset.tema = tema;
}
