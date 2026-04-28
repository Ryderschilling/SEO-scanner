"use client";

import { useState, useEffect } from "react";
import type {
  AnalysisResult,
  CheckResult,
  Category,
  CompareResult,
  PageSpeedData,
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

const TOC_SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "fixes",    label: "Top fixes" },
  { id: "speed",    label: "Performance" },
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
  return (
    <div id={id} style={card}>
      <div style={{ padding: "20px 20px 16px", position: "relative" }}>
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
              alignItems: "baseline",
              marginBottom: 4,
            }}
          >
            <div
              style={{ display: "flex", alignItems: "baseline", gap: 6 }}
            >
              <span
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: "var(--fg)",
                }}
              >
                {cfg.label}
              </span>
              <span style={{ fontSize: 12, color: "var(--fg-3)" }}>
                · {cfg.title}
              </span>
            </div>
            <span
              style={{
                fontSize: 28,
                fontWeight: 800,
                letterSpacing: "-0.02em",
                color: "var(--fg)",
              }}
            >
              {score.percentage}
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 400,
                  color: "var(--fg-4)",
                }}
              >
                /100
              </span>
            </span>
          </div>
          <p
            style={{
              fontSize: 12,
              color: "var(--fg-3)",
              lineHeight: 1.5,
              maxWidth: 480,
            }}
          >
            {cfg.desc}
          </p>
          <p
            style={{
              fontSize: 11,
              color: "var(--fg-4)",
              fontWeight: 500,
              marginTop: 4,
            }}
          >
            {passed} of {checks.length} passed
          </p>
        </div>
      </div>
      {checks.map((check) => (
        <CheckRow key={check.id} check={check} />
      ))}
    </div>
  );
}

// ── GradeCard ─────────────────────────────────────────────────────────────────
function GradeCard({
  result,
  scanKey,
}: {
  result: AnalysisResult;
  scanKey: string;
}) {
  const score = useTick(result.scores.overall.percentage);
  const [barWidth, setBarWidth] = useState(0);
  useEffect(() => {
    const raf = requestAnimationFrame(() =>
      setBarWidth(result.scores.overall.percentage)
    );
    return () => cancelAnimationFrame(raf);
  }, [result.scores.overall.percentage]);

  return (
    <div
      id="overview"
      style={{ ...card, padding: "var(--card-pad-lg)", textAlign: "center", overflow: "visible" }}
    >
      <p
        style={{
          fontSize: 12,
          fontWeight: 500,
          color: "var(--fg-3)",
          marginBottom: 8,
        }}
      >
        {result.url}
      </p>
      <div
        style={{
          fontSize: "var(--grade-letter)",
          fontWeight: 800,
          letterSpacing: "-0.06em",
          lineHeight: 0.9,
          color: "var(--fg)",
        }}
      >
        {result.grade}
      </div>
      <p
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: "var(--accent)",
          marginTop: 8,
        }}
      >
        {GRADE_LABELS[result.grade] ?? "Unknown"}
      </p>
      <div style={{ marginTop: 28 }}>
        <span
          style={{
            fontSize: "var(--grade-score)",
            fontWeight: 800,
            letterSpacing: "-0.04em",
            lineHeight: 1,
            color: "var(--fg)",
          }}
        >
          {score}
        </span>
        <span style={{ fontSize: 18, color: "var(--fg-4)" }}>/100</span>
      </div>
      <p style={{ fontSize: 12, color: "var(--fg-3)", marginTop: 4 }}>
        Overall visibility score
      </p>
      <div
        style={{
          marginTop: 24,
          height: 6,
          background: "var(--bg-3)",
          borderRadius: 3,
          overflow: "hidden",
        }}
      >
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
  );
}

// ── SubScores ─────────────────────────────────────────────────────────────────
function SubScores({
  result,
  scanKey,
}: {
  result: AnalysisResult;
  scanKey: string;
}) {
  const isMobile = useIsMobile();
  const ringSize = isMobile ? 68 : 88;
  return (
    <div style={{ ...card, padding: 24 }}>
      <div className="ring-grid">
        {(["seo", "aeo", "geo"] as Category[]).map((cat) => (
          <a
            key={cat}
            href={`#${cat}`}
            className="ring-cell"
          >
            <Ring
              percentage={result.scores[cat].percentage}
              ringKey={`${scanKey}-${cat}`}
              size={ringSize}
            />
            <span
              style={{
                marginTop: 8,
                fontSize: 12,
                fontWeight: 600,
                color: "var(--fg-3)",
                letterSpacing: "0.04em",
                textTransform: "uppercase",
              }}
            >
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
        ...card,
        padding: "20px 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        flexWrap: "wrap",
        borderLeft: "3px solid var(--accent)",
      }}
    >
      <div>
        <p style={{ fontSize: 15, fontWeight: 700, color: "var(--fg)", marginBottom: 4 }}>
          Want these fixed for you?
        </p>
        <p style={{ fontSize: 13, color: "var(--fg-3)", lineHeight: 1.5, maxWidth: 400 }}>
          Book a free 20-minute call. I&apos;ll walk through exactly what&apos;s holding your site back and show you how to fix it.
        </p>
      </div>
      <a
        href="https://calendly.com/ryderscott33"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          flexShrink: 0,
          padding: "10px 18px",
          fontSize: 13,
          fontWeight: 600,
          background: "var(--fg)",
          color: "var(--bg)",
          borderRadius: 10,
          textDecoration: "none",
          whiteSpace: "nowrap",
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
  onScan: (url: string, competitorUrl?: string) => void;
}) {
  const [url, setUrl] = useState("");
  const [compMode, setCompMode] = useState(false);
  const [compUrl, setCompUrl] = useState("");
  const [recentUrls, setRecentUrls] = useState<string[]>([]);

  useEffect(() => {
    try {
      setRecentUrls(JSON.parse(localStorage.getItem("seo-recent") ?? "[]"));
    } catch {}
  }, []);

  const fire = () => {
    if (!url.trim()) return;
    if (compMode) {
      if (!compUrl.trim()) return;
      onScan(url.trim(), compUrl.trim());
    } else {
      onScan(url.trim());
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

  const saveRecentUrl = (url: string) => {
    try {
      const existing: string[] = JSON.parse(localStorage.getItem("seo-recent") ?? "[]");
      const updated = [url, ...existing.filter((u) => u !== url)].slice(0, 5);
      localStorage.setItem("seo-recent", JSON.stringify(updated));
    } catch {}
  };

  const handleScan = async (url: string, competitorUrl?: string) => {
    setScanUrl(url);
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

  const showTOC = phase === "result" || phase === "compare";
  const resultTocSections = [
    { id: "overview", label: "Overview" },
    { id: "fixes",    label: "Top fixes" },
    ...(result?.pageSpeed ? [{ id: "speed", label: "Performance" }] : []),
    { id: "ai",       label: "AI prompt" },
    { id: "seo",      label: "SEO" },
    { id: "aeo",      label: "AEO" },
    { id: "geo",      label: "GEO" },
  ];
  const tocSections = tab === "compare" ? COMPARE_TOC_SECTIONS : resultTocSections;

  const contentStyle: React.CSSProperties = {
    maxWidth: 680,
    width: "100%",
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: 16,
  };

  return (
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
        {/* Main content — always centered */}
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

          {phase === "loading" && <LoadingCard url={scanUrl} />}

          {phase === "gate" && result && (
            <EmailGate result={result} onSubmit={handleGateSubmit} />
          )}

          {phase === "result" && result && (
            <>
              <GradeCard result={result} scanKey={scanKey} />
              <SubScores result={result} scanKey={scanKey} />
              <TopFixes checks={result.checks} />
              {!isAdmin && <CtaBanner />}
              {result.pageSpeed && (
                <PageSpeedCard data={result.pageSpeed} />
              )}
              <AiFixPrompt result={result} />
              {(["seo", "aeo", "geo"] as Category[]).map((cat) => (
                <CategoryCard
                  key={cat}
                  category={cat}
                  checks={result.checks.filter((c) => c.category === cat)}
                  score={result.scores[cat]}
                  id={cat}
                />
              ))}
              <ActionBar onReset={handleReset} />
            </>
          )}

          {phase === "compare" && compareResult && (
            <CompareView result={compareResult} onReset={handleReset} />
          )}
        </div>
      </div>

      {/* Fixed TOC — desktop only, floats right of viewport, does not affect content centering */}
      {showTOC && (
        <div className="hidden toc:block" style={{ position: "fixed", right: 32, top: 32 }}>
          <StickyTOC sections={tocSections} />
        </div>
      )}
    </div>
  );
}
