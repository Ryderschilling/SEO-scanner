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

export interface AnalysisResult {
  url: string;
  timestamp: string;
  pageTitle?: string;
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
