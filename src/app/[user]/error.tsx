"use client";
import Link from "next/link";
import s from "@/components/home.module.css";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className={s.plain}>
      <p className={s.caps}>Something went wrong</p>
      <h1 className={s.plainTitle}>Couldn&rsquo;t load contributions.</h1>
      <p className={s.plainLine}>GitHub didn&rsquo;t respond in time. Try again in a moment.</p>
      <div style={{ display: "flex", gap: 12 }}>
        <button onClick={reset} className={s.button}>Try again</button>
        <Link href="/" className={s.button}>Home</Link>
      </div>
    </main>
  );
}
