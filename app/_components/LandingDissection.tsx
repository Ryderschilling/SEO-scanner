"use client";

// app/_components/LandingDissection.tsx
// Scroll-triggered scan animation with wireframe + annotations.

import { useEffect, useRef, useState } from "react";

const REGIONS = [
  { y: 30,  h: 36,  label: "NAV",      annot: "h1.nav · alt:0/4 · contrast 4.8:1",        score: "A−", side: "L" as const },
  { y: 78,  h: 110, label: "HERO",     annot: "<h1> 64px · 12 words · keyword density 2.1%", score: "A",  side: "R" as const },
  { y: 200, h: 60,  label: "LEDE",     annot: "meta description ✓ · og:image ✗",          score: "B",  side: "L" as const },
  { y: 270, h: 88,  label: "PRODUCTS", annot: "6 cards · alt missing 2/6 · LCP 1.8s",     score: "B+", side: "R" as const },
  { y: 370, h: 52,  label: "TRUST",    annot: "0 schema.org markup detected",             score: "D",  side: "L" as const },
  { y: 432, h: 78,  label: "FOOTER",   annot: "sitemap ✓ · robots.txt ✓",                 score: "A",  side: "R" as const },
];

const MENTIONS = [
  { at: 0.18, engine: "GPT-5",      text: "A frontier AI safety lab." },
  { at: 0.42, engine: "CLAUDE",     text: "— self-reference omitted —" },
  { at: 0.65, engine: "PERPLEXITY", text: "Known for the Claude family of models." },
  { at: 0.88, engine: "GEMINI",     text: "Founded 2021 by ex-OpenAI researchers." },
];

export default function LandingDissection() {
  const accent = "#b45309";
  const ref = useRef<HTMLElement>(null);
  const [t, setT] = useState(0);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && !running && !done) setRunning(true);
      });
    }, { threshold: 0.35 });
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [running, done]);

  useEffect(() => {
    if (!running) return;
    const dur = 5500;
    let raf: number;
    const start = performance.now();
    const loop = (now: number) => {
      const progress = Math.min(1, (now - start) / dur);
      setT(progress);
      if (progress < 1) raf = requestAnimationFrame(loop);
      else setDone(true);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running]);

  const frameH = 540;
  const scanY = t * frameH;

  return (
    <section className="dissect-section" ref={ref}>
      <div className="dissect-header">
        <div className="eyebrow">FIG. 03 — HOW IT WORKS</div>
        <h2 className="serif dissect-h2">
          We lay your page open<br />
          <span className="dissect-h2-em">and read it back to you.</span>
        </h2>
        <p className="dissect-lead">
          A scan line walks the DOM. Every region — nav, hero, products, footer — gets graded
          against 24 checks across SEO, AEO and GEO. Then we extract what eight different AI
          engines actually <em>say</em> about your business.
        </p>
      </div>

      <div className="dissect-stage">
        <div className="dissect-annot dissect-annot-l">
          {REGIONS.filter((r) => r.side === "L").map((r) => {
            const visible = scanY >= r.y;
            return (
              <div key={r.label} className="annot-item"
                style={{ top: r.y + r.h / 2 - 22, opacity: visible ? 1 : 0.15 }}>
                <div className="annot-head">
                  <span className="annot-label">{r.label}</span>
                  <span className="serif annot-grade" style={{ color: accent }}>{r.score}</span>
                </div>
                <div className="annot-text">{r.annot}</div>
                <div className="annot-leader" />
              </div>
            );
          })}
        </div>

        <div className="dissect-frame">
          <div className="dissect-url-bar mono">
            <span>HTTPS · 200 OK</span>
            <span>1440 × 900</span>
          </div>
          {REGIONS.map((r) => {
            const passed = scanY >= r.y + r.h;
            const inScan = scanY >= r.y && scanY < r.y + r.h;
            return (
              <div key={r.label} className="wf-region"
                style={{ top: r.y, height: r.h, opacity: passed ? 0.7 : inScan ? 1 : 0.25 }}>
                <div className="wf-content">
                  {Array.from({ length: r.label === "HERO" ? 3 : r.label === "PRODUCTS" ? 4 : 2 }).map((_, j) => (
                    <div key={j} className="wf-line" style={{
                      height: r.label === "HERO" && j === 0 ? 8 : 4,
                      width: r.label === "PRODUCTS" ? "23%" : `${80 - j * 15}%`,
                      display: r.label === "PRODUCTS" ? "inline-block" : "block",
                    }} />
                  ))}
                  {r.label === "PRODUCTS" && (
                    <div className="wf-grid">
                      {[1, 2, 3].map((j) => <div key={j} className="wf-cell" />)}
                    </div>
                  )}
                </div>
                <span className="wf-label mono">{r.label}</span>
              </div>
            );
          })}
          <div className="scan-line" style={{ top: scanY, background: accent, boxShadow: `0 0 12px ${accent}, 0 0 24px ${accent}` }}>
            <div className="scan-pct mono" style={{ color: accent }}>{String(Math.round(t * 100)).padStart(3, "0")}%</div>
            <div className="scan-y mono"   style={{ color: accent }}>Y={String(Math.round(scanY)).padStart(3, "0")}</div>
          </div>
          <div className="scan-trail" style={{ height: scanY, background: `linear-gradient(to bottom, transparent, ${accent}10)` }} />
        </div>

        <div className="dissect-annot dissect-annot-r">
          {REGIONS.filter((r) => r.side === "R").map((r) => {
            const visible = scanY >= r.y;
            return (
              <div key={r.label} className="annot-item annot-r"
                style={{ top: r.y + r.h / 2 - 22, opacity: visible ? 1 : 0.15 }}>
                <div className="annot-head">
                  <span className="serif annot-grade" style={{ color: accent }}>{r.score}</span>
                  <span className="annot-label">{r.label}</span>
                </div>
                <div className="annot-text">{r.annot}</div>
                <div className="annot-leader annot-leader-r" />
              </div>
            );
          })}
        </div>
      </div>

      <div className="dissect-mentions">
        <div className="eyebrow" style={{ marginBottom: 16 }}>EXTRACTED · WHAT THE AI ENGINES SAY</div>
        <div className="mentions-grid">
          {MENTIONS.map((m, i) => {
            const visible = t >= m.at;
            return (
              <div key={i} className="mention-card" style={{ opacity: visible ? 1 : 0.15 }}>
                <div className="mention-engine mono">{m.engine}</div>
                <div className="serif mention-text">&ldquo;{m.text}&rdquo;</div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
