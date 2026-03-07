export type Severity = "critical" | "warning" | "suggestion";
export type Category =
  | "accessibility"
  | "seo"
  | "readability"
  | "completeness"
  | "governance";
export type FindingSource = "rules" | "ai";
export type Confidence = "high" | "medium" | "low";

export interface Finding {
  id: string;
  category: Category;
  severity: Severity;
  title: string;
  evidence: string;
  rationale: string;
  suggestedFix: string;
  aiRewrite?: string;
  standard?: string;
  confidence: Confidence;
  source: FindingSource;
}

export interface CategoryScore {
  category: Category;
  label: string;
  score: number;
  weight: number;
  description: string;
}

export type Grade = "A" | "B" | "C" | "D" | "F";

export interface ContentAnalysis {
  overallScore: number;
  grade: Grade;
  categories: CategoryScore[];
  findings: Finding[];
  pageTitle: string;
  itemPath: string;
  language: string;
  pageType: string;
  analyzedAt: Date;
}
