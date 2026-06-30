/**
 * storage.js — localStorage helpers (device ID, activation, PIN, theme, prefs)
 * Keys with __ prefix are excluded from backups.
 */

const K = {
  DEVICE_ID: '__device_id',
  ACT: '__act',
  PIN: '__pin',
  THEME: 'tema',
  ONBOARDING: 'onboarding_done',
  EMPRESA: 'empresa_nombre',
  LOGO: 'empresa_logo',
  CATEGORIES: 'categorias',
  UNITS: 'unidades',
  ALTO_CONTRASTE: 'alto_contraste',
  ROL: '__rol',
};

function genDeviceId() {
  const arr = new Uint8Array(12);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

export function getDeviceId() {
  let id = localStorage.getItem(K.DEVICE_ID);
  if (!id) {
    id = genDeviceId();
    localStorage.setItem(K.DEVICE_ID, id);
  }
  return id;
}

export function saveActivation(data) {
  localStorage.setItem(K.ACT, JSON.stringify(data));
}

export function loadActivation() {
  try {
    const raw = localStorage.getItem(K.ACT);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function clearActivation() {
  localStorage.removeItem(K.ACT);
}

export function getPIN() {
  return localStorage.getItem(K.PIN) || null;
}

export function setPIN(pin) {
  localStorage.setItem(K.PIN, pin);
}

export function removePIN() {
  localStorage.removeItem(K.PIN);
}

export function getTheme() {
  return localStorage.getItem(K.THEME) || 'claro';
}

export function setTheme(t) {
  localStorage.setItem(K.THEME, t);
}

export function isOnboardingDone() {
  return localStorage.getItem(K.ONBOARDING) === '1';
}

export function markOnboardingDone() {
  localStorage.setItem(K.ONBOARDING, '1');
}

export function getEmpresa() {
  return {
    nombre: localStorage.getItem(K.EMPRESA) || 'Mi Empresa',
    logo: localStorage.getItem(K.LOGO) || null,
  };
}

export function setEmpresa(nombre, logo) {
  localStorage.setItem(K.EMPRESA, nombre || 'Mi Empresa');
  if (logo !== undefined) {
    if (logo) localStorage.setItem(K.LOGO, logo);
    else localStorage.removeItem(K.LOGO);
  }
}

export function getCategories() {
  try {
    const raw = localStorage.getItem(K.CATEGORIES);
    return raw ? JSON.parse(raw) : defaultCategories();
  } catch { return defaultCategories(); }
}

export function setCategories(cats) {
  localStorage.setItem(K.CATEGORIES, JSON.stringify(cats));
}

export function defaultCategories() {
  return ['General', 'Higiene', 'Alimentos', 'Limpieza', 'Medicamentos', 'Papelería', 'Mantenimiento', 'Otros'];
}

export function getUnits() {
  try {
    const raw = localStorage.getItem(K.UNITS);
    return raw ? JSON.parse(raw) : defaultUnits();
  } catch { return defaultUnits(); }
}

export function setUnits(units) {
  localStorage.setItem(K.UNITS, JSON.stringify(units));
}

export function defaultUnits() {
  return ['unidad', 'paquete', 'caja', 'bolsa', 'litro', 'kg', 'par', 'docena', 'rollo'];
}

export function getRole() {
  return localStorage.getItem(K.ROL) || 'admin';
}

export function setRole(rol) {
  localStorage.setItem(K.ROL, rol);
}

export function getAltoContraste() {
  return localStorage.getItem(K.ALTO_CONTRASTE) === '1';
}

export function setAltoContraste(val) {
  localStorage.setItem(K.ALTO_CONTRASTE, val ? '1' : '0');
}

export function exportPrefs() {
  const prefs = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k.startsWith('__')) prefs[k] = localStorage.getItem(k);
  }
  return prefs;
}

export function importPrefs(obj) {
  Object.entries(obj).forEach(([k, v]) => {
    if (!k.startsWith('__')) localStorage.setItem(k, v);
  });
}
