import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { HarvestError, getHarvest, parseYear } from "@/lib/github";
import { deriveView } from "@/lib/harvest-view";
import { fmtDate, fmtNum } from "@/lib/stats";
import { terrainSvg } from "@/lib/svg";

const fonts = Promise.all([
  readFile(join(process.cwd(), "src/assets/fonts/hanken-grotesk-latin-400-normal.woff")),
  readFile(join(process.cwd(), "src/assets/fonts/hanken-grotesk-latin-500-normal.woff")),
]);

const INK = "#29261f";
const MUTED = "#7a715f";

export async function GET(req: Request, ctx: RouteContext<"/card/[user]">) {
  const { user } = await ctx.params;
  const year = parseYear(new URL(req.url).searchParams.get("year"));
  const [regular, medium] = await fonts;
  try {
    const h = await getHarvest(user, year);
    const { stats, terrain } = deriveView(h);
    const svg = terrainSvg(terrain, { x: 90, y: 40, w: 980, h: 920 });
    const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
    const season = stats.season;

    const caption = (text: string) => (
      <div style={{ fontSize: 15, letterSpacing: 2.6, textTransform: "uppercase", color: MUTED }}>{text}</div>
    );

    return new ImageResponse(
      (
        <div style={{ width: 1200, height: 630, display: "flex", background: "#ebe5d6", fontFamily: "Hanken" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} width={672} height={630} alt="" style={{ width: 672, height: 630 }} />
          <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: "52px 56px 48px", color: INK }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              {caption("Harvest")}
              {caption(String(h.year))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", marginTop: 64 }}>
              {caption(`@${h.login} on GitHub`)}
              <div style={{ fontSize: 96, fontWeight: 500, letterSpacing: -3, lineHeight: 1, marginTop: 18 }}>
                {fmtNum(h.total)}
              </div>
              <div style={{ fontSize: 24, color: MUTED, marginTop: 10 }}>{`contributions in ${h.year}`}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", marginTop: "auto", gap: 16 }}>
              <div style={{ display: "flex", borderTop: `1px solid #cbbf9f`, paddingTop: 16, justifyContent: "space-between" }}>
                {caption("Longest streak")}
                <div style={{ fontSize: 18 }}>{season.length ? `${season.length} ${season.length === 1 ? "day" : "days"}` : "—"}</div>
              </div>
              <div style={{ display: "flex", borderTop: `1px solid #cbbf9f`, paddingTop: 16, justifyContent: "space-between" }}>
                {caption("Busiest day")}
                <div style={{ fontSize: 18 }}>
                  {stats.busiest ? `${fmtDate(stats.busiest.date)} · ${fmtNum(stats.busiest.count ?? 0)}` : "—"}
                </div>
              </div>
              <div style={{ fontSize: 15, color: MUTED, marginTop: 18, fontStyle: "normal" }}>
                Your year in code, seen from above.
              </div>
            </div>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
        fonts: [
          { name: "Hanken", data: regular, weight: 400 },
          { name: "Hanken", data: medium, weight: 500 },
        ],
        headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400" },
      },
    );
  } catch (e) {
    const status = e instanceof HarvestError ? e.status : 500;
    return new Response(e instanceof Error ? e.message : "Error", { status });
  }
}
