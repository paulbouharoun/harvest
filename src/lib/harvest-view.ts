import { computeStats, seedFrom } from "./stats";
import { buildTerrain } from "./terrain";
import type { Harvest } from "./types";

/** Everything derived from a Harvest that both server and client need. */
export function deriveView(h: Pick<Harvest, "login" | "year" | "days" | "total">) {
  const stats = computeStats(h);
  const terrain = buildTerrain(h.days, stats.levels, stats.flooded, seedFrom(`${h.login.toLowerCase()}:${h.year}`));
  return { stats, terrain };
}
