import { PALETTE, linePath, paddyColor, polyPath, type Terrain } from "./terrain";

/** Static, fully grown render of the terrain as an SVG string (share card). */
export function terrainSvg(t: Terrain, view?: { x: number; y: number; w: number; h: number }) {
  const v = view ?? { x: 0, y: 0, w: t.W, h: t.H };
  const out: string[] = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${v.x} ${v.y} ${v.w} ${v.h}" width="${v.w}" height="${v.h}" preserveAspectRatio="xMidYMid slice">`,
    `<defs>
      <linearGradient id="water" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${PALETTE.waterLight}"/>
        <stop offset="0.55" stop-color="${PALETTE.waterDeep}"/>
        <stop offset="1" stop-color="#c6d2cc"/>
      </linearGradient>
      <radialGradient id="haze" cx="0.18" cy="0.1" r="1">
        <stop offset="0" stop-color="#fbf6ea" stop-opacity="0.5"/>
        <stop offset="0.45" stop-color="#f4efe2" stop-opacity="0.16"/>
        <stop offset="1" stop-color="#f4efe2" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="vig" cx="0.5" cy="0.5" r="0.75">
        <stop offset="0.6" stop-color="#1d1a12" stop-opacity="0"/>
        <stop offset="1" stop-color="#1d1a12" stop-opacity="0.28"/>
      </radialGradient>
    </defs>`,
    `<rect x="${v.x - 50}" y="${v.y - 50}" width="${v.w + 100}" height="${v.h + 100}" fill="${PALETTE.forest}"/>`,
  );
  const inView = (x: number, y: number, m = 20) => x > v.x - m && x < v.x + v.w + m && y > v.y - m && y < v.y + v.h + m;

  const shadows: string[] = [];
  const crowns: string[] = [];
  const lights: string[] = [];
  for (const tr of t.trees) {
    if (!inView(tr.x, tr.y)) continue;
    shadows.push(`<circle cx="${(tr.x + 2.5).toFixed(1)}" cy="${(tr.y + 3).toFixed(1)}" r="${tr.r.toFixed(1)}"/>`);
    crowns.push(`<circle cx="${tr.x.toFixed(1)}" cy="${tr.y.toFixed(1)}" r="${tr.r.toFixed(1)}" fill="${PALETTE.crowns[tr.shade]}"/>`);
    lights.push(`<circle cx="${(tr.x - tr.r * 0.3).toFixed(1)}" cy="${(tr.y - tr.r * 0.3).toFixed(1)}" r="${(tr.r * 0.45).toFixed(1)}"/>`);
  }
  out.push(`<g fill="#1a2012" fill-opacity="0.4">${shadows.join("")}</g>`, `<g>${crowns.join("")}</g>`);
  out.push(`<g fill="#f3f0dc" fill-opacity="0.09">${lights.join("")}</g>`);

  out.push(`<g fill="${PALETTE.bund}">${t.bands.map((b) => `<path d="${polyPath(b.outline)}"/>`).join("")}</g>`);
  out.push(
    `<g stroke="${PALETTE.bund}" stroke-width="1.3" stroke-linejoin="round">${t.paddies
      .map((p) => `<path d="${polyPath(p.poly)}" fill="${p.flooded ? "url(#water)" : paddyColor(p)}"/>`)
      .join("")}</g>`,
  );
  out.push(
    `<g fill="none" stroke="#2f4a17" stroke-opacity="0.2" stroke-width="0.9">${t.paddies
      .filter((p) => !p.flooded)
      .flatMap((p) => p.rows.map((r) => `<path d="${linePath(r)}"/>`))
      .join("")}</g>`,
  );
  // terrace risers: a soft shadow beneath each bund, a highlight on top
  out.push(
    `<g fill="none" stroke="#3a2c16" stroke-opacity="0.22" stroke-width="2.4" transform="translate(0 1.6)">${t.bands
      .map((b) => `<path d="${linePath(b.top)}"/>`)
      .join("")}</g>`,
    `<g fill="none" stroke="#efe6cd" stroke-opacity="0.7" stroke-width="0.8">${t.bands
      .map((b) => `<path d="${linePath(b.top)}"/>`)
      .join("")}</g>`,
  );
  // glints on flooded paddies
  out.push(
    `<g stroke="#ffffff" stroke-opacity="0.75" stroke-width="1.1" stroke-linecap="round">${t.paddies
      .filter((p) => p.flooded)
      .map((p) => `<path d="M${(p.cx - 14).toFixed(1)} ${(p.cy - 1).toFixed(1)}L${(p.cx + 8).toFixed(1)} ${(p.cy - 2).toFixed(1)}"/>`)
      .join("")}</g>`,
  );
  out.push(
    `<rect x="${v.x}" y="${v.y}" width="${v.w}" height="${v.h}" fill="url(#haze)"/>`,
    `<rect x="${v.x}" y="${v.y}" width="${v.w}" height="${v.h}" fill="url(#vig)"/>`,
    `</svg>`,
  );
  return out.join("");
}
