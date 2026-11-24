import Link from "next/link";
import Track from "@/components/Track";
import s from "@/components/home.module.css";

export default function NotFound() {
  return (
    <main className={s.plain}>
      <Track event="field_load_failed" reason="not_found" />
      <p className={s.caps}>Not found</p>
      <h1 className={s.plainTitle}>No GitHub user by that name.</h1>
      <p className={s.plainLine}>Check the spelling and try again.</p>
      <Link href="/" className={s.button}>Back</Link>
    </main>
  );
}
