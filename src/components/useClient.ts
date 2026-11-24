"use client";

import { useSyncExternalStore } from "react";

const subscribeResize = (cb: () => void) => {
  window.addEventListener("resize", cb);
  return () => window.removeEventListener("resize", cb);
};
const noop = () => () => {};

/** "wide" or "narrow:<height>" — a stable string so React can compare snapshots. */
export function useViewport(): { wide: boolean; height: number } | null {
  const snap = useSyncExternalStore(
    subscribeResize,
    () => (window.innerWidth > 860 ? "wide" : `narrow:${window.innerHeight}`),
    () => "",
  );
  if (!snap) return null;
  return snap === "wide" ? { wide: true, height: 0 } : { wide: false, height: Number(snap.split(":")[1]) };
}

export function useTimeZone() {
  return useSyncExternalStore(noop, () => Intl.DateTimeFormat().resolvedOptions().timeZone, () => "");
}

export function useOrigin() {
  return useSyncExternalStore(noop, () => window.location.origin, () => "");
}
