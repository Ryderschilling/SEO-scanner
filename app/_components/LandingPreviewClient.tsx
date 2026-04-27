"use client";

// app/landing-preview/_components/LandingPreviewClient.tsx
// Wires up scroll-to-scan and the URL submit handler in preview mode.
// In preview mode, submitting the URL just alerts where it WOULD go (`/?url=...`)
// so we don't accidentally navigate away from the preview.

import React, { cloneElement, isValidElement } from "react";

type Props = {
  nav: React.ReactNode;
  oracle: React.ReactElement;
  feature: React.ReactNode;
  dissection: React.ReactNode;
  cta: React.ReactElement;
  footer: React.ReactNode;
};

export default function LandingPreviewClient({
  nav, oracle, feature, dissection, cta, footer,
}: Props) {
  const handleScan = (url: string) => {
    // Navigate to the scanner with the URL as a query param.
    // The scanner page reads ?url=... in a useEffect and auto-fires the scan.
    window.location.href = `/scan?url=${encodeURIComponent(url)}`;
  };

  const handleScrollToScan = () => {
    const el = document.getElementById("scan");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Inject the handlers into the oracle and CTA without prop-drilling through the page file.
  const oracleWithHandler = isValidElement(oracle)
    ? cloneElement(oracle as React.ReactElement<{ onScan?: (u: string) => void }>, { onScan: handleScan })
    : oracle;

  const ctaWithHandler = isValidElement(cta)
    ? cloneElement(cta as React.ReactElement<{ onScanClick?: () => void }>, { onScanClick: handleScrollToScan })
    : cta;

  return (
    <>
      {nav}
      <div id="scan">{oracleWithHandler}</div>
      {feature}
      <div id="how">{dissection}</div>
      {ctaWithHandler}
      {footer}
    </>
  );
}
