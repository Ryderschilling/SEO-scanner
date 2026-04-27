"use client";

// app/page.tsx
// Marketing landing page — lives at "/".
// Scanner is at "/scan". Submitting a URL in the hero/CTA navigates to
// /scan?url=<encoded> and the scanner auto-fires the scan from the param.

import "./marketing.css";
import LandingOracle from "./_components/LandingOracle";
import LandingDissection from "./_components/LandingDissection";
import {
  MarketingNav,
  FeatureStrip,
  CtaBlock,
  MarketingFooter,
} from "./_components/MarketingChrome";
import LandingPreviewClient from "./_components/LandingPreviewClient";

export default function LandingPage() {
  return (
    <main className="marketing-root">
      <LandingPreviewClient
        nav={<MarketingNav scanHref="/scan" />}
        oracle={<LandingOracle />}
        feature={<FeatureStrip />}
        dissection={<LandingDissection />}
        cta={<CtaBlock />}
        footer={<MarketingFooter scanHref="/scan" />}
      />
    </main>
  );
}
