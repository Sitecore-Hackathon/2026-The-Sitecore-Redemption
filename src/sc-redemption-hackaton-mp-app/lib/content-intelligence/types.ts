// ─── Field & Page Data ────────────────────────────────────────────────────────

export interface FieldData {
  /** Sitecore field GUID — used for saveFields mutations */
  id: string;
  /** Human-readable field name, e.g. "MetaDescription" */
  name: string;
  /** Current raw field value */
  value: string;
}

export interface SitecorePageData {
  pageId: string;
  pageName: string;
  displayName: string;
  pagePath: string;
  pageRoute: string;
  language: string;
  version: number;
  revision: string;
  templateName: string;
  templateId: string;
  siteName: string;
  fields: FieldData[];
  /** Raw layout JSON from presentationDetails */
  layoutJson?: string;
}

// ─── Analysis Types ───────────────────────────────────────────────────────────

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
  source: FindingSource;
  confidence: Confidence;
  title: string;
  evidence: string;
  rationale: string;
  suggestedFix: string;
  standard?: string;
  /** Field name (e.g. "MetaDescription") — used to match back to a FieldData */
  fieldName?: string;
  /** Field GUID — populated after cross-referencing fetched fields */
  fieldId?: string;
  /** The field's current value at time of analysis */
  currentValue?: string;
  /** Exact replacement text to write back to the field via saveFields */
  applyValue?: string;
  /** True once the fix has been successfully applied */
  applied?: boolean;
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

// ─── AI API Payload ───────────────────────────────────────────────────────────

export interface AnalyzeRequest {
  pageData: SitecorePageData;
}

export interface AnalyzeResponse {
  findings: Finding[];
  error?: string;
}
