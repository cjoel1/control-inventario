/**
 * qr.js — Pure-JS QR Code generator (ISO 18004, Byte mode, EC Level M)
 * Supports versions 1-5 (up to 84 bytes of data).
 * Exports: qrSVG(text, px)
 */

// ── GF(256) arithmetic ────────────────────────────────────────────────────────

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(function initGF() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x = (x << 1) ^ (x >= 128 ? 0x11d : 0);
    x &= 0xff;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

function gfMul(a, b) {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

// ── Reed-Solomon ──────────────────────────────────────────────────────────────

function rsGen(n) {
  let g = [1];
  for (let i = 0; i < n; i++) {
    const factor = [1, GF_EXP[i]];
    const out = new Array(g.length + factor.length - 1).fill(0);
    for (let j = 0; j < g.length; j++)
      for (let k = 0; k < factor.length; k++)
        out[j + k] ^= gfMul(g[j], factor[k]);
    g = out;
  }
  return g;
}

function rsCalc(data, n) {
  const gen = rsGen(n);
  const msg = [...data, ...new Array(n).fill(0)];
  for (let i = 0; i < data.length; i++) {
    const coef = msg[i];
    if (coef !== 0)
      for (let j = 0; j < gen.length; j++)
        msg[i + j] ^= gfMul(gen[j], coef);
  }
  return msg.slice(data.length);
}

// ── Version / capacity tables (EC Level M) ───────────────────────────────────
// [maxBytes, ecBytes, blocks, alignmentPos(if any)]

const VER = [
  null,
  { maxB: 14, ecB: 10, blk: 1, align: [] },      // v1
  { maxB: 26, ecB: 16, blk: 1, align: [6, 18] }, // v2
  { maxB: 42, ecB: 26, blk: 2, align: [6, 22] }, // v3
  { maxB: 62, ecB: 36, blk: 2, align: [6, 26] }, // v4
  { maxB: 84, ecB: 48, blk: 2, align: [6, 30] }, // v5
];

// ── Matrix helpers ────────────────────────────────────────────────────────────

function makeMatrix(sz) {
  return Array.from({ length: sz }, () => new Int8Array(sz).fill(-1));
}

function setModule(m, r, c, v) { m[r][c] = v; }

function addFinder(m, tr, tc) {
  for (let r = -1; r <= 7; r++)
    for (let c = -1; c <= 7; c++) {
      const row = tr + r, col = tc + c;
      if (row < 0 || col < 0 || row >= m.length || col >= m.length) continue;
      const inPat = r >= 0 && r <= 6 && c >= 0 && c <= 6;
      const onBorder = r === 0 || r === 6 || c === 0 || c === 6;
      const inInner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
      m[row][col] = inPat ? (onBorder || inInner ? 1 : 0) : 0;
    }
}

function addAlignment(m, r, c) {
  for (let dr = -2; dr <= 2; dr++)
    for (let dc = -2; dc <= 2; dc++) {
      const onBorder = Math.abs(dr) === 2 || Math.abs(dc) === 2;
      const isCenter = dr === 0 && dc === 0;
      if (m[r + dr][c + dc] === -1)
        m[r + dr][c + dc] = onBorder || isCenter ? 1 : 0;
    }
}

function reserveFormat(m, sz) {
  // Row 8 cols 0-8, col 8 rows 0-8 (around top-left finder)
  for (let i = 0; i <= 8; i++) {
    if (m[8][i] === -1) m[8][i] = 0;
    if (m[i][8] === -1) m[i][8] = 0;
  }
  // Bottom-left and top-right copies
  for (let i = 0; i < 8; i++) {
    if (m[sz - 1 - i][8] === -1) m[sz - 1 - i][8] = 0;
    if (m[8][sz - 1 - i] === -1) m[8][sz - 1 - i] = 0;
  }
  m[sz - 8][8] = 1; // dark module
}

function addTimingAndDark(m, sz) {
  for (let i = 8; i < sz - 8; i++) {
    if (m[6][i] === -1) m[6][i] = i % 2 === 0 ? 1 : 0;
    if (m[i][6] === -1) m[i][6] = i % 2 === 0 ? 1 : 0;
  }
}

// ── Format information ────────────────────────────────────────────────────────

function bchFormat(data) {
  let d = data << 10;
  for (let i = 9; i >= 0; i--) {
    if ((d >> (i + 10)) & 1) d ^= 0x537 << i;
  }
  return ((data << 10) | (d & 0x3ff)) ^ 0x5412;
}

function placeFormat(m, sz, mask) {
  // EC Level M = bits 01, so format data = (0b01 << 3) | mask
  const fmt = bchFormat((0b01 << 3) | mask);
  const bits = [];
  for (let i = 0; i < 15; i++) bits.push((fmt >> i) & 1);

  // Copy 1: around top-left finder
  const pos1r = [8, 8, 8, 8, 8, 8, 8, 8, 7, 5, 4, 3, 2, 1, 0];
  const pos1c = [0, 1, 2, 3, 4, 5, 7, 8, 8, 8, 8, 8, 8, 8, 8];
  for (let i = 0; i < 15; i++) m[pos1r[i]][pos1c[i]] = bits[i];

  // Copy 2: bottom-left and top-right
  for (let i = 0; i < 7; i++) m[sz - 1 - i][8] = bits[i];
  for (let i = 7; i < 15; i++) m[8][sz - 8 + (i - 7)] = bits[i];
}

// ── Masking ───────────────────────────────────────────────────────────────────

function maskFn(k, r, c) {
  switch (k) {
    case 0: return (r + c) % 2 === 0;
    case 1: return r % 2 === 0;
    case 2: return c % 3 === 0;
    case 3: return (r + c) % 3 === 0;
    case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
    case 5: return (r * c) % 2 + (r * c) % 3 === 0;
    case 6: return ((r * c) % 2 + (r * c) % 3) % 2 === 0;
    case 7: return ((r + c) % 2 + (r * c) % 3) % 2 === 0;
  }
}

function applyMask(matrix, isData, k) {
  const sz = matrix.length;
  const m = matrix.map(row => Int8Array.from(row));
  for (let r = 0; r < sz; r++)
    for (let c = 0; c < sz; c++)
      if (isData[r][c] && maskFn(k, r, c)) m[r][c] ^= 1;
  return m;
}

function penalty(m) {
  const sz = m.length;
  let p = 0;
  // Rule 1: 5+ in a row
  for (let r = 0; r < sz; r++) {
    let run = 1;
    for (let c = 1; c < sz; c++) {
      if (m[r][c] === m[r][c - 1]) { run++; if (run === 5) p += 3; else if (run > 5) p++; }
      else run = 1;
    }
    run = 1;
    for (let c = 1; c < sz; c++) {
      if (m[c][r] === m[c - 1][r]) { run++; if (run === 5) p += 3; else if (run > 5) p++; }
      else run = 1;
    }
  }
  // Rule 2: 2×2 blocks
  for (let r = 0; r < sz - 1; r++)
    for (let c = 0; c < sz - 1; c++)
      if (m[r][c] === m[r][c+1] && m[r][c] === m[r+1][c] && m[r][c] === m[r+1][c+1]) p += 3;
  // Rule 3: finder-like patterns
  const pat1 = [1,0,1,1,1,0,1,0,0,0,0];
  const pat2 = [0,0,0,0,1,0,1,1,1,0,1];
  for (let r = 0; r < sz; r++)
    for (let c = 0; c <= sz - 11; c++) {
      let m1 = true, m2 = true, v1 = true, v2 = true;
      for (let i = 0; i < 11; i++) {
        if (m[r][c+i] !== pat1[i]) m1 = false;
        if (m[r][c+i] !== pat2[i]) m2 = false;
        if (m[c+i][r] !== pat1[i]) v1 = false;
        if (m[c+i][r] !== pat2[i]) v2 = false;
      }
      if (m1) p += 40; if (m2) p += 40;
      if (v1) p += 40; if (v2) p += 40;
    }
  // Rule 4: dark ratio
  let dark = 0;
  for (let r = 0; r < sz; r++) for (let c = 0; c < sz; c++) dark += m[r][c];
  const pct = (dark / (sz * sz)) * 100;
  p += Math.min(Math.abs(Math.floor(pct / 5) * 5 - 50), Math.abs(Math.ceil(pct / 5) * 5 - 50)) * 2;
  return p;
}

// ── Data encoding ─────────────────────────────────────────────────────────────

function encodeData(text, ver) {
  const { maxB, ecB, blk } = VER[ver];
  const bytes = new TextEncoder().encode(text);
  const dataB = maxB - ecB;

  // Byte mode header + length + data + terminator
  const bits = [];
  const pushBits = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >> i) & 1); };
  pushBits(0b0100, 4);       // mode: byte
  pushBits(bytes.length, 8); // character count
  for (const b of bytes) pushBits(b, 8);
  // Terminator
  for (let i = 0; i < 4 && bits.length < dataB * 8; i++) bits.push(0);
  // Pad to byte boundary
  while (bits.length % 8) bits.push(0);
  // Pad codewords
  const PAD = [0xec, 0x11];
  let pi = 0;
  while (bits.length < dataB * 8) pushBits(PAD[pi++ & 1], 8);

  // Build bytes array
  const data = [];
  for (let i = 0; i < dataB; i++) {
    let v = 0;
    for (let b = 0; b < 8; b++) v = (v << 1) | bits[i * 8 + b];
    data.push(v);
  }

  // Split into blocks and compute EC
  const bSize = Math.floor(dataB / blk);
  const extra = dataB % blk;
  const blocks = [], ecBlocks = [];
  let pos = 0;
  for (let b = 0; b < blk; b++) {
    const sz = bSize + (b >= blk - extra ? 1 : 0);
    const block = data.slice(pos, pos + sz);
    blocks.push(block);
    ecBlocks.push(rsCalc(block, ecB / blk));
    pos += sz;
  }

  // Interleave data
  const cw = [];
  const maxLen = Math.max(...blocks.map(b => b.length));
  for (let i = 0; i < maxLen; i++) for (const b of blocks) if (i < b.length) cw.push(b[i]);
  const ecLen = ecBlocks[0].length;
  for (let i = 0; i < ecLen; i++) for (const b of ecBlocks) cw.push(b[i]);
  return cw;
}

// ── Place data codewords ──────────────────────────────────────────────────────

function placeData(matrix, isData, cw, sz) {
  const bits = [];
  for (const b of cw) for (let i = 7; i >= 0; i--) bits.push((b >> i) & 1);
  let bi = 0;
  let up = true;
  let col = sz - 1;
  while (col > 0) {
    if (col === 6) col--;
    for (let i = 0; i < sz; i++) {
      const row = up ? sz - 1 - i : i;
      for (let dc = 0; dc < 2; dc++) {
        const c = col - dc;
        if (matrix[row][c] === -1) {
          matrix[row][c] = bi < bits.length ? bits[bi++] : 0;
          isData[row][c] = true;
        }
      }
    }
    col -= 2;
    up = !up;
  }
}

// ── Main entry point ──────────────────────────────────────────────────────────

export function qrSVG(text, px = 200) {
  const enc = new TextEncoder().encode(text);
  let ver = 1;
  while (ver <= 5 && enc.length > VER[ver].maxB - VER[ver].ecB - 3) ver++;
  if (ver > 5) {
    // Text too long — truncate
    ver = 5;
    text = text.slice(0, VER[5].maxB - VER[5].ecB - 3);
  }

  const sz = 17 + ver * 4;

  // Build base matrix
  const base = makeMatrix(sz);
  addFinder(base, 0, 0);
  addFinder(base, 0, sz - 7);
  addFinder(base, sz - 7, 0);
  addTimingAndDark(base, sz);
  // Alignment patterns (v2+)
  const al = VER[ver].align;
  if (al.length >= 2) {
    for (const r of al) for (const c of al) {
      if (base[r][c] === -1) addAlignment(base, r, c);
    }
  }
  reserveFormat(base, sz);

  const cw = encodeData(text, ver);

  // Find best mask
  let bestMask = 0, bestPen = Infinity;
  const isData = Array.from({ length: sz }, () => new Uint8Array(sz));
  // Place data once on a clone to find data positions
  const tmp = base.map(r => Int8Array.from(r));
  const tmpD = Array.from({ length: sz }, () => new Uint8Array(sz));
  placeData(tmp, tmpD, cw, sz);
  for (const row of tmpD) for (let c = 0; c < sz; c++) isData[row === tmpD[sz-1] ? sz-1 : tmpD.indexOf(row)][c] = row[c];
  // Recompute isData properly
  for (let r = 0; r < sz; r++) for (let c = 0; c < sz; c++) isData[r][c] = tmpD[r][c];

  for (let k = 0; k < 8; k++) {
    const m = applyMask(tmp, isData, k);
    placeFormat(m, sz, k);
    const pen = penalty(m);
    if (pen < bestPen) { bestPen = pen; bestMask = k; }
  }

  // Build final matrix with best mask
  const final = applyMask(tmp, isData, bestMask);
  placeFormat(final, sz, bestMask);

  // Render SVG with 4-module quiet zone
  const quiet = 4;
  const total = sz + quiet * 2;
  const cell = px / total;
  const w = px;
  const rects = [];
  for (let r = 0; r < sz; r++)
    for (let c = 0; c < sz; c++)
      if (final[r][c]) {
        const x = ((c + quiet) * cell).toFixed(2);
        const y = ((r + quiet) * cell).toFixed(2);
        const s = (cell + 0.5).toFixed(2);
        rects.push(`<rect x="${x}" y="${y}" width="${s}" height="${s}"/>`);
      }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${w}" width="${w}" height="${w}" shape-rendering="crispEdges"><rect width="${w}" height="${w}" fill="white"/><g fill="black">${rects.join('')}</g></svg>`;
}
