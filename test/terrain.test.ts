import { describe, expect, it } from "vitest";
import { computeStats } from "../src/lib/stats";
import { buildTerrain, mulberry, pointInPoly } from "../src/lib/terrain";
import type { DayCount } from "../src/lib/types";

function field(y: number, seed: number) {
  const rand = mulberry(7);
  const days: DayCount[] = [];
  for (let d = new Date(Date.UTC(y, 0, 1)); d.getUTCFullYear() === y; d.setUTCDate(d.getUTCDate() + 1)) {
    days.push({ date: d.toISOString().slice(0, 10), count: rand() < 0.4 ? 0 : Math.floor(rand() * 12) });
  }
  const s = computeStats({ days, total: 0 });
  return { days, s, terrain: buildTerrain(days, s.levels, s.flooded, seed) };
}

describe("buildTerrain", () => {
  it.each([2023, 2024, 2026])("lays out one paddy for every day of %i", (y) => {
    const { days, terrain } = field(y, 42);
    const planted = terrain.paddies.filter((p) => p.index >= 0);
    expect(planted).toHaveLength(days.length);
    expect(new Set(planted.map((p) => p.index)).size).toBe(days.length);
    for (const p of planted) {
      expect(p.date).toBe(days[p.index].date);
      expect(p.slot).toBe(new Date(`${p.date}T12:00:00Z`).getUTCDay());
    }
  });

  it("carries levels and flooding through to the paddies", () => {
    const { s, terrain } = field(2026, 42);
    for (const p of terrain.paddies.filter((p) => p.index >= 0)) {
      expect(p.level).toBe(s.levels[p.index]);
      expect(p.flooded).toBe(s.flooded.has(p.index));
    }
  });

  it("is deterministic for a seed and different across seeds", () => {
    const a = JSON.stringify(field(2026, 42).terrain);
    expect(JSON.stringify(field(2026, 42).terrain)).toBe(a);
    expect(JSON.stringify(field(2026, 43).terrain)).not.toBe(a);
  });

  it("keeps every paddy a real polygon inside the canvas width", () => {
    const { terrain } = field(2026, 42);
    for (const p of terrain.paddies) {
      expect(p.poly.length).toBeGreaterThanOrEqual(3);
      for (const [x, y] of p.poly) {
        expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
      }
    }
  });
});

describe("pointInPoly", () => {
  const square: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]];
  it("tells inside from outside", () => {
    expect(pointInPoly(5, 5, square)).toBe(true);
    expect(pointInPoly(15, 5, square)).toBe(false);
    expect(pointInPoly(5, -1, square)).toBe(false);
  });
});
