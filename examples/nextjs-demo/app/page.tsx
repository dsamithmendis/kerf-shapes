import { NotchCard } from "../components/kerf/NotchCard";
import { RoundedBanner } from "../components/kerf/RoundedBanner";
import { RingFrame } from "../components/kerf/RingFrame";

// This page is a React Server Component (no "use client").
// NotchCard and RoundedBanner are hook-free, so they render on the server.
// RingFrame has a hole, so its generated file carries its own "use client".
export default function Page() {
  return (
    <main style={{ padding: 48, display: "grid", gap: 32 }}>
      <h1 style={{ margin: 0 }}>Kerf × Next.js (Server Component page)</h1>

      <section style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "center" }}>
        <NotchCard size={260} fill="#f5a524" />
        <NotchCard size={260}>
          <div style={{ background: "linear-gradient(135deg,#7c3aed,#06b6d4)", width: "100%", height: "100%", display: "grid", placeItems: "center", color: "white", fontWeight: 700 }}>
            clipped children
          </div>
        </NotchCard>
        <NotchCard size={260}>
          <div style={{ background: "#22c55e", width: "100%", height: "100%" }} />
        </NotchCard>
      </section>

      <section style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "center" }}>
        <RoundedBanner size={360} fill="#ef4444" />
        <RingFrame size={200} fill="#38bdf8" />
        <RingFrame size={200}>
          <div style={{ background: "#e11d48", width: "100%", height: "100%" }} />
        </RingFrame>
        <RoundedBanner size={360}>
          <div style={{ background: "linear-gradient(90deg,#f59e0b,#ef4444)", width: "100%", height: "100%", display: "grid", placeItems: "center", color: "white", fontWeight: 700 }}>
            curved clip
          </div>
        </RoundedBanner>
      </section>
    </main>
  );
}
