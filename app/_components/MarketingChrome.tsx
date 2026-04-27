"use client";

// app/landing-preview/_components/MarketingChrome.tsx — Nav, FeatureStrip, CtaBlock, Footer.
// PREVIEW MODE: links to /scan use the SCAN_HREF prop so we never collide with the existing scanner.

import { useEffect, useState } from "react";

export function MarketingNav({ scanHref = "#" }: { scanHref?: string }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <nav className={"nav " + (scrolled ? "scrolled" : "")}>
      <div className="nav-logo">
        <span className="nav-logo-mark" />
        <span>oracle.scan</span>
      </div>
      <div className="nav-links">
        <a href="#how">How it works</a>
        <a href={scanHref}>Scanner</a>
        <a href="#scan" className="cta-secondary" style={{ padding: "8px 14px" }}>Scan now</a>
      </div>
    </nav>
  );
}

export function FeatureStrip() {
  const cells = [
    { num: "24", label: "CHECKS", desc: "Run on every URL" },
    { num: "08", label: "ENGINES", desc: "GPT, Claude, Gemini, Perplexity & more" },
    { num: "03", label: "CATEGORIES", desc: "SEO · AEO · GEO scored separately" },
    { num: "~30s", label: "PER SCAN", desc: "Free. No signup required." },
  ];
  return (
    <section className="feature-strip">
      <div className="feature-strip-inner">
        {cells.map((c, i) => (
          <div key={i} className="feature-cell">
            <div className="feature-num serif">{c.num}</div>
            <div className="feature-label">{c.label}</div>
            <div className="feature-desc">{c.desc}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function CtaBlock({ onScanClick }: { onScanClick?: () => void }) {
  return (
    <section className="cta-block">
      <div className="gridlines" />
      <div className="eyebrow">FINIS · BEGIN THE SCAN</div>
      <h2 className="cta-h">
        See what the<br />
        machines <em>see.</em>
      </h2>
      <p className="cta-sub">
        Eight AI engines, twenty-four checks, one verdict. Free, no signup, results in thirty seconds.
      </p>
      <button onClick={onScanClick} className="cta-primary" style={{ fontSize: 16, padding: "16px 28px" }}>
        Scan your site
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M3 7h8m0 0L7 3m4 4l-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </section>
  );
}

export function MarketingFooter({ scanHref = "#" }: { scanHref?: string }) {
  return (
    <footer className="foot">
      <div>© 2026 ORACLE.SCAN — AI VISIBILITY · SEO · AEO · GEO</div>
      <div className="foot-links">
        <a href="#how">HOW IT WORKS</a>
        <a href={scanHref}>SCANNER</a>
        <a href="mailto:hello@example.com">CONTACT</a>
      </div>
    </footer>
  );
}
