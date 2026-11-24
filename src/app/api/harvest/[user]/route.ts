import { HarvestError, getHarvest, parseYear } from "@/lib/github";

/** The one serverless route that holds the token: public contribution data as JSON. */
export async function GET(req: Request, ctx: RouteContext<"/api/harvest/[user]">) {
  const { user } = await ctx.params;
  const year = parseYear(new URL(req.url).searchParams.get("year"));
  try {
    const data = await getHarvest(user, year);
    return Response.json(data, {
      headers: { "Cache-Control": "public, max-age=600, s-maxage=3600, stale-while-revalidate=86400" },
    });
  } catch (e) {
    const status = e instanceof HarvestError ? e.status : 500;
    return Response.json({ error: e instanceof Error ? e.message : "Error" }, { status });
  }
}
