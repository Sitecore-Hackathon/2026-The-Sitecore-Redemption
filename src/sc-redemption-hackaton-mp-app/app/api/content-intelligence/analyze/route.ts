import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { NextResponse } from "next/server";
import type { AnalyzeRequest, AnalyzeResponse, ContentIntelligenceSettings, Finding } from "@/lib/content-intelligence/types";

// Allow up to 60 s — AI calls can take 20–40 s on large pages
export const maxDuration = 60;

// ─── Provider resolution ──────────────────────────────────────────────────────
//
// Set AI_PROVIDER in .env.local to "anthropic" or "openai".
// If not set, the provider is auto-detected from which API key is present.
// If both keys are present and AI_PROVIDER is not set, Anthropic is preferred.

type Provider = "anthropic" | "openai";

/** Returns true if the key looks like the placeholder from .env.local.example */
function isPlaceholder(key: string | undefined): boolean {
  if (!key) return true;
  return key.startsWith("sk-ant-...") || key.startsWith("sk-...") || key === "your-key-here";
}

/**
 * Resolves the AI provider to use.
 * Priority: Sitecore-stored vendor → AI_PROVIDER env var → auto-detect from key presence.
 * When a Sitecore apiKey is supplied, any non-null vendor is valid (key overrides .env).
 */
function resolveProvider(
  overrideVendor?: "anthropic" | "openai" | null,
  overrideKey?: string,
): Provider | null {
  // If a Sitecore key was passed, use the vendor it came from
  if (overrideKey && !isPlaceholder(overrideKey)) {
    if (overrideVendor === "openai") return "openai";
    return "anthropic"; // default to anthropic if vendor not specified but key is present
  }
  // Vendor hint from Sitecore (no key override — fall through to .env key check)
  if (overrideVendor === "openai") {
    return isPlaceholder(process.env.OPENAI_API_KEY) ? null : "openai";
  }
  if (overrideVendor === "anthropic") {
    return isPlaceholder(process.env.ANTHROPIC_API_KEY) ? null : "anthropic";
  }
  // Fall back to AI_PROVIDER env var, then auto-detect
  const explicit = process.env.AI_PROVIDER?.toLowerCase().trim();
  if (explicit === "openai")    return isPlaceholder(process.env.OPENAI_API_KEY)    ? null : "openai";
  if (explicit === "anthropic") return isPlaceholder(process.env.ANTHROPIC_API_KEY) ? null : "anthropic";
  if (!isPlaceholder(process.env.ANTHROPIC_API_KEY)) return "anthropic";
  if (!isPlaceholder(process.env.OPENAI_API_KEY))    return "openai";
  return null;
}

// ─── Models ───────────────────────────────────────────────────────────────────

const DEFAULT_ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
const DEFAULT_OPENAI_MODEL    = process.env.OPENAI_MODEL    ?? "gpt-4o";

// ─── Page content synthesis ───────────────────────────────────────────────────

function synthesisePageContent(req: AnalyzeRequest["pageData"]): string {
  const { fields, displayName, pageName, templateName, language, pageRoute } = req;

  const lines: string[] = [
    `Page: ${displayName || pageName}`,
    `Template: ${templateName}`,
    `Language: ${language}`,
    `Route: ${pageRoute || "(not set)"}`,
    "",
    "=== FIELD VALUES ===",
  ];

  const priorityOrder = [
    "title",
    "navigationtitle",
    "browsertitle",
    "metatitle",
    "metadescription",
    "meta description",
    "ogdescription",
    "text",
    "body",
    "content",
    "richtext",
    "summary",
    "abstract",
    "teaser",
    "intro",
    "introduction",
    "keywords",
    "metakeywords",
  ];

  const sorted = [...fields].sort((a, b) => {
    const ai = priorityOrder.indexOf(a.name.toLowerCase());
    const bi = priorityOrder.indexOf(b.name.toLowerCase());
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  const htmlFieldNames = new Set<string>();

  for (const f of sorted) {
    const val = f.value?.trim();
    if (!val) continue;
    // Skip system fields
    if (f.name.startsWith("__")) continue;
    // Skip Sitecore-specific XML/JSON data fields (layout, image, link fields)
    // but KEEP HTML content fields like RichText (<p>, <h1>, etc.)
    if (/^(\{|<r[\s>]|<r\/>|<image[\s/>]|<link[\s/>]|<field[\s/>])/.test(val)) continue;

    const isHtml = /<[a-z][\s\S]*>/i.test(val);
    if (isHtml) {
      htmlFieldNames.add(f.name);
      // Send raw HTML so the AI preserves existing tag structure in applyValue
      if (val.length > 3000) {
        lines.push(`${f.name} [HTML field]: [HTML content truncated — ${val.length} chars]`);
      } else {
        lines.push(`${f.name} [HTML field]: ${val}`);
      }
      continue;
    }

    // Plain text fields — send as-is
    const text = val.replace(/\s+/g, " ").trim();
    if (!text) continue;
    if (text.length > 3000) {
      lines.push(`${f.name}: [content truncated — ${text.length} chars]`);
      continue;
    }
    lines.push(`${f.name}: ${text}`);
  }

  if (htmlFieldNames.size > 0) {
    lines.push("");
    lines.push(`=== HTML FIELDS (preserve all tags in applyValue) ===`);
    lines.push([...htmlFieldNames].join(", "));
  }

  const result = lines.join("\n");
  console.info(`[content-intelligence] synthesised page content (${lines.length - 5} fields):\n${result}`);
  return result;
}

// ─── System prompt builder ────────────────────────────────────────────────────

function buildSystemPrompt(settings?: ContentIntelligenceSettings): string {
  const tone = settings?.preferredTone ?? "formal";
  const level = settings?.readingLevel ?? "college";
  const banned = settings?.bannedPhrases ?? [];
  const schemas = settings?.requiredSchemaTypes ?? [];

  const toneInstruction =
    tone === "formal"          ? "Write in a formal, professional register." :
    tone === "conversational"  ? "Write in a friendly, conversational tone." :
    tone === "technical"       ? "Write in a precise, technical style." :
                                 `Write in a ${tone} tone.`;

  const levelInstruction: Record<string, string> = {
    "elementary":  "Target a reading level appropriate for ages 9–11 (Flesch-Kincaid Grade 3–5).",
    "high-school": "Target a high-school reading level (Flesch-Kincaid Grade 8–10).",
    "college":     "Target a college reading level (Flesch-Kincaid Grade 12–14).",
    "expert":      "Target an expert/professional reading level.",
  };

  const bannedSection = banned.length > 0
    ? `\n\nBANNED PHRASES: The following phrases must NEVER appear in suggested content: ${banned.map((p) => `"${p}"`).join(", ")}. Flag any finding where these appear in the existing field values.`
    : "";

  const schemaSection = schemas.length > 0
    ? `\n\nREQUIRED SCHEMA TYPES: Check whether the page content supports these structured data types: ${schemas.join(", ")}. Flag missing schema opportunities as "suggestion" findings.`
    : "";

  const vibeSection = settings?.contentVibe
    ? `\n\nSITE CONTENT VIBE: ${settings.contentVibe}. All suggestions must align with this tone and demographic target.`
    : "";

  return `You are a Sitecore XM Cloud content quality analyst specialising in SEO, WCAG accessibility, editorial clarity, and content governance.

${toneInstruction}
${levelInstruction[level] ?? ""}

Your job is to analyse Sitecore page field values and return a JSON array of specific, actionable findings.

Rules:
- Each finding MUST reference a specific field by its exact name (as shown in the input).
- Only raise issues that are directly evidenced by the field values provided.
- Do NOT invent fields or values not present in the input.
- ALWAYS flag any field that contains "Lorem ipsum" or other obvious placeholder/dummy text as a CRITICAL governance finding.
- ALWAYS flag any field that contains repetitive, nonsensical, or clearly auto-generated filler text.
- applyValue MUST be the complete replacement text ready to save to the field — not a description of what to write.
- For fields marked [HTML field]: applyValue MUST preserve all existing HTML tags and structure. Only replace the text content inside tags. Never strip or add tags. Example: if the field contains "<h1>Old title</h1><p>Old text</p>", your applyValue must return "<h1>New title</h1><p>New text</p>" with the exact same tag structure.
- For plain text fields (no [HTML field] marker): do not add any HTML tags — plain text only.
- If a finding is about a missing field (empty value), applyValue should be the suggested content to add.
- Maximum 8 findings total. Prioritise the most impactful.
- Return ONLY a valid JSON array — no markdown fences, no explanation outside the array.${bannedSection}${schemaSection}${vibeSection}

Each finding object must match exactly:
{
  "id": "ai-1",
  "category": "accessibility" | "seo" | "readability" | "completeness" | "governance",
  "severity": "critical" | "warning" | "suggestion",
  "source": "ai",
  "confidence": "high" | "medium" | "low",
  "title": "Short, specific issue title",
  "fieldName": "Exact field name from the input, or null if page-level",
  "evidence": "The specific text or value that triggered this finding",
  "rationale": "Why this matters for the page quality",
  "suggestedFix": "Actionable instruction in plain language",
  "applyValue": "The complete replacement field value, or null if not applicable",
  "standard": "WCAG 2.2 / Google Search Central / Schema.org reference, or null"
}`;
}

const USER_PROMPT = (pageContent: string) =>
  `Analyse the following Sitecore page and return findings as a JSON array:\n\n${pageContent}`;

// ─── Provider implementations ─────────────────────────────────────────────────

async function callAnthropic(
  pageContent: string,
  settings?: ContentIntelligenceSettings,
  apiKey?: string,
  model?: string,
): Promise<string> {
  const anthropic = new Anthropic({ apiKey: apiKey || process.env.ANTHROPIC_API_KEY });
  const message = await anthropic.messages.create({
    model: model || DEFAULT_ANTHROPIC_MODEL,
    max_tokens: 2048,
    system: buildSystemPrompt(settings),
    messages: [{ role: "user", content: USER_PROMPT(pageContent) }],
  });
  return message.content[0].type === "text" ? message.content[0].text : "";
}

async function callOpenAI(
  pageContent: string,
  settings?: ContentIntelligenceSettings,
  apiKey?: string,
  model?: string,
): Promise<string> {
  const openai = new OpenAI({ apiKey: apiKey || process.env.OPENAI_API_KEY });
  const completion = await openai.chat.completions.create({
    model: model || DEFAULT_OPENAI_MODEL,
    max_completion_tokens: 2048,
    messages: [
      { role: "system", content: buildSystemPrompt(settings) },
      { role: "user", content: USER_PROMPT(pageContent) },
    ],
    // No response_format — asking for a JSON array, not an object.
    // json_object mode forces an object wrapper and causes parse failures.
  });
  return completion.choices[0]?.message?.content ?? "";
}

// ─── Response normalisation ───────────────────────────────────────────────────

function parseFindings(rawText: string): Finding[] | { error: string } {
  // Strip accidental markdown fences
  const jsonText = rawText
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { error: `AI returned non-JSON: ${rawText.substring(0, 200)}` };
  }

  // OpenAI with json_object sometimes wraps the array: { "findings": [...] }
  if (!Array.isArray(parsed) && typeof parsed === "object" && parsed !== null) {
    const candidate = Object.values(parsed as Record<string, unknown>).find(
      Array.isArray,
    );
    if (candidate) parsed = candidate;
  }

  if (!Array.isArray(parsed)) {
    return { error: "AI response was not a JSON array" };
  }

  return (parsed as Record<string, unknown>[]).map((f, i) => ({
    id: `ai-${i + 1}`,
    category: (f.category as Finding["category"]) ?? "readability",
    severity: (f.severity as Finding["severity"]) ?? "suggestion",
    source: "ai" as const,
    confidence: (f.confidence as Finding["confidence"]) ?? "medium",
    title: String(f.title ?? "AI finding"),
    fieldName: f.fieldName ? String(f.fieldName) : undefined,
    evidence: String(f.evidence ?? ""),
    rationale: String(f.rationale ?? ""),
    suggestedFix: String(f.suggestedFix ?? ""),
    applyValue: f.applyValue ? String(f.applyValue) : undefined,
    standard: f.standard ? String(f.standard) : undefined,
  }));
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(
  request: Request,
): Promise<NextResponse<AnalyzeResponse & { provider?: string }>> {
  let body: AnalyzeRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { findings: [], error: "Invalid request body" },
      { status: 400 },
    );
  }

  const { pageData, settings, apiKey, model } = body;
  if (!pageData) {
    return NextResponse.json(
      { findings: [], error: "Missing pageData" },
      { status: 400 },
    );
  }

  const provider = resolveProvider(settings?.aiVendor, apiKey);

  if (!provider) {
    return NextResponse.json(
      {
        findings: [],
        error:
          "No AI provider configured. Add an API key in the Settings tab or set ANTHROPIC_API_KEY / OPENAI_API_KEY in .env.local.",
      },
      { status: 503 },
    );
  }

  const pageContent = synthesisePageContent(pageData);

  try {
    const rawText =
      provider === "openai"
        ? await callOpenAI(pageContent, settings, apiKey, model)
        : await callAnthropic(pageContent, settings, apiKey, model);

    const result = parseFindings(rawText);

    if ("error" in result) {
      console.error(`[content-intelligence] ${provider} parse error: ${result.error}`);
      return NextResponse.json({ findings: [], error: result.error }, { status: 502 });
    }

    return NextResponse.json({ findings: result, provider });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Serialize fully so the object doesn't appear as [Object] in the terminal
    const detail = err instanceof Error
      ? `${err.message}\n${err.stack ?? ""}${err.cause ? `\nCause: ${String(err.cause)}` : ""}`
      : JSON.stringify(err, Object.getOwnPropertyNames(err as object));
    console.error(`[content-intelligence] ${provider} API error:\n${detail}`);
    return NextResponse.json(
      {
        findings: [],
        error: `AI analysis failed (${provider}): ${msg}. Check your API key and server logs.`,
      },
      { status: 500 },
    );
  }
}
