import { describe, expect, it } from "vitest";
import { computeStats, fmtDate, hourProfile, seedFrom } from "../src/lib/stats";
import type { DayCount } from "../src/lib/types";

/** A year of days from a list of counts; the rest of the year is still to come. */
function year(counts: (number | null)[], y = 2026): DayCount[] {
  const days: DayCount[] = [];
  const leap = new Date(Date.UTC(y, 1, 29)).getUTCMonth() === 1;
  for (let i = 0; i < (leap ? 366 : 365); i++) {
    const date = new Date(Date.UTC(y, 0, 1 + i)).toISOString().slice(0, 10);
    days.push({ date, count: i < counts.length ? counts[i] : null });
  }
  return days;
}

describe("computeStats", () => {
  it("counts active and elapsed days and ignores days still to come", () => {
    const s = computeStats({ days: year([1, 0, 2, 0, 0]), total: 3 });
    expect(s.elapsedDays).toBe(5);
    expect(s.activeDays).toBe(2);
    expect(s.levels.slice(0, 5).every((l) => l >= 0)).toBe(true);
    expect(s.levels[5]).toBe(-1);
  });

  it("finds the longest growing season and its dates", () => {
    const s = computeStats({ days: year([1, 1, 0, 3, 1, 2, 4, 0, 1]), total: 13 });
    expect(s.season).toEqual({ length: 4, start: "2026-01-04", end: "2026-01-07" });
  });

  it("reports the busiest day, keeping the first on a tie", () => {
    const s = computeStats({ days: year([2, 7, 0, 7]), total: 16 });
    expect(s.busiest).toEqual({ date: "2026-01-02", count: 7 });
  });

  it("handles an empty year", () => {
    const s = computeStats({ days: year([0, 0, 0]), total: 0 });
    expect(s.activeDays).toBe(0);
    expect(s.season.length).toBe(0);
    expect(s.busiest).toBeNull();
    expect(s.flooded.size).toBe(0);
  });

  it("floods only days that stand out, and never more than nine", () => {
    const steady = computeStats({ days: year(Array(60).fill(3)), total: 180 });
    expect(steady.flooded.size).toBe(0);

    const counts = Array(100).fill(2);
    for (let i = 0; i < 20; i++) counts[i * 5] = 50 + i;
    const spiky = computeStats({ days: year(counts), total: 0 });
    expect(spiky.flooded.size).toBeGreaterThan(0);
    expect(spiky.flooded.size).toBeLessThanOrEqual(9);
    for (const i of spiky.flooded) expect(counts[i]).toBeGreaterThanOrEqual(50);
  });
});

describe("hourProfile", () => {
  const at = (hour: number, n: number) =>
    Array.from({ length: n }, (_, i) => `2026-03-${String(1 + i).padStart(2, "0")}T${String(hour).padStart(2, "0")}:15:00Z`);

  it("needs a minimum sample", () => {
    expect(hourProfile(at(10, 7), "UTC")).toBeNull();
  });

  it("names the hours someone keeps", () => {
    expect(hourProfile(at(23, 10), "UTC")?.title).toBe("Night gardener");
    expect(hourProfile(at(6, 10), "UTC")?.title).toBe("Dawn planter");
    expect(hourProfile(at(11, 10), "UTC")?.title).toBe("Daylight farmer");
    expect(hourProfile(at(19, 10), "UTC")?.title).toBe("Evening tender");
  });

  it("buckets into the viewer's time zone", () => {
    const p = hourProfile(at(11, 10), "Asia/Tokyo");
    expect(p?.hist[20]).toBe(10);
    expect(p?.sample).toBe(10);
  });
});

describe("helpers", () => {
  it("formats dates without depending on the local time zone", () => {
    expect(fmtDate("2026-11-24")).toBe("24 Nov");
    expect(fmtDate("2026-11-24", true)).toBe("Tue 24 Nov");
  });

  it("derives a stable seed from a username", () => {
    expect(seedFrom("octocat")).toBe(seedFrom("octocat"));
    expect(seedFrom("octocat")).not.toBe(seedFrom("octocaT"));
  });
});
