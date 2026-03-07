import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { NextResponse } from "next/server";
import type { AnalyzeRequest, AnalyzeResponse, Finding } from "@/lib/content-intelligence/types";

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

function resolveProvider(): Provider | null {
  const explicit = process.env.AI_PROVIDER?.toLowerCase().trim();
  if (explicit === "openai") {
    return isPlaceholder(process.env.OPENAI_API_KEY) ? null : "openai";
  }
  if (explicit === "anthropic") {
    return isPlaceholder(process.env.ANTHROPIC_API_KEY) ? null : "anthropic";
  }
  // Auto-detect
  if (!isPlaceholder(process.env.ANTHROPIC_API_KEY)) return "anthropic";
  if (!isPlaceholder(process.env.OPENAI_API_KEY)) return "openai";
  return null;
}

// ─── Models ───────────────────────────────────────────────────────────────────

const ANTHROPIC_MODEL =
  process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

const OPENAI_MODEL =
  process.env.OPENAI_MODEL ?? "gpt-4o";

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

  for (const f of sorted) {
    const val = f.value?.trim();
    if (!val) continue;
    // Skip system fields
    if (f.name.startsWith("__")) continue;
    // Skip Sitecore-specific XML/JSON data fields (layout, image, link fields)
    // but KEEP HTML content fields like RichText (<p>, <h1>, etc.)
    if (/^(\{|<r[\s>]|<r\/>|<image[\s/>]|<link[\s/>]|<field[\s/>])/.test(val)) continue;
    // Strip HTML tags for the AI — it needs the text, not the markup
    const text = val.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    if (!text) continue;
    if (text.length > 3000) {
      lines.push(`${f.name}: [content truncated — ${text.length} chars]`);
      continue;
    }
    lines.push(`${f.name}: ${text}`);
  }

  const result = lines.join("\n");
  console.info(`[content-intelligence] synthesised page content (${lines.length - 5} fields):\n${result}`);
  return result;
}

// ─── Shared system prompt ─────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a Sitecore XM Cloud content quality analyst specialising in SEO, WCAG accessibility, editorial clarity, and content governance.

Your job is to analyse Sitecore page field values and return a JSON array of specific, actionable findings.

Rules:
- Each finding MUST reference a specific field by its exact name (as shown in the input).
- Only raise issues that are directly evidenced by the field values provided.
- Do NOT invent fields or values not present in the input.
- ALWAYS flag any field that contains "Lorem ipsum" or other obvious placeholder/dummy text as a CRITICAL governance finding.
- ALWAYS flag any field that contains repetitive, nonsensical, or clearly auto-generated filler text.
- applyValue MUST be the complete replacement text ready to save to the field — not a description of what to write.
- applyValue must respect the field's apparent type: plain text for title/meta fields, do not add HTML tags to plain text fields.
- If a finding is about a missing field (empty value), applyValue should be the suggested content to add.
- Maximum 8 findings total. Prioritise the most impactful.
- Return ONLY a valid JSON array — no markdown fences, no explanation outside the array.

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

const USER_PROMPT = (pageContent: string) =>
  `Analyse the following Sitecore page and return findings as a JSON array:\n\n${pageContent}`;

// ─── Provider implementations ─────────────────────────────────────────────────

async function callAnthropic(pageContent: string): Promise<string> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const message = await anthropic.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: USER_PROMPT(pageContent) }],
  });
  return message.content[0].type === "text" ? message.content[0].text : "";
}

async function callOpenAI(pageContent: string): Promise<string> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const completion = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    max_completion_tokens: 2048,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
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
  const provider = resolveProvider();

  if (!provider) {
    return NextResponse.json(
      {
        findings: [],
        error:
          "No AI provider configured. Copy .env.local.example to .env.local and set a real ANTHROPIC_API_KEY or OPENAI_API_KEY (not the placeholder value).",
      },
      { status: 503 },
    );
  }

  let body: AnalyzeRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { findings: [], error: "Invalid request body" },
      { status: 400 },
    );
  }

  const { pageData } = body;
  if (!pageData) {
    return NextResponse.json(
      { findings: [], error: "Missing pageData" },
      { status: 400 },
    );
  }

  const pageContent = synthesisePageContent(pageData);

  try {
    const rawText =
      provider === "openai"
        ? await callOpenAI(pageContent)
        : await callAnthropic(pageContent);

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
