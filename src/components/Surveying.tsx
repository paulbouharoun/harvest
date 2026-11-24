import s from "./home.module.css";

export default function Surveying() {
  return (
    <main className={s.plain}>
      <p className={`${s.caps} ${s.breathe}`}>Loading contributions</p>
      <div className={s.progress}><span /></div>
    </main>
  );
}
