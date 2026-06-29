/**
 * utils.js — Utility helpers
 */

export function fmtFecha(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function fmtFechaHora(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function fmtNum(n) {
  if (n === null || n === undefined) return '0';
  return Number(n).toLocaleString('es-MX');
}

export function fmtMoneda(n) {
  if (!n && n !== 0) return '—';
  return Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function genId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function debounce(fn, ms = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function descargaBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function escape(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function csvField(val) {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

export function stockClass(current, min) {
  if (current <= 0) return 'critico';
  if (min > 0 && current <= min) return 'bajo';
  return 'ok';
}

export function stockLabel(current, min) {
  const cls = stockClass(current, min);
  if (cls === 'critico') return 'Sin stock';
  if (cls === 'bajo') return 'Stock bajo';
  return 'Normal';
}

/** Returns 'vencido' | 'critico' | 'proximo' | 'ok' | null */
export function expiryClass(expiryDate) {
  if (!expiryDate) return null;
  const exp = new Date(expiryDate);
  const now = new Date();
  const diffDays = Math.ceil((exp - now) / 86400000);
  if (diffDays < 0) return 'vencido';
  if (diffDays <= 7) return 'critico';
  if (diffDays <= 30) return 'proximo';
  return 'ok';
}

export function expiryDaysLeft(expiryDate) {
  if (!expiryDate) return null;
  return Math.ceil((new Date(expiryDate) - new Date()) / 86400000);
}

export function calcInventoryValue(articulos) {
  return articulos.reduce((sum, a) => {
    if (!a.archivedAt && a.cost > 0) sum += (a.cost || 0) * (a.currentStock || 0);
    return sum;
  }, 0);
}

export async function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

export async function resizeImage(base64, maxW = 320, maxH = 320) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(maxW / img.width, maxH / img.height, 1);
      const canvas = document.createElement('canvas');
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.75));
    };
    img.src = base64;
  });
}

export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

export function parseCsvLine(line) {
  const result = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === ',' && !inQ) {
      result.push(cur); cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}
