"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type {
  AnalysisResult,
  CheckResult,
  Category,
  CompareResult,
  PageSpeedData,
  SerpResult,
  SerpKeywordResult,
  CrawlResult,
  CrawlPageResult,
} from "@/lib/types";

// ── Types ─────────────────────────────────────────────────────────────────────
type Phase = "hero" | "loading" | "gate" | "result" | "compare";

interface LeadData {
  name: string;
  email: string;
  business: string;
  challenge?: string;
}

// ── Config ────────────────────────────────────────────────────────────────────
const GRADE_LABELS: Record<string, string> = {
  A: "Excellent",
  B: "Good",
  C: "Needs work",
  D: "Poor",
  F: "Critical",
};

const CATEGORY_CFG = {
  seo: {
    label: "SEO",
    title: "Search Engine Optimization",
    desc: "How visible you are to Google, Bing, and traditional search engines.",
  },
  aeo: {
    label: "AEO",
    title: "Answer Engine Optimization",
    desc: "How likely you are to appear in featured snippets and voice answers.",
  },
  geo: {
    label: "GEO",
    title: "Generative Engine Optimization",
    desc: "How likely AI tools — ChatGPT, Perplexity, Google AI Overviews — are to cite you.",
  },
};

const LOADING_STEPS = [
  "Fetching HTML",
  "Parsing 13 SEO checks",
  "Parsing 6 AEO checks",
  "Parsing 5 GEO checks",
  "PageSpeed insights",
];

// L3 Editorial Anticipation loading screen constants
const SCAN_STEPS_TIMED = [
  { label: "Fetching HTML",           duration: 0.8 },
  { label: "Parsing 13 SEO checks",   duration: 1.2 },
  { label: "Parsing 6 AEO checks",    duration: 0.9 },
  { label: "Parsing 5 GEO checks",    duration: 0.9 },
  { label: "PageSpeed insights",      duration: 1.4 },
  { label: "Compiling score",         duration: 0.6 },
] as const;

const TRIVIA_NOTES = [
  {
    n: "01",
    title: "Did you know?",
    body: "Google truncates titles at about 60 characters. Most sites we scan have titles 12 characters too long.",
  },
  {
    n: "02",
    title: "Fun fact.",
    body: "ChatGPT cites a webpage roughly once every 380 queries. AEO signals can more than double that rate.",
  },
  {
    n: "03",
    title: "Worth knowing.",
    body: "FAQ schema is the single highest-ROI thing most B2B sites are missing. It takes about 20 minutes to add.",
  },
  {
    n: "04",
    title: "From the trenches.",
    body: "The average site we scan recovers 27 visibility points after just 3 targeted fixes.",
  },
] as const;

const TOC_SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "fixes",    label: "Top fixes" },
  { id: "speed",    label: "Performance" },
  { id: "serp",     label: "Rankings" },
  { id: "crawl",    label: "Site-wide" },
  { id: "ai",       label: "AI prompt" },
  { id: "seo",      label: "SEO" },
  { id: "aeo",      label: "AEO" },
  { id: "geo",      label: "GEO" },
];

const COMPARE_TOC_SECTIONS = [
  { id: "compare-head", label: "Head to head" },
  { id: "compare-wins", label: "Wins / Ties" },
  { id: "compare-gaps", label: "Gaps" },
];

// ── Utilities ─────────────────────────────────────────────────────────────────
function formatMs(ms: number): string {
  if (!ms) return "—";
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function buildFixPrompt(result: AnalysisResult): string {
  const failed = result.checks
    .filter((c) => !c.passed)
    .sort((a, b) => b.maxScore - a.maxScore);
  const lines: string[] = [
    `Fix the following SEO issues on ${result.url}:`,
    "",
  ];
  const cats: Category[] = ["seo", "aeo", "geo"];
  for (const cat of cats) {
    const checks = failed.filter((c) => c.category === cat);
    if (!checks.length) continue;
    lines.push(`--- ${CATEGORY_CFG[cat].label} ---`);
    checks.forEach((c, i) => {
      lines.push(`${i + 1}. ${c.name}`);
      if (c.detail) lines.push(`   Current: ${c.detail}`);
      lines.push(`   Fix: ${c.recommendation}`, "");
    });
  }
  lines.push("Implement these fixes in my codebase.");
  return lines.join("\n");
}

function buildSeoFixPrompt(result: AnalysisResult): string {
  const failedSeo = result.checks
    .filter((c) => c.category === "seo" && !c.passed)
    .sort((a, b) => b.maxScore - a.maxScore);

  const lines: string[] = [
    `SEO Fix Request — ${result.url}`,
    `Scanned: ${new Date(result.timestamp).toLocaleDateString()}`,
    `SEO Score: ${result.scores.seo.percentage}/100 — ${failedSeo.length} issue${failedSeo.length !== 1 ? "s" : ""} to fix`,
    "",
  ];

  failedSeo.forEach((c, i) => {
    lines.push(`${i + 1}. ${c.name}  (+${c.maxScore} pts)`);
    if (c.detail) lines.push(`   Current: ${c.detail}`);
    lines.push(`   Fix: ${c.recommendation}`);
    lines.push("");
  });

  lines.push("Please implement all of these SEO fixes in my codebase. For each one, show me exactly what code to add or change.");
  return lines.join("\n");
}

// ── Hooks ─────────────────────────────────────────────────────────────────────
function useTick(target: number, duration = 1400) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    setValue(0);
    let raf: number;
    let startTime: number | null = null;
    const animate = (ts: number) => {
      if (!startTime) startTime = ts;
      const progress = Math.min((ts - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));
      if (progress < 1) raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

// (useActiveSection is now inlined into StickyTOC)

function useIsMobile(breakpoint = 640) {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < breakpoint);
    check();
    window.addEventListener("resize", check, { passive: true });
    return () => window.removeEventListener("resize", check);
  }, [breakpoint]);
  return isMobile;
}

// Drives L3 loading animation — monotonically increasing, time-based, never loops.
// Elapsed time drives everything so the bar always moves forward and never resets.
function useScanProgress(_steps: typeof SCAN_STEPS_TIMED) {
  const startRef = useRef(performance.now());
  const [elapsed, setElapsed] = useState(0); // ms since mount

  useEffect(() => {
    let raf: number;
    const tick = () => {
      setElapsed(performance.now() - startRef.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Each entry: elapsed ms at which that step COMPLETES and the next begins.
  // Tuned to match real scan stages: HTML fetch → parse → robots/sitemap → PageSpeed.
  // PageSpeed is the slowest (10–25 s) so the last step lingers realistically.
  const STEP_ENDS = [1800, 3200, 4400, 5600, 8000, Infinity];

  let activeIdx = 0;
  for (let i = 0; i < STEP_ENDS.length; i++) {
    if (elapsed < STEP_ENDS[i]) { activeIdx = i; break; }
    if (i === STEP_ENDS.length - 1) activeIdx = i;
  }
  activeIdx = Math.min(activeIdx, _steps.length - 1);

  const stepStart = activeIdx === 0 ? 0 : STEP_ENDS[activeIdx - 1];
  const stepEnd   = STEP_ENDS[activeIdx];
  const stepProgress = stepEnd === Infinity
    ? Math.min(0.92, (elapsed - stepStart) / 20000) // PageSpeed: slow crawl to 92%
    : Math.min(1, (elapsed - stepStart) / Math.max(1, stepEnd - stepStart));

  return { activeIdx, stepProgress, elapsed };
}

// ── Primitives ────────────────────────────────────────────────────────────────
const card: React.CSSProperties = {
  border: "1px solid var(--line)",
  borderRadius: 16,
  background: "var(--bg-2)",
  overflow: "hidden",
};

const Checkmark = ({ color = "var(--bg)" }: { color?: string }) => (
  <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
    <path
      d="M1.5 4L3 5.5L6.5 2"
      stroke={color}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const Caret = ({ open }: { open: boolean }) => (
  <svg
    width="10"
    height="6"
    viewBox="0 0 10 6"
    fill="none"
    style={{
      flexShrink: 0,
      transform: open ? "rotate(180deg)" : "none",
      transition: "transform 0.2s",
      color: "var(--fg-4)",
    }}
  >
    <path
      d="M1 1L5 5L9 1"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// ── Ring ──────────────────────────────────────────────────────────────────────
function Ring({
  percentage,
  size = 88,
  strokeWidth = 5,
  ringKey,
}: {
  percentage: number;
  size?: number;
  strokeWidth?: number;
  ringKey?: string;
}) {
  const r = (size - strokeWidth * 2) / 2;
  const circ = 2 * Math.PI * r;
  const target = circ * (1 - percentage / 100);

  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg
        key={ringKey}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ transform: "rotate(-90deg)", display: "block" }}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--line)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--fg)"
          strokeWidth={strokeWidth}
          strokeDasharray={circ}
          strokeLinecap="round"
          className="ring-fill"
          style={
            {
              "--ring-circ": circ,
              "--ring-target": target,
            } as React.CSSProperties
          }
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span
          style={{
            fontSize: 24,
            fontWeight: 700,
            lineHeight: 1,
            color: "var(--fg)",
          }}
        >
          {percentage}
        </span>
      </div>
    </div>
  );
}

// ── CheckRow ──────────────────────────────────────────────────────────────────
function CheckRow({ check }: { check: CheckResult }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderTop: "1px solid var(--line)" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "12px 20px",
          background: "none",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span
          style={{
            flexShrink: 0,
            width: 16,
            height: 16,
            borderRadius: "50%",
            background: check.passed ? "var(--pass)" : "none",
            border: check.passed ? "none" : "1.5px solid var(--fail-dot)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {check.passed && <Checkmark />}
        </span>
        <span
          style={{ flex: 1, fontSize: 14, fontWeight: 500, color: "var(--fg)" }}
        >
          {check.name}
        </span>
        <span
          style={{
            fontSize: 11,
            padding: "2px 9px",
            borderRadius: 999,
            border: "1px solid var(--line)",
            background: "var(--bg)",
            color: "var(--fg-3)",
            flexShrink: 0,
          }}
        >
          {check.score}/{check.maxScore}
        </span>
        <Caret open={open} />
      </button>
      {open && (
        <div
          style={{
            padding: "0 20px 14px 48px",
            fontSize: 13,
            color: "var(--fg-3)",
            lineHeight: 1.55,
          }}
        >
          {check.detail && (
            <p
              style={{
                fontFamily: "'Geist Mono', monospace",
                fontSize: 11,
                color: "var(--fg-4)",
                marginBottom: 6,
              }}
            >
              {check.detail}
            </p>
          )}
          <p>{check.recommendation}</p>
        </div>
      )}
    </div>
  );
}

// ── CategoryCard ──────────────────────────────────────────────────────────────
function CategoryCard({
  category,
  checks,
  score,
  id,
}: {
  category: Category;
  checks: CheckResult[];
  score: { earned: number; max: number; percentage: number };
  id?: string;
}) {
  const cfg = CATEGORY_CFG[category];
  const passed = checks.filter((c) => c.passed).length;
  const [open, setOpen] = useState(false);
  return (
    <div id={id} style={card}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          padding: "20px 20px 16px",
          position: "relative",
          background: "none",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span
          style={{
            position: "absolute",
            left: 0,
            top: 20,
            bottom: 16,
            width: 3,
            background: "var(--accent)",
            borderRadius: 999,
          }}
        />
        <div style={{ paddingLeft: 8 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 4,
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: "var(--fg)" }}>
                {cfg.label}
              </span>
              <span style={{ fontSize: 12, color: "var(--fg-3)" }}>
                · {cfg.title}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.02em", color: "var(--fg)" }}>
                {score.percentage}
                <span style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-4)" }}>
                  /100
                </span>
              </span>
              <Caret open={open} />
            </div>
          </div>
          <p style={{ fontSize: 12, color: "var(--fg-3)", lineHeight: 1.5, maxWidth: 480 }}>
            {cfg.desc}
          </p>
          <p style={{ fontSize: 11, color: "var(--fg-4)", fontWeight: 500, marginTop: 4 }}>
            {passed} of {checks.length} passed
          </p>
        </div>
      </button>
      {open && checks.map((check) => (
        <CheckRow key={check.id} check={check} />
      ))}
    </div>
  );
}

// ── OverviewCard ──────────────────────────────────────────────────────────────
// Desktop: horizontal header — grade + score left, rings right
// Mobile:  stacked card (grade → score → rings)
function OverviewCard({
  result,
  scanKey,
  desktop = false,
}: {
  result: AnalysisResult;
  scanKey: string;
  desktop?: boolean;
}) {
  const score = useTick(result.scores.overall.percentage);
  const [barWidth, setBarWidth] = useState(0);

  useEffect(() => {
    const raf = requestAnimationFrame(() =>
      setBarWidth(result.scores.overall.percentage)
    );
    return () => cancelAnimationFrame(raf);
  }, [result.scores.overall.percentage]);

  if (desktop) {
    return (
      <div id="overview" style={{ ...card, padding: "36px 44px", overflow: "visible" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 36 }}>

          {/* Grade letter */}
          <div style={{
            fontSize: 140,
            fontWeight: 800,
            letterSpacing: "-0.06em",
            lineHeight: 1,
            color: "var(--fg)",
            flexShrink: 0,
          }}>
            {result.grade}
          </div>

          {/* Score + meta */}
          <div style={{ flexShrink: 0 }}>
            <p style={{ fontSize: 13, color: "var(--fg-3)", marginBottom: 4 }}>{result.url}</p>
            <p style={{ fontSize: 14, fontWeight: 600, color: "var(--accent)", marginBottom: 12 }}>
              {GRADE_LABELS[result.grade] ?? "Unknown"}
            </p>
            <div>
              <span style={{ fontSize: 56, fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1, color: "var(--fg)" }}>
                {score}
              </span>
              <span style={{ fontSize: 20, color: "var(--fg-4)", marginLeft: 3 }}>/100</span>
            </div>
            <p style={{ fontSize: 12, color: "var(--fg-3)", marginTop: 4 }}>Overall visibility score</p>
            <div style={{ marginTop: 12, width: 200, height: 5, background: "var(--bg-3)", borderRadius: 3, overflow: "hidden" }}>
              <div
                key={scanKey}
                style={{
                  height: "100%",
                  background: "var(--fg)",
                  borderRadius: 3,
                  width: `${barWidth}%`,
                  transition: "width 1.4s cubic-bezier(0.22,1,0.36,1)",
                }}
              />
            </div>
          </div>

          {/* Vertical divider */}
          <div style={{ width: 1, alignSelf: "stretch", background: "var(--line)", flexShrink: 0, margin: "0 8px" }} />

          {/* Category rings — right side */}
          <div style={{ display: "flex", gap: 48, flex: 1, justifyContent: "center", alignItems: "center" }}>
            {(["seo", "aeo", "geo"] as Category[]).map((cat) => (
              <a
                key={cat}
                href={`#${cat}`}
                style={{ display: "flex", flexDirection: "column", alignItems: "center", textDecoration: "none", gap: 10 }}
              >
                <Ring
                  percentage={result.scores[cat].percentage}
                  ringKey={`${scanKey}-${cat}`}
                  size={110}
                />
                <span style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--fg-3)",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}>
                  {CATEGORY_CFG[cat].label}
                </span>
              </a>
            ))}
          </div>

        </div>
      </div>
    );
  }

  // Mobile: stacked layout
  return (
    <div id="overview" style={{ ...card, padding: "var(--card-pad-lg)", textAlign: "center", overflow: "visible" }}>
      <p style={{ fontSize: 12, fontWeight: 500, color: "var(--fg-3)", marginBottom: 8 }}>{result.url}</p>
      <div style={{ fontSize: "var(--grade-letter)", fontWeight: 800, letterSpacing: "-0.06em", lineHeight: 0.9, color: "var(--fg)" }}>
        {result.grade}
      </div>
      <p style={{ fontSize: 14, fontWeight: 600, color: "var(--accent)", marginTop: 8 }}>
        {GRADE_LABELS[result.grade] ?? "Unknown"}
      </p>
      <div style={{ marginTop: 20 }}>
        <span style={{ fontSize: "var(--grade-score)", fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1, color: "var(--fg)" }}>
          {score}
        </span>
        <span style={{ fontSize: 18, color: "var(--fg-4)" }}>/100</span>
      </div>
      <p style={{ fontSize: 12, color: "var(--fg-3)", marginTop: 4 }}>Overall visibility score</p>
      <div style={{ marginTop: 20, height: 6, background: "var(--bg-3)", borderRadius: 3, overflow: "hidden" }}>
        <div
          key={scanKey}
          style={{
            height: "100%",
            background: "var(--fg)",
            borderRadius: 3,
            width: `${barWidth}%`,
            transition: "width 1.4s cubic-bezier(0.22,1,0.36,1)",
          }}
        />
      </div>
      <div style={{ borderTop: "1px solid var(--line)", margin: "24px -48px 0" }} />
      <div className="ring-grid" style={{ marginTop: 24 }}>
        {(["seo", "aeo", "geo"] as Category[]).map((cat) => (
          <a key={cat} href={`#${cat}`} className="ring-cell">
            <Ring percentage={result.scores[cat].percentage} ringKey={`${scanKey}-${cat}`} size={68} />
            <span style={{ marginTop: 8, fontSize: 12, fontWeight: 600, color: "var(--fg-3)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
              {CATEGORY_CFG[cat].label}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}

// ── TopFixes ──────────────────────────────────────────────────────────────────
function TopFixes({ checks }: { checks: CheckResult[] }) {
  const failed = checks
    .filter((c) => !c.passed)
    .sort((a, b) => b.maxScore - a.maxScore)
    .slice(0, 5);
  if (!failed.length) return null;
  return (
    <div id="fixes" style={card}>
      <div style={{ padding: "20px 20px 14px" }}>
        <p style={{ fontSize: 15, fontWeight: 700, color: "var(--fg)" }}>
          Fix these first
        </p>
        <p style={{ fontSize: 12, color: "var(--fg-3)", marginTop: 2 }}>
          Biggest impact, smallest effort.
        </p>
      </div>
      {failed.map((check, i) => (
        <div
          key={check.id}
          style={{
            borderTop: "1px solid var(--line)",
            padding: "14px 20px",
            display: "flex",
            gap: 12,
            alignItems: "flex-start",
          }}
        >
          <span
            style={{
              flexShrink: 0,
              width: 24,
              height: 24,
              borderRadius: "50%",
              border: "1px solid var(--line)",
              background: "var(--bg)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              fontWeight: 600,
              color: "var(--fg-3)",
            }}
          >
            {i + 1}
          </span>
          <div style={{ flex: 1 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 4,
                flexWrap: "wrap",
              }}
            >
              <span
                style={{ fontSize: 14, fontWeight: 600, color: "var(--fg)" }}
              >
                {check.name}
              </span>
              <span
                style={{
                  fontSize: 11,
                  padding: "1px 6px",
                  borderRadius: 999,
                  border: "1px solid var(--line)",
                  color: "var(--fg-3)",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                {CATEGORY_CFG[check.category].label}
              </span>
            </div>
            <p
              style={{
                fontSize: 13,
                color: "var(--fg-3)",
                lineHeight: 1.55,
              }}
            >
              {check.recommendation}
            </p>
          </div>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "var(--fg-4)",
              flexShrink: 0,
            }}
          >
            +{check.maxScore}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── PageSpeedCard ─────────────────────────────────────────────────────────────
function PageSpeedCard({ data }: { data: PageSpeedData }) {
  if (!data || (data.mobile.score === 0 && data.desktop.score === 0))
    return null;
  return (
    <div id="speed" style={card}>
      <div
        style={{
          padding: "20px 20px 14px",
          borderBottom: "1px solid var(--line)",
        }}
      >
        <p style={{ fontSize: 15, fontWeight: 700, color: "var(--fg)" }}>
          Performance
        </p>
        <p style={{ fontSize: 12, color: "var(--fg-3)", marginTop: 2 }}>
          Google PageSpeed — real-world load metrics.
        </p>
      </div>
      <div className="speed-grid">
        {(["mobile", "desktop"] as const).map((strat, idx) => {
          const s = data[strat];
          const isFast = s.score >= 90;
          return (
            <div
              key={strat}
              className={idx === 0 ? "speed-divider" : undefined}
              style={{ padding: 20 }}
            >
              <p
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--fg-3)",
                  textTransform: "capitalize",
                  marginBottom: 4,
                }}
              >
                {strat}
              </p>
              <p
                style={{
                  fontSize: 28,
                  fontWeight: 800,
                  letterSpacing: "-0.02em",
                  color: "var(--fg)",
                }}
              >
                {s.score}
              </p>
              <div
                style={{
                  height: 4,
                  background: "var(--bg-3)",
                  borderRadius: 2,
                  marginTop: 8,
                  marginBottom: 12,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    borderRadius: 2,
                    background: isFast ? "var(--fg)" : "var(--accent)",
                    width: `${s.score}%`,
                    transition: "width 1s ease",
                  }}
                />
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: 4,
                  textAlign: "center",
                }}
              >
                {[
                  { label: "LCP", value: formatMs(s.lcp) },
                  { label: "FCP", value: formatMs(s.fcp) },
                  { label: "TBT", value: formatMs(s.tbt) },
                ].map((m) => (
                  <div key={m.label}>
                    <p
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: "var(--fg)",
                      }}
                    >
                      {m.value}
                    </p>
                    <p
                      style={{
                        fontSize: 10,
                        fontWeight: 500,
                        letterSpacing: "0.04em",
                        color: "var(--fg-4)",
                        marginTop: 2,
                      }}
                    >
                      {m.label}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── AiFixPrompt ───────────────────────────────────────────────────────────────
function AiFixPrompt({ result }: { result: AnalysisResult }) {
  const [generated, setGenerated] = useState(false);
  const [copied, setCopied] = useState(false);
  const failedCount = result.checks.filter((c) => !c.passed).length;
  if (!failedCount) return null;

  const prompt = buildFixPrompt(result);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const btnBase: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    padding: "8px 14px",
    borderRadius: 8,
    cursor: "pointer",
    flexShrink: 0,
  };

  return (
    <div id="ai" style={card}>
      <div
        style={{
          padding: 20,
          borderBottom: "1px solid var(--line)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div>
          <p style={{ fontSize: 15, fontWeight: 700, color: "var(--fg)" }}>
            AI fix prompt
          </p>
          <p style={{ fontSize: 12, color: "var(--fg-3)", marginTop: 2 }}>
            One paste into Claude or ChatGPT — covers all {failedCount} issues.
          </p>
        </div>
        {!generated ? (
          <button
            onClick={() => setGenerated(true)}
            style={{
              ...btnBase,
              background: "var(--fg)",
              color: "var(--bg)",
              border: "none",
            }}
          >
            Generate
          </button>
        ) : (
          <button
            onClick={handleCopy}
            style={{
              ...btnBase,
              background: "none",
              border: "1px solid var(--line)",
              color: "var(--fg)",
            }}
          >
            {copied ? "✓ Copied" : "Copy"}
          </button>
        )}
      </div>
      {generated && (
        <textarea
          readOnly
          value={prompt}
          style={{
            display: "block",
            width: "100%",
            minHeight: 200,
            fontFamily: "'Geist Mono', monospace",
            fontSize: 12,
            background: "var(--bg)",
            border: "none",
            padding: 14,
            color: "var(--fg-3)",
            resize: "none",
            lineHeight: 1.6,
            outline: "none",
          }}
        />
      )}
    </div>
  );
}

// ── SeoDeepDive ───────────────────────────────────────────────────────────────
function SeoDeepDive({ result }: { result: AnalysisResult }) {
  const [copied, setCopied] = useState(false);

  const seoChecks = result.checks.filter((c) => c.category === "seo");
  const failedSeo = seoChecks
    .filter((c) => !c.passed)
    .sort((a, b) => b.maxScore - a.maxScore);
  const passedSeo = seoChecks.filter((c) => c.passed);
  const prompt = buildSeoFixPrompt(result);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  return (
    <div>
      {/* Header + copy button */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 20,
          marginBottom: 28,
          flexWrap: "wrap",
        }}
      >
        <div>
          <p
            style={{
              fontSize: 11,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "#a3a3a3",
              fontWeight: 600,
              marginBottom: 12,
            }}
          >
            04 — SEO deep dive
          </p>
          <h2
            style={{
              fontFamily: "'Instrument Serif', Georgia, serif",
              fontSize: "clamp(28px, 4vw, 44px)",
              lineHeight: 1.1,
              fontWeight: 400,
              letterSpacing: "-0.02em",
              margin: "0 0 12px",
              color: "#171717",
            }}
          >
            {failedSeo.length > 0
              ? `${failedSeo.length} SEO issue${failedSeo.length !== 1 ? "s" : ""} to fix.`
              : "SEO is clean."}
          </h2>
          {failedSeo.length > 0 && (
            <p style={{ fontSize: 15, color: "#525252", lineHeight: 1.6, maxWidth: 540, margin: 0 }}>
              Copy all errors below and paste into Claude to get exact code fixes for your site.
            </p>
          )}
        </div>
        {failedSeo.length > 0 && (
          <button
            onClick={handleCopy}
            style={{
              flexShrink: 0,
              padding: "12px 22px",
              background: copied ? "#16a34a" : "#171717",
              color: "white",
              border: "none",
              borderRadius: 6,
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "background 0.25s",
              whiteSpace: "nowrap",
              letterSpacing: "-0.01em",
            }}
          >
            {copied ? "✓ Copied!" : "Copy errors for Claude"}
          </button>
        )}
      </div>

      {/* All-clear state */}
      {failedSeo.length === 0 && (
        <div
          style={{
            padding: "32px 28px",
            background: "white",
            border: "1px solid rgba(23,23,23,0.07)",
            borderRadius: 8,
            textAlign: "center",
          }}
        >
          <p style={{ fontSize: 16, fontWeight: 600, color: "#171717", marginBottom: 6 }}>
            All SEO checks passing ✓
          </p>
          <p style={{ fontSize: 14, color: "#727272" }}>
            {passedSeo.length} checks passed — your SEO fundamentals are solid.
          </p>
        </div>
      )}

      {/* Failed checks — expanded */}
      {failedSeo.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
          {failedSeo.map((check) => (
            <div
              key={check.id}
              style={{
                background: "white",
                border: "1px solid rgba(23,23,23,0.07)",
                borderRadius: 8,
                padding: "clamp(16px, 3vw, 24px) clamp(16px, 3vw, 28px)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 16,
                  marginBottom: 10,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: "#E8743A",
                      flexShrink: 0,
                      display: "inline-block",
                    }}
                  />
                  <span style={{ fontSize: 14, fontWeight: 600, color: "#171717" }}>
                    {check.name}
                  </span>
                </div>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#E8743A",
                    flexShrink: 0,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  +{check.maxScore} pts
                </span>
              </div>
              {check.detail && (
                <div
                  style={{
                    fontFamily: "ui-monospace, monospace",
                    fontSize: 11,
                    color: "#a3a3a3",
                    background: "rgba(23,23,23,0.03)",
                    padding: "6px 10px",
                    borderRadius: 4,
                    marginBottom: 10,
                  }}
                >
                  Current: {check.detail}
                </div>
              )}
              <p style={{ fontSize: 13, color: "#525252", lineHeight: 1.6, margin: 0 }}>
                {check.recommendation}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Passing checks — collapsed pill summary */}
      {passedSeo.length > 0 && failedSeo.length > 0 && (
        <div
          style={{
            marginTop: 12,
            padding: "14px 20px",
            background: "rgba(22,163,74,0.05)",
            border: "1px solid rgba(22,163,74,0.12)",
            borderRadius: 8,
            display: "flex",
            gap: 10,
            alignItems: "flex-start",
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#16a34a",
              flexShrink: 0,
              marginTop: 4,
            }}
          />
          <span style={{ fontSize: 13, color: "#525252", lineHeight: 1.55 }}>
            <strong style={{ color: "#171717" }}>{passedSeo.length} passing:</strong>{" "}
            {passedSeo.map((c) => c.name).join(" · ")}
          </span>
        </div>
      )}
    </div>
  );
}

// ── ActionBar ─────────────────────────────────────────────────────────────────
function ActionBar({ onReset }: { onReset: () => void }) {
  const [shared, setShared] = useState(false);

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    setShared(true);
    setTimeout(() => setShared(false), 1500);
  };

  const btn = (primary = false): React.CSSProperties => ({
    fontSize: 13,
    fontWeight: primary ? 600 : 500,
    padding: "8px 14px",
    borderRadius: 8,
    cursor: "pointer",
    background: "none",
    border: "1px solid var(--line)",
    color: primary ? "var(--fg)" : "var(--fg-2)",
  });

  return (
    <div
      style={{
        ...card,
        padding: 16,
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexWrap: "wrap",
        overflow: "visible",
      }}
    >
      <button onClick={onReset} style={btn(true)}>
        ← Scan another
      </button>
      <div style={{ flex: 1 }} />
      <button onClick={handleShare} style={btn()}>
        {shared ? "✓ Link copied" : "Share"}
      </button>
      <button onClick={() => window.print()} style={btn()}>
        Export PDF
      </button>
    </div>
  );
}

// ── TabBar ────────────────────────────────────────────────────────────────────
function TabBar({
  tab,
  onTabChange,
}: {
  tab: "single" | "compare";
  onTabChange: (t: "single" | "compare") => void;
}) {
  return (
    <div
      style={{
        ...card,
        padding: 6,
        display: "flex",
        gap: 4,
        overflow: "visible",
      }}
    >
      {(["single", "compare"] as const).map((t) => (
        <button
          key={t}
          onClick={() => onTabChange(t)}
          style={{
            flex: 1,
            fontSize: 14,
            fontWeight: tab === t ? 600 : 500,
            padding: "8px 12px",
            borderRadius: 8,
            border: "none",
            cursor: "pointer",
            background: "none",
            color: tab === t ? "var(--fg)" : "var(--fg-3)",
            position: "relative",
          }}
        >
          {t === "single" ? "Single scan" : "Compare"}
          {tab === t && (
            <span
              style={{
                position: "absolute",
                bottom: -1,
                left: 12,
                right: 12,
                height: 2,
                background: "var(--fg)",
                borderRadius: 1,
              }}
            />
          )}
        </button>
      ))}
    </div>
  );
}

// ── StickyTOC ─────────────────────────────────────────────────────────────────
function StickyTOC({
  sections,
}: {
  sections: Array<{ id: string; label: string }>;
}) {
  const [active, setActive] = useState(sections[0]?.id ?? "");

  useEffect(() => {
    setActive(sections[0]?.id ?? "");
  }, [sections]);

  useEffect(() => {
    const handler = () => {
      for (const s of [...sections].reverse()) {
        const el = document.getElementById(s.id);
        if (el && el.getBoundingClientRect().top < 120) {
          setActive(s.id);
          return;
        }
      }
      setActive(sections[0]?.id ?? "");
    };
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, [sections]);

  return (
    <div
      style={{
        borderLeft: "1px solid var(--line)",
        paddingLeft: 16,
        paddingTop: 8,
        paddingBottom: 8,
      }}
    >
      <p
        style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.08em",
          color: "var(--fg-4)",
          marginBottom: 8,
          textTransform: "uppercase",
        }}
      >
        Sections
      </p>
      {sections.map((s) => (
        <a
          key={s.id}
          href={`#${s.id}`}
          onClick={() => setActive(s.id)}
          style={{
            display: "flex",
            alignItems: "center",
            padding: "4px 0",
            fontSize: 13,
            fontWeight: active === s.id ? 600 : 500,
            color: active === s.id ? "var(--fg)" : "var(--fg-3)",
            textDecoration: "none",
            position: "relative",
          }}
        >
          {active === s.id && (
            <span
              style={{
                position: "absolute",
                left: -20,
                width: 4,
                height: 4,
                borderRadius: "50%",
                background: "var(--accent)",
              }}
            />
          )}
          {s.label}
        </a>
      ))}
    </div>
  );
}

// ── EmailGate ─────────────────────────────────────────────────────────────────
function EmailGate({
  result,
  onSubmit,
}: {
  result: AnalysisResult;
  onSubmit: (data: LeadData) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [business, setBusiness] = useState("");
  const [challenge, setChallenge] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, boolean>>({});

  const validate = () => {
    const e: Record<string, boolean> = {};
    if (!name.trim()) e.name = true;
    if (!email.trim() || !email.includes("@")) e.email = true;
    if (!business.trim()) e.business = true;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    await onSubmit({ name: name.trim(), email: email.trim(), business: business.trim(), challenge: challenge.trim() || undefined });
  };

  const inputStyle = (hasError: boolean): React.CSSProperties => ({
    width: "100%",
    padding: "10px 12px",
    fontSize: 14,
    border: `1px solid ${hasError ? "var(--accent)" : "var(--line)"}`,
    borderRadius: 10,
    background: "var(--bg)",
    color: "var(--fg)",
    outline: "none",
    boxSizing: "border-box",
  });

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      {/* Blurred grade backdrop */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "var(--bg)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            fontSize: 400,
            fontWeight: 800,
            letterSpacing: "-0.06em",
            lineHeight: 1,
            color: "var(--fg)",
            opacity: 0.04,
            userSelect: "none",
            filter: "blur(6px)",
          }}
        >
          {result.grade}
        </div>
      </div>

      {/* Gate card */}
      <div
        style={{
          ...card,
          position: "relative",
          width: "100%",
          maxWidth: 420,
          padding: 28,
        }}
      >
        {/* Score preview */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              color: "var(--accent)",
              fontWeight: 600,
              padding: "4px 12px",
              border: "1px solid var(--line)",
              borderRadius: 999,
              marginBottom: 12,
            }}
          >
            <span
              className="pulse-dot"
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "var(--accent)",
                display: "inline-block",
              }}
            />
            Scan complete
          </div>
          <h2
            style={{
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: "var(--fg)",
              marginBottom: 6,
            }}
          >
            Your results are ready.
          </h2>
          <p style={{ fontSize: 14, color: "var(--fg-3)", lineHeight: 1.55 }}>
            Enter your info below to unlock your full visibility report for{" "}
            <strong style={{ color: "var(--fg)" }}>
              {new URL(result.url.startsWith("http") ? result.url : `https://${result.url}`).hostname}
            </strong>
            .
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input
            type="text"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={inputStyle(!!errors.name)}
            disabled={submitting}
          />
          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle(!!errors.email)}
            disabled={submitting}
          />
          <input
            type="text"
            placeholder="Business name"
            value={business}
            onChange={(e) => setBusiness(e.target.value)}
            style={inputStyle(!!errors.business)}
            disabled={submitting}
          />
          <input
            type="text"
            placeholder="Biggest challenge getting found online? (optional)"
            value={challenge}
            onChange={(e) => setChallenge(e.target.value)}
            style={inputStyle(false)}
            disabled={submitting}
          />
          <button
            type="submit"
            disabled={submitting}
            style={{
              marginTop: 4,
              padding: "12px 20px",
              fontSize: 14,
              fontWeight: 600,
              background: "var(--fg)",
              color: "var(--bg)",
              border: "none",
              borderRadius: 10,
              cursor: submitting ? "default" : "pointer",
              opacity: submitting ? 0.6 : 1,
              transition: "opacity 0.15s",
            }}
          >
            {submitting ? "Loading…" : "See my results →"}
          </button>
        </form>

        <p
          style={{
            marginTop: 14,
            fontSize: 11,
            color: "var(--fg-4)",
            textAlign: "center",
            lineHeight: 1.5,
          }}
        >
          No spam. No sales pressure. Just your report.
        </p>
      </div>
    </div>
  );
}

// ── CtaBanner ─────────────────────────────────────────────────────────────────
function CtaBanner() {
  return (
    <div
      style={{
        background: "var(--fg)",
        borderRadius: 16,
        padding: "56px 40px",
        textAlign: "center",
      }}
    >
      <p style={{
        fontSize: 32,
        fontWeight: 800,
        letterSpacing: "-0.03em",
        lineHeight: 1.1,
        color: "var(--bg)",
        marginBottom: 14,
      }}>
        Want these fixed for you?
      </p>
      <p style={{
        fontSize: 15,
        color: "rgba(255,255,255,0.55)",
        lineHeight: 1.65,
        maxWidth: 420,
        margin: "0 auto 32px",
      }}>
        Book a free 20-minute call. I&apos;ll walk through exactly what&apos;s holding your site back and give you a clear plan to fix it.
      </p>
      <a
        href="https://calendly.com/ryderschilling/free-20-minute-call"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: "inline-block",
          padding: "14px 32px",
          fontSize: 15,
          fontWeight: 700,
          background: "var(--bg)",
          color: "var(--fg)",
          borderRadius: 10,
          textDecoration: "none",
          whiteSpace: "nowrap",
          letterSpacing: "-0.01em",
        }}
      >
        Book a free call →
      </a>
    </div>
  );
}

const EXAMPLE_URLS = ["aisyndicate.co", "stripe.com", "wikipedia.org"];

// ── Hero ──────────────────────────────────────────────────────────────────────
function Hero({
  onScan,
}: {
  onScan: (url: string, competitorUrl?: string, targetKeyword?: string) => void;
}) {
  const [url, setUrl] = useState("");
  const [compMode, setCompMode] = useState(false);
  const [compUrl, setCompUrl] = useState("");
  const [kwMode, setKwMode] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [recentUrls, setRecentUrls] = useState<string[]>([]);

  useEffect(() => {
    try {
      setRecentUrls(JSON.parse(localStorage.getItem("seo-recent") ?? "[]"));
    } catch {}
  }, []);

  const fire = () => {
    if (!url.trim()) return;
    const kw = keyword.trim() || undefined;
    if (compMode) {
      if (!compUrl.trim()) return;
      onScan(url.trim(), compUrl.trim(), kw);
    } else {
      onScan(url.trim(), undefined, kw);
    }
  };

  const inputStyle: React.CSSProperties = {
    flex: 1,
    border: "none",
    outline: "none",
    background: "none",
    fontSize: 14,
    color: "var(--fg)",
    padding: "0 8px",
    minWidth: 0,
  };

  const pillRow: React.CSSProperties = {
    border: "1px solid var(--line)",
    borderRadius: 14,
    padding: 6,
    display: "flex",
    alignItems: "center",
    gap: 6,
  };

  const scanBtn: React.CSSProperties = {
    fontSize: 14,
    fontWeight: 600,
    padding: "12px 22px",
    borderRadius: 10,
    background: "var(--fg)",
    color: "var(--bg)",
    border: "none",
    cursor: "pointer",
    flexShrink: 0,
    whiteSpace: "nowrap",
  };

  const chipUrls = recentUrls.length > 0 ? recentUrls : EXAMPLE_URLS;
  const chipLabel = recentUrls.length > 0 ? "Recently used" : "Try one of these";

  return (
    <div
      style={{
        ...card,
        padding: "var(--card-pad-lg)",
        textAlign: "center",
        overflow: "visible",
      }}
    >
      {/* Free pill */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            color: "var(--fg-3)",
            padding: "4px 12px",
            border: "1px solid var(--line)",
            borderRadius: 999,
          }}
        >
          <span
            className="pulse-dot"
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "var(--accent)",
              display: "inline-block",
            }}
          />
          Free · No signup
        </span>
      </div>

      {/* H1 */}
      <h1
        style={{
          fontSize: "var(--hero-h1)",
          fontWeight: 700,
          letterSpacing: "-0.03em",
          lineHeight: 1.05,
          color: "var(--fg)",
          marginBottom: 12,
        }}
      >
        Is your site
        <br />
        visible to AI?
      </h1>
      <p
        style={{
          fontSize: 15,
          color: "var(--fg-3)",
          lineHeight: 1.55,
          maxWidth: 380,
          margin: "0 auto 28px",
        }}
      >
        {compMode
          ? "Enter your URL and a competitor's to compare scores side by side."
          : "One scan. SEO, answer engines, and generative AI — graded."}
      </p>

      {/* URL input(s) */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={pillRow}>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !compMode && fire()}
            placeholder="yourwebsite.com"
            style={inputStyle}
          />
          {!compMode && (
            <button onClick={fire} style={scanBtn}>
              Scan →
            </button>
          )}
        </div>

        {compMode && (
          <div style={pillRow}>
            <input
              type="text"
              value={compUrl}
              onChange={(e) => setCompUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && fire()}
              placeholder="competitor.com"
              style={inputStyle}
            />
            <button onClick={fire} style={scanBtn}>
              Compare →
            </button>
          </div>
        )}
      </div>

      {/* Compare toggle */}
      <button
        onClick={() => setCompMode((m) => !m)}
        style={{
          marginTop: 14,
          background: "none",
          border: "none",
          fontSize: 13,
          color: "var(--fg-3)",
          cursor: "pointer",
          padding: 0,
        }}
      >
        {compMode ? "← Single scan" : "Compare with competitor →"}
      </button>

      {/* Keyword toggle */}
      {!compMode && (
        <div style={{ marginTop: 8 }}>
          {!kwMode ? (
            <button
              onClick={() => setKwMode(true)}
              style={{
                background: "none",
                border: "none",
                fontSize: 13,
                color: "var(--fg-4)",
                cursor: "pointer",
                padding: 0,
              }}
            >
              + Add target keyword for ranking check
            </button>
          ) : (
            <div style={{ ...pillRow, marginTop: 4 }}>
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && fire()}
                placeholder="e.g. second home management watersound origins"
                style={{ ...inputStyle, fontSize: 13 }}
              />
              <button
                onClick={() => { setKwMode(false); setKeyword(""); }}
                style={{
                  flexShrink: 0,
                  background: "none",
                  border: "none",
                  fontSize: 18,
                  color: "var(--fg-4)",
                  cursor: "pointer",
                  lineHeight: 1,
                  padding: "0 4px",
                }}
              >
                ×
              </button>
            </div>
          )}
        </div>
      )}

      {/* Example / recently-used chips */}
      <div style={{ borderTop: "1px solid var(--line)", marginTop: 20, paddingTop: 20 }}>
        <p
          style={{
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: "0.06em",
            color: "var(--fg-4)",
            marginBottom: 10,
            textTransform: "uppercase",
          }}
        >
          {chipLabel}
        </p>
        <div style={{ display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
          {chipUrls.map((u) => (
            <button
              key={u}
              onClick={() => {
                const clean = u.replace(/^https?:\/\//, "");
                setUrl(clean);
                onScan(clean);
              }}
              style={{
                fontSize: 12,
                padding: "6px 12px",
                borderRadius: 999,
                border: "1px solid var(--line)",
                background: "var(--bg)",
                color: "var(--fg-3)",
                cursor: "pointer",
              }}
            >
              {safeHostname(u.startsWith("http") ? u : `https://${u}`)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── SerpSection ──────────────────────────────────────────────────────────────
function SerpSection({
  result,
  targetKeyword,
}: {
  result: AnalysisResult;
  targetKeyword?: string;
}) {
  const [serpData, setSerpData] = useState<SerpResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMobile = useIsMobile(640);

  const runCheck = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/serp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: result.url,
          pageTitle: result.pageTitle ?? "",
          pageContext: result.pageContext,
          targetKeyword: targetKeyword || undefined,
        }),
      });
      const data = await res.json() as SerpResult & { error?: string };
      if (data.error) setError(data.error);
      else setSerpData(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [result, targetKeyword]);

  const eyebrow: React.CSSProperties = {
    fontSize: 11,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: "#a3a3a3",
    fontWeight: 600,
    marginBottom: 24,
  };

  const chapterTitle: React.CSSProperties = {
    fontFamily: "'Instrument Serif', Georgia, serif",
    fontSize: "clamp(28px, 4vw, 44px)",
    lineHeight: 1.1,
    fontWeight: 400,
    letterSpacing: "-0.02em",
    margin: "0 0 16px",
    color: "#171717",
  };

  const section: React.CSSProperties = {
    padding: isMobile
      ? "32px 20px"
      : "clamp(40px, 6vw, 80px) clamp(20px, 5vw, 48px)",
    maxWidth: 920,
    margin: "0 auto",
    borderTop: "1px solid rgba(23,23,23,0.06)",
  };

  return (
    <section id="serp" style={section}>
      <div style={eyebrow}>04 — SERP rankings</div>
      <h2 style={chapterTitle}>Where you actually rank.</h2>
      <p style={{ fontSize: 15, color: "#525252", lineHeight: 1.6, maxWidth: 580, marginBottom: 32 }}>
        {targetKeyword
          ? `Checking Google rankings for "${targetKeyword}" and related queries.`
          : "Generates 5 relevant queries based on your site and checks where you appear in Google results."}
      </p>

      {!serpData && !loading && (
        <button
          onClick={runCheck}
          style={{
            padding: "12px 28px",
            background: "#171717",
            color: "white",
            border: "none",
            borderRadius: 6,
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Check rankings →
        </button>
      )}

      {loading && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, color: "#727272", fontSize: 14 }}>
          <div
            style={{
              width: 8, height: 8, borderRadius: "50%", background: "#E8743A",
              animation: "scanPulse 1.4s ease-in-out infinite", flexShrink: 0,
            }}
          />
          Querying Google for 5 keywords… usually 5–10 seconds.
        </div>
      )}

      {error && (
        <div style={{ padding: 16, background: "rgba(232,116,58,0.06)", border: "1px solid rgba(232,116,58,0.2)", borderRadius: 8, fontSize: 13, color: "#E8743A" }}>
          {error}
        </div>
      )}

      {serpData && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {serpData.keywords.map((kw: SerpKeywordResult, ki: number) => {
            const ranked = kw.rank !== null;
            return (
              <div
                key={ki}
                style={{
                  background: "white",
                  border: "1px solid rgba(23,23,23,0.07)",
                  borderRadius: 8,
                  overflow: "hidden",
                }}
              >
                {/* Keyword header */}
                <div style={{
                  padding: isMobile ? "14px 16px" : "16px 24px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  borderBottom: "1px solid rgba(23,23,23,0.05)",
                }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "#171717", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    &ldquo;{kw.query}&rdquo;
                  </span>
                  <span style={{
                    flexShrink: 0,
                    fontSize: 12,
                    fontWeight: 700,
                    padding: "3px 10px",
                    borderRadius: 999,
                    background: ranked ? "rgba(22,163,74,0.08)" : "rgba(23,23,23,0.05)",
                    color: ranked ? "#16a34a" : "#a3a3a3",
                    border: `1px solid ${ranked ? "rgba(22,163,74,0.2)" : "rgba(23,23,23,0.1)"}`,
                  }}>
                    {ranked ? `#${kw.rank}` : "Not ranked"}
                  </span>
                </div>

                {/* Top results */}
                <div>
                  {kw.competitors.slice(0, 5).map((comp, ci) => {
                    const isYou = comp.url === kw.yourUrl;
                    return (
                      <div
                        key={ci}
                        style={{
                          padding: isMobile ? "10px 16px" : "10px 24px",
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 12,
                          borderTop: ci > 0 ? "1px solid rgba(23,23,23,0.04)" : undefined,
                          background: isYou ? "rgba(22,163,74,0.04)" : undefined,
                        }}
                      >
                        <span style={{
                          flexShrink: 0,
                          width: 20,
                          fontSize: 11,
                          fontWeight: 600,
                          color: isYou ? "#16a34a" : "#a3a3a3",
                          textAlign: "right",
                          paddingTop: 1,
                          fontVariantNumeric: "tabular-nums",
                        }}>
                          {comp.position}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                            <span style={{ fontSize: 13, fontWeight: isYou ? 700 : 500, color: isYou ? "#16a34a" : "#171717", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {comp.title || safeHostname(comp.url)}
                            </span>
                            {isYou && (
                              <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", color: "#16a34a", background: "rgba(22,163,74,0.1)", padding: "1px 6px", borderRadius: 3 }}>
                                YOU
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 11, color: "#a3a3a3", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {safeHostname(comp.url)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ── CrawlSection ──────────────────────────────────────────────────────────────
function CrawlSection({ result }: { result: AnalysisResult }) {
  const [crawlData, setCrawlData] = useState<CrawlResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMobile = useIsMobile(640);

  const runCrawl = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/crawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: result.url, maxPages: 8 }),
      });
      const data = await res.json() as CrawlResult & { error?: string };
      if (data.error && !data.pages?.length) setError(data.error);
      else setCrawlData(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [result.url]);

  const eyebrow: React.CSSProperties = {
    fontSize: 11,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: "#a3a3a3",
    fontWeight: 600,
    marginBottom: 24,
  };

  const chapterTitle: React.CSSProperties = {
    fontFamily: "'Instrument Serif', Georgia, serif",
    fontSize: "clamp(28px, 4vw, 44px)",
    lineHeight: 1.1,
    fontWeight: 400,
    letterSpacing: "-0.02em",
    margin: "0 0 16px",
    color: "#171717",
  };

  const section: React.CSSProperties = {
    padding: isMobile
      ? "32px 20px"
      : "clamp(40px, 6vw, 80px) clamp(20px, 5vw, 48px)",
    maxWidth: 920,
    margin: "0 auto",
    borderTop: "1px solid rgba(23,23,23,0.06)",
  };

  const GRADE_COLOR: Record<string, string> = {
    A: "#16a34a", B: "#16a34a", C: "#E8743A", D: "#E8743A", F: "#dc2626",
  };

  function pathOf(url: string, root: string): string {
    try {
      const rootOrigin = new URL(root.startsWith("http") ? root : `https://${root}`).origin;
      const pageOrigin = new URL(url.startsWith("http") ? url : `https://${url}`).origin;
      if (rootOrigin !== pageOrigin) return url;
      const path = new URL(url).pathname;
      return path === "/" ? "/ (homepage)" : path;
    } catch {
      return url;
    }
  }

  return (
    <section id="crawl" style={section}>
      <div style={eyebrow}>05 — Site-wide scan</div>
      <h2 style={chapterTitle}>Every page, graded.</h2>
      <p style={{ fontSize: 15, color: "#525252", lineHeight: 1.6, maxWidth: 580, marginBottom: 32 }}>
        Crawls up to 8 internal pages and runs the full SEO/AEO/GEO check on each one. Finds the weak spots you&apos;d miss scanning just the homepage.
      </p>

      {!crawlData && !loading && (
        <button
          onClick={runCrawl}
          style={{
            padding: "12px 28px",
            background: "#171717",
            color: "white",
            border: "none",
            borderRadius: 6,
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Scan all pages →
        </button>
      )}

      {loading && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, color: "#727272", fontSize: 14 }}>
          <div
            style={{
              width: 8, height: 8, borderRadius: "50%", background: "#E8743A",
              animation: "scanPulse 1.4s ease-in-out infinite", flexShrink: 0,
            }}
          />
          Crawling and analyzing pages… usually 15–30 seconds.
        </div>
      )}

      {error && (
        <div style={{ padding: 16, background: "rgba(232,116,58,0.06)", border: "1px solid rgba(232,116,58,0.2)", borderRadius: 8, fontSize: 13, color: "#E8743A" }}>
          {error}
        </div>
      )}

      {crawlData && (
        <div>
          <div style={{ fontSize: 13, color: "#a3a3a3", marginBottom: 16 }}>
            {crawlData.pages.length} page{crawlData.pages.length !== 1 ? "s" : ""} scanned
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {crawlData.pages
              .slice()
              .sort((a, b) => a.scores.overall.percentage - b.scores.overall.percentage)
              .map((page: CrawlPageResult, i: number) => {
                const pct = page.scores.overall.percentage;
                const needsWork = page.grade === "D" || page.grade === "F";
                return (
                  <div
                    key={i}
                    style={{
                      background: "white",
                      border: `1px solid ${needsWork ? "rgba(232,116,58,0.2)" : "rgba(23,23,23,0.07)"}`,
                      borderRadius: 8,
                      padding: isMobile ? "12px 16px" : "14px 24px",
                      display: "grid",
                      gridTemplateColumns: isMobile ? "32px 1fr auto" : "32px 1fr 200px auto",
                      gap: isMobile ? 12 : 20,
                      alignItems: "center",
                    }}
                  >
                    {/* Grade */}
                    <span style={{
                      fontSize: 18,
                      fontWeight: 800,
                      color: GRADE_COLOR[page.grade] ?? "#a3a3a3",
                      letterSpacing: "-0.02em",
                      fontFamily: "'Instrument Serif', Georgia, serif",
                    }}>
                      {page.grade}
                    </span>

                    {/* URL path */}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: "#171717", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {pathOf(page.url, result.url)}
                      </div>
                      {page.pageTitle && (
                        <div style={{ fontSize: 11, color: "#a3a3a3", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {page.pageTitle}
                        </div>
                      )}
                      {page.error && (
                        <div style={{ fontSize: 11, color: "#E8743A", marginTop: 2 }}>Failed to fetch</div>
                      )}
                    </div>

                    {/* Score bar — hidden on mobile */}
                    {!isMobile && (
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ flex: 1, height: 4, background: "rgba(23,23,23,0.07)", borderRadius: 2 }}>
                          <div style={{
                            height: "100%",
                            width: `${pct}%`,
                            background: needsWork ? "#E8743A" : "#171717",
                            borderRadius: 2,
                          }} />
                        </div>
                        <span style={{ fontSize: 12, color: "#727272", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                          {pct}
                        </span>
                      </div>
                    )}

                    {/* Warning badge */}
                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      {needsWork && (
                        <span style={{
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: "0.06em",
                          padding: "2px 7px",
                          borderRadius: 3,
                          background: "rgba(232,116,58,0.1)",
                          color: "#E8743A",
                        }}>
                          FIX
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </section>
  );
}

// ── LoadingCard ───────────────────────────────────────────────────────────────
function LoadingCard({ url }: { url: string }) {
  const [activeStep, setActiveStep] = useState(-1);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    const t = setTimeout(() => {
      setActiveStep(0);
      let step = 0;
      interval = setInterval(() => {
        step++;
        if (step >= LOADING_STEPS.length) {
          clearInterval(interval);
        } else {
          setActiveStep(step);
        }
      }, 320);
    }, 400);
    return () => {
      clearTimeout(t);
      clearInterval(interval);
    };
  }, []);

  return (
    <div style={{ ...card, padding: 28 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 20,
        }}
      >
        <span
          className="pulse-dot"
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "var(--accent)",
            flexShrink: 0,
            display: "inline-block",
          }}
        />
        <div>
          <p
            style={{ fontSize: 15, fontWeight: 600, color: "var(--fg)" }}
          >
            Scanning {url}
          </p>
          <p style={{ fontSize: 12, color: "var(--fg-3)" }}>
            Usually under 2 seconds
          </p>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          marginBottom: 20,
        }}
      >
        {LOADING_STEPS.map((step, i) => {
          const isDone = i < activeStep;
          const isActive = i === activeStep;
          return (
            <div
              key={step}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                animation:
                  i <= activeStep
                    ? `tickIn 0.35s cubic-bezier(0.22, 1, 0.36, 1) ${i * 50}ms backwards`
                    : "none",
              }}
            >
              <span
                style={{
                  flexShrink: 0,
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  background: isDone ? "var(--fg)" : "none",
                  border: isDone
                    ? "none"
                    : `1.5px solid ${isActive ? "var(--accent)" : "var(--line-2)"}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {isDone && <Checkmark color="var(--bg)" />}
                {isActive && (
                  <span
                    className="pulse-dot"
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: "50%",
                      background: "var(--accent)",
                      display: "inline-block",
                    }}
                  />
                )}
              </span>
              <span
                style={{
                  fontSize: 14,
                  color: isDone
                    ? "var(--fg-3)"
                    : isActive
                    ? "var(--fg)"
                    : "var(--fg-4)",
                }}
              >
                {step}
              </span>
            </div>
          );
        })}
      </div>

      <div
        style={{
          borderTop: "1px solid var(--line)",
          paddingTop: 16,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <div
          className="shimmer"
          style={{ height: 18, width: "60%", borderRadius: 4 }}
        />
        <div
          className="shimmer"
          style={{ height: 14, width: "40%", borderRadius: 4 }}
        />
      </div>
    </div>
  );
}

// ── CompareView ───────────────────────────────────────────────────────────────
function CompareView({
  result,
  onReset,
}: {
  result: CompareResult;
  onReset: () => void;
}) {
  const { primary, competitor } = result;

  const primaryWins = primary.checks.filter((c) => {
    const comp = competitor.checks.find((cc) => cc.id === c.id);
    return c.passed && !comp?.passed;
  }).length;

  const competitorWins = competitor.checks.filter((c) => {
    const prim = primary.checks.find((pc) => pc.id === c.id);
    return c.passed && !prim?.passed;
  }).length;

  const ties = primary.checks.length - primaryWins - competitorWins;

  const gaps = primary.checks
    .filter((c) => {
      const comp = competitor.checks.find((cc) => cc.id === c.id);
      return !c.passed && comp?.passed;
    })
    .sort((a, b) => b.maxScore - a.maxScore);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Head-to-head */}
      <div id="compare-head" style={{ ...card, padding: 24, overflow: "visible" }}>
        <p style={{ fontSize: 12, color: "var(--fg-3)", marginBottom: 16 }}>
          Head to head
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 60px 1fr",
            alignItems: "center",
            gap: 8,
          }}
        >
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                fontSize: 88,
                fontWeight: 800,
                letterSpacing: "-0.04em",
                color: "var(--fg)",
                lineHeight: 1,
              }}
            >
              {primary.grade}
            </div>
            <p
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--fg-3)",
                marginTop: 4,
              }}
            >
              You
            </p>
            <p style={{ fontSize: 11, color: "var(--fg-4)", marginTop: 2 }}>
              {safeHostname(primary.url)}
            </p>
            <p
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: "var(--fg)",
                marginTop: 4,
              }}
            >
              {primary.scores.overall.percentage}/100
            </p>
          </div>
          <div
            style={{
              textAlign: "center",
              fontSize: 13,
              fontWeight: 500,
              color: "var(--fg-4)",
            }}
          >
            vs
          </div>
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                fontSize: 88,
                fontWeight: 800,
                letterSpacing: "-0.04em",
                color: "var(--accent)",
                lineHeight: 1,
              }}
            >
              {competitor.grade}
            </div>
            <p
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--fg-3)",
                marginTop: 4,
              }}
            >
              Them
            </p>
            <p style={{ fontSize: 11, color: "var(--fg-4)", marginTop: 2 }}>
              {safeHostname(competitor.url)}
            </p>
            <p
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: "var(--fg)",
                marginTop: 4,
              }}
            >
              {competitor.scores.overall.percentage}/100
            </p>
          </div>
        </div>

        {/* Sub-score deltas */}
        <div
          style={{
            borderTop: "1px solid var(--line)",
            marginTop: 24,
            paddingTop: 24,
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 8,
          }}
        >
          {(["seo", "aeo", "geo"] as Category[]).map((cat) => {
            const a = primary.scores[cat].percentage;
            const b = competitor.scores[cat].percentage;
            const delta = a - b;
            return (
              <div
                key={cat}
                style={{
                  padding: "12px 8px",
                  background: "var(--bg-3)",
                  borderRadius: 12,
                  textAlign: "center",
                }}
              >
                <p
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: "0.04em",
                    color: "var(--fg-3)",
                    marginBottom: 4,
                  }}
                >
                  {CATEGORY_CFG[cat].label}
                </p>
                <p style={{ fontSize: 14, color: "var(--fg)" }}>
                  {a} vs {b}
                </p>
                <p
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color:
                      delta > 0
                        ? "var(--accent)"
                        : "var(--fg-4)",
                    marginTop: 2,
                  }}
                >
                  {delta > 0 ? `+${delta}` : delta < 0 ? `${delta}` : "Tied"}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Wins / Ties / Losses */}
      <div id="compare-wins" style={card}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            textAlign: "center",
            padding: "24px 0",
          }}
        >
          <div>
            <p
              style={{
                fontSize: 32,
                fontWeight: 800,
                color: "var(--accent)",
              }}
            >
              {primaryWins}
            </p>
            <p
              style={{
                fontSize: 11,
                color: "var(--fg-3)",
                marginTop: 4,
              }}
            >
              You win
            </p>
          </div>
          <div
            style={{
              borderLeft: "1px solid var(--line)",
              borderRight: "1px solid var(--line)",
            }}
          >
            <p
              style={{
                fontSize: 32,
                fontWeight: 800,
                color: "var(--fg-3)",
              }}
            >
              {ties}
            </p>
            <p
              style={{
                fontSize: 11,
                color: "var(--fg-3)",
                marginTop: 4,
              }}
            >
              Tied
            </p>
          </div>
          <div>
            <p
              style={{
                fontSize: 32,
                fontWeight: 800,
                color: "var(--fg)",
              }}
            >
              {competitorWins}
            </p>
            <p
              style={{
                fontSize: 11,
                color: "var(--fg-3)",
                marginTop: 4,
              }}
            >
              They win
            </p>
          </div>
        </div>
      </div>

      {/* Competitive gaps */}
      {gaps.length > 0 && (
        <div id="compare-gaps" style={card}>
          <div
            style={{
              padding: "20px 20px 14px",
              borderBottom: "1px solid var(--line)",
            }}
          >
            <p
              style={{ fontSize: 15, fontWeight: 700, color: "var(--fg)" }}
            >
              Competitive gaps
            </p>
            <p style={{ fontSize: 12, color: "var(--fg-3)", marginTop: 2 }}>
              {gaps.length} check{gaps.length > 1 ? "s" : ""} they pass that
              you don&apos;t.
            </p>
          </div>
          {gaps.map((check, i) => (
            <div
              key={check.id}
              style={{
                borderTop: i > 0 ? "1px solid var(--line)" : "none",
                padding: "14px 20px",
                display: "flex",
                gap: 12,
                alignItems: "flex-start",
              }}
            >
              <span
                style={{
                  flexShrink: 0,
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  background: "var(--accent)",
                  color: "var(--bg)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {i + 1}
              </span>
              <div>
                <p
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: "var(--fg)",
                  }}
                >
                  {check.name}
                </p>
                <p
                  style={{
                    fontSize: 12,
                    color: "var(--fg-3)",
                    marginTop: 2,
                  }}
                >
                  {CATEGORY_CFG[check.category].label} · +{check.maxScore} pts
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      <ActionBar onReset={onReset} />
    </div>
  );
}

// ── LoadingViewL3 ─────────────────────────────────────────────────────────────
// Design 03: Editorial Anticipation — dark, full-screen, two-column.
// Left: big serif headline + animated step ledger + live % counter.
// Right: rotating "while you wait" trivia notes.
function LoadingViewL3({ url }: { url: string }) {
  const { activeIdx, stepProgress, elapsed } = useScanProgress(SCAN_STEPS_TIMED);

  // Asymptotic progress — starts fast, decelerates, approaches 95% but never hits it.
  // Formula: 1 - e^(-t/τ)  where τ = 22 s
  //   5 s → ~20%   10 s → ~36%   20 s → ~59%   30 s → ~74%   45 s → ~87%
  const TAU = 22000;
  const overall = Math.min(0.95, 1 - Math.exp(-elapsed / TAU));

  // Trivia rotates every 7 s, independent of step index (no resets)
  const triviaIdx = Math.floor(elapsed / 7000) % TRIVIA_NOTES.length;
  const isMobile = useIsMobile(768);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#171717",
        color: "#FAFAF7",
        fontFamily: "'Inter', system-ui, sans-serif",
        padding: isMobile
          ? "40px 24px 48px"
          : "clamp(40px, 5vw, 56px) clamp(40px, 6vw, 72px)",
        boxSizing: "border-box",
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
        gap: isMobile ? 48 : "clamp(40px, 6vw, 72px)",
        alignItems: isMobile ? "start" : "stretch",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Ambient gradient — orange warmth in corners */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: [
            "radial-gradient(circle at 18% 28%, rgba(232,116,58,0.10) 0%, transparent 48%)",
            "radial-gradient(circle at 82% 72%, rgba(232,116,58,0.05) 0%, transparent 48%)",
          ].join(", "),
          pointerEvents: "none",
        }}
      />

      {/* ── LEFT: headline + progress ── */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          position: "relative",
          minHeight: isMobile ? "auto" : "calc(100vh - 112px)",
        }}
      >
        {/* Top: scanning indicator + headline */}
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontSize: 11,
              marginBottom: 32,
            }}
          >
            <div
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "#E8743A",
                boxShadow: "0 0 10px rgba(232,116,58,0.6)",
                animation: "scanPulse 1.4s ease-in-out infinite",
                flexShrink: 0,
              }}
            />
            <span
              style={{
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                fontWeight: 600,
                color: "#FAFAF7",
              }}
            >
              Scanning
            </span>
            <span style={{ color: "#525252" }}>·</span>
            <span
              style={{
                fontFamily: "ui-monospace, monospace",
                color: "#727272",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {safeHostname(url)}
            </span>
          </div>

          <h1
            style={{
              fontFamily: "'Instrument Serif', Georgia, serif",
              fontSize: isMobile ? "clamp(52px, 14vw, 72px)" : "clamp(56px, 7vw, 96px)",
              fontWeight: 400,
              letterSpacing: "-0.03em",
              lineHeight: 0.95,
              margin: "0 0 20px",
              color: "#FAFAF7",
            }}
          >
            Reading
            <br />
            your site.
          </h1>

          <p
            style={{
              fontSize: 15,
              color: "#727272",
              lineHeight: 1.55,
              maxWidth: 380,
              margin: 0,
            }}
          >
            Checking 36 signals across SEO, answer engines, and AI citation
            tools. Usually under two seconds.
          </p>
        </div>

        {/* Bottom: percentage + bar + step ledger */}
        <div style={{ marginTop: isMobile ? 48 : 0 }}>
          {/* Big live percentage */}
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 10,
              marginBottom: 14,
            }}
          >
            <span
              style={{
                fontFamily: "'Instrument Serif', Georgia, serif",
                fontSize: isMobile ? "clamp(60px, 16vw, 80px)" : "clamp(60px, 7vw, 88px)",
                lineHeight: 0.9,
                fontWeight: 400,
                letterSpacing: "-0.04em",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {Math.round(overall * 100)}
            </span>
            <span style={{ fontSize: 16, color: "#a3a3a3" }}>%</span>
          </div>

          {/* Progress bar */}
          <div
            style={{
              height: 1,
              background: "rgba(250,250,247,0.08)",
              marginBottom: 20,
              position: "relative",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: -1,
                left: 0,
                height: 3,
                width: `${overall * 100}%`,
                background: "#E8743A",
                boxShadow: "0 0 8px rgba(232,116,58,0.5)",
                transition: "width 0.15s linear",
                borderRadius: 1,
              }}
            />
          </div>

          {/* Step ledger */}
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {SCAN_STEPS_TIMED.map((s, i) => {
              const state =
                i < activeIdx ? "done" : i === activeIdx ? "active" : "pending";
              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    fontSize: 13,
                    color:
                      state === "active"
                        ? "#FAFAF7"
                        : state === "done"
                        ? "#a3a3a3"
                        : "#525252",
                    opacity: state === "pending" ? 0.45 : 1,
                    transition: "all 0.3s",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "ui-monospace, monospace",
                      fontSize: 10,
                      color: state === "active" ? "#E8743A" : "inherit",
                      width: 24,
                      flexShrink: 0,
                    }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span
                    style={{
                      flex: 1,
                      fontWeight: state === "active" ? 600 : 400,
                    }}
                  >
                    {s.label}
                  </span>
                  {state === "done" && (
                    <span style={{ fontSize: 10, color: "#525252" }}>✓</span>
                  )}
                  {state === "active" && (
                    <span
                      style={{
                        fontSize: 10,
                        color: "#E8743A",
                        fontFamily: "ui-monospace, monospace",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {Math.round(stepProgress * 100)}%
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── RIGHT: rotating trivia ── (hidden on mobile) */}
      {!isMobile && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            position: "relative",
          }}
        >
          <div
            style={{
              fontSize: 11,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "#525252",
              fontWeight: 600,
              marginBottom: 28,
            }}
          >
            While you wait —
          </div>

          {/* Trivia cards — absolute-stacked, fade in/out */}
          <div style={{ position: "relative", minHeight: 320 }}>
            {TRIVIA_NOTES.map((t, i) => (
              <div
                key={i}
                style={{
                  position: "absolute",
                  inset: 0,
                  opacity: i === triviaIdx ? 1 : 0,
                  transform:
                    i === triviaIdx ? "translateY(0)" : "translateY(20px)",
                  transition: "opacity 0.6s, transform 0.6s",
                  pointerEvents: i === triviaIdx ? "auto" : "none",
                }}
              >
                <div
                  style={{
                    fontFamily: "'Instrument Serif', Georgia, serif",
                    fontSize: 14,
                    fontStyle: "italic",
                    color: "#E8743A",
                    marginBottom: 20,
                  }}
                >
                  Note №{t.n}
                </div>
                <div
                  style={{
                    fontFamily: "'Instrument Serif', Georgia, serif",
                    fontSize: "clamp(38px, 4.5vw, 56px)",
                    fontWeight: 400,
                    lineHeight: 1.05,
                    letterSpacing: "-0.03em",
                    marginBottom: 24,
                    color: "#FAFAF7",
                  }}
                >
                  {t.title}
                </div>
                <div
                  style={{
                    fontSize: 17,
                    lineHeight: 1.6,
                    color: "#a3a3a3",
                    maxWidth: 400,
                  }}
                >
                  {t.body}
                </div>
              </div>
            ))}
          </div>

          {/* Dot indicators */}
          <div style={{ display: "flex", gap: 6, marginTop: 36 }}>
            {TRIVIA_NOTES.map((_, i) => (
              <div
                key={i}
                style={{
                  width: 24,
                  height: 2,
                  borderRadius: 1,
                  background:
                    i === triviaIdx
                      ? "#E8743A"
                      : "rgba(250,250,247,0.08)",
                  transition: "background 0.3s",
                }}
              />
            ))}
          </div>
        </div>
      )}

      <style>{`
        @keyframes scanPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.4; transform: scale(0.7); }
        }
      `}</style>
    </div>
  );
}

// ── ResultViewD3 ─────────────────────────────────────────────────────────────
// Design 03: Guided Narrative — single column, scroll-driven story.
// Replaces the old desktop/mobile result layout.
function ResultViewD3({
  result,
  isAdmin,
  onReset,
  targetKeyword,
}: {
  result: AnalysisResult;
  isAdmin: boolean;
  onReset: () => void;
  targetKeyword?: string;
}) {
  const [done, setDone] = useState<Set<string>>(new Set());
  const [activeChannel, setActiveChannel] = useState<string | null>(null);
  const [shared, setShared] = useState(false);
  const isMobile = useIsMobile(640);

  const toggleDone = (id: string) => {
    setDone((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Ordered fix list (failed checks, highest impact first)
  const fixes = result.checks
    .filter((c) => !c.passed)
    .sort((a, b) => b.maxScore - a.maxScore);

  const totalMinutes = fixes.reduce(
    (sum, f) => sum + (f.maxScore >= 6 ? 25 : f.maxScore >= 3 ? 15 : 5),
    0
  );

  const recovered = fixes
    .filter((f) => done.has(f.id))
    .reduce((sum, f) => sum + f.maxScore, 0);

  const projectedScore = Math.min(
    100,
    result.scores.overall.percentage + recovered
  );

  const top5Score = Math.min(
    100,
    result.scores.overall.percentage +
      fixes.slice(0, 5).reduce((sum, f) => sum + f.maxScore, 0)
  );

  const fixEverythingScore = Math.min(
    100,
    result.scores.overall.percentage +
      fixes.reduce((sum, f) => sum + f.maxScore, 0)
  );

  const getDiagnosis = (): string => {
    const g = result.grade;
    const aeoScore = result.scores.aeo.percentage;
    const geoScore = result.scores.geo.percentage;
    if (g === "A")
      return "Your site is highly visible across search and AI engines. You're in the top tier of web visibility.";
    if (g === "B")
      return "Your site performs well for traditional search. A few targeted fixes will unlock strong AI engine visibility too.";
    if (g === "C") {
      if (aeoScore < 50 || geoScore < 50)
        return "Your site has solid SEO foundations but is missing key signals that AI tools use to surface and cite content.";
      return "Solid foundations are in place. Addressing the gaps below will meaningfully lift your overall visibility score.";
    }
    if (g === "D")
      return "Your site shows up for traditional Google searches, but AI tools like ChatGPT and Perplexity rarely cite it. A few quick fixes will recover most of the gap.";
    return "Your site is nearly invisible to both search engines and AI tools. The fixes below are high-impact and achievable — start here.";
  };

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    setShared(true);
    setTimeout(() => setShared(false), 1500);
  };

  // Grade color: good grades stay dark, poor grades get the orange accent
  const gradeColor =
    result.grade === "A" || result.grade === "B" ? "#171717" : "#E8743A";

  // ── Style constants ──────────────────────────────────────────────────
  const eyebrow: React.CSSProperties = {
    fontSize: 11,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: "#a3a3a3",
    fontWeight: 600,
    marginBottom: 24,
  };

  const chapterTitle: React.CSSProperties = {
    fontFamily: "'Instrument Serif', Georgia, serif",
    fontSize: "clamp(28px, 4vw, 44px)",
    lineHeight: 1.1,
    fontWeight: 400,
    letterSpacing: "-0.02em",
    margin: "0 0 16px",
    color: "#171717",
  };

  const statLabel: React.CSSProperties = {
    fontSize: 11,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: "#a3a3a3",
    fontWeight: 600,
  };

  const ghostBtn: React.CSSProperties = {
    padding: "5px 10px",
    fontSize: 12,
    fontFamily: "inherit",
    background: "transparent",
    color: "#a3a3a3",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: 4,
    cursor: "pointer",
  };

  const section: React.CSSProperties = {
    padding: isMobile
      ? "32px 20px"
      : "clamp(40px, 6vw, 80px) clamp(20px, 5vw, 48px)",
    maxWidth: 920,
    margin: "0 auto",
    borderTop: "1px solid rgba(23,23,23,0.06)",
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        fontFamily: "'Inter', system-ui, sans-serif",
        background: "rgb(243, 243, 243)",
        color: "rgb(52, 52, 52)",
      }}
    >
      {/* ── Sticky black header ───────────────────────────────────────── */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "rgb(0,0,0)",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          padding: isMobile ? "11px 20px" : "13px clamp(20px, 5vw, 48px)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
        }}
      >
        {/* Left — brand + URL (desktop) or brand only (mobile) */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, minWidth: 0 }}>
          <span style={{ fontWeight: 700, color: "white", letterSpacing: -0.2, flexShrink: 0, fontSize: isMobile ? 12 : 13 }}>
            AI Visibility Scanner
          </span>
          {!isMobile && (
            <>
              <span style={{ color: "#525252" }}>·</span>
              <span style={{ color: "#727272", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {safeHostname(result.url)}
              </span>
              <span style={{ color: "#525252", flexShrink: 0 }}>·</span>
              <span style={{ color: "#525252", fontSize: 12, flexShrink: 0 }}>
                {new Date(result.timestamp).toLocaleDateString()}
              </span>
            </>
          )}
        </div>

        {/* Right — progress + actions (desktop) or just New scan (mobile) */}
        <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 8 : 12, flexShrink: 0 }}>
          {!isMobile && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#727272" }}>
                <div style={{ width: 72, height: 3, background: "rgba(255,255,255,0.1)", borderRadius: 2, position: "relative" }}>
                  <div
                    style={{
                      position: "absolute", inset: 0,
                      width: fixes.length > 0 ? `${(done.size / fixes.length) * 100}%` : "0%",
                      background: "white", borderRadius: 2, transition: "width .3s",
                    }}
                  />
                </div>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>{done.size}/{fixes.length} fixed</span>
              </div>
              <button onClick={handleShare} style={ghostBtn}>{shared ? "✓ Copied" : "Share"}</button>
              <button onClick={() => window.print()} style={ghostBtn}>Export</button>
            </>
          )}
          <button onClick={onReset} style={{ ...ghostBtn, fontSize: isMobile ? 11 : 12 }}>← New scan</button>
        </div>
      </div>

      {/* ── 01 — The score ────────────────────────────────────────────── */}
      <section
        style={{
          padding: isMobile
            ? "36px 20px 40px"
            : "clamp(56px, 8vw, 96px) clamp(20px, 5vw, 48px) clamp(48px, 6vw, 80px)",
          maxWidth: 920,
          margin: "0 auto",
        }}
      >
        <div style={eyebrow}>01 — The score</div>
        <h1
          style={{
            fontFamily: "'Instrument Serif', Georgia, serif",
            fontSize: "clamp(48px, 8vw, 84px)",
            lineHeight: 1.02,
            fontWeight: 400,
            margin: "0 0 6px",
            letterSpacing: "-0.03em",
            color: "#171717",
          }}
        >
          Your site scored a{" "}
          <span style={{ color: gradeColor }}>{result.grade}</span>.
        </h1>
        <div
          style={{
            width: 40,
            height: 2,
            background: "rgba(23,23,23,0.15)",
            marginBottom: 28,
          }}
        />
        <p
          style={{
            fontFamily: "'Instrument Serif', Georgia, serif",
            fontStyle: "italic",
            fontSize: "clamp(16px, 2.5vw, 20px)",
            lineHeight: 1.6,
            color: "#525252",
            margin: "0 0 40px",
            maxWidth: 660,
          }}
        >
          {getDiagnosis()}
        </p>

        {/* Stats strip — locked 3-col grid so it never wraps */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            background: "white",
            border: "1px solid rgba(23,23,23,0.07)",
            borderRadius: 8,
            overflow: "hidden",
          }}
        >
          {[
            {
              label: "Score today",
              value: result.scores.overall.percentage,
              suffix: "/100",
              color: gradeColor,
              extra: null,
            },
            {
              label: isMobile ? "Fix top 5" : "Fix top 5 issues",
              value: top5Score,
              suffix: "/100",
              color: gradeColor,
              extra:
                top5Score > result.scores.overall.percentage
                  ? `+${top5Score - result.scores.overall.percentage}`
                  : null,
            },
            {
              label: "Fix everything",
              value: fixEverythingScore,
              suffix: "/100",
              color: gradeColor,
              extra:
                fixEverythingScore > result.scores.overall.percentage
                  ? `+${fixEverythingScore - result.scores.overall.percentage}`
                  : null,
            },
          ].map((stat, i) => (
            <div
              key={i}
              style={{
                padding: isMobile ? "14px 12px" : "20px 28px",
                borderRight: i < 2 ? "1px solid rgba(23,23,23,0.06)" : "none",
              }}
            >
              <div style={{ ...statLabel, fontSize: isMobile ? 9 : 11 }}>{stat.label}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 3, marginTop: isMobile ? 5 : 8, flexWrap: "wrap" }}>
                <span
                  style={{
                    fontSize: isMobile ? 26 : 40,
                    fontWeight: 700,
                    fontVariantNumeric: "tabular-nums",
                    color: stat.color,
                    lineHeight: 1,
                  }}
                >
                  {stat.value}
                </span>
                <span style={{ color: "#a3a3a3", fontSize: isMobile ? 11 : 15 }}>{stat.suffix}</span>
                {stat.extra && (
                  <span style={{ fontSize: isMobile ? 10 : 13, color: "#E8743A" }}>{stat.extra}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── 02 — Where you stand ──────────────────────────────────────── */}
      <section style={section}>
        <div style={eyebrow}>02 — Where you stand</div>
        <h2 style={chapterTitle}>Three channels, three different stories.</h2>
        <p
          style={{
            fontSize: 15,
            color: "#525252",
            lineHeight: 1.6,
            maxWidth: 580,
            marginBottom: 36,
          }}
        >
          Each channel measures how a different kind of system finds and surfaces
          your site. Click any row to see what it tested.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {(["seo", "aeo", "geo"] as Category[]).map((cat) => {
            const cfg = CATEGORY_CFG[cat];
            const s = result.scores[cat];
            const catChecks = result.checks.filter((c) => c.category === cat);
            const passedCount = catChecks.filter((c) => c.passed).length;
            const isActive = activeChannel === cat;
            const isLow = s.percentage < 70;

            return (
              <div key={cat}>
                <div
                  onClick={() => setActiveChannel(isActive ? null : cat)}
                  style={{
                    padding: isMobile ? "16px 16px" : "clamp(16px, 3vw, 28px) clamp(16px, 3vw, 32px)",
                    background: "white",
                    border: "1px solid rgba(23,23,23,0.07)",
                    borderRadius: isActive ? "8px 8px 0 0" : 8,
                    cursor: "pointer",
                    display: "grid",
                    gridTemplateColumns: isMobile ? "56px 1fr" : "80px 1fr auto",
                    gap: isMobile ? "12px" : "clamp(12px, 3vw, 32px)",
                    alignItems: "center",
                  }}
                >
                  {/* Big score number */}
                  <div
                    style={{
                      fontFamily: "'Instrument Serif', Georgia, serif",
                      fontSize: "clamp(44px, 6vw, 64px)",
                      lineHeight: 1,
                      fontWeight: 400,
                      letterSpacing: "-0.03em",
                      color: isLow ? "#E8743A" : "#171717",
                    }}
                  >
                    {s.percentage}
                  </div>

                  {/* Name + desc + bar */}
                  <div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        marginBottom: 6,
                        flexWrap: "wrap",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 15,
                          fontWeight: 700,
                          letterSpacing: -0.3,
                          color: "#171717",
                        }}
                      >
                        {cfg.title}
                      </span>
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          letterSpacing: "0.06em",
                          padding: "2px 7px",
                          border: "1px solid rgba(23,23,23,0.1)",
                          borderRadius: 3,
                          color: "#727272",
                        }}
                      >
                        {cfg.label}
                      </span>
                      {/* Check count inline on mobile */}
                      {isMobile && (
                        <span style={{ fontSize: 11, color: "#a3a3a3", marginLeft: "auto" }}>
                          {passedCount}/{catChecks.length} passed
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        color: "#727272",
                        lineHeight: 1.5,
                        maxWidth: 440,
                        marginBottom: 12,
                      }}
                    >
                      {cfg.desc}
                    </div>
                    <div
                      style={{
                        height: 4,
                        background: "rgba(23,23,23,0.07)",
                        borderRadius: 2,
                        maxWidth: 440,
                        position: "relative",
                      }}
                    >
                      <div
                        style={{
                          position: "absolute",
                          inset: 0,
                          width: `${s.percentage}%`,
                          background: isLow ? "#E8743A" : "#171717",
                          borderRadius: 2,
                        }}
                      />
                    </div>
                  </div>

                  {/* Check count — hidden on mobile (grid col removed) */}
                  {!isMobile && (
                    <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <div style={{ fontSize: 14, color: "#525252", fontVariantNumeric: "tabular-nums" }}>
                        {passedCount}
                        <span style={{ color: "#a3a3a3" }}>/{catChecks.length}</span>
                      </div>
                      <div style={{ fontSize: 11, color: "#a3a3a3", marginTop: 2 }}>checks passed</div>
                    </div>
                  )}
                </div>

                {/* Expanded checks for this channel */}
                {isActive && (
                  <div
                    style={{
                      background: "white",
                      border: "1px solid rgba(23,23,23,0.07)",
                      borderTop: "none",
                      borderRadius: "0 0 8px 8px",
                      overflow: "hidden",
                    }}
                  >
                    {catChecks.map((check) => (
                      <div
                        key={check.id}
                        style={{
                          padding: "13px clamp(16px, 3vw, 32px)",
                          borderTop: "1px solid rgba(23,23,23,0.04)",
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 12,
                        }}
                      >
                        <span
                          style={{
                            flexShrink: 0,
                            width: 16,
                            height: 16,
                            borderRadius: "50%",
                            background: check.passed ? "#16a34a" : "none",
                            border: check.passed
                              ? "none"
                              : "1.5px solid #d4d4d4",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            marginTop: 2,
                          }}
                        >
                          {check.passed && (
                            <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                              <path
                                d="M1.5 4L3 5.5L6.5 2"
                                stroke="white"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          )}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 13,
                              fontWeight: 500,
                              color: "#171717",
                              marginBottom: check.passed ? 0 : 3,
                            }}
                          >
                            {check.name}
                          </div>
                          {!check.passed && (
                            <div
                              style={{
                                fontSize: 12,
                                color: "#727272",
                                lineHeight: 1.5,
                              }}
                            >
                              {check.recommendation}
                            </div>
                          )}
                          {check.detail && !check.passed && (
                            <div
                              style={{
                                fontSize: 11,
                                color: "#a3a3a3",
                                marginTop: 4,
                                fontFamily: "'Geist Mono', monospace",
                              }}
                            >
                              {check.detail}
                            </div>
                          )}
                        </div>
                        <span
                          style={{
                            fontSize: 11,
                            color: "#a3a3a3",
                            flexShrink: 0,
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {check.score}/{check.maxScore}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── PageSpeed (when available) ────────────────────────────────── */}
      {result.pageSpeed &&
        !(
          result.pageSpeed.mobile.score === 0 &&
          result.pageSpeed.desktop.score === 0
        ) && (
          <section style={section}>
            <div style={eyebrow}>02b — Performance</div>
            <h2 style={chapterTitle}>How fast it loads.</h2>
            <p
              style={{
                fontSize: 15,
                color: "#525252",
                lineHeight: 1.6,
                maxWidth: 580,
                marginBottom: 36,
              }}
            >
              Google PageSpeed — real-world load metrics.
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: 4,
              }}
            >
              {(["mobile", "desktop"] as const).map((strat) => {
                const s = result.pageSpeed![strat];
                const isFast = s.score >= 90;
                return (
                  <div
                    key={strat}
                    style={{
                      padding: "28px 32px",
                      background: "white",
                      border: "1px solid rgba(23,23,23,0.07)",
                      borderRadius: 8,
                    }}
                  >
                    <div style={{ ...statLabel, marginBottom: 12, textTransform: "capitalize" }}>
                      {strat}
                    </div>
                    <div
                      style={{
                        fontSize: 48,
                        fontWeight: 700,
                        color: isFast ? "#171717" : "#E8743A",
                        lineHeight: 1,
                        marginBottom: 12,
                      }}
                    >
                      {s.score}
                    </div>
                    <div
                      style={{
                        height: 4,
                        background: "rgba(23,23,23,0.07)",
                        borderRadius: 2,
                        marginBottom: 20,
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${s.score}%`,
                          background: isFast ? "#171717" : "#E8743A",
                          borderRadius: 2,
                        }}
                      />
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr 1fr",
                        gap: 8,
                        textAlign: "center",
                      }}
                    >
                      {[
                        { label: "LCP", value: formatMs(s.lcp) },
                        { label: "FCP", value: formatMs(s.fcp) },
                        { label: "TBT", value: formatMs(s.tbt) },
                      ].map((m) => (
                        <div key={m.label}>
                          <div
                            style={{
                              fontSize: 14,
                              fontWeight: 600,
                              color: "#171717",
                            }}
                          >
                            {m.value}
                          </div>
                          <div
                            style={{
                              fontSize: 10,
                              color: "#a3a3a3",
                              marginTop: 3,
                              letterSpacing: "0.06em",
                              textTransform: "uppercase",
                            }}
                          >
                            {m.label}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

      {/* ── 03 — What to fix ─────────────────────────────────────────── */}
      <section style={section}>
        <div style={eyebrow}>03 — What to fix</div>
        <h2 style={chapterTitle}>
          {fixes.filter((f) => !done.has(f.id)).length > 0
            ? "Start with these."
            : "All fixed. Nice work."}
        </h2>
        <p
          style={{
            fontSize: 15,
            color: "#525252",
            lineHeight: 1.6,
            maxWidth: 580,
            marginBottom: 36,
          }}
        >
          Ordered by impact. Check the box when you&apos;ve handled one — your
          projected score updates as you go.
        </p>

        {fixes.length === 0 && (
          <div
            style={{
              padding: 40,
              textAlign: "center",
              background: "white",
              borderRadius: 8,
              border: "1px solid rgba(23,23,23,0.07)",
            }}
          >
            <p style={{ fontSize: 18, fontWeight: 600, color: "#171717" }}>
              Perfect score!
            </p>
            <p style={{ fontSize: 14, color: "#727272", marginTop: 8 }}>
              No issues found. Your site is fully optimized.
            </p>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {fixes.map((fix, i) => {
            const isDone = done.has(fix.id);
            const effort =
              fix.maxScore >= 6 ? "~25 min" : fix.maxScore >= 3 ? "~15 min" : "~5 min";
            const catCfg = CATEGORY_CFG[fix.category];
            const catBorderColor =
              fix.category === "aeo"
                ? "rgba(232,116,58,0.3)"
                : "rgba(23,23,23,0.1)";
            const catTextColor =
              fix.category === "aeo" ? "#E8743A" : "#727272";

            return (
              <article
                key={fix.id}
                style={{
                  background: "white",
                  border: `1px solid ${isDone ? "rgba(23,23,23,0.04)" : "rgba(23,23,23,0.07)"}`,
                  borderRadius: 8,
                  padding: "clamp(16px, 3vw, 24px) clamp(16px, 3vw, 28px)",
                  opacity: isDone ? 0.45 : 1,
                  transition: "opacity .25s",
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "28px 1fr auto",
                    gap: "clamp(12px, 2vw, 20px)",
                    alignItems: "flex-start",
                  }}
                >
                  {/* Checkbox */}
                  <button
                    onClick={() => toggleDone(fix.id)}
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: "50%",
                      border: `1.5px solid ${isDone ? "#171717" : "rgba(23,23,23,0.18)"}`,
                      background: isDone ? "#171717" : "transparent",
                      cursor: "pointer",
                      padding: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      marginTop: 2,
                      flexShrink: 0,
                    }}
                  >
                    {isDone && (
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path
                          d="M2 5L4 7L8 3"
                          stroke="white"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </button>

                  {/* Content */}
                  <div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        marginBottom: 8,
                        flexWrap: "wrap",
                      }}
                    >
                      <span
                        style={{
                          fontFamily: "'Instrument Serif', Georgia, serif",
                          fontSize: 12,
                          color: "#a3a3a3",
                          fontStyle: "italic",
                        }}
                      >
                        № {String(i + 1).padStart(2, "0")}
                      </span>
                      <h3
                        style={{
                          margin: 0,
                          fontSize: "clamp(14px, 2vw, 17px)",
                          fontWeight: 600,
                          letterSpacing: -0.2,
                          color: "#171717",
                          textDecoration: isDone ? "line-through" : "none",
                        }}
                      >
                        {fix.name}
                      </h3>
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          letterSpacing: "0.06em",
                          padding: "2px 6px",
                          borderRadius: 3,
                          border: `1px solid ${catBorderColor}`,
                          color: catTextColor,
                          textTransform: "uppercase",
                        }}
                      >
                        {catCfg.label}
                      </span>
                    </div>
                    <p
                      style={{
                        margin: "0 0 10px",
                        fontSize: 14,
                        color: "#525252",
                        lineHeight: 1.55,
                      }}
                    >
                      {fix.recommendation}
                    </p>
                    {fix.detail && (
                      <p
                        style={{
                          margin: 0,
                          fontSize: 12,
                          color: "#a3a3a3",
                          lineHeight: 1.6,
                          paddingLeft: 12,
                          borderLeft: "2px solid rgba(23,23,23,0.08)",
                          fontFamily: "'Geist Mono', monospace",
                        }}
                      >
                        {fix.detail}
                      </p>
                    )}
                  </div>

                  {/* Impact */}
                  <div style={{ textAlign: "right", whiteSpace: "nowrap", flexShrink: 0 }}>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: "#E8743A",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      +{fix.maxScore} pts
                    </div>
                    <div style={{ fontSize: 11, color: "#a3a3a3", marginTop: 2 }}>
                      {effort}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* ── SERP Rankings ───────────────────────────────────────────── */}
      <SerpSection result={result} targetKeyword={targetKeyword} />

      {/* ── Site-Wide Crawl ─────────────────────────────────────────── */}
      <CrawlSection result={result} />

      {/* ── SEO Deep Dive ────────────────────────────────────────────── */}
      <section style={section}>
        <SeoDeepDive result={result} />
      </section>

      {/* ── Admin: AI fix prompt ─────────────────────────────────────── */}
      {isAdmin && (
        <section style={section}>
          <div style={eyebrow}>Admin — AI fix prompt</div>
          <AiFixPrompt result={result} />
        </section>
      )}

      {/* ── 05 — Quiet CTA ───────────────────────────────────────────── */}
      <section style={{ ...section, paddingBottom: "clamp(64px, 8vw, 96px)" }}>
        <div style={eyebrow}>05 — Want it done for you?</div>

        {/* SEO CTA */}
        <div
          style={{
            marginTop: 24,
            padding: "clamp(24px, 4vw, 36px)",
            background: "white",
            border: "1px solid rgba(23,23,23,0.07)",
            borderRadius: 8,
            display: "flex",
            flexWrap: "wrap",
            gap: 28,
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <div style={{ flex: "1 1 280px", minWidth: 0 }}>
            <p
              style={{
                fontSize: 11,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "#a3a3a3",
                fontWeight: 600,
                marginBottom: 8,
              }}
            >
              SEO fixes
            </p>
            <h3
              style={{
                fontFamily: "'Instrument Serif', Georgia, serif",
                fontSize: "clamp(22px, 3vw, 28px)",
                fontWeight: 400,
                margin: "0 0 10px",
                letterSpacing: -0.5,
                color: "#171717",
              }}
            >
              I can fix your SEO.
            </h3>
            <p
              style={{
                margin: 0,
                fontSize: 14,
                color: "#525252",
                lineHeight: 1.65,
                maxWidth: 460,
              }}
            >
              Book a free 20-minute call. We walk through your top fixes together —
              no pitch, no upsell. You leave with a clear plan even if we never
              work together.
            </p>
          </div>
          <a
            href="https://calendly.com/ryderschilling/free-20-minute-call"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: "14px 28px",
              background: "#171717",
              color: "white",
              borderRadius: 6,
              fontSize: 14,
              fontWeight: 600,
              fontFamily: "inherit",
              cursor: "pointer",
              whiteSpace: "nowrap",
              textDecoration: "none",
              display: "inline-block",
              flexShrink: 0,
            }}
          >
            Book a free call →
          </a>
        </div>

        {/* AI Syndicate GEO/AEO upsell */}
        <div
          style={{
            padding: "clamp(20px, 3vw, 28px) clamp(20px, 3vw, 32px)",
            background: "rgba(23,23,23,0.02)",
            border: "1px solid rgba(23,23,23,0.07)",
            borderRadius: 8,
            display: "flex",
            flexWrap: "wrap",
            gap: 20,
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ flex: "1 1 260px", minWidth: 0 }}>
            <p
              style={{
                fontSize: 11,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "#a3a3a3",
                fontWeight: 600,
                marginBottom: 8,
              }}
            >
              AEO + GEO — AI engine visibility
            </p>
            <h3
              style={{
                fontSize: "clamp(16px, 2vw, 20px)",
                fontWeight: 600,
                margin: "0 0 8px",
                letterSpacing: -0.3,
                color: "#171717",
              }}
            >
              Want ChatGPT and Perplexity to cite you?
            </h3>
            <p style={{ margin: 0, fontSize: 13, color: "#727272", lineHeight: 1.6, maxWidth: 440 }}>
              AI Syndicate specializes in getting businesses ranked by AI tools —
              the next frontier beyond Google. If your AEO or GEO score is low,
              this is the team to call.
            </p>
          </div>
          <a
            href="https://aisyndicate.co"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: "12px 22px",
              background: "none",
              color: "#171717",
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              fontFamily: "inherit",
              cursor: "pointer",
              whiteSpace: "nowrap",
              textDecoration: "none",
              display: "inline-block",
              flexShrink: 0,
              border: "1px solid rgba(23,23,23,0.2)",
            }}
          >
            Visit AI Syndicate →
          </a>
        </div>
      </section>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Home() {
  const [phase, setPhase] = useState<Phase>("hero");
  const [scanUrl, setScanUrl] = useState("");
  const [scanKey, setScanKey] = useState("0");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [compareResult, setCompareResult] = useState<CompareResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"single" | "compare">("single");
  const [isAdmin, setIsAdmin] = useState(false);
  const [hasGated, setHasGated] = useState(false);
  const [targetKeyword, setTargetKeyword] = useState<string | undefined>(undefined);
  const isDesktop = !useIsMobile(1024);

  const saveRecentUrl = (url: string) => {
    try {
      const existing: string[] = JSON.parse(localStorage.getItem("seo-recent") ?? "[]");
      const updated = [url, ...existing.filter((u) => u !== url)].slice(0, 5);
      localStorage.setItem("seo-recent", JSON.stringify(updated));
    } catch {}
  };

  const handleScan = async (url: string, competitorUrl?: string, keyword?: string) => {
    setScanUrl(url);
    setTargetKeyword(keyword || undefined);
    setPhase("loading");
    setError(null);
    setResult(null);
    setCompareResult(null);

    try {
      if (competitorUrl) {
        const res = await fetch("/api/compare", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, competitorUrl }),
        });
        const data = await res.json();
        if (data.error) {
          setError(data.error);
          setPhase("hero");
        } else {
          saveRecentUrl(url);
          if (competitorUrl) saveRecentUrl(competitorUrl);
          setCompareResult(data as CompareResult);
          setTab("compare");
          setPhase("compare");
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      } else {
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });
        const data = await res.json();
        if (data.error) {
          setError(data.error);
          setPhase("hero");
        } else {
          saveRecentUrl(url);
          setResult(data as AnalysisResult);
          setScanKey((k) => String(Number(k) + 1));
          setTab("single");
          // Route to gate for first-time non-admin users
          const alreadyGated = document.cookie.includes("oracle_gated=1");
          const adminMode = document.cookie.includes("oracle_admin=1");
          setPhase(adminMode || alreadyGated ? "result" : "gate");
        }
      }
    } catch {
      setError("Failed to connect. Make sure the URL is publicly accessible.");
      setPhase("hero");
    }
  };

  const handleGateSubmit = async (data: LeadData) => {
    try {
      await fetch("/api/capture-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          url: scanUrl,
          grade: result?.grade,
          score: result?.scores.overall.percentage,
          timestamp: new Date().toISOString(),
        }),
      });
    } catch {
      // Never block the user if lead capture fails
    }
    document.cookie = "oracle_gated=1; max-age=2592000; path=/";
    setHasGated(true);
    setPhase("result");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleReset = () => {
    setPhase("hero");
    setResult(null);
    setCompareResult(null);
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleTabChange = (t: "single" | "compare") => {
    setTab(t);
    if (phase === "result" && t === "compare") {
      if (compareResult) setPhase("compare");
      else handleReset();
    } else if (phase === "compare" && t === "single") {
      if (result) setPhase("result");
      else handleReset();
    }
    // In hero/loading phase: just switch the input mode, no reset
  };

  // Admin bypass + gate status + auto-fire scan from landing page
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);

    // Admin bypass: visit /scan?admin=r9d3rAdm1n to set a 30-day cookie
    if (params.get("admin") === "r9d3rAdm1n") {
      document.cookie = "oracle_admin=1; max-age=2592000; path=/";
      window.history.replaceState({}, "", "/scan");
    }

    const cookies = document.cookie;
    const adminMode = cookies.includes("oracle_admin=1");
    const gated = cookies.includes("oracle_gated=1");
    setIsAdmin(adminMode);
    setHasGated(gated);

    // Auto-fire scan from landing page /scan?url=...
    const u = params.get("url");
    if (u) {
      window.history.replaceState({}, "", "/scan");
      setTimeout(() => handleScan(u), 50);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // TOC only shown for the compare view; result uses the new D3 sticky header
  const showCompareTOC = phase === "compare";

  const contentStyle: React.CSSProperties = {
    maxWidth: phase === "result" && isDesktop ? 960 : 680,
    width: "100%",
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: 16,
  };

  return (
    <>
      {/* ── Result phase: full-width Guided Narrative (D3) design ── */}
      {phase === "result" && result && (
        <ResultViewD3
          result={result}
          isAdmin={isAdmin}
          onReset={handleReset}
          targetKeyword={targetKeyword}
        />
      )}

      {/* ── Loading phase: full-width L3 Editorial Anticipation ── */}
      {phase === "loading" && <LoadingViewL3 url={scanUrl} />}

      {/* ── All other phases: centered single-column layout ── */}
      {phase !== "result" && phase !== "loading" && (
        <div
          style={{
            background: "var(--bg)",
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            justifyContent: phase === "hero" ? "center" : "flex-start",
          }}
        >
          <div style={{ padding: "var(--outer-padding)", width: "100%" }}>
            <div style={contentStyle}>
              {phase === "hero" && (
                <>
                  {error && (
                    <div style={{ ...card, padding: 16, fontSize: 13, color: "var(--fg-3)" }}>
                      {error}
                    </div>
                  )}
                  <Hero onScan={handleScan} />
                </>
              )}

              {phase === "gate" && result && (
                <EmailGate result={result} onSubmit={handleGateSubmit} />
              )}

              {phase === "compare" && compareResult && (
                <CompareView result={compareResult} onReset={handleReset} />
              )}
            </div>
          </div>

          {/* TOC for compare view only */}
          {showCompareTOC && (
            <div className="hidden toc:block" style={{ position: "fixed", right: 32, top: 32 }}>
              <StickyTOC sections={COMPARE_TOC_SECTIONS} />
            </div>
          )}
        </div>
      )}
    </>
  );
}
