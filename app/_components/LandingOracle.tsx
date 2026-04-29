"use client";

// app/landing-preview/_components/LandingOracle.tsx
// Oracle constellation hero with URL input.

import { useEffect, useState } from "react";

const BAKED = {
  accent: "#b45309",
  headlineColor: "#b45309",
  headlineWeight: 700,
  headlineSize: 80,
  constellationOpacity: 0.4,
  textBackdrop: "shadow" as "none" | "scrim" | "blur" | "card" | "shadow",
  subColor: "#404040",
};

const ENGINES = [
  { id: "GPT", label: "GPT", x: 0.18, y: 0.30 },
  { id: "CLA", label: "CLAUDE", x: 0.82, y: 0.20 },
  { id: "PRP", label: "PERPLEXITY", x: 0.10, y: 0.72 },
  { id: "GEM", label: "GEMINI", x: 0.88, y: 0.66 },
  { id: "GRK", label: "GROK", x: 0.24, y: 0.92 },
  { id: "CPT", label: "COPILOT", x: 0.76, y: 0.92 },
  { id: "DPS", label: "DEEPSEEK", x: 0.50, y: 0.10 },
  { id: "YOU", label: "YOU.COM", x: 0.50, y: 1.00 },
];

export default function LandingOracle() {
  const [phase, setPhase] = useState<"querying" | "answered">("querying");
  const [activeIdx, setActiveIdx] = useState(0);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (phase === "querying") {
      let i = 0;
      const id = setInterval(() => {
        i++;
        setActiveIdx(i);
        if (i >= ENGINES.length) {
          clearInterval(id);
          setTimeout(() => setPhase("answered"), 700);
        }
      }, 460);
      return () => clearInterval(id);
    }
    if (phase === "answered") {
      const t = setTimeout(() => {
        setPhase("querying");
        setActiveIdx(0);
      }, 4500);
      return () => clearTimeout(t);
    }
  }, [phase]);

  const accent = BAKED.accent;

  return (
    <section className={`oracle-hero tk-backdrop-${BAKED.textBackdrop}`}
      style={{
        // CSS vars consumed by marketing.css
        ["--tk-headline-color" as any]: BAKED.headlineColor,
        ["--tk-sub-color" as any]: BAKED.subColor,
        ["--tk-headline-weight" as any]: BAKED.headlineWeight,
        ["--tk-headline-size" as any]: `${BAKED.headlineSize}px`,
        ["--tk-constellation-opacity" as any]: BAKED.constellationOpacity,
        ["--accent" as any]: accent,
      }}>
      <div className="gridlines" />
      <div className="regmark" style={{ top: 80, left: 24 }} />
      <div className="regmark" style={{ top: 80, right: 24, transform: "scaleX(-1)" }} />

      <div className="oracle-chrome">
        <span>SCANNER · ORACLE</span>
        <span className="hide-sm">QRY — {String(tick).padStart(4, "0")}</span>
        <span className="flicker" style={{ color: accent }}>● LIVE</span>
        <span className="hide-sm">N=08 ENGINES</span>
      </div>

      <div className="oracle-text-stack">
        <div className="oracle-eyebrow eyebrow fade-up" style={{ animationDelay: "0.1s" }}>
          AN ORACLE IS CONSULTED
        </div>
        <h1 className="oracle-h1 serif fade-up" style={{ animationDelay: "0.2s" }}>
          What do the machines<br />
          <span className="oracle-h1-em">say about you?</span>
        </h1>
        <p className="oracle-sub fade-up" style={{ animationDelay: "0.3s" }}>
          Eight AI engines. One scan. We grade your site for classical SEO, answer-engine
          optimization, and generative-engine visibility — then tell you exactly what to fix.
        </p>
        <div className="oracle-form fade-up" style={{ animationDelay: "0.4s" }}>
          <a href="/scan" className="cta-primary">
            Scan now
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 7h8m0 0L7 3m4 4l-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        </div>
        <div className="oracle-meta fade-up" style={{ animationDelay: "0.5s" }}>
          <span className="pulse-dot-wrap"><span className="pulse-dot" /></span>
          Free · No signup · Results in ~30 seconds
        </div>
      </div>

      <div className="oracle-constellation">
        <svg viewBox="0 0 760 540" preserveAspectRatio="xMidYMid meet">
          {[80, 140, 200, 260].map((r, i) => (
            <circle key={i} cx={380} cy={270} r={r} fill="none"
              stroke="var(--fg)" strokeOpacity={0.06}
              strokeDasharray={i % 2 ? "2 4" : "0"} />
          ))}
          <line x1={20} y1={270} x2={740} y2={270} stroke="var(--fg)" strokeOpacity={0.06} />
          <line x1={380} y1={20} x2={380} y2={520} stroke="var(--fg)" strokeOpacity={0.06} />
          {ENGINES.map((e, i) => {
            const x = e.x * 760, y = e.y * 540;
            const drawn = i < activeIdx || phase === "answered";
            const isCur = i === activeIdx - 1 && phase === "querying";
            return (
              <line key={"l" + e.id}
                x1={380} y1={270} x2={x} y2={y}
                stroke={isCur ? accent : "var(--fg)"}
                strokeOpacity={drawn ? (isCur ? 1 : 0.28) : 0}
                strokeWidth={isCur ? 1.2 : 0.5}
                style={{ transition: "opacity 0.5s, stroke 0.3s" }} />
            );
          })}
          <g>
            <circle cx={380} cy={270} r={4} fill="var(--fg)" />
            <circle cx={380} cy={270} r={12} fill="none" stroke="var(--fg)" strokeOpacity={0.4} />
            <circle cx={380} cy={270} r={20} fill="none" stroke="var(--fg)" strokeOpacity={0.18} />
          </g>
          {ENGINES.map((e, i) => {
            const x = e.x * 760, y = e.y * 540;
            const drawn = i < activeIdx || phase === "answered";
            const isCur = i === activeIdx - 1 && phase === "querying";
            return (
              <g key={e.id} style={{ opacity: drawn ? 1 : 0.25, transition: "opacity 0.5s" }}>
                <circle cx={x} cy={y} r={isCur ? 8 : 4}
                  fill={drawn ? (isCur ? accent : "var(--fg)") : "none"}
                  stroke="var(--fg)" strokeOpacity={0.6} strokeWidth={0.8}
                  style={{ transition: "all 0.3s" }} />
                {isCur && (
                  <circle cx={x} cy={y} r={16} fill="none" stroke={accent}
                    strokeOpacity={0.5} strokeWidth={1}>
                    <animate attributeName="r" from="8" to="24" dur="1s" repeatCount="indefinite" />
                    <animate attributeName="stroke-opacity" from="0.6" to="0" dur="1s" repeatCount="indefinite" />
                  </circle>
                )}
                <text x={x} y={y - 14}
                  fill="var(--fg)" fillOpacity={drawn ? 0.85 : 0.4}
                  fontFamily="Geist Mono, monospace" fontSize={9}
                  textAnchor="middle" letterSpacing="0.18em">
                  {e.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="oracle-scroll-hint">
        <span>SCROLL</span>
        <svg width="10" height="14" viewBox="0 0 10 14" fill="none">
          <path d="M5 1v12m0 0L1 9m4 4l4-4" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
        </svg>
      </div>
    </section>
  );
}
