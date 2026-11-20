/**
 * Ana sayfa parçacık sahnesi — saf WebGL 1, tek tuval, tek çizim çağrısı (gl.POINTS).
 *
 * Her parçacığın dört hedef konumu vardır (öznitelik olarak GPU'da):
 *   0 gece yolu (şerit çizgileri ve yol kenarları izleyiciye doğru akar, ufukta amber güneş)
 *   1 temsilî arazi haritası ve kıvrılan rota          2 kilometre kadranı ve kendini çizen GPS izi
 *   3 açık kitap (seyahatname)
 * Kaydırma ilerlemesi uStage (0..3) uniform'una yazılır; geçiş köşe gölgelendiricisinde yapılır.
 * Bu modül yalnızca istemcide, dinamik import ile yüklenir (ilk yükleme paketinde yer almaz).
 */
import { generateMap, MAP_ROUTE, MAP_STOPS, type MapPoints } from "./map-points";

export type SceneOptions = {
  /** Sahnenin kaydırma kapsayıcısı (bölümler bunun içinde) */
  root: HTMLElement;
  /** Bölüm öğeleri: 1., 2. ve 3. hedefe geçişin çapaları */
  chapters: HTMLElement[];
  /** Ufuk ışıltısı (CSS); yoldan ayrılınca söner */
  glow?: HTMLElement | null;
  /** Kilometre sayacı metni */
  km?: HTMLElement | null;
  reducedMotion: boolean;
};

export type SceneHandle = { destroy: () => void };

const STRIDE = 20; // 4 hedef × vec4 + rastgele vec4
const FOV_F = 1 / Math.tan((45 * Math.PI) / 360); // dikey 45°
const ROUTE_KM = 640;

// ---------------------------------------------------------------- Yardımcılar
let seed = 1;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd());

/** Catmull-Rom ile yumuşatılmış, yay uzunluğuna göre parametrelenmiş çoklu çizgi. */
function smoothPath(pts: ReadonlyArray<readonly [number, number]>, samples = 600) {
  const out: [number, number][] = [];
  const n = pts.length;
  for (let s = 0; s <= samples; s++) {
    const g = (s / samples) * (n - 1);
    const i = Math.min(Math.floor(g), n - 2), t = g - i;
    const p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, n - 1)];
    const cr = (a: number, b: number, c: number, d: number) =>
      0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
    out.push([cr(p0[0], p1[0], p2[0], p3[0]), cr(p0[1], p1[1], p2[1], p3[1])]);
  }
  const cum = [0];
  for (let i = 1; i < out.length; i++) cum.push(cum[i - 1] + Math.hypot(out[i][0] - out[i - 1][0], out[i][1] - out[i - 1][1]));
  const total = cum[cum.length - 1];
  return (t: number): [number, number] => {
    const d = Math.min(Math.max(t, 0), 1) * total;
    let lo = 0, hi = cum.length - 1;
    while (lo < hi - 1) { const m = (lo + hi) >> 1; if (cum[m] <= d) lo = m; else hi = m; }
    const f = (d - cum[lo]) / Math.max(cum[hi] - cum[lo], 1e-9);
    return [out[lo][0] + (out[hi][0] - out[lo][0]) * f, out[lo][1] + (out[hi][1] - out[lo][1]) * f];
  };
}

// Projekte birimlerden şekil birimlerine (yükseklik ≈ 4)
const TR_S = 4 / 640, TR_CX = 272, TR_CY = 296;
const trX = (x: number) => (x - TR_CX) * TR_S;
const trY = (y: number) => -(y - TR_CY) * TR_S;

/** Rota kadranın içine sığacak biçimde: merkezlenmiş, yükseklik 2.3 */
const routeFn = smoothPath(MAP_ROUTE);
const RX = MAP_ROUTE.map((p) => p[0]), RY = MAP_ROUTE.map((p) => p[1]);
const TRACK_S = 2.3 / (Math.max(...RY) - Math.min(...RY));
const TRACK_CX = (Math.max(...RX) + Math.min(...RX)) / 2, TRACK_CY = (Math.max(...RY) + Math.min(...RY)) / 2;
const trackAt = (t: number): [number, number] => {
  const [x, y] = routeFn(t);
  return [(x - TRACK_CX) * TRACK_S, -(y - TRACK_CY) * TRACK_S];
};

// ---------------------------------------------------------------- Hedef geometriler
type Put = (i: number, x: number, y: number, z: number, kind: number) => void;

/** Tür kodları (gölgelendiriciyle aynı): 0 toz · 1 yol kenarı · 2 şerit · 3 zemin · 4 tepeler · 5 güneş
 *  6 şekil · 7 parlak hat · 8.x rota/iz (x = parametre) · 9 durak · 10 soluk dolgu · 11 iz başı · 12 yıldız */
const kindParam = (k: number, t: number) => k + Math.min(Math.max(t, 0), 1) * 0.98;
const BEND = 0.0004;
const bend = (z: number) => BEND * z * z;
/** Güneş, yolun ufuktaki bitişiyle aynı doğrultuda */
const SUN_X = (bend(-78) * 96) / 78;

function buildRoad(put: Put, from: number, to: number) {
  const M = to - from;
  for (let j = 0; j < M; j++) {
    const i = from + j, r = j / M;
    const z = -78.5 + rnd() * 80; // akan noktalar: z gölgelendiricide kaydırılır
    if (r < 0.24) {
      // Yol kenarı: her yanda ince çift çizgi
      const side = rnd() < 0.5 ? -1 : 1, inner = rnd() < 0.35 ? 0.09 : 0;
      put(i, side * (1.72 - inner + gauss() * 0.012), -1.3, z, 1);
    } else if (r < 0.36) {
      let zz = z;
      while (((zz % 6) + 6) % 6 > 2.6) zz = -78.5 + rnd() * 80;
      put(i, gauss() * 0.018, -1.3, zz, 2);
    } else if (r < 0.62) {
      const side = rnd() < 0.5 ? -1 : 1;
      put(i, side * (2.3 + Math.pow(rnd(), 2.2) * 34), -1.3 + gauss() * 0.02, z, 3);
    } else if (r < 0.72) {
      const x = -75 + rnd() * 150, zz = -86 - rnd() * 6;
      const dist = Math.abs(x - SUN_X);
      let hh = 1.5 + 0.9 * Math.sin(x * 0.09) + 0.6 * Math.sin(x * 0.23 + 1) + 0.25 * Math.sin(x * 0.7);
      hh *= 0.2 + 0.8 * Math.min(Math.max((dist - 4) / 18, 0), 1);
      const y = rnd() < 0.65 ? hh : hh * Math.sqrt(rnd());
      put(i, x, -1.3 + y, zz, 4);
    } else if (r < 0.8) {
      // Ufuktaki güneş: yarım disk, merkeze doğru yoğun
      const a = Math.PI * rnd(), rr = 5.5 * Math.sqrt(rnd());
      put(i, SUN_X + Math.cos(a) * rr, -1.3 + Math.sin(a) * rr, -96, 5);
    } else {
      put(i, -90 + rnd() * 180, 0.5 + Math.pow(rnd(), 1.4) * 48, -60 - rnd() * 40, 12);
    }
  }
}

function buildMap(put: Put, from: number, to: number, tr: MapPoints) {
  const M = to - from;
  const pick = (arr: [number, number][]) => arr[Math.floor(rnd() * arr.length)];
  for (let j = 0; j < M; j++) {
    const i = from + j, r = j / M, dz = gauss() * 0.03;
    if (r < 0.46) {
      const [x, y] = pick(tr.fill);
      put(i, trX(x) + gauss() * 0.02, trY(y) + gauss() * 0.02, dz, 10);
    } else if (r < 0.76) {
      const [x, y] = pick(tr.edge);
      put(i, trX(x) + gauss() * 0.005, trY(y) + gauss() * 0.005, dz * 0.4, 7);
    } else if (r < 0.94) {
      const t = rnd(), [x, y] = routeFn(t);
      put(i, trX(x) + gauss() * 0.008, trY(y) + gauss() * 0.008, 0.02, kindParam(8, t));
    } else {
      const s = MAP_ROUTE[MAP_STOPS[Math.floor(rnd() * MAP_STOPS.length)]];
      const k = rnd() < 0.5 ? 0.012 : 0.04;
      put(i, trX(s[0]) + gauss() * k, trY(s[1]) + gauss() * k, 0.04, 9);
    }
  }
}

const DIAL_R = 1.85, SWEEP0 = (210 * Math.PI) / 180, SWEEP = (240 * Math.PI) / 180;
function buildDial(put: Put, from: number, to: number) {
  const M = to - from;
  for (let j = 0; j < M; j++) {
    const i = from + j, r = j / M, dz = gauss() * 0.02;
    if (r < 0.22) {
      const n = Math.floor(rnd() * 41), major = n % 5 === 0;
      const a = SWEEP0 - (n / 40) * SWEEP;
      const rr = DIAL_R * ((major ? 0.82 : 0.9) + rnd() * (major ? 0.18 : 0.1));
      const w = gauss() * 0.006;
      put(i, Math.cos(a) * rr - Math.sin(a) * w, Math.sin(a) * rr + Math.cos(a) * w, dz, major ? 7 : 6);
    } else if (r < 0.34) {
      const a = SWEEP0 - rnd() * SWEEP, rr = DIAL_R * 1.07 + gauss() * 0.004;
      put(i, Math.cos(a) * rr, Math.sin(a) * rr, dz, 10);
    } else if (r < 0.48) {
      const t = rnd(), a = SWEEP0 - t * SWEEP, rr = DIAL_R * 1.14 + gauss() * 0.01;
      put(i, Math.cos(a) * rr, Math.sin(a) * rr, dz, kindParam(8, t));
    } else if (r < 0.8) {
      const t = rnd(), [x, y] = trackAt(t);
      put(i, x + gauss() * 0.007, y + gauss() * 0.007, 0.03, kindParam(8, t));
    } else if (r < 0.86) {
      const k = rnd() < 0.6 ? 0.018 : 0.06;
      put(i, gauss() * k, gauss() * k, 0.05 + gauss() * 0.01, 11); // konum gölgelendiricide (uHeadPos)
    } else {
      const rr = DIAL_R * (rnd() < 0.5 ? 0.42 : 0.68), a = rnd() * Math.PI * 2;
      put(i, Math.cos(a) * rr, Math.sin(a) * rr, dz - 0.05, 10);
    }
  }
}

const BOOK_W = 1.85, BOOK_H = 2.55, BOOK_TILT = -0.95;
function bookPoint(side: number, u: number, v: number, lift = 0): [number, number, number] {
  const x = side * u * BOOK_W, y = (v - 0.5) * BOOK_H;
  const z = 0.55 * Math.pow(u, 0.45) * (1 - 0.82 * u) + lift;
  const c = Math.cos(BOOK_TILT), s = Math.sin(BOOK_TILT);
  return [x, c * y - s * z - 0.25, s * y + c * z];
}
function buildBook(put: Put, from: number, to: number) {
  const M = to - from;
  for (let j = 0; j < M; j++) {
    const i = from + j, r = j / M;
    const side = rnd() < 0.5 ? -1 : 1;
    let p: [number, number, number], kind: number;
    if (r < 0.32) {
      p = bookPoint(side, rnd(), rnd());
      kind = 10;
    } else if (r < 0.48) {
      const e = rnd();
      if (e < 0.4) p = bookPoint(side, 1, rnd());
      else if (e < 0.85) p = bookPoint(side, rnd(), rnd() < 0.5 ? 0 : 1);
      else p = bookPoint(side, 0, rnd(), -0.01);
      kind = 7;
    } else if (r < 0.53) {
      p = bookPoint(side, 1 + rnd() * 0.02, rnd(), -0.02 - rnd() * 0.09); // sayfa destesi
      kind = 6;
    } else if (r < 0.84) {
      // Metin satırları: sol sayfa tam, sağ sayfa fotoğrafın altında
      const rows = side < 0 ? 15 : 7;
      const row = Math.floor(rnd() * rows);
      const v = side < 0 ? 0.88 - row * 0.054 : 0.42 - row * 0.05;
      const lineEnd = 0.86 - ((row * 7919) % 5) * 0.06 - (row === rows - 1 ? 0.3 : 0);
      p = bookPoint(side, 0.14 + rnd() * (lineEnd - 0.14), v + gauss() * 0.003, 0.004);
      kind = 6;
    } else {
      // Sağ sayfadaki "fotoğraf": rotanın küçük çizimi
      const t = rnd(), [x, y] = routeFn(t);
      const u = 0.36 + ((x - 119) / 155) * 0.34, v = 0.5 + (1 - (y - 89) / 440) * 0.44;
      p = bookPoint(1, u + gauss() * 0.004, v + gauss() * 0.004, 0.01);
      kind = kindParam(8, t);
    }
    put(i, p[0], p[1], p[2], kind);
  }
}

function buildData(N: number) {
  seed = 20261121;
  const data = new Float32Array(N * STRIDE);
  const D = Math.floor(N * 0.1);
  const putFor = (target: number): Put => (i, x, y, z, kind) => {
    const o = i * STRIDE + target * 4;
    data[o] = x; data[o + 1] = y; data[o + 2] = z; data[o + 3] = kind;
  };
  // Toz: tüm hedeflerde aynı konum (derinlik ve bokeh hissi)
  for (let i = 0; i < D; i++) {
    const x = -10 + rnd() * 20, y = -4 + rnd() * 9, z = -1.8 - Math.pow(rnd(), 0.7) * 22;
    for (let t = 0; t < 4; t++) putFor(t)(i, x, y, z, 0);
  }
  const tr = generateMap(rnd);
  // Şekil parçacıklarını hedefler arasında karıştır: geçişte noktalar uzak yerlerden gelsin
  buildRoad(putFor(0), D, N);
  buildMap(putFor(1), D, N, tr);
  buildDial(putFor(2), D, N);
  buildBook(putFor(3), D, N);
  for (let i = 0; i < N; i++) {
    const o = i * STRIDE + 16;
    data[o] = rnd(); data[o + 1] = rnd(); data[o + 2] = rnd(); data[o + 3] = rnd();
  }
  // Hedef 1–3 sıralarını karıştır (Fisher–Yates), yol sırası sabit kalır
  for (const t of [1, 2, 3]) {
    for (let i = N - 1; i > D; i--) {
      const j = D + Math.floor(rnd() * (i - D + 1));
      for (let c = 0; c < 4; c++) {
        const a = i * STRIDE + t * 4 + c, b = j * STRIDE + t * 4 + c;
        const tmp = data[a]; data[a] = data[b]; data[b] = tmp;
      }
    }
  }
  return data;
}

// ---------------------------------------------------------------- Gölgelendiriciler
const VERT = /* glsl */ `
precision highp float;
attribute vec4 aP0; attribute vec4 aP1; attribute vec4 aP2; attribute vec4 aP3; attribute vec4 aR;
uniform float uStage, uTime, uAspect, uPx, uBase, uCoc, uHead, uSpeed;
uniform vec2 uMouse;
uniform vec3 uFit[4];
uniform vec2 uHeadPos;
varying vec3 vCol; varying float vA; varying float vSoft;

const vec3 PIVOT = vec3(0.0, 0.0, -6.0);
vec3 rotY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }
vec3 rotX(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z); }

vec3 place(vec4 a, float k) {
  float kind = floor(a.w);
  vec3 p = a.xyz;
  if (kind < 0.5) {
    float ph = aR.z * 6.2831;
    return p + vec3(sin(uTime * 0.09 + ph), cos(uTime * 0.07 + ph * 1.3), 0.0) * 0.18;
  }
  if (k < 0.5) {
    if (kind < 3.5) { p.z = mod(p.z + 78.5 + uTime * uSpeed, 80.0) - 78.5; p.x += ${BEND.toFixed(5)} * p.z * p.z; }
    return p;
  }
  if (kind > 10.5 && kind < 11.5) p.xy += uHeadPos;
  float sc = k < 1.5 ? uFit[1].z : (k < 2.5 ? uFit[2].z : uFit[3].z);
  p *= sc;
  if (k < 1.5) { p = rotX(p, -0.42); p = rotY(p, sin(uTime * 0.13) * 0.2); }
  else if (k < 2.5) { p = rotX(p, -0.22); p = rotY(p, sin(uTime * 0.11 + 1.0) * 0.22); }
  else { p = rotY(p, sin(uTime * 0.1 + 2.0) * 0.16); }
  return p + PIVOT;
}

// rgb + alfa, boyut çarpanı
vec4 styleOf(vec4 a, float k, out float sz) {
  float kind = floor(a.w), t = fract(a.w) / 0.98;
  float tw = 0.75 + 0.25 * sin(uTime * (0.6 + aR.w) + aR.z * 40.0);
  sz = 1.0;
  if (kind < 0.5) { sz = 1.1; return vec4(0.55, 0.7, 1.0, 0.2 * tw); }
  if (kind < 1.5) { sz = 1.25; return vec4(0.82, 0.9, 1.0, 0.85); }
  if (kind < 2.5) { sz = 1.15; return vec4(1.0, 0.78, 0.48, 0.9); }
  if (kind < 3.5) { sz = 1.6; return vec4(0.45, 0.6, 1.0, 0.55 * tw); }
  if (kind < 4.5) { sz = 5.0; return vec4(0.45, 0.6, 1.0, 0.6); }
  if (kind < 5.5) { sz = 7.0; return vec4(1.0, 0.58, 0.22, 0.6); }
  if (kind < 6.5) { sz = 0.95; return vec4(0.7, 0.83, 1.0, 0.55); }
  if (kind < 7.5) return vec4(0.88, 0.94, 1.0, 0.8);
  if (kind < 8.5) {
    if (k > 1.5 && k < 2.5) {
      float lit = step(t, uHead);
      float head = exp(-pow((t - uHead) * 26.0, 2.0));
      sz = 1.0 + head * 0.8;
      return vec4(mix(vec3(0.5, 0.62, 0.95), vec3(1.0, 0.64, 0.26), lit), mix(0.1, 0.95, lit) + head);
    }
    float pulse = exp(-pow((t - fract(uTime * 0.09)) * 14.0, 2.0));
    sz = 1.05 + pulse * 0.7;
    return vec4(1.0, 0.64 + pulse * 0.2, 0.26 + pulse * 0.3, 0.9 + pulse);
  }
  if (kind < 9.5) { sz = 1.9; return vec4(1.0, 0.74, 0.38, 0.75 + 0.25 * sin(uTime * 2.0 + aR.z * 6.0)); }
  if (kind < 10.5) { sz = 0.85; return vec4(0.48, 0.63, 1.0, 0.3 * tw); }
  if (kind < 11.5) { sz = 1.6; return vec4(1.0, 0.82, 0.55, 1.0); }
  sz = 4.0; return vec4(0.7, 0.8, 1.0, 0.85 * tw);
}

void main() {
  float s = clamp(uStage, 0.0, 3.0);
  float i = min(floor(s), 2.0), f = s - i;
  float ff = smoothstep(0.0, 1.0, clamp((f - aR.x * 0.35) / 0.65, 0.0, 1.0));
  vec4 tA = i < 0.5 ? aP0 : (i < 1.5 ? aP1 : aP2);
  vec4 tB = i < 0.5 ? aP1 : (i < 1.5 ? aP2 : aP3);
  vec3 p = mix(place(tA, i), place(tB, i + 1.0), ff);
  float szA, szB;
  vec4 cA = styleOf(tA, i, szA), cB = styleOf(tB, i + 1.0, szB);
  vec4 c = mix(cA, cB, ff);
  float sz = mix(szA, szB, ff);

  // Geçişte savrulma
  float sw = sin(3.14159 * ff);
  p += (aR.yzw - 0.5) * sw * 1.6;

  // İmleç paralaksı (pivot etrafında)
  p = rotX(rotY(p - PIVOT, uMouse.x * 0.1), -uMouse.y * 0.06) + PIVOT;

  float depth = -p.z;
  if (depth < 0.15) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vA = 0.0; return; }

  vec3 fit = mix(i < 0.5 ? uFit[0] : (i < 1.5 ? uFit[1] : uFit[2]), i < 0.5 ? uFit[1] : (i < 1.5 ? uFit[2] : uFit[3]), ff);
  gl_Position = vec4(p.x * ${FOV_F.toFixed(5)} / uAspect + fit.x * depth, p.y * ${FOV_F.toFixed(5)} + fit.y * depth, 0.0, depth);

  float px = uPx * uBase * sz * (0.6 + aR.y * 0.8) / depth;
  float coc = min(max(5.0 - depth, 0.0) * uCoc, 46.0);
  float size = px + coc;
  float a = c.a * clamp((px * px) / (size * size), 0.03, 1.0);
  if (size < 1.6) { a *= mix(0.4, 1.0, size / 1.6); size = 1.6; }
  a *= smoothstep(0.2, 1.4, depth) * mix(1.0, 0.75, smoothstep(30.0, 90.0, depth));
  gl_PointSize = size;
  vCol = c.rgb; vA = a; vSoft = clamp(coc / (px + 2.0), 0.0, 1.0);
}`;

const FRAG = /* glsl */ `
precision mediump float;
varying vec3 vCol; varying float vA; varying float vSoft;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float d = dot(q, q);
  if (d > 1.0) discard;
  float glow = exp(-d * 4.5);
  float disc = smoothstep(1.0, 0.7, d) * 0.6;
  float a = mix(glow, disc, vSoft) * vA;
  gl_FragColor = vec4(vCol * a, a);
}`;

// ---------------------------------------------------------------- Sahne
function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? "shader");
  return sh;
}

export function startScene(canvas: HTMLCanvasElement, opts: SceneOptions): SceneHandle | null {
  const gl = canvas.getContext("webgl", { antialias: false, alpha: true, premultipliedAlpha: true, depth: false, stencil: false, powerPreference: "high-performance" });
  if (!gl) return null;

  const desktopMq = window.matchMedia("(min-width: 1024px)");
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const small = !desktopMq.matches || coarse;
  const N = small ? 7500 : 17000;

  let prog: WebGLProgram;
  try {
    prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? "link");
  } catch (e) {
    console.warn("[landing] WebGL sahnesi kurulamadı", e);
    return null;
  }
  gl.useProgram(prog);

  const data = buildData(N);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  ["aP0", "aP1", "aP2", "aP3", "aR"].forEach((name, k) => {
    const loc = gl.getAttribLocation(prog, name);
    if (loc < 0) return;
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, STRIDE * 4, k * 16);
  });
  const U = (n: string) => gl.getUniformLocation(prog, n);
  const u = {
    stage: U("uStage"), time: U("uTime"), aspect: U("uAspect"), px: U("uPx"), base: U("uBase"), coc: U("uCoc"),
    head: U("uHead"), speed: U("uSpeed"), mouse: U("uMouse"), fit: U("uFit"), headPos: U("uHeadPos"),
  };
  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE);
  gl.clearColor(0, 0, 0, 0);

  // ---- Ölçüler (yalnızca yeniden boyutlandırmada okunur)
  let W = 1, H = 1, dpr = 1, desktop = desktopMq.matches;
  let anchors: number[] = [];
  let vh = window.innerHeight;
  const measure = () => {
    desktop = desktopMq.matches;
    dpr = Math.min(window.devicePixelRatio || 1, small ? 1.5 : 1.75);
    W = Math.max(1, Math.round(canvas.clientWidth * dpr));
    H = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    vh = window.innerHeight;
    const sy = window.scrollY;
    anchors = opts.chapters.map((el) => el.getBoundingClientRect().top + sy);
    gl.viewport(0, 0, W, H);
    const aspect = W / H;
    gl.uniform1f(u.aspect, aspect);
    gl.uniform1f(u.px, (H * FOV_F) / 2);
    gl.uniform1f(u.base, small ? 0.029 : 0.021);
    gl.uniform1f(u.coc, 1.1 * dpr);
    // Şekil yerleşimi: masaüstünde sağ yarı, telefonda üst bölüm
    const hh = 6 / FOV_F, hw = hh * aspect;
    const ext: [number, number][] = [[1, 1], [1.75, 2.05], [2.2, 2.2], [2.2, 1.55]];
    const fit = new Float32Array(12);
    fit.set([0, desktop ? 0.16 : 0.52, 1], 0);
    for (let k = 1; k < 4; k++) {
      const [ex, ey] = ext[k];
      const sc = desktop ? Math.min((hw * 0.46) / ex, (hh * 0.78) / ey) : Math.min((hw * (k === 3 ? 0.8 : 0.9)) / ex, (hh * 0.4) / ey);
      fit.set(desktop ? [0.46, -0.02, sc] : [0, 0.4, sc], k * 3);
    }
    gl.uniform3fv(u.fit, fit);
    dirty = true;
  };

  // ---- Durum
  const reduced = opts.reducedMotion;
  let stage = 0, mouseX = 0, mouseY = 0, tmx = 0, tmy = 0, time = reduced ? 9 : 0;
  let last = performance.now(), raf = 0, visible = true, onscreen = true, dirty = true, ready = false, lastKm = -1, lastGlow = -1;

  const stageTarget = () => {
    const y = window.scrollY;
    let s = 0;
    for (const a of anchors) s += Math.min(Math.max((y - (a - vh * 0.85)) / (vh * 0.7), 0), 1);
    return s;
  };

  const frame = (now: number) => {
    raf = 0;
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const target = stageTarget();
    if (reduced) {
      const snapped = Math.round(target);
      if (snapped !== stage) { stage = snapped; dirty = true; }
    } else {
      time += dt;
      stage += (target - stage) * Math.min(1, dt * 4.5);
      if (Math.abs(target - stage) < 0.0005) stage = target;
      mouseX += (tmx - mouseX) * Math.min(1, dt * 2.5);
      mouseY += (tmy - mouseY) * Math.min(1, dt * 2.5);
      dirty = true;
    }
    if (dirty) draw();
    if (!reduced && visible && onscreen) raf = requestAnimationFrame(frame);
  };

  const draw = () => {
    dirty = false;
    // İz başı: 13 sn'de bir başlangıçtan varışa
    let head = 1;
    if (!reduced) {
      const c = (time % 13) / 11;
      head = c >= 1 ? 1 : c < 0.5 ? 2 * c * c : 1 - Math.pow(-2 * c + 2, 2) / 2;
    }
    const hp = trackAt(head);
    gl.uniform1f(u.stage, stage);
    gl.uniform1f(u.time, time);
    gl.uniform1f(u.head, head);
    gl.uniform2f(u.headPos, hp[0], hp[1]);
    gl.uniform1f(u.speed, 7);
    gl.uniform2f(u.mouse, mouseX, mouseY);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.POINTS, 0, N);

    // DOM yazımları (okuma yok): ışıltı ve km sayacı yalnızca değişince
    const g = Math.round(Math.max(0, 1 - stage) * 100) / 100;
    if (opts.glow && g !== lastGlow) { opts.glow.style.opacity = String(g); lastGlow = g; }
    if (opts.km && !reduced && stage > 1.3 && stage < 2.7) {
      const km = Math.round(head * ROUTE_KM);
      if (km !== lastKm) { opts.km.textContent = km.toLocaleString("tr-TR"); lastKm = km; }
    }
    if (!ready) { ready = true; canvas.dataset.ready = "1"; }
  };

  const kick = () => {
    if (!raf && visible && onscreen) { last = performance.now(); raf = requestAnimationFrame(frame); }
  };

  const onPointer = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    tmx = (e.clientX / window.innerWidth) * 2 - 1;
    tmy = (e.clientY / window.innerHeight) * 2 - 1;
  };
  const onVis = () => { visible = document.visibilityState === "visible"; kick(); };
  const onScroll = () => { if (reduced) kick(); };

  const io = new IntersectionObserver((entries) => {
    onscreen = entries.some((en) => en.isIntersecting);
    kick();
  });
  io.observe(opts.root);
  const ro = new ResizeObserver(() => { measure(); kick(); });
  ro.observe(canvas);
  ro.observe(opts.root);
  if (!reduced) window.addEventListener("pointermove", onPointer, { passive: true });
  window.addEventListener("scroll", onScroll, { passive: true });
  document.addEventListener("visibilitychange", onVis);
  const onLost = (e: Event) => { e.preventDefault(); cancelAnimationFrame(raf); raf = 0; visible = false; delete canvas.dataset.ready; };
  canvas.addEventListener("webglcontextlost", onLost);

  measure();
  kick();

  return {
    destroy() {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onVis);
      canvas.removeEventListener("webglcontextlost", onLost);
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
    },
  };
}
