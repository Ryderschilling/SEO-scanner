export type Category = "seo" | "aeo" | "geo";

export interface CheckResult {
  id: string;
  category: Category;
  name: string;
  passed: boolean;
  score: number;
  maxScore: number;
  description: string;
  recommendation: string;
  detail?: string;
}

export interface CategoryScore {
  earned: number;
  max: number;
  percentage: number;
}

export interface SpeedScore {
  score: number;       // 0–100
  lcp: number;         // ms — Largest Contentful Paint
  cls: number;         // raw — Cumulative Layout Shift
  fcp: number;         // ms — First Contentful Paint
  tbt: number;         // ms — Total Blocking Time
}

export interface PageSpeedData {
  mobile: SpeedScore;
  desktop: SpeedScore;
  error?: string;
}

// Extracted content used for more specific AI-generated fixes + SERP context
export interface PageContext {
  h1?: string;
  metaDesc?: string;
  bodySnippet?: string;   // first ~600 chars of visible body text
}

export interface AnalysisResult {
  url: string;
  timestamp: string;
  pageTitle?: string;
  pageContext?: PageContext;
  checks: CheckResult[];
  scores: {
    seo: CategoryScore;
    aeo: CategoryScore;
    geo: CategoryScore;
    overall: CategoryScore;
  };
  grade: string;
  fetchTimeMs?: number;
  pageSpeed?: PageSpeedData;
  error?: string;
}

export interface CompareResult {
  primary: AnalysisResult;
  competitor: AnalysisResult;
}

export interface AnalyzeRequest {
  url: string;
  targetKeyword?: string;
}

export interface CompareRequest {
  url: string;
  competitorUrl: string;
}

export interface AiFix {
  checkId: string;
  checkName: string;
  category: Category;
  fix: string;         // Specific, copy-paste-ready fix content
  type: "html" | "schema" | "content" | "config" | "general";
}

export interface AiFixesResult {
  fixes: AiFix[];
  model: string;
  generatedAt: string;
}

// ── SERP ranking types ────────────────────────────────────────────────────────

export interface SerpCompetitor {
  title: string;
  url: string;
  position: number;
  snippet?: string;
}

export interface SerpKeywordResult {
  query: string;
  rank: number | null;   // null = not found in top 10
  yourUrl?: string;      // the result URL that matched the scanned site
  competitors: SerpCompetitor[];
  error?: string;
}

export interface SerpResult {
  keywords: SerpKeywordResult[];
  generatedAt: string;
  error?: string;
}

// ── Multi-page crawl types ────────────────────────────────────────────────────

export interface CrawlPageResult {
  url: string;
  grade: string;
  scores: {
    seo: CategoryScore;
    aeo: CategoryScore;
    geo: CategoryScore;
    overall: CategoryScore;
  };
  pageTitle?: string;
  error?: string;
}

export interface CrawlResult {
  rootUrl: string;
  pages: CrawlPageResult[];
  scannedAt: string;
  error?: string;
}
