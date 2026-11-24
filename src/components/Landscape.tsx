"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { PALETTE, mix, mulberry, paddyColor, pointInPoly, type Paddy, type Pt, type Terrain } from "@/lib/terrain";

export type Tint = "night" | "dawn" | "day" | "evening" | null;

export interface Focus {
  /** day indexes to keep lit; everything else recedes */
  highlight?: number[] | null;
  /** day index to mark with a ring and zoom into */
  marker?: number | null;
  /** zoom to fit these day indexes */
  frame?: number[] | null;
  tint?: Tint;
}

interface Props {
  terrain: Terrain;
  focus?: Focus;
  /** play the flyover on mount */
  flyover?: boolean;
  /** shift the resting camera to leave room for a side panel (CSS px) */
  inset?: { left?: number; bottom?: number };
  /** slow ambient drift (home page) */
  drift?: boolean;
  onHover?: (p: Paddy | null, x: number, y: number) => void;
  onLanded?: () => void;
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const FLY_MS = 4200;
const LAND_MS = 1400;

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));

function toPath(pts: Pt[], close = true, into?: Path2D) {
  const p = into ?? new Path2D();
  pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
  if (close) p.closePath();
  return p;
}

const TILE = 360;
/** A seamless tile of tree crowns, so the forest runs past the edge of the world. */
function makeForestTile() {
  const c = document.createElement("canvas");
  c.width = c.height = TILE * 2;
  const g = c.getContext("2d")!;
  g.scale(2, 2);
  g.fillStyle = PALETTE.forest;
  g.fillRect(0, 0, TILE, TILE);
  const rand = mulberry(99);
  const trees: { x: number; y: number; r: number; s: number }[] = [];
  for (let y = 0; y < TILE; y += 15)
    for (let x = 0; x < TILE; x += 15)
      trees.push({ x: x + rand() * 15, y: y + rand() * 15, r: 5 + rand() * 7, s: Math.floor(rand() * PALETTE.crowns.length) });
  trees.sort((a, b) => a.y - b.y);
  const each = (fn: (x: number, y: number) => void, tr: { x: number; y: number }) => {
    for (const dx of [-TILE, 0, TILE]) for (const dy of [-TILE, 0, TILE]) fn(tr.x + dx, tr.y + dy);
  };
  for (const tr of trees) {
    each((x, y) => {
      g.fillStyle = "rgba(26,32,18,0.4)";
      g.beginPath();
      g.arc(x + 2.5, y + 3, tr.r, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = PALETTE.crowns[tr.s];
      g.beginPath();
      g.arc(x, y, tr.r, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "rgba(243,240,220,0.09)";
      g.beginPath();
      g.arc(x - tr.r * 0.3, y - tr.r * 0.3, tr.r * 0.45, 0, Math.PI * 2);
      g.fill();
    }, tr);
  }
  return c;
}

/** Precomputed Path2D objects for one terrain */
function prepare(t: Terrain) {
  const treeShadow = new Path2D();
  const treeLight = new Path2D();
  const crowns = PALETTE.crowns.map(() => new Path2D());
  for (const tr of t.trees) {
    treeShadow.moveTo(tr.x + 2.5 + tr.r, tr.y + 3);
    treeShadow.arc(tr.x + 2.5, tr.y + 3, tr.r, 0, Math.PI * 2);
    crowns[tr.shade].moveTo(tr.x + tr.r, tr.y);
    crowns[tr.shade].arc(tr.x, tr.y, tr.r, 0, Math.PI * 2);
    const lr = tr.r * 0.45;
    treeLight.moveTo(tr.x - tr.r * 0.3 + lr, tr.y - tr.r * 0.3);
    treeLight.arc(tr.x - tr.r * 0.3, tr.y - tr.r * 0.3, lr, 0, Math.PI * 2);
  }
  const bandBase = new Path2D();
  const bandTops = new Path2D();
  for (const b of t.bands) {
    toPath(b.outline, true, bandBase);
    toPath(b.top, false, bandTops);
  }
  const paddyPaths = t.paddies.map((p) => toPath(p.poly));
  const allPaddies = new Path2D();
  paddyPaths.forEach((p) => allPaddies.addPath(p));
  // Rice rows grouped per terrace so they can grow in with the flyover
  const rowsByWeek = t.bands.map(() => new Path2D());
  t.paddies.forEach((p) => {
    if (p.flooded) return;
    p.rows.forEach((r) => toPath(r, false, rowsByWeek[p.week]));
  });
  const byIndex = new Map<number, number>();
  t.paddies.forEach((p, i) => p.index >= 0 && byIndex.set(p.index, i));
  const grown = t.paddies.map((p) => paddyColor(p, 1));
  const forestTile = makeForestTile();
  const bare = t.paddies.map((p) => paddyColor(p, 0));
  return { forestTile, treeShadow, treeLight, crowns, bandBase, bandTops, paddyPaths, allPaddies, rowsByWeek, byIndex, grown, bare };
}

export default function Landscape({ terrain, focus, flyover = false, inset, drift = false, onHover, onLanded }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const live = useRef({ focus, inset, onHover, onLanded, drift });
  useLayoutEffect(() => {
    live.current = { focus, inset, onHover, onLanded, drift };
  });

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const t = terrain;
    const N = t.bands.length;
    const P = prepare(t);
    const forest = ctx.createPattern(P.forestTile, "repeat")!;
    forest.setTransform(new DOMMatrix().scale(0.5));
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let cw = 0;
    let ch = 0;
    let dpr = 1;
    let rot = 0;
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      cw = r.width;
      ch = r.height;
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(ch * dpr);
      rot = ch > cw * 1.15 ? -Math.PI / 2 : 0; // portrait: turn the hill on its side
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const view = () => {
      const vw = rot ? t.H : t.W;
      const vh = rot ? t.W : t.H;
      const ins = live.current.inset ?? {};
      const aw = cw - (ins.left ?? 0);
      const ah = ch - (ins.bottom ?? 0);
      const cover = Math.max(cw / vw, ch / vh);
      const contain = Math.min(aw / (vw * 0.86), ah / (vh * 0.86));
      const zoom = Math.min(cover, contain);
      // screen-space offset that centres the field in the available area
      return { zoom, ox: (ins.left ?? 0) / 2, oy: -(ins.bottom ?? 0) / 2 };
    };

    // camera in world coordinates
    const cam = { x: t.W / 2, y: t.H / 2, z: 1, ox: 0, oy: 0 };
    const startFly = flyover && !reduceMotion;
    let flyStart = -1;
    let landed = !startFly;
    let landedFired = false;
    let reveal = startFly ? -4 : N + 4;
    const fx = { hl: 0, tint: 0, marker: 0, labels: startFly ? 0 : 1 };
    let curTint: Tint = null;
    let hover: number | null = null;

    const v0 = view();
    if (startFly) {
      cam.z = v0.zoom * 2.6;
      cam.x = t.W * 0.42;
      cam.y = t.bands[0].cy;
    } else {
      cam.z = v0.zoom;
      cam.ox = v0.ox;
      cam.oy = v0.oy;
    }

    const target = () => {
      const f = live.current.focus;
      const v = view();
      const base = { x: t.W / 2, y: t.H / 2, z: v.zoom, ox: v.ox, oy: v.oy };
      if (!f) return base;
      const ids = f.marker != null ? [f.marker] : f.frame;
      if (!ids?.length) return base;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const i of ids) {
        const pi = P.byIndex.get(i);
        if (pi === undefined) continue;
        for (const [x, y] of t.paddies[pi].poly) {
          x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
        }
      }
      if (!isFinite(x0)) return base;
      const pad = f.marker != null ? 260 : 120;
      const bw = (rot ? y1 - y0 : x1 - x0) + pad;
      const bh = (rot ? x1 - x0 : y1 - y0) + pad;
      const ins = live.current.inset ?? {};
      const z = clamp(Math.min((cw - (ins.left ?? 0)) / bw, (ch - (ins.bottom ?? 0)) / bh), v.zoom, v.zoom * 3.2);
      return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z, ox: v.ox, oy: v.oy };
    };

    const toWorld = (sx: number, sy: number): Pt => {
      const dx = (sx - cw / 2 - cam.ox) / cam.z;
      const dy = (sy - ch / 2 - cam.oy) / cam.z;
      const c = Math.cos(rot);
      const n = Math.sin(rot);
      return [dx * c + dy * n + cam.x, -dx * n + dy * c + cam.y];
    };
    const toScreen = (wx: number, wy: number): Pt => {
      const dx = (wx - cam.x) * cam.z;
      const dy = (wy - cam.y) * cam.z;
      const c = Math.cos(rot);
      const n = Math.sin(rot);
      return [dx * c - dy * n + cw / 2 + cam.ox, dx * n + dy * c + ch / 2 + cam.oy];
    };

    const onMove = (e: PointerEvent) => {
      if (!landed) return;
      const r = canvas.getBoundingClientRect();
      const [wx, wy] = toWorld(e.clientX - r.left, e.clientY - r.top);
      let found: number | null = null;
      for (let i = 0; i < t.paddies.length; i++) {
        const p = t.paddies[i];
        if (p.index < 0 || Math.abs(p.cy - wy) > 40) continue;
        if (pointInPoly(wx, wy, p.poly)) {
          found = i;
          break;
        }
      }
      hover = found;
      live.current.onHover?.(found === null ? null : t.paddies[found], e.clientX, e.clientY);
    };
    const onLeave = () => {
      hover = null;
      live.current.onHover?.(null, 0, 0);
    };
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerleave", onLeave);

    const waterGrad = (p: Paddy) => {
      const xs = p.poly.map((q) => q[0]);
      const ys = p.poly.map((q) => q[1]);
      const g = ctx.createLinearGradient(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys));
      g.addColorStop(0, PALETTE.waterLight);
      g.addColorStop(0.55, PALETTE.waterDeep);
      g.addColorStop(1, "#c6d2cc");
      return g;
    };
    const waters = new Map<number, CanvasGradient>();
    t.paddies.forEach((p, i) => p.flooded && waters.set(i, waterGrad(p)));

    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const f = live.current.focus;

      // ---- camera ----
      if (!landed) {
        if (flyStart < 0) flyStart = now;
        const e = now - flyStart;
        const v = view();
        const first = t.bands[0].cy;
        const lastY = t.bands[N - 1].cy;
        if (e < FLY_MS) {
          const k = ease(e / FLY_MS);
          cam.z = v.zoom * (2.6 - 0.5 * k);
          cam.y = first + (lastY - first) * k;
          cam.x = t.W * (0.42 + 0.16 * k);
          cam.ox = v.ox * k * 0.5;
          cam.oy = v.oy * k * 0.5;
          reveal = -3 + (N + 1) * (e / FLY_MS) * 1.05 + 2;
        } else {
          const k = ease(clamp((e - FLY_MS) / LAND_MS));
          const zs = v.zoom * 2.1;
          cam.z = zs + (v.zoom - zs) * k;
          cam.y = lastY + (t.H / 2 - lastY) * k;
          cam.x = t.W * 0.58 + (t.W / 2 - t.W * 0.58) * k;
          cam.ox = v.ox * (0.5 + 0.5 * k);
          cam.oy = v.oy * (0.5 + 0.5 * k);
          reveal = N + 4;
          if (k >= 1) landed = true;
        }
      } else {
        const tg = target();
        const a = 1 - Math.exp(-dt * 2.6);
        if (live.current.drift && !reduceMotion) {
          tg.x += Math.sin(now / 9000) * 40;
          tg.y += Math.cos(now / 11000) * 24;
        }
        cam.x += (tg.x - cam.x) * a;
        cam.y += (tg.y - cam.y) * a;
        cam.z += (tg.z - cam.z) * a;
        cam.ox += (tg.ox - cam.ox) * a;
        cam.oy += (tg.oy - cam.oy) * a;
        if (!landedFired) {
          landedFired = true;
          live.current.onLanded?.();
        }
      }

      const ea = 1 - Math.exp(-dt * 3.5);
      const hlOn = landed && !!(f?.highlight?.length || f?.marker != null);
      fx.hl += ((hlOn ? 1 : 0) - fx.hl) * ea;
      fx.marker += ((landed && f?.marker != null ? 1 : 0) - fx.marker) * ea;
      fx.labels += ((landed ? 1 : 0) - fx.labels) * ea;
      if (f?.tint) curTint = f.tint;
      fx.tint += ((f?.tint ? 1 : 0) - fx.tint) * ea;

      // ---- draw ----
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = PALETTE.forest;
      ctx.fillRect(0, 0, cw, ch);
      ctx.save();
      ctx.translate(cw / 2 + cam.ox, ch / 2 + cam.oy);
      ctx.rotate(rot);
      ctx.scale(cam.z, cam.z);
      ctx.translate(-cam.x, -cam.y);

      ctx.fillStyle = forest;
      ctx.fillRect(-t.W * 3, -t.H * 3, t.W * 7, t.H * 7);
      ctx.fillStyle = "rgba(26,32,18,0.4)";
      ctx.fill(P.treeShadow);
      P.crowns.forEach((c, i) => {
        ctx.fillStyle = PALETTE.crowns[i];
        ctx.fill(c);
      });
      ctx.fillStyle = "rgba(243,240,220,0.09)";
      ctx.fill(P.treeLight);

      ctx.fillStyle = PALETTE.bund;
      ctx.fill(P.bandBase);

      const growth = (w: number) => clamp((reveal - w) / 3);
      t.paddies.forEach((p, i) => {
        const g = growth(p.week);
        if (p.flooded && g > 0.6) {
          ctx.fillStyle = waters.get(i)!;
        } else {
          ctx.fillStyle = g >= 1 ? P.grown[i] : g <= 0 ? P.bare[i] : mix(P.bare[i], P.grown[i], g);
        }
        ctx.fill(P.paddyPaths[i]);
      });

      ctx.lineJoin = "round";
      ctx.strokeStyle = PALETTE.bund;
      ctx.lineWidth = 1.3;
      ctx.stroke(P.allPaddies);

      ctx.lineWidth = 0.9;
      P.rowsByWeek.forEach((rows, w) => {
        const g = growth(w);
        if (g <= 0) return;
        ctx.strokeStyle = `rgba(47,74,23,${0.2 * g})`;
        ctx.stroke(rows);
      });

      ctx.save();
      ctx.translate(0, 1.6);
      ctx.strokeStyle = "rgba(58,44,22,0.22)";
      ctx.lineWidth = 2.4;
      ctx.stroke(P.bandTops);
      ctx.restore();
      ctx.strokeStyle = "rgba(239,230,205,0.7)";
      ctx.lineWidth = 0.8;
      ctx.stroke(P.bandTops);

      // glints drift slowly across flooded paddies
      ctx.strokeStyle = "rgba(255,255,255,0.8)";
      ctx.lineCap = "round";
      ctx.lineWidth = 1.1;
      t.paddies.forEach((p) => {
        if (!p.flooded || growth(p.week) < 0.8) return;
        const s = Math.sin(now / 1400 + p.cx * 0.01) * 10;
        ctx.beginPath();
        ctx.moveTo(p.cx - 16 + s, p.cy - 1);
        ctx.lineTo(p.cx + 6 + s, p.cy - 2);
        ctx.stroke();
      });

      // focus: let the rest of the field recede
      if (fx.hl > 0.01) {
        const keep = new Set(f?.highlight ?? (f?.marker != null ? [f.marker] : []));
        const dim = new Path2D();
        const lit = new Path2D();
        t.paddies.forEach((p, i) => (keep.has(p.index) ? lit : dim).addPath(P.paddyPaths[i]));
        ctx.fillStyle = `rgba(38,34,24,${0.5 * fx.hl})`;
        ctx.fill(dim);
        ctx.strokeStyle = `rgba(250,246,232,${0.85 * fx.hl})`;
        ctx.lineWidth = 1.4 / Math.max(1, cam.z);
        ctx.stroke(lit);
      }

      if (hover !== null) {
        ctx.strokeStyle = "rgba(255,252,240,0.95)";
        ctx.lineWidth = 2 / cam.z;
        ctx.stroke(P.paddyPaths[hover]);
      }
      ctx.restore();

      // marker ring, in screen space so it stays crisp
      if (fx.marker > 0.01 && f?.marker != null) {
        const pi = P.byIndex.get(f.marker);
        if (pi !== undefined) {
          const p = t.paddies[pi];
          const [sx, sy] = toScreen(p.cx, p.cy);
          const pulse = 1 + Math.sin(now / 600) * 0.06;
          ctx.strokeStyle = `rgba(255,251,238,${0.9 * fx.marker})`;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(sx, sy, 30 * pulse, 0, Math.PI * 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(sx, sy, 3, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255,251,238,${fx.marker})`;
          ctx.fill();
        }
      }

      // month captions along the field's edge
      if (fx.labels > 0.01) {
        ctx.font = `500 10px "Hanken Grotesk", sans-serif`;
        ctx.fillStyle = `rgba(236,231,214,${0.75 * fx.labels * (1 - fx.hl * 0.6)})`;
        ctx.textAlign = rot ? "center" : "right";
        ctx.textBaseline = "middle";
        let prev: Pt | null = null;
        for (const b of t.bands) {
          if (b.month === null) continue;
          const [sx, sy] = toScreen(b.xL - 16, b.cy);
          if (sx < 8 || sy < 8 || sx > cw - 8 || sy > ch - 8) continue;
          if (prev && Math.hypot(sx - prev[0], sy - prev[1]) < (rot ? 34 : 16)) continue;
          prev = [sx, sy];
          ctx.fillText(MONTHS[b.month].split("").join(String.fromCharCode(8202)), sx, sy);
        }
      }

      // morning haze and light
      const haze = ctx.createRadialGradient(cw * 0.15, ch * 0.05, 0, cw * 0.15, ch * 0.05, Math.max(cw, ch) * 1.05);
      haze.addColorStop(0, "rgba(251,246,234,0.5)");
      haze.addColorStop(0.45, "rgba(244,239,226,0.14)");
      haze.addColorStop(1, "rgba(244,239,226,0)");
      ctx.fillStyle = haze;
      ctx.fillRect(0, 0, cw, ch);
      if (!reduceMotion) {
        // a slow bank of mist rolling across
        const mx = ((now / 60000) % 1) * (cw + 800) - 400;
        const mist = ctx.createRadialGradient(mx, ch * 0.62, 0, mx, ch * 0.62, Math.max(cw, ch) * 0.45);
        mist.addColorStop(0, "rgba(246,243,233,0.16)");
        mist.addColorStop(1, "rgba(246,243,233,0)");
        ctx.fillStyle = mist;
        ctx.fillRect(0, 0, cw, ch);
      }
      // the flyover starts in thicker haze
      if (!landed && flyStart > 0) {
        const e = now - flyStart;
        const a = 0.55 * (1 - clamp(e / 1800));
        ctx.fillStyle = `rgba(240,236,224,${a})`;
        ctx.fillRect(0, 0, cw, ch);
      }
      if (fx.tint > 0.01 && curTint) {
        const tints: Record<string, [string, GlobalCompositeOperation]> = {
          night: ["rgba(28,40,78,0.55)", "multiply"],
          dawn: ["rgba(255,196,170,0.35)", "soft-light"],
          evening: ["rgba(232,140,70,0.32)", "multiply"],
          day: ["rgba(255,250,225,0.22)", "soft-light"],
        };
        const [c, op] = tints[curTint];
        ctx.globalCompositeOperation = op;
        ctx.globalAlpha = fx.tint;
        ctx.fillStyle = c;
        ctx.fillRect(0, 0, cw, ch);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
      }
      const vig = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.35, cw / 2, ch / 2, Math.max(cw, ch) * 0.75);
      vig.addColorStop(0, "rgba(29,26,18,0)");
      vig.addColorStop(1, "rgba(29,26,18,0.35)");
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, cw, ch);

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
    };
  }, [terrain, flyover]);

  return <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }} />;
}
