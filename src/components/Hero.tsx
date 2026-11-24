"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { computeStats } from "@/lib/stats";
import { buildTerrain, mulberry } from "@/lib/terrain";
import type { DayCount } from "@/lib/types";
import Landscape from "./Landscape";
import { useViewport } from "./useClient";
import s from "./home.module.css";

const EXAMPLES = ["mattpocock", "karpathy", "simonw", "ggerganov", "steipete"];

/** A plausible, made-up year for the backdrop: slow spring, busy autumn. */
function sampleYear(): DayCount[] {
  const rand = mulberry(7);
  const year = 2025;
  const days: DayCount[] = [];
  for (let d = new Date(Date.UTC(year, 0, 1)); d.getUTCFullYear() === year; d.setUTCDate(d.getUTCDate() + 1)) {
    const doy = days.length;
    const season = 0.35 + 0.65 * Math.max(0, Math.sin(((doy - 40) / 365) * Math.PI * 1.1));
    const weekend = d.getUTCDay() % 6 === 0 ? 0.35 : 1;
    const active = rand() < season * weekend * 0.95;
    days.push({ date: d.toISOString().slice(0, 10), count: active ? Math.round(1 + rand() ** 2 * 30 * season) : 0 });
  }
  return days;
}

export default function Hero() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [going, setGoing] = useState(false);
  const vp = useViewport();
  const inset = useMemo(
    () => (!vp ? {} : vp.wide ? { left: 560 } : { bottom: 260 }),
    [vp?.wide], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const terrain = useMemo(() => {
    const days = sampleYear();
    const st = computeStats({ days, total: 0 });
    return buildTerrain(days, st.levels, st.flooded, 1234);
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const u = name.trim().replace(/^@/, "").replace(/^https?:\/\/github\.com\//, "").split("/")[0];
    if (!u) return;
    setGoing(true);
    router.push(`/${u}`);
  };

  return (
    <main className={s.root}>
      <Landscape terrain={terrain} drift inset={inset} />
      <div className={s.veil} />
      <div className={s.card}>
        <p className={s.caps}>Harvest</p>
        <h1 className={s.title}>Your year in code, seen from&nbsp;above.</h1>
        <p className={s.lede}>
          Your GitHub contribution graph, drawn as terraced farmland. Each terrace is a week, each paddy a day, and the greener it is, the more you shipped.
        </p>
        <form onSubmit={submit} className={s.form}>
          <span className={s.at}>github.com/</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="username"
            aria-label="GitHub username"
            autoFocus
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <button type="submit" disabled={going}>
            {going ? "Loading…" : "View →"}
          </button>
        </form>
        <p className={s.examples}>
          <span className={s.caps}>Examples</span>
          {EXAMPLES.map((u) => (
            <Link key={u} href={`/${u}`}>
              {u}
            </Link>
          ))}
        </p>
      </div>
      <footer className={s.foot}>
        <span>Public data only · no sign-in</span>
        <a href="https://paulbouharoun.com" target="_blank" rel="noreferrer">
          Made by Paul Bouharoun
        </a>
      </footer>
    </main>
  );
}
