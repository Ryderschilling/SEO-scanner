# CLAUDE.md — AI Syndicate SEO Scanner

This file gives Claude full context on this project. Read it every session before touching code.

---

## What This Project Is

A web-based SEO/AEO/GEO visibility scanner built in Next.js. The user (Ryder) built this as a side project, used it on his own business (took it from zero views / F score to ranking on Google and AI engines), and is now being brought in by **Andrew Soncini** and **CJ Britton** (founders of **AI Syndicate**) to build it into a commercial product.

This codebase is the **foundation** of AI Syndicate's lower-ticket product (~$500/sale). Their higher-ticket product is a $20k consulting engagement — they already have a client on a 3-month deadline with no product built. Ryder is being asked to build the product they need to deliver.

---

## The Business Context

### The Company: AI Syndicate
- **CJ Britton** — marketing and sales; has the clients and the brand
- **Andrew Soncini** — AI consultant; the technical vision person; NOT available to build
- **Neither can build this product.** They are sales-first, already have paying clients, and are on a hard 3-month delivery clock
- Currently have 1 active client, actively selling to more
- Two product tiers:
  - **$20k tier** — consulting/done-for-you AI engine optimization
  - **$500 tier** — this SEO scanner tool (self-serve or report delivery)

### Ryder's Role
Ryder built the scanner independently. He is being recruited to build it into a full product for AI Syndicate. He has significant leverage:
1. Andrew cannot build it — too busy, wrong timeline
2. CJ cannot build it — marketer, not an engineer
3. Hard 3-month deadline on a $20k paying client — time pressure is extreme
4. Ryder already built a working v1 that proves the product works
5. Ryder can walk and start a competing product himself

### The Current Offer on the Table (from Andrew)
- $4k lump sum on completion
- More if more clients come in
- No equity, no royalty mentioned

### Ryder's Target Deal
- Keep $4k as upfront (not a dealbreaker)
- **Company equity** in AI Syndicate
- **Royalty on every $500 product sale** in perpetuity
- Creative deal structure that rewards ongoing contribution, not just build labor

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| HTML Parsing | Cheerio |
| Runtime | Node.js (Vercel Edge-compatible) |
| Deploy target | Vercel (not yet deployed) |

---

## Project Structure

```
seo-scanner/
├── app/
│   ├── page.tsx          # Full frontend UI — scanner form + results display
│   ├── layout.tsx        # Root layout
│   ├── globals.css       # Global styles
│   └── api/
│       └── analyze/
│           └── route.ts  # POST /api/analyze — calls analyzeUrl()
├── lib/
│   ├── analyzer.ts       # Core scan engine — all 24 check functions
│   └── types.ts          # TypeScript types: CheckResult, AnalysisResult, etc.
├── next.config.mjs
└── package.json
```

---

## What's Built (v1 — Working)

### Scan Engine (`lib/analyzer.ts`)
Fetches a URL's HTML with Cheerio and runs 24 checks across 3 categories:

**SEO (13 checks, 46 pts max)**
- Title tag (length 30–60 chars)
- Meta description (120–160 chars)
- H1 tag (exactly 1)
- Heading structure (2+ H2s)
- Image alt tags (all images)
- Canonical tag
- Mobile viewport
- HTTPS
- Structured data / Schema.org JSON-LD
- Open Graph tags (title, desc, image)
- Internal links (3+)
- robots.txt
- sitemap.xml

**AEO — Answer Engine Optimization (6 checks, 30 pts max)**
- FAQ / Q&A schema (FAQPage, QAPage)
- Question-format headings (What/How/Why H2s)
- Concise paragraphs (avg < 60 words)
- Lists / bullet points (2+)
- HTML tables
- HowTo / Article schema

**GEO — Generative Engine Optimization (5 checks, 20 pts max)**
- Author / byline signals + author schema
- Organization / Brand schema
- External authority links
- About page signals
- E-E-A-T signals (certifications, credentials, trust language)

### Scoring
- Each category scored 0–100% independently
- Overall score = combined weighted %
- Letter grade: A (90+), B (80+), C (70+), D (60+), F (<60)

### Frontend (`app/page.tsx`)
- URL input + scan button
- Loading spinner with status
- Results: grade badge, 3 score rings (SVG animated), overall progress bar
- Top 5 Priority Fixes (ranked by impact)
- Expandable check items per category with recommendations
- Clean, minimal design — black/white/gray, no color overload

---

## What Is NOT Built Yet (Roadmap)

These are the gaps between "working demo" and "sellable product":

| Feature | Priority | Notes |
|---|---|---|
| Auth / gated access | High | Need login or access code before scanning |
| Stripe payment wall | High | $500/scan or subscription model |
| PDF export of results | High | Critical for done-for-you delivery model |
| Deployment to Vercel | High | Not live yet |
| White-label / branding | Medium | AI Syndicate branding + customer-facing |
| Scan history / dashboard | Medium | Save past scans per user |
| More scan checks | Medium | JS-rendered sites, Core Web Vitals, PageSpeed |
| Email delivery of reports | Low | Send PDF report to customer |
| API for resellers | Low | Programmatic access for agencies |

---

## Known Technical Limitations

- **Static HTML only** — Cheerio can't execute JavaScript. Sites built in React, Vue, or Angular SPAs may return empty or partial HTML. Works best on WordPress, Webflow, Squarespace, traditional CMS.
- **15s timeout** on URL fetch — some slow servers will fail
- **No JS rendering** — no Puppeteer/Playwright integration yet
- **robots.txt / sitemap** fetched separately with 5s timeout each

---

## Architecture Decisions to Preserve

- Keep the scan engine fully server-side (`/api/analyze`) — never expose fetched HTML or analysis logic to the client
- Keep check functions modular — each check is its own function, easy to add/remove/adjust scoring
- Score weighting is intentional: SEO > AEO > GEO in current point distribution — do not change without considering the product story
- The `CheckResult` type is the core data contract — don't break it without updating both the analyzer and frontend

---

## Deal / Business Notes (for Claude context)

When helping Ryder think through business decisions, equity deals, pricing, or contracts for this project, always keep in mind:
- Ryder has **strong leverage** — he is the only person who can build this on their timeline
- The $4k offer is low for the value created (a $20k client depends on this product existing)
- The goal is **equity + royalty + upfront**, not pure labor compensation
- Ryder could start a competing product independently — this is a real alternative, not a bluff
- Any deal should protect Ryder's contribution if AI Syndicate is sold or pivots

---

## Commands

```bash
# Install
npm install

# Dev server
npm run dev
# → http://localhost:3000

# Build
npm run build

# Start production
npm start
```

---

## Session Startup Checklist

Before starting any work on this project:
1. Re-read this file
2. Check what's in `lib/analyzer.ts` — the check count and scoring may have changed
3. Check `app/page.tsx` for any UI state that affects new features
4. If adding new checks: add to `lib/types.ts` if needed, add function to `lib/analyzer.ts`, register in the `checks[]` array, update max score totals in the error fallback block
