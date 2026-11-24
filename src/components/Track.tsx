"use client";

import { useEffect } from "react";
import { track } from "@/lib/analytics";

/** Sends one telemetry event when it mounts. Lets server-rendered pages report themselves. */
export default function Track({ event, reason }: { event: string; reason: string }) {
  useEffect(() => track(event, { reason }), [event, reason]);
  return null;
}
