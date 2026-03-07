import type {
  Category,
  CategoryScore,
  ContentAnalysis,
  Finding,
  Grade,
} from "./types";

// ---------------------------------------------------------------------------
// Mock page data
// In production this would be fetched via:
//   client.query("xmc.item.getFields", { itemId: appContext.item.id })
// then run against actual Sitecore field values.
// ---------------------------------------------------------------------------
const MOCK_PAGE = {
  title: "Retirement Planning Solutions",
  metaTitle: "Retirement Planning Solutions | Sitecore Financial",
  metaDescription: "", // MISSING — triggers critical SEO finding
  h1Tags: ["Retirement Planning Solutions", "Start Planning Today"], // Two H1s
  headings: [
    "Our Approach",
    "Investment Options",
    "Why Choose Us",
    "Contact Us",
  ],
  bodyWordCount: 312,
  bodyCopy: `We provide comprehensive retirement planning solutions to meet your needs.
    Our services are designed to be personalized. Plans are crafted by our team.
    Investment options are reviewed annually. Your future is secured by our advisors.
    We believe in building long-term relationships based on trust and transparency.`,
  images: [
    { alt: "", src: "hero-retirement.jpg" }, // MISSING alt — critical
    { alt: "", src: "advisors-team.jpg" }, // MISSING alt — critical
    { alt: "graph", src: "investment-chart.jpg" }, // Generic alt — AI suggestion
  ],
  internalLinks: 0, // No internal links — SEO warning
  externalLinks: 2,
  hasSummary: false, // No excerpt / summary — completeness warning
  hasPrimaryCTA: true,
  hasTaxonomy: false, // No taxonomy assigned — completeness warning
  hasStructuredData: false, // No schema markup — SEO suggestion
  passiveVoicePercentage: 62, // High passive voice — readability warning
  pageType: "Financial Services Landing",
  language: "en",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function computeGrade(score: number): Grade {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 40) return "D";
  return "F";
}

// ---------------------------------------------------------------------------
// Rules engine — deterministic checks
// ---------------------------------------------------------------------------
function buildFindings(): Finding[] {
  const findings: Finding[] = [];

  // ── ACCESSIBILITY ─────────────────────────────────────────────────────────

  const missingAlt = MOCK_PAGE.images.filter((i) => !i.alt);
  if (missingAlt.length > 0) {
    findings.push({
      id: "acc-1",
      category: "accessibility",
      severity: "critical",
      title: `${missingAlt.length} image${missingAlt.length > 1 ? "s are" : " is"} missing alternative text`,
      evidence: `Images without alt text: ${missingAlt.map((i) => i.src).join(", ")}`,
      rationale:
        "Screen readers cannot convey image content to visually impaired users without descriptive alt text. This is a WCAG Level A failure.",
      suggestedFix:
        'Add descriptive alt text to each meaningful image. Decorative images should use an empty alt attribute (alt="").',
      aiRewrite:
        'hero-retirement.jpg → "A couple reviewing retirement savings documents with a financial advisor in a bright, modern office"\nadvisors-team.jpg → "Three certified financial advisors from Sitecore Financial seated at a conference table"',
      standard: "WCAG 2.2 — Success Criterion 1.1.1 (Non-text Content, Level A)",
      confidence: "high",
      source: "rules",
    });
  }

  if (MOCK_PAGE.h1Tags.length > 1) {
    findings.push({
      id: "acc-2",
      category: "accessibility",
      severity: "warning",
      title: `Multiple H1 tags detected (${MOCK_PAGE.h1Tags.length} found)`,
      evidence: `H1 tags found: "${MOCK_PAGE.h1Tags.join('", "')}"`,
      rationale:
        "A page should have exactly one H1 to define its primary topic. Multiple H1s disrupt heading hierarchy for screen reader users and weaken document structure.",
      suggestedFix:
        'Keep "Retirement Planning Solutions" as the sole H1. Convert "Start Planning Today" to an H2.',
      standard:
        "WCAG 2.2 — Success Criterion 1.3.1 (Info and Relationships, Level A)",
      confidence: "high",
      source: "rules",
    });
  }

  // AI finding — generic alt text
  const genericAlt = MOCK_PAGE.images.filter(
    (i) => i.alt && i.alt.length < 8,
  );
  if (genericAlt.length > 0) {
    findings.push({
      id: "acc-3",
      category: "accessibility",
      severity: "suggestion",
      title: `Alt text on ${genericAlt.map((i) => i.src).join(", ")} is too generic`,
      evidence: `Current alt text: "${genericAlt.map((i) => i.alt).join('", "')}"`,
      rationale:
        "Generic alt text like \"graph\" provides no context about what the image shows, failing users who rely on assistive technology.",
      suggestedFix:
        "Describe the chart subject and its relevance to the page topic.",
      aiRewrite:
        '"Bar chart comparing projected retirement savings growth over 20 years across three contribution levels: conservative, moderate, and aggressive"',
      standard: "WCAG-aligned image alternative guidance (WAI)",
      confidence: "high",
      source: "ai",
    });
  }

  // ── SEO / DISCOVERABILITY ─────────────────────────────────────────────────

  if (!MOCK_PAGE.metaDescription) {
    findings.push({
      id: "seo-1",
      category: "seo",
      severity: "critical",
      title: "Meta description is not set",
      evidence: "Meta description field is empty",
      rationale:
        "Search engines display meta descriptions in results pages. A missing description forces an auto-generated snippet that is often truncated or off-topic, reducing click-through rate.",
      suggestedFix:
        "Add a concise, keyword-rich meta description between 150–160 characters that clearly states the page benefit.",
      aiRewrite:
        '"Explore personalized retirement planning solutions from Sitecore Financial. Our certified advisors help you build a secure financial future — start your free consultation today."',
      standard: "Google Search Central — Snippet best practices",
      confidence: "high",
      source: "rules",
    });
  }

  if (MOCK_PAGE.internalLinks === 0) {
    findings.push({
      id: "seo-2",
      category: "seo",
      severity: "warning",
      title: "Page contains no internal links",
      evidence: `Internal link count: ${MOCK_PAGE.internalLinks}`,
      rationale:
        "Internal links help search engines discover your site structure and distribute page authority. They also guide users to related content, reducing bounce rate.",
      suggestedFix:
        "Add 2–4 internal links to related pages such as investment options, a financial calculator, or advisor profiles.",
      confidence: "high",
      source: "rules",
    });
  }

  if (!MOCK_PAGE.hasStructuredData) {
    findings.push({
      id: "seo-3",
      category: "seo",
      severity: "suggestion",
      title: "No structured data (Schema.org) detected",
      evidence: "No JSON-LD or microdata markup found on this template type",
      rationale:
        "Structured data helps search engines understand page content and can unlock rich results such as FAQs, breadcrumbs, or review stars in SERPs.",
      suggestedFix:
        'Add Schema.org "FinancialService" or "LocalBusiness" markup using JSON-LD. Consider making this a default on the Financial Services Landing template.',
      standard: "Schema.org — FinancialService type",
      confidence: "medium",
      source: "rules",
    });
  }

  // ── READABILITY / CLARITY ─────────────────────────────────────────────────

  if (MOCK_PAGE.passiveVoicePercentage > 40) {
    findings.push({
      id: "read-1",
      category: "readability",
      severity: "warning",
      title: `High passive voice usage (${MOCK_PAGE.passiveVoicePercentage}% of sentences)`,
      evidence:
        'Examples: "Plans are crafted by our team", "Investment options are reviewed annually", "Your future is secured by our advisors"',
      rationale:
        "Passive voice makes content feel impersonal and harder to scan, reducing trust and engagement — particularly for high-stakes financial decisions.",
      suggestedFix:
        'Rewrite in active voice: "Our team crafts personalized plans", "We review investment options annually", "Our advisors secure your future."',
      confidence: "high",
      source: "ai",
    });
  }

  // AI finding — vague opening
  findings.push({
    id: "read-2",
    category: "readability",
    severity: "suggestion",
    title: "Opening paragraph is vague and lacks audience specificity",
    evidence:
      '"We provide comprehensive retirement planning solutions to meet your needs."',
    rationale:
      "The opening line does not identify the target audience (adults 50+ planning retirement), differentiate the service, or communicate a clear benefit. Vague intros cause high-intent visitors to bounce.",
    suggestedFix:
      "Lead with the audience benefit and a specific differentiator relevant to the page intent.",
    aiRewrite:
      "\"Whether you're 10 years from retirement or ready to start withdrawing, our certified advisors build a personalized plan around your income goals, risk tolerance, and timeline — not a one-size-fits-all template.\"",
    confidence: "medium",
    source: "ai",
  });

  // ── CONTENT COMPLETENESS ──────────────────────────────────────────────────

  if (!MOCK_PAGE.hasSummary) {
    findings.push({
      id: "comp-1",
      category: "completeness",
      severity: "warning",
      title: "Page summary / excerpt field is empty",
      evidence: "Summary field not populated on this item",
      rationale:
        "The summary field is used in site search results, content listings, social sharing previews, and personalization rules. Leaving it empty forces the system to use truncated body copy.",
      suggestedFix:
        "Add a 1–2 sentence summary describing the page purpose and target audience.",
      aiRewrite:
        '"Personalized retirement planning from certified financial advisors. We help individuals and families build tax-efficient withdrawal strategies, investment portfolios, and estate plans tailored to their goals."',
      confidence: "high",
      source: "rules",
    });
  }

  if (!MOCK_PAGE.hasTaxonomy) {
    findings.push({
      id: "comp-2",
      category: "completeness",
      severity: "warning",
      title: "No taxonomy tags assigned to this item",
      evidence: "Taxonomy / tags field is empty",
      rationale:
        "Taxonomy is used for content targeting, personalization rules, site search facets, and related content surfaces. Untagged pages are invisible to these systems.",
      suggestedFix:
        'Assign relevant tags: "Retirement Planning", "Investment Management", "Financial Services", "Personal Finance".',
      confidence: "high",
      source: "rules",
    });
  }

  // ── BRAND / GOVERNANCE ────────────────────────────────────────────────────
  // No issues on this demo page — governance score is clean.

  return findings;
}

// ---------------------------------------------------------------------------
// Scoring engine
// ---------------------------------------------------------------------------
function computeCategories(findings: Finding[]): CategoryScore[] {
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

  return CATEGORY_DEFS.map(({ category, label, weight, description }) => {
    const catFindings = findings.filter((f) => f.category === category);
    let score = 100;
    for (const f of catFindings) {
      if (f.severity === "critical") score -= 25;
      else if (f.severity === "warning") score -= 15;
      else score -= 5;
    }
    return {
      category,
      label,
      score: Math.max(0, score),
      weight,
      description,
    };
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export async function analyzePage(itemPath?: string): Promise<ContentAnalysis> {
  // Simulate async processing time (rules engine + AI analysis)
  await new Promise((resolve) => setTimeout(resolve, 2400));

  const findings = buildFindings();
  const categories = computeCategories(findings);
  const overallScore = Math.round(
    categories.reduce((acc, cat) => acc + (cat.score * cat.weight) / 100, 0),
  );

  return {
    overallScore,
    grade: computeGrade(overallScore),
    categories,
    findings,
    pageTitle: MOCK_PAGE.title,
    itemPath:
      itemPath ??
      "/sitecore/content/Sites/financial/en/solutions/retirement-planning",
    language: MOCK_PAGE.language,
    pageType: MOCK_PAGE.pageType,
    analyzedAt: new Date(),
  };
}
