import type {
  Category,
  CategoryScore,
  ContentAnalysis,
  FieldData,
  Finding,
  Grade,
  SitecorePageData,
} from "./types";

// ─── Field name lookup ────────────────────────────────────────────────────────

/**
 * Finds a field by one of its possible names (case-insensitive).
 * Covers common XM Cloud / SXA field naming conventions.
 */
function findField(
  fields: FieldData[],
  ...candidates: string[]
): FieldData | undefined {
  for (const name of candidates) {
    const f = fields.find(
      (f) => f.name.toLowerCase() === name.toLowerCase(),
    );
    if (f) return f;
  }
  return undefined;
}

/** Returns true if a field exists and has a non-empty trimmed value. */
function hasValue(field: FieldData | undefined): boolean {
  return !!field?.value?.trim();
}

/** Counts words in a string (strips HTML tags first). */
function wordCount(text: string): number {
  return text
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean).length;
}

/** Returns % of sentences that are likely passive voice (simple heuristic). */
function passiveVoicePercent(text: string): number {
  const clean = text.replace(/<[^>]*>/g, " ");
  const sentences = clean.split(/[.!?]+/).filter((s) => s.trim().length > 5);
  if (sentences.length === 0) return 0;
  const passivePattern =
    /\b(is|are|was|were|be|been|being)\s+\w+ed\b/i;
  const passive = sentences.filter((s) => passivePattern.test(s)).length;
  return Math.round((passive / sentences.length) * 100);
}

// ─── Rules engine ─────────────────────────────────────────────────────────────

export function runRulesEngine(data: SitecorePageData): Finding[] {
  const { fields, language } = data;
  const findings: Finding[] = [];
  let seq = 0;
  const id = (prefix: string) => `${prefix}-${++seq}`;

  // ── SEO ────────────────────────────────────────────────────────────────────

  const metaDesc = findField(
    fields,
    "MetaDescription",
    "Meta Description",
    "OgDescription",
    "OG Description",
    "Description",
  );
  if (!hasValue(metaDesc)) {
    findings.push({
      id: id("seo"),
      category: "seo",
      severity: "critical",
      source: "rules",
      confidence: "high",
      title: "Meta description is missing",
      evidence: 'Field "MetaDescription" is empty or not present',
      rationale:
        "Search engines display meta descriptions in results pages. A missing description forces auto-generated snippets that reduce click-through rate.",
      suggestedFix:
        "Add a 150–160 character meta description that clearly states the page benefit and includes the primary keyword.",
      standard: "Google Search Central — Snippet best practices",
      fieldName: metaDesc?.name ?? "MetaDescription",
      fieldId: metaDesc?.id,
      currentValue: metaDesc?.value ?? "",
    });
  } else if (
    metaDesc &&
    (metaDesc.value.length < 70 || metaDesc.value.length > 165)
  ) {
    findings.push({
      id: id("seo"),
      category: "seo",
      severity: "warning",
      source: "rules",
      confidence: "high",
      title: `Meta description is ${metaDesc.value.length < 70 ? "too short" : "too long"} (${metaDesc.value.length} chars)`,
      evidence: `Current meta description: "${metaDesc.value.substring(0, 80)}…"`,
      rationale:
        "Google typically displays 155–160 characters. Descriptions shorter than 70 characters leave unused ranking signal; longer ones are truncated.",
      suggestedFix:
        "Rewrite the meta description to be 150–160 characters — specific, benefit-led, and keyword-rich.",
      standard: "Google Search Central — Snippet best practices",
      fieldName: metaDesc.name,
      fieldId: metaDesc.id,
      currentValue: metaDesc.value,
    });
  }

  const title = findField(
    fields,
    "Title",
    "Browser Title",
    "MetaTitle",
    "Meta Title",
    "OgTitle",
    "OG Title",
    "NavigationTitle",
    "Navigation Title",
  );
  if (!hasValue(title)) {
    findings.push({
      id: id("seo"),
      category: "seo",
      severity: "critical",
      source: "rules",
      confidence: "high",
      title: "Page title is missing",
      evidence: "No Title field found with a value",
      rationale:
        "The page title is the most important on-page SEO signal and is shown in search engine results and browser tabs.",
      suggestedFix:
        "Add a clear, descriptive title (50–60 characters) that includes the primary keyword.",
      standard: "Google Search Central — Title best practices",
      fieldName: "Title",
    });
  } else if (title && (title.value.length < 10 || title.value.length > 70)) {
    findings.push({
      id: id("seo"),
      category: "seo",
      severity: "warning",
      source: "rules",
      confidence: "high",
      title: `Page title is ${title.value.length < 10 ? "too short" : "too long"} (${title.value.length} chars)`,
      evidence: `Current title: "${title.value}"`,
      rationale:
        "Titles between 50–60 characters perform best in search results. Shorter titles under-utilise ranking space; longer ones are truncated.",
      suggestedFix: "Rewrite the title to be 50–60 characters.",
      standard: "Google Search Central — Title best practices",
      fieldName: title.name,
      fieldId: title.id,
      currentValue: title.value,
    });
  }

  const keywords = findField(
    fields,
    "Keywords",
    "Meta Keywords",
    "MetaKeywords",
  );
  if (!hasValue(keywords)) {
    findings.push({
      id: id("seo"),
      category: "seo",
      severity: "suggestion",
      source: "rules",
      confidence: "medium",
      title: "Meta keywords field is empty",
      evidence: "No Keywords field with a value found",
      rationale:
        "While Google ignores meta keywords, Sitecore's site search and personalisation rules may use them for content targeting.",
      suggestedFix:
        "Add 5–10 relevant keywords that represent the page topic and audience intent.",
      fieldName: keywords?.name ?? "Keywords",
      fieldId: keywords?.id,
      currentValue: keywords?.value ?? "",
    });
  }

  // ── ACCESSIBILITY ──────────────────────────────────────────────────────────

  // Look for any image alt-text-style fields that are empty
  const altFields = fields.filter(
    (f) =>
      /\balt\b/i.test(f.name) &&
      !hasValue(f),
  );
  if (altFields.length > 0) {
    findings.push({
      id: id("acc"),
      category: "accessibility",
      severity: "critical",
      source: "rules",
      confidence: "high",
      title: `${altFields.length} image alt text field${altFields.length > 1 ? "s are" : " is"} empty`,
      evidence: `Fields without alt text: ${altFields.map((f) => `"${f.name}"`).join(", ")}`,
      rationale:
        "Screen readers cannot describe images to visually impaired users without descriptive alt text. This is a WCAG Level A failure.",
      suggestedFix:
        'Describe each image concisely (e.g. "Two advisors reviewing a retirement plan in an office"). Use alt="" for purely decorative images.',
      standard: "WCAG 2.2 — Success Criterion 1.1.1 (Non-text Content, Level A)",
      fieldName: altFields[0].name,
      fieldId: altFields[0].id,
      currentValue: altFields[0].value,
    });
  }

  // ── READABILITY ────────────────────────────────────────────────────────────

  const bodyField = findField(
    fields,
    "Text",
    "Body",
    "Content",
    "RichText",
    "Rich Text",
    "Body Copy",
    "BodyCopy",
  );

  if (bodyField && hasValue(bodyField)) {
    const wc = wordCount(bodyField.value);
    if (wc < 100) {
      findings.push({
        id: id("read"),
        category: "readability",
        severity: "warning",
        source: "rules",
        confidence: "high",
        title: `Body content is very thin (${wc} words)`,
        evidence: `Field "${bodyField.name}" contains approximately ${wc} words`,
        rationale:
          "Pages with fewer than 100 words of body content are less likely to rank well and may be flagged as thin content by search engines.",
        suggestedFix:
          "Expand the body copy to at least 250 words. Add context, supporting evidence, and relevant detail for the target audience.",
        fieldName: bodyField.name,
        fieldId: bodyField.id,
        currentValue: bodyField.value,
      });
    }

    const pvPercent = passiveVoicePercent(bodyField.value);
    if (pvPercent > 40) {
      findings.push({
        id: id("read"),
        category: "readability",
        severity: "warning",
        source: "rules",
        confidence: "medium",
        title: `High passive voice usage (${pvPercent}% of sentences)`,
        evidence: `Passive voice detected in "${bodyField.name}" field`,
        rationale:
          "Passive voice makes content impersonal and harder to scan. For financial or trust-sensitive content this reduces engagement.",
        suggestedFix:
          'Replace passive constructions with active voice: "Our team reviews plans" instead of "Plans are reviewed by our team."',
        fieldName: bodyField.name,
        fieldId: bodyField.id,
        currentValue: bodyField.value,
      });
    }
  } else if (!bodyField) {
    findings.push({
      id: id("read"),
      category: "readability",
      severity: "warning",
      source: "rules",
      confidence: "medium",
      title: "No recognised body content field found",
      evidence:
        'No field named "Text", "Body", "Content", or "RichText" found on this item',
      rationale:
        "The rules engine cannot evaluate body content quality without a recognised body field. Verify the template field names.",
      suggestedFix:
        "Ensure the page template includes a body/rich-text field, and that it is populated.",
    });
  }

  // ── COMPLETENESS ───────────────────────────────────────────────────────────

  const summary = findField(
    fields,
    "Summary",
    "Short Description",
    "ShortDescription",
    "Abstract",
    "Teaser",
    "Excerpt",
    "Intro",
    "Introduction",
  );
  if (!hasValue(summary)) {
    findings.push({
      id: id("comp"),
      category: "completeness",
      severity: "warning",
      source: "rules",
      confidence: "high",
      title: "Page summary / excerpt field is empty",
      evidence: "No populated summary, abstract, or teaser field found",
      rationale:
        "Summary fields power site search snippets, content listing cards, social sharing previews, and personalisation surfaces. An empty summary means these fall back to truncated body copy.",
      suggestedFix:
        "Write a 1–2 sentence summary (under 200 characters) that captures the page purpose and target audience.",
      fieldName: summary?.name ?? "Summary",
      fieldId: summary?.id,
      currentValue: summary?.value ?? "",
    });
  }

  // Check for language-specific issues (non-English)
  if (language && language.toLowerCase() !== "en" && language.toLowerCase() !== "en-us") {
    const langTitle = findField(fields, "Title", "NavigationTitle");
    if (langTitle && /^[a-zA-Z\s]+$/.test(langTitle.value) && langTitle.value.trim().length > 5) {
      findings.push({
        id: id("comp"),
        category: "completeness",
        severity: "suggestion",
        source: "rules",
        confidence: "medium",
        title: `Title appears to be in English for a ${language} page`,
        evidence: `Field "${langTitle.name}" value: "${langTitle.value}" (detected language: ${language})`,
        rationale:
          "Page titles in the wrong language hurt localised search rankings and confuse screen readers set to the page language.",
        suggestedFix: `Translate the title to ${language}.`,
        fieldName: langTitle.name,
        fieldId: langTitle.id,
        currentValue: langTitle.value,
      });
    }
  }

  return findings;
}

// ─── Scoring engine ───────────────────────────────────────────────────────────

const CATEGORY_DEFS: Array<{
  category: Category;
  label: string;
  weight: number;
  description: string;
}> = [
  {
    category: "accessibility",
    label: "Accessibility",
    weight: 30,
    description: "WCAG 2.2-aligned checks",
  },
  {
    category: "seo",
    label: "SEO & Discoverability",
    weight: 25,
    description: "Google Search Central guidance",
  },
  {
    category: "readability",
    label: "Readability & Clarity",
    weight: 20,
    description: "Editorial heuristics",
  },
  {
    category: "completeness",
    label: "Content Completeness",
    weight: 15,
    description: "Business rule checks",
  },
  {
    category: "governance",
    label: "Brand & Governance",
    weight: 10,
    description: "Org-specific rules",
  },
];

function computeGrade(score: number): Grade {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 40) return "D";
  return "F";
}

export function computeCategories(findings: Finding[]): CategoryScore[] {
  return CATEGORY_DEFS.map(({ category, label, weight, description }) => {
    const catFindings = findings.filter((f) => f.category === category);
    let score = 100;
    for (const f of catFindings) {
      if (f.severity === "critical") score -= 25;
      else if (f.severity === "warning") score -= 15;
      else score -= 5;
    }
    return { category, label, score: Math.max(0, score), weight, description };
  });
}

export function computeAnalysis(
  data: SitecorePageData,
  findings: Finding[],
): ContentAnalysis {
  const categories = computeCategories(findings);
  const overallScore = Math.round(
    categories.reduce((acc, cat) => acc + (cat.score * cat.weight) / 100, 0),
  );
  const displayTitle =
    data.displayName ||
    data.pageName ||
    findField(data.fields, "Title", "Browser Title")?.value ||
    "(Untitled)";

  return {
    overallScore,
    grade: computeGrade(overallScore),
    categories,
    findings,
    pageTitle: displayTitle,
    itemPath: data.pagePath,
    language: data.language,
    pageType: data.templateName,
    analyzedAt: new Date(),
  };
}

// ─── Field ID enrichment ──────────────────────────────────────────────────────

/**
 * After the AI returns findings (with fieldName but no fieldId), cross-reference
 * against the fetched FieldData array to populate fieldId and currentValue.
 */
export function enrichFindingsWithFieldIds(
  findings: Finding[],
  fields: FieldData[],
): Finding[] {
  return findings.map((f) => {
    if (!f.fieldName || f.fieldId) return f;
    const match = fields.find(
      (fd) => fd.name.toLowerCase() === f.fieldName!.toLowerCase(),
    );
    if (!match) return f;
    return {
      ...f,
      fieldId: match.id,
      currentValue: f.currentValue ?? match.value,
    };
  });
}

// ─── Sitecore item ID formatting ──────────────────────────────────────────────

/**
 * XM Cloud Authoring GQL accepts IDs with or without braces.
 * Normalise to the `{XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}` format.
 */
export function formatItemId(rawId: string): string {
  const hex = rawId.replace(/[{}-]/g, "");
  if (hex.length !== 32) return rawId;
  return `{${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}}`.toUpperCase();
}
