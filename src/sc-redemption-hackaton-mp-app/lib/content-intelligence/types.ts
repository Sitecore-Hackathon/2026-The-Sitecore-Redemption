// ─── Field & Page Data ────────────────────────────────────────────────────────

export interface FieldData {
  /** Sitecore field GUID — used for saveFields mutations */
  id: string;
  /** Human-readable field name, e.g. "MetaDescription" */
  name: string;
  /** Current raw field value */
  value: string;
  /**
   * The item that owns this field. For page fields this equals the page ID;
   * for datasource fields it is the datasource item ID. Used by applyFix to
   * target the correct item when calling saveFields.
   */
  sourceItemId?: string;
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
  /** The item that owns this field (page or datasource item ID) */
  sourceItemId?: string;
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
  /** Sitecore-stored configuration — overrides hard-coded defaults when present */
  settings?: ContentIntelligenceSettings;
  /** API key from Sitecore vendor item — overrides the .env key on the server */
  apiKey?: string;
  /** Model name from Sitecore vendor item — overrides the .env model on the server */
  model?: string;
}

export interface AnalyzeResponse {
  findings: Finding[];
  error?: string;
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export interface SEOPageTypeExpectation {
  titleMin?: number;
  titleMax?: number;
  metaDescMin?: number;
  metaDescMax?: number;
}

export interface ContentIntelligenceSettings {
  // Feature flags
  enableAIAnalysis: boolean;
  /** Sitecore-selected vendor; null means use AI_PROVIDER env var */
  aiVendor: "anthropic" | "openai" | null;

  // AI persona
  preferredTone: string;
  readingLevel: string;
  /** Free-text instruction to set the overall site vibe/demographic for AI suggestions */
  contentVibe?: string;

  // Governance
  bannedPhrases: string[];
  requiredSchemaTypes: string[];

  // SEO thresholds
  metaDescMinChars: number;
  metaDescMaxChars: number;
  titleMinChars: number;
  titleMaxChars: number;

  // Readability thresholds
  bodyMinWords: number;
  passiveVoiceThreshold: number;

  // Category scoring weights (must sum to 100)
  categoryWeights: {
    accessibility: number;
    seo: number;
    readability: number;
    completeness: number;
    governance: number;
  };

  // Advanced
  accessibilityThreshold: "AA" | "AAA";
  seoExpectationsByPageType: Record<string, SEOPageTypeExpectation>;
  localizationRules: Record<string, unknown>;

  /** itemId of the Global Settings Sitecore item; null = not initialized */
  settingsItemId: string | null;
  /** itemId of the active vendor item (Anthropic or OpenAI) */
  vendorItemId: string | null;
}
