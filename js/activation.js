/**
 * activation.js — License activation (HMAC-SHA256)
 * Secret: SHH-STOCK-2025
 * Permanent:  XXXX-XXXX  → HMAC-SHA256(deviceId, secret) → first 8 hex chars, uppercase, dash at 4
 * Beta/trial: YYYYMMDD:XXXX-XXXX → HMAC-SHA256(deviceId + '|' + YYYYMMDD, secret)
 */

import { getDeviceId, saveActivation, loadActivation, clearActivation } from './storage.js';

const SECRET = 'SHH-STOCK-2025';

async function hmacHex(message, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function formatCode(hex8) {
  const clean = hex8.toUpperCase().replace(/[^A-F0-9]/g, '').slice(0, 8);
  return `${clean.slice(0, 4)}-${clean.slice(4, 8)}`;
}

export async function generatePermanentCode(deviceId) {
  const hex = await hmacHex(deviceId, SECRET);
  return formatCode(hex);
}

export async function generateBetaCode(deviceId, days = 30) {
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + days);
  const yyyymmdd = expiry.toISOString().slice(0, 10).replace(/-/g, '');
  const hex = await hmacHex(`${deviceId}|${yyyymmdd}`, SECRET);
  return `${yyyymmdd}:${formatCode(hex)}`;
}

export async function activateWithCode(code) {
  const deviceId = getDeviceId();
  const trimmed = code.trim().toUpperCase();

  // Beta format: YYYYMMDD:XXXX-XXXX
  const betaMatch = trimmed.match(/^(\d{8}):([A-F0-9]{4}-[A-F0-9]{4})$/);
  if (betaMatch) {
    const [, yyyymmdd, userCode] = betaMatch;
    const expected = await hmacHex(`${deviceId}|${yyyymmdd}`, SECRET);
    const expectedFormatted = formatCode(expected);
    if (expectedFormatted !== userCode) return { ok: false, msg: 'Código beta incorrecto para este dispositivo.' };
    const expDate = new Date(`${yyyymmdd.slice(0,4)}-${yyyymmdd.slice(4,6)}-${yyyymmdd.slice(6,8)}T23:59:59`);
    if (expDate < new Date()) return { ok: false, msg: 'Este código beta ya expiró.' };
    saveActivation({ type: 'beta', code: trimmed, expiresAt: expDate.toISOString() });
    return { ok: true, type: 'beta', expiresAt: expDate.toISOString() };
  }

  // Permanent format: XXXX-XXXX
  const permMatch = trimmed.match(/^([A-F0-9]{4}-[A-F0-9]{4})$/);
  if (permMatch) {
    const expected = await hmacHex(deviceId, SECRET);
    const expectedFormatted = formatCode(expected);
    if (expectedFormatted !== trimmed) return { ok: false, msg: 'Código de activación incorrecto para este dispositivo.' };
    saveActivation({ type: 'permanent', code: trimmed });
    return { ok: true, type: 'permanent' };
  }

  return { ok: false, msg: 'Formato de código no válido. Use XXXX-XXXX o AAAAMMDD:XXXX-XXXX.' };
}

export function getActivationStatus() {
  const act = loadActivation();
  if (!act) return { state: 'inactive' };
  if (act.type === 'permanent') return { state: 'active' };
  if (act.type === 'beta') {
    const exp = new Date(act.expiresAt);
    const now = new Date();
    if (exp < now) return { state: 'expired', expiresAt: act.expiresAt };
    const msLeft = exp - now;
    const daysLeft = Math.ceil(msLeft / 86400000);
    return { state: 'beta', daysLeft, expiresAt: act.expiresAt };
  }
  return { state: 'inactive' };
}

export function deactivate() {
  clearActivation();
}
