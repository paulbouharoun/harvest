/**
 * Terrain geometry: a year of contributions laid out as terraced paddies.
 * Each week is one terrace (a long band following the hillside's contour),
 * each day one paddy along it. Geometry is pure data so it can be drawn to
 * Canvas in the browser and to SVG for the share card.
 */
import type { DayCount } from "./types";

export type Pt = [number, number];

export interface Paddy {
  index: number; // day-of-year index, -1 for verge (no day)
  week: number;
  slot: number; // weekday 0–6
  date: string | null;
  count: number | null;
  level: number; // -2 verge, -1 future, 0 fallow, 1–4 planted
  flooded: boolean;
  poly: Pt[];
  rows: Pt[][];
  cx: number;
  cy: number;
  tone: number; // -1..1 slight per-paddy colour variation
}

export interface Tree {
  x: number;
  y: number;
  r: number;
  shade: number;
}

export interface Band {
  week: number;
  top: Pt[]; // contour along the terrace's upper edge (field extent only)
  outline: Pt[];
  month: number | null; // month that starts in this week, for captions
  cy: number;
  xL: number;
}

export interface Terrain {
  W: number;
  H: number;
  bands: Band[];
  paddies: Paddy[];
  trees: Tree[];
}

export const PALETTE = {
  paper: "#ebe5d6",
  ink: "#29261f",
  forest: "#39432d",
  crowns: ["#46553a", "#52623f", "#3c4a31", "#5d6b43", "#4b5a36"],
  bund: "#d6c9a9",
  verge: "#8a8a5c",
  future: "#d4cdbd",
  fallow: "#b39c7a",
  levels: ["#b39c7a", "#a7a571", "#8b9a59", "#6c8a42", "#3f9b2c"],
  waterDeep: "#9fb3b2",
  waterLight: "#dfe6de",
};

export function mulberry(seed: number) {
  let a = seed || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth 1D noise built from a few seeded sines; returns roughly -1..1 */
function sines(rand: () => number, n = 3) {
  const comps = Array.from({ length: n }, (_, i) => ({
    f: (0.6 + rand() * 0.8) * (i + 1),
    p: rand() * Math.PI * 2,
    a: 1 / (i + 1),
  }));
  const norm = comps.reduce((s, c) => s + c.a, 0);
  return (t: number) => comps.reduce((s, c) => s + c.a * Math.sin(t * c.f + c.p), 0) / norm;
}

export function buildTerrain(days: DayCount[], levels: number[], flooded: Set<number>, seed: number, W = 1600, H = 1000): Terrain {
  const rand = mulberry(seed);
  const year = Number(days[0]?.date.slice(0, 4) ?? 2026);
  const jan1Dow = new Date(Date.UTC(year, 0, 1)).getUTCDay();
  const N = Math.floor((days.length - 1 + jan1Dow) / 7) + 1;

  // ---- contour curves -----------------------------------------------------
  const M = 121; // samples across the width
  const xs = Array.from({ length: M }, (_, i) => (i / (M - 1)) * W);
  const s = (H * 0.8) / N;
  const A = H * 0.07;
  const n1 = sines(rand);
  const n2 = sines(rand);
  const n3 = sines(rand);
  const p = [rand() * 6.28, rand() * 6.28, rand() * 6.28];
  const bowAmp = H * (0.16 + rand() * 0.14) * (rand() < 0.5 ? -1 : 1);
  const bowCenter = 0.35 + rand() * 0.3;

  const curves: number[][] = [];
  for (let k = 0; k <= N; k++) {
    const env = 0.55 + 0.45 * Math.sin((k / N) * Math.PI);
    const jitter = (rand() - 0.5) * s * 0.5;
    const row = xs.map((x) => {
      const u = x / W;
      const d =
        0.55 * Math.sin(u * Math.PI * 2 * 0.9 + p[0] + k * 0.05) +
        0.3 * Math.sin(u * Math.PI * 2 * 2.1 + p[1] - k * 0.08) +
        0.15 * Math.sin(u * Math.PI * 2 * 3.7 + p[2] + k * 0.13);
      return k * s + jitter + A * env * d + bowAmp * (u - bowCenter) ** 2;
    });
    curves.push(row);
  }
  // Contours never cross: enforce a minimum terrace depth.
  const minGap = s * 0.42;
  for (let k = 1; k <= N; k++)
    for (let i = 0; i < M; i++) curves[k][i] = Math.max(curves[k][i], curves[k - 1][i] + minGap);

  // ---- horizontal extent of each terrace ----------------------------------
  const ext = Array.from({ length: N }, (_, k) => {
    const edge = Math.max(0, 1 - Math.min(k + 0.5, N - k - 0.5) / 7) ** 2;
    const xL = W * (0.09 + 0.03 * n1(k * 0.22) + 0.11 * edge);
    const xR = W * (0.91 + 0.03 * n2(k * 0.19 + 3) - 0.11 * edge);
    return { xL, xR };
  });

  // Fit vertically into the frame
  let minY = Infinity;
  let maxY = -Infinity;
  for (let k = 0; k <= N; k++) {
    const e = ext[Math.min(k, N - 1)];
    const prev = ext[Math.max(0, k - 1)];
    const lo = Math.min(e.xL, prev.xL);
    const hi = Math.max(e.xR, prev.xR);
    curves[k].forEach((y, i) => {
      if (xs[i] < lo || xs[i] > hi) return;
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    });
  }
  const top = H * 0.09;
  const scale = (H * 0.82) / (maxY - minY);
  for (const row of curves) for (let i = 0; i < M; i++) row[i] = top + (row[i] - minY) * scale;

  const yAt = (k: number, x: number) => {
    const f = Math.min(M - 1.0001, Math.max(0, (x / W) * (M - 1)));
    const i = Math.floor(f);
    const t = f - i;
    return curves[k][i] * (1 - t) + curves[k][i + 1] * t;
  };
  const along = (k: number, x0: number, x1: number, f = 0): Pt[] => {
    // points along contour k (blended toward k+1 by f) from x0 to x1
    const pts: Pt[] = [];
    const y = (x: number) => (f ? yAt(k, x) * (1 - f) + yAt(k + 1, x) * f : yAt(k, x));
    const step = W / (M - 1);
    const dir = x1 >= x0 ? 1 : -1;
    pts.push([x0, y(x0)]);
    let x = dir > 0 ? Math.floor(x0 / step + 1) * step : Math.ceil(x0 / step - 1) * step;
    while (dir > 0 ? x < x1 - 0.5 : x > x1 + 0.5) {
      pts.push([x, y(x)]);
      x += step * dir;
    }
    pts.push([x1, y(x1)]);
    return pts;
  };

  // ---- paddies ------------------------------------------------------------
  const slots = new Map<string, number>();
  days.forEach((_, i) => {
    const w = Math.floor((i + jan1Dow) / 7);
    slots.set(`${w}:${(i + jan1Dow) % 7}`, i);
  });

  const bands: Band[] = [];
  const paddies: Paddy[] = [];
  for (let k = 0; k < N; k++) {
    const { xL, xR } = ext[k];
    const width = xR - xL;
    const cuts = Array.from({ length: 8 }, (_, d) => (d === 0 || d === 7 ? d / 7 : d / 7 + (rand() - 0.5) * 0.035));
    const tilt = Array.from({ length: 8 }, (_, d) => (d === 0 || d === 7 ? 0 : (rand() - 0.5) * 0.012));
    let month: number | null = null;
    for (let d = 0; d < 7; d++) {
      const i = slots.get(`${k}:${d}`);
      const xa = xL + cuts[d] * width;
      const xb = xL + cuts[d + 1] * width;
      const xa2 = xa + tilt[d] * width;
      const xb2 = xb + tilt[d + 1] * width;
      const poly = [...along(k, xa, xb), ...along(k + 1, xb2, xa2)];
      const day = i !== undefined ? days[i] : null;
      if (day && day.date.endsWith("-01")) month = Number(day.date.slice(5, 7)) - 1;
      const level = i === undefined ? -2 : levels[i];
      const inset = 3;
      const nRows = level >= 1 ? 3 : 0;
      const rows: Pt[][] = [];
      for (let r = 1; r <= nRows; r++) {
        const f = r / (nRows + 1);
        rows.push(along(k, xa + inset + tilt[d] * width * f, xb - inset + tilt[d + 1] * width * f, f));
      }
      const midX = (xa + xb + xa2 + xb2) / 4;
      paddies.push({
        index: i ?? -1,
        week: k,
        slot: d,
        date: day?.date ?? null,
        count: day?.count ?? null,
        level,
        flooded: i !== undefined && flooded.has(i),
        poly,
        rows,
        cx: midX,
        cy: (yAt(k, midX) + yAt(k + 1, midX)) / 2,
        tone: rand() * 2 - 1,
      });
    }
    const outline = [...along(k, xL - 4, xR + 4), ...along(k + 1, xR + 4, xL - 4)];
    bands.push({
      week: k,
      top: along(k, xL, xR),
      outline,
      month,
      cy: (yAt(k, xL) + yAt(k + 1, xL)) / 2,
      xL,
    });
  }

  // ---- forest -------------------------------------------------------------
  const inField = (x: number, y: number) => {
    if (y < yAt(0, x) - 6 || y > yAt(N, x) + 6) return false;
    let lo = 0;
    let hi = N - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (yAt(mid, x) <= y) lo = mid;
      else hi = mid - 1;
    }
    const ks = [Math.max(0, lo - 1), lo, Math.min(N - 1, lo + 1)];
    return ks.some((kk) => x > ext[kk].xL - 10 && x < ext[kk].xR + 10);
  };
  const trees: Tree[] = [];
  const g = 15;
  for (let y = -40; y < H + 40; y += g)
    for (let x = -40; x < W + 40; x += g) {
      const tx = x + (rand() - 0.5) * g * 1.2;
      const ty = y + (rand() - 0.5) * g * 1.2;
      if (inField(tx, ty)) continue;
      const clearing = n3(tx * 0.006 + ty * 0.004) > 0.55; // occasional glades
      if (clearing && rand() < 0.7) continue;
      trees.push({ x: tx, y: ty, r: 5 + rand() * 7, shade: Math.floor(rand() * PALETTE.crowns.length) });
    }
  // Draw order: top to bottom so shadows overlap naturally
  trees.sort((a, b) => a.y - b.y);

  return { W, H, bands, paddies, trees };
}

// ---- colour helpers ---------------------------------------------------------
function hex(c: string): [number, number, number] {
  if (c.startsWith("rgb")) {
    const [r, g, b] = c.slice(c.indexOf("(") + 1, -1).split(",").map(Number);
    return [r, g, b];
  }
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function mix(a: string, b: string, t: number) {
  const [r1, g1, b1] = hex(a);
  const [r2, g2, b2] = hex(b);
  const m = (x: number, y: number) => Math.round(x + (y - x) * t);
  return `rgb(${m(r1, r2)},${m(g1, g2)},${m(b1, b2)})`;
}
export function shade(c: string, amt: number) {
  return amt >= 0 ? mix(c, "#ffffff", amt) : mix(c, "#000000", -amt);
}

/** Base fill colour for a paddy at a given growth (0 = bare soil, 1 = fully grown) */
export function paddyColor(p: Paddy, growth = 1) {
  if (p.level === -2) return shade(PALETTE.verge, p.tone * 0.05);
  if (p.level === -1) return shade(PALETTE.future, p.tone * 0.025);
  const soil = shade(PALETTE.fallow, p.tone * 0.05);
  if (p.level === 0) return soil;
  return mix(soil, shade(PALETTE.levels[p.level], p.tone * 0.04), growth);
}

export function polyPath(pts: Pt[]) {
  return "M" + pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join("L") + "Z";
}
export function linePath(pts: Pt[]) {
  return "M" + pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join("L");
}

export function pointInPoly(x: number, y: number, poly: Pt[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
