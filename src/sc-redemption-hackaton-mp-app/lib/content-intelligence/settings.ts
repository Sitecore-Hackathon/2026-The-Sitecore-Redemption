"use client";

import type { ContentIntelligenceSettings } from "./types";
import type { useMarketplaceClient } from "@/components/providers/marketplace";

// ─── Paths & constants ────────────────────────────────────────────────────────

const MODULE_ROOT = "/sitecore/system/modules/AI Content Intelligence";
const GLOBAL_SETTINGS_PATH = `${MODULE_ROOT}/Global Settings`;
const VENDORS_PATH = `${MODULE_ROOT}/Vendors`;
const ANTHROPIC_PATH = `${VENDORS_PATH}/Anthropic`;
const OPENAI_PATH = `${VENDORS_PATH}/OpenAI`;

// ─── Defaults ─────────────────────────────────────────────────────────────────

export const DEFAULT_SETTINGS: ContentIntelligenceSettings = {
  enableAIAnalysis: true,
  aiVendor: null,
  preferredTone: "formal",
  readingLevel: "college",
  contentVibe: undefined,
  bannedPhrases: [],
  requiredSchemaTypes: [],
  metaDescMinChars: 70,
  metaDescMaxChars: 165,
  titleMinChars: 10,
  titleMaxChars: 70,
  bodyMinWords: 100,
  passiveVoiceThreshold: 40,
  categoryWeights: {
    accessibility: 30,
    seo: 25,
    readability: 20,
    completeness: 15,
    governance: 10,
  },
  accessibilityThreshold: "AA",
  seoExpectationsByPageType: {},
  localizationRules: {},
  settingsItemId: null,
  vendorItemId: null,
};

// ─── GQL queries ──────────────────────────────────────────────────────────────

const GET_ITEM_BY_PATH_QUERY = `
  query GetItemByPath($path: String!, $language: String!) {
    item(where: { path: $path, language: $language }) {
      itemId
      fields {
        nodes {
          fieldId
          name
          value
        }
      }
    }
  }
`;


// ─── Parse helpers ────────────────────────────────────────────────────────────

type GqlField = { fieldId?: string; name?: string; value?: string };

function getField(nodes: GqlField[], name: string): string {
  return nodes.find((n) => n.name?.toLowerCase() === name.toLowerCase())?.value?.trim() ?? "";
}

function parseIntField(nodes: GqlField[], name: string, fallback: number): number {
  const v = parseInt(getField(nodes, name), 10);
  return isNaN(v) ? fallback : v;
}

function parseBoolField(nodes: GqlField[], name: string, fallback: boolean): boolean {
  const v = getField(nodes, name);
  if (v === "1" || v.toLowerCase() === "true") return true;
  if (v === "0" || v.toLowerCase() === "false") return false;
  return fallback;
}

function parseMultiLineList(nodes: GqlField[], name: string): string[] {
  const v = getField(nodes, name);
  return v ? v.split("\n").map((s) => s.trim()).filter(Boolean) : [];
}

function parseJsonField<T>(nodes: GqlField[], name: string, fallback: T): T {
  const v = getField(nodes, name);
  if (!v) return fallback;
  try {
    return JSON.parse(v) as T;
  } catch {
    return fallback;
  }
}

/** Returns true if the string looks like a Sitecore GUID e.g. {A1B2C3D4-...} */
function isGuid(v: string): boolean {
  return /^\{[0-9A-Fa-f-]{36}\}$/.test(v);
}

/**
 * Normalises a GUID to the `{XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}` format
 * Sitecore Droplink fields expect: uppercase, braces, and dashes.
 * Handles input with or without surrounding braces and with or without dashes.
 */
export function normalizeGuid(v: string): string {
  // Strip braces and uppercase
  const stripped = v.trim().toUpperCase().replace(/^\{|\}$/g, "");
  // If 32 hex chars with no dashes, insert standard GUID dashes
  if (/^[0-9A-F]{32}$/.test(stripped)) {
    return `{${stripped.slice(0, 8)}-${stripped.slice(8, 12)}-${stripped.slice(12, 16)}-${stripped.slice(16, 20)}-${stripped.slice(20)}}`;
  }
  // Already has dashes — just wrap with braces
  return `{${stripped}}`;
}

// ─── GQL executor ─────────────────────────────────────────────────────────────

type Client = ReturnType<typeof useMarketplaceClient>;

type GqlItemResult = { item?: { itemId?: string; fields?: { nodes?: GqlField[] } } } | null;

async function gqlQuery(
  client: Client,
  contextId: string,
  query: string,
  variables: Record<string, string>,
): Promise<GqlItemResult> {
  try {
    const result = await client.mutate("xmc.authoring.graphql", {
      params: {
        body: { query, variables },
        query: { sitecoreContextId: contextId },
      },
    });
    const gql = (result as unknown as { data?: { data?: { item?: unknown } } }).data;
    return (gql?.data ?? null) as GqlItemResult;
  } catch {
    return null;
  }
}

const GET_ITEM_BY_ID_QUERY = `
  query GetItemById($itemId: ID!, $language: String!) {
    item(where: { itemId: $itemId, language: $language }) {
      itemId
      fields {
        nodes {
          fieldId
          name
          value
        }
      }
    }
  }
`;

async function gqlQueryById(
  client: Client,
  contextId: string,
  itemId: string,
  language: string,
): Promise<GqlItemResult> {
  return gqlQuery(client, contextId, GET_ITEM_BY_ID_QUERY, { itemId, language });
}

// ─── fetchSettings ────────────────────────────────────────────────────────────

function parseGlobalSettings(
  nodes: GqlField[],
  itemId: string,
): ContentIntelligenceSettings & { _rawVendorGuid?: string } {
  const rawVendor = getField(nodes, "AIVendor");
  // AIVendor is a Droplink — stored as GUID. Normalise to {UPPERCASE} so it
  // consistently matches vendor item IDs returned by fetchVendorItems.
  const vendorItemId = isGuid(rawVendor) ? normalizeGuid(rawVendor) : null;
  // Legacy: if somehow stored as plain text
  const aiVendorDirect =
    rawVendor === "anthropic" || rawVendor === "openai" ? rawVendor : null;

  const weights = {
    accessibility: parseIntField(nodes, "WeightAccessibility", 30),
    seo: parseIntField(nodes, "WeightSEO", 25),
    readability: parseIntField(nodes, "WeightReadability", 20),
    completeness: parseIntField(nodes, "WeightCompleteness", 15),
    governance: parseIntField(nodes, "WeightGovernance", 10),
  };
  const weightSum = Object.values(weights).reduce((a, b) => a + b, 0);

  return {
    enableAIAnalysis: parseBoolField(nodes, "EnableAIAnalysis", true),
    aiVendor: aiVendorDirect, // will be resolved from GUID in fetchSettings
    preferredTone: getField(nodes, "PreferredTone") || "formal",
    readingLevel: getField(nodes, "ReadingLevel") || "college",
    contentVibe: getField(nodes, "ContentVibe") || undefined,
    bannedPhrases: parseMultiLineList(nodes, "BannedPhrases"),
    requiredSchemaTypes: parseMultiLineList(nodes, "RequiredSchemaTypes"),
    metaDescMinChars: parseIntField(nodes, "MetaDescMinChars", 70),
    metaDescMaxChars: parseIntField(nodes, "MetaDescMaxChars", 165),
    titleMinChars: parseIntField(nodes, "TitleMinChars", 10),
    titleMaxChars: parseIntField(nodes, "TitleMaxChars", 70),
    bodyMinWords: parseIntField(nodes, "BodyMinWords", 100),
    passiveVoiceThreshold: parseIntField(nodes, "PassiveVoiceThreshold", 40),
    categoryWeights: weightSum === 100 ? weights : DEFAULT_SETTINGS.categoryWeights,
    accessibilityThreshold:
      getField(nodes, "AccessibilityThreshold") === "AAA" ? "AAA" : "AA",
    seoExpectationsByPageType: parseJsonField(nodes, "SEOExpectationsByPageType", {}),
    localizationRules: parseJsonField(nodes, "LocalizationRules", {}),
    settingsItemId: itemId,
    vendorItemId,
    // carry raw GUID forward so fetchSettings can resolve vendor name
    _rawVendorGuid: vendorItemId ?? undefined,
  };
}

/**
 * Fetches the Global Settings item. If not found, returns DEFAULT_SETTINGS
 * with settingsItemId: null so the UI can show the "Initialize" flow.
 */
export async function fetchSettings(
  client: Client,
  contextId: string,
  language = "en",
): Promise<ContentIntelligenceSettings> {
  const data = await gqlQuery(client, contextId, GET_ITEM_BY_PATH_QUERY, {
    path: GLOBAL_SETTINGS_PATH,
    language,
  });
  const item = data?.item;
  if (!item?.itemId) return { ...DEFAULT_SETTINGS };

  const parsed = parseGlobalSettings(item.fields?.nodes ?? [], item.itemId);

  // Resolve Droplink GUID → vendor name by looking up the vendor item
  if (parsed._rawVendorGuid) {
    const vendorData = await gqlQueryById(client, contextId, parsed._rawVendorGuid, language);
    const vendorNodes = vendorData?.item?.fields?.nodes ?? [];
    const vendorName = getField(vendorNodes, "VendorName");
    if (vendorName === "anthropic" || vendorName === "openai") {
      parsed.aiVendor = vendorName;
    }
  }

  const { _rawVendorGuid: _drop, ...settings } = parsed;
  return settings;
}

// ─── fetchVendorConfig ────────────────────────────────────────────────────────

export interface VendorConfig {
  vendor: "anthropic" | "openai";
  apiKey: string;
  model: string;
  itemId: string;
}

export interface VendorItem {
  itemId: string;
  vendor: "anthropic" | "openai";
  apiKey: string;
  modelName: string;
}

/**
 * Reads both vendor items. Returns config for the preferred vendor,
 * or the first one that has an API key configured.
 */
export async function fetchVendorConfig(
  client: Client,
  contextId: string,
  preferredVendor: "anthropic" | "openai" | null,
  language = "en",
): Promise<VendorConfig | null> {
  const paths: Array<{ path: string; vendor: "anthropic" | "openai" }> =
    preferredVendor === "openai"
      ? [{ path: OPENAI_PATH, vendor: "openai" }, { path: ANTHROPIC_PATH, vendor: "anthropic" }]
      : [{ path: ANTHROPIC_PATH, vendor: "anthropic" }, { path: OPENAI_PATH, vendor: "openai" }];

  for (const { path, vendor } of paths) {
    const data = await gqlQuery(client, contextId, GET_ITEM_BY_PATH_QUERY, { path, language });
    const item = data?.item;
    if (!item?.itemId) continue;
    const nodes = item.fields?.nodes ?? [];
    const apiKey = getField(nodes, "APIKey");
    if (!apiKey) continue;
    const model = getField(nodes, "ModelName") || (vendor === "anthropic" ? "claude-sonnet-4-6" : "gpt-4o");
    return { vendor, apiKey, model, itemId: item.itemId };
  }
  return null;
}

/**
 * Returns both vendor items (Anthropic + OpenAI) with their current APIKey/ModelName values.
 * Used by Settings Panel to populate the vendor selector and inline credential fields.
 */
export async function fetchVendorItems(
  client: Client,
  contextId: string,
  language = "en",
): Promise<VendorItem[]> {
  const entries: Array<{ path: string; vendor: "anthropic" | "openai" }> = [
    { path: ANTHROPIC_PATH, vendor: "anthropic" },
    { path: OPENAI_PATH, vendor: "openai" },
  ];
  const results: VendorItem[] = [];
  for (const { path, vendor } of entries) {
    const data = await gqlQuery(client, contextId, GET_ITEM_BY_PATH_QUERY, { path, language });
    const item = data?.item;
    if (!item?.itemId) continue;
    const nodes = item.fields?.nodes ?? [];
    results.push({
      // Normalise to {UPPERCASE} so it matches the Droplink value stored in Global Settings
      itemId: normalizeGuid(item.itemId),
      vendor,
      apiKey: getField(nodes, "APIKey"),
      modelName: getField(nodes, "ModelName"),
    });
  }
  return results;
}

/**
 * Saves APIKey and ModelName to a vendor item using the authoring GQL
 * updateItem mutation (not xmc.pages.saveFields, which requires a site context).
 */
export async function saveVendorFields(
  client: Client,
  vendorItemId: string,
  contextId: string,
  apiKey: string,
  modelName: string,
): Promise<void> {
  const fields: Array<{ name: string; value: string }> = [];
  if (apiKey !== undefined) fields.push({ name: "APIKey", value: apiKey });
  if (modelName !== undefined) fields.push({ name: "ModelName", value: modelName });
  if (fields.length === 0) return;
  await gqlUpdateByName(client, contextId, vendorItemId, "en", fields);
}

// ─── hasVendorApiKey ──────────────────────────────────────────────────────────

/** Returns true if at least one vendor item has an API key stored. */
export async function hasVendorApiKey(
  client: Client,
  contextId: string,
  language = "en",
): Promise<boolean> {
  for (const path of [ANTHROPIC_PATH, OPENAI_PATH]) {
    const data = await gqlQuery(client, contextId, GET_ITEM_BY_PATH_QUERY, { path, language });
    const nodes = data?.item?.fields?.nodes ?? [];
    if (getField(nodes, "APIKey")) return true;
  }
  return false;
}

// ─── initializeSettings ───────────────────────────────────────────────────────

/**
 * Checks whether the module root exists in Sitecore.
 * Returns the itemId if it exists, null if not initialized.
 */
export async function checkInitialized(
  client: Client,
  contextId: string,
  language = "en",
): Promise<string | null> {
  const data = await gqlQuery(client, contextId, GET_ITEM_BY_PATH_QUERY, {
    path: GLOBAL_SETTINGS_PATH,
    language,
  });
  return data?.item?.itemId ?? null;
}

/**
 * Returns the paths for the two vendor items so the Settings UI can
 * show deep links to the Sitecore Content Editor.
 */
export const VENDOR_PATHS = {
  anthropic: ANTHROPIC_PATH,
  openai: OPENAI_PATH,
} as const;

export const MODULE_ROOT_PATH = MODULE_ROOT;

// ─── Item initialization ──────────────────────────────────────────────────────
// Well-known Sitecore system template IDs — present in every XM Cloud instance.
const FOLDER_TEMPLATE_ID   = "{A87A00B1-E6DB-45AB-8B54-636FEC3B5523}"; // System/Common/Folder
const TEMPLATE_TEMPLATE_ID = "{AB86861A-6030-46C5-B394-E8F99E8B87DB}"; // System/Templates/Template
const SECTION_TEMPLATE_ID  = "{E269FBB5-3750-427A-9149-7AA950B49301}"; // System/Templates/Template section
const FIELD_TEMPLATE_ID    = "{455A3E98-A627-4B40-8035-E683A0331AC7}"; // System/Templates/Template field

// Where the module's custom templates live in Sitecore
const TEMPLATES_FOLDER_PATH        = "/sitecore/templates/modules/AI Content Intelligence";
const SETTINGS_TEMPLATE_PATH       = `${TEMPLATES_FOLDER_PATH}/AI CI Global Settings`;
const VENDOR_TEMPLATE_PATH         = `${TEMPLATES_FOLDER_PATH}/AI CI Vendor`;
const CONFIG_OPTION_TEMPLATE_PATH  = `${TEMPLATES_FOLDER_PATH}/AI CI Config Option`;

// Config option item paths for Droplist fields
const CONFIG_PATH            = `${MODULE_ROOT}/Config`;
const TONES_PATH             = `${CONFIG_PATH}/Tones`;
const READING_LEVELS_PATH    = `${CONFIG_PATH}/Reading Levels`;
const A11Y_LEVELS_PATH       = `${CONFIG_PATH}/Accessibility Levels`;

// ─── FieldDef — describes a template field with all metadata ─────────────────

interface FieldDef {
  name: string;
  type: string;    // "Checkbox" | "Integer" | "Multi-Line Text" | "Droplink" | "Droplist" | "Single-Line Text"
  title: string;
  help: string;
  source?: string; // for Droplink / Droplist
}

// ─── GQL mutations ────────────────────────────────────────────────────────────

const CREATE_ITEM_MUTATION = `
  mutation CreateItem($name: String!, $templateId: ID!, $parent: ID!, $language: String!) {
    createItem(input: {
      name: $name
      templateId: $templateId
      parent: $parent
      language: $language
    }) {
      item { itemId }
    }
  }
`;

// Static mutation for template field items — ALL metadata passed as proper GQL variables,
// avoiding string-interpolation issues with long help text or special characters.
// templateId is hardcoded (same as original working CREATE_SLT_FIELD_MUTATION pattern).
const CREATE_FIELD_MUTATION = `
  mutation CreateTemplateField(
    $name: String!
    $parent: ID!
    $language: String!
    $type: String!
    $title: String!
    $shortHelp: String!
    $help: String!
    $source: String!
  ) {
    createItem(input: {
      name: $name
      templateId: "{455A3E98-A627-4B40-8035-E683A0331AC7}"
      parent: $parent
      language: $language
      fields: [
        { name: "Type",                value: $type }
        { name: "Shared",              value: "1" }
        { name: "Title",               value: $title }
        { name: "__Short description", value: $shortHelp }
        { name: "__Long description",  value: $help }
        { name: "Source",              value: $source }
      ]
    }) {
      item { itemId }
    }
  }
`;

/**
 * Builds a dynamic updateItem mutation where each field value is a numbered GQL variable
 * ($v0, $v1, …) to safely pass arbitrary user-provided content without string escaping.
 * Field names are inlined as quoted literals (they are always known safe identifiers).
 */
function buildUpdateMutation(
  fields: Array<{ name: string; value: string }>,
): { query: string; variables: Record<string, string> } {
  const varDecls = fields.map((_, i) => `$v${i}: String!`).join(", ");
  const fieldItems = fields
    .map((f, i) => `        { name: ${JSON.stringify(f.name)}, value: $v${i} }`)
    .join("\n");
  const variables: Record<string, string> = {};
  fields.forEach((f, i) => { variables[`v${i}`] = f.value; });
  return {
    query: `
      mutation UpdateItem($itemId: ID!, $language: String!, ${varDecls}) {
        updateItem(input: {
          itemId: $itemId
          language: $language
          fields: [
${fieldItems}
          ]
        }) {
          item { itemId }
        }
      }
    `,
    variables,
  };
}

async function gqlUpdateByName(
  client: Client,
  contextId: string,
  itemId: string,
  language: string,
  fields: Array<{ name: string; value: string }>,
): Promise<boolean> {
  if (fields.length === 0) return true;
  try {
    const { query, variables } = buildUpdateMutation(fields);
    const result = await client.mutate("xmc.authoring.graphql", {
      params: {
        body: { query, variables: { ...variables, itemId, language } },
        query: { sitecoreContextId: contextId },
      },
    });
    const data = (result as unknown as { data?: { data?: { updateItem?: { item?: { itemId?: string } } }; errors?: unknown[] } }).data;
    if (data?.errors?.length) {
      console.warn("[content-intelligence] updateItem errors:", data.errors);
    }
    return !!data?.data?.updateItem?.item?.itemId;
  } catch (err) {
    console.warn("[content-intelligence] updateItem threw:", err);
    return false;
  }
}

async function gqlCreate(
  client: Client,
  contextId: string,
  name: string,
  templateId: string,
  parentId: string,
  language: string,
  extraFields?: Array<{ name: string; value: string }>,
): Promise<string | null> {
  try {
    // Build a dynamic mutation that inlines extra fields when provided.
    // Only used for simple short-value fields (e.g. __Icon, VendorName, standard values).
    // For template field metadata use gqlCreateField which uses proper GQL variables.
    const fieldsBlock = extraFields && extraFields.length > 0
      ? `\n      fields: [\n${extraFields.map((f) => `        { name: ${JSON.stringify(f.name)}, value: ${JSON.stringify(f.value)} }`).join("\n")}\n      ]`
      : "";
    const mutation = `
      mutation CreateItem($name: String!, $templateId: ID!, $parent: ID!, $language: String!) {
        createItem(input: {
          name: $name
          templateId: $templateId
          parent: $parent
          language: $language${fieldsBlock}
        }) {
          item { itemId }
        }
      }
    `;
    const result = await client.mutate("xmc.authoring.graphql", {
      params: {
        body: { query: mutation, variables: { name, templateId, parent: parentId, language } },
        query: { sitecoreContextId: contextId },
      },
    });
    const data = (result as unknown as { data?: { data?: { createItem?: { item?: { itemId?: string } } } } }).data?.data;
    return data?.createItem?.item?.itemId ?? null;
  } catch {
    return null;
  }
}

/**
 * Creates a template field item using a static mutation with proper GQL variables.
 * All metadata (Type, Title, Source, __Help) is passed as variables — not inline strings —
 * to avoid GQL parse failures caused by long text or special characters in help content.
 */
async function gqlCreateField(
  client: Client,
  contextId: string,
  def: FieldDef,
  parentId: string,
  language: string,
): Promise<void> {
  // Auto-generate __Short description from the first sentence of the full help text.
  const firstSentence = def.help.split(". ")[0];
  const shortHelp =
    firstSentence.length > 100
      ? firstSentence.substring(0, 97) + "..."
      : firstSentence.endsWith(".")
        ? firstSentence
        : firstSentence + ".";

  try {
    const result = await client.mutate("xmc.authoring.graphql", {
      params: {
        body: {
          query: CREATE_FIELD_MUTATION,
          variables: {
            name: def.name,
            parent: parentId,
            language,
            type: def.type,
            title: def.title,
            shortHelp,
            help: def.help,
            source: def.source ?? "",
          },
        },
        query: { sitecoreContextId: contextId },
      },
    });
    const data = (result as unknown as { data?: { data?: { createItem?: { item?: { itemId?: string } } }; errors?: unknown[] } }).data;
    if (data?.errors?.length) {
      console.warn(`[content-intelligence] field "${def.name}" creation returned errors:`, data.errors);
    }
  } catch (err) {
    // Non-fatal — field may already exist; settings reads by name so missing fields return defaults
    console.warn(`[content-intelligence] field "${def.name}" creation threw:`, err);
  }
}

async function getOrCreateItem(
  client: Client,
  contextId: string,
  path: string,
  name: string,
  templateId: string,
  parentId: string,
  language: string,
  extraFields?: Array<{ name: string; value: string }>,
): Promise<string | null> {
  const existing = await gqlQuery(client, contextId, GET_ITEM_BY_PATH_QUERY, { path, language });
  if (existing?.item?.itemId) return existing.item.itemId;
  return gqlCreate(client, contextId, name, templateId, parentId, language, extraFields);
}

// ─── Field definitions ────────────────────────────────────────────────────────

const SETTINGS_FIELDS: FieldDef[] = [
  {
    name: "EnableAIAnalysis",
    type: "Checkbox",
    title: "Enable AI Analysis",
    help: "When checked, the module performs AI-powered semantic analysis on page fields. Uncheck to run rules-only checks without calling an external AI provider.",
  },
  {
    name: "AIVendor",
    type: "Droplink",
    title: "AI Vendor",
    help: "Select the AI provider to use for analysis. The selected vendor item must have a valid API key stored in its APIKey field.",
    source: `${VENDORS_PATH}`,
  },
  {
    name: "PreferredTone",
    type: "Droplist",
    title: "Preferred Tone",
    help: "The writing register the AI should target when suggesting content. Formal = professional; Conversational = friendly; Technical = precise jargon.",
    source: TONES_PATH,
  },
  {
    name: "ReadingLevel",
    type: "Droplist",
    title: "Reading Level",
    help: "Target Flesch-Kincaid grade level for body copy. AI flags suggestions that exceed or fall below this level.",
    source: READING_LEVELS_PATH,
  },
  {
    name: "ContentVibe",
    type: "Multi-Line Text",
    title: "Content Vibe",
    help: "Free-text instruction that sets the overall site personality for AI suggestions. Example: 'Catered for a Gen-Z demographic interested in fashion and sustainability.' All AI-generated suggestions will align with this vibe.",
  },
  {
    name: "BannedPhrases",
    type: "Multi-Line Text",
    title: "Banned Phrases",
    help: "One phrase per line. The AI will flag content that contains any of these phrases as a governance finding.",
  },
  {
    name: "RequiredSchemaTypes",
    type: "Multi-Line Text",
    title: "Required Schema Types",
    help: "One Schema.org type per line (e.g. Article, BreadcrumbList). The AI will suggest adding missing structured-data markup for these types.",
  },
  {
    name: "MetaDescMinChars",
    type: "Integer",
    title: "Meta Description Min (chars)",
    help: "Minimum character count for the meta description field. Pages below this threshold receive an SEO warning.",
  },
  {
    name: "MetaDescMaxChars",
    type: "Integer",
    title: "Meta Description Max (chars)",
    help: "Maximum character count for the meta description field. Pages above this threshold risk truncation in search result snippets.",
  },
  {
    name: "TitleMinChars",
    type: "Integer",
    title: "Title Min (chars)",
    help: "Minimum character count for the page title. Very short titles may lack keyword relevance.",
  },
  {
    name: "TitleMaxChars",
    type: "Integer",
    title: "Title Max (chars)",
    help: "Maximum character count for the page title. Titles exceeding this are typically truncated by search engines.",
  },
  {
    name: "BodyMinWords",
    type: "Integer",
    title: "Body Min Words",
    help: "Minimum word count for the main body copy field. Pages below this threshold receive a completeness warning.",
  },
  {
    name: "PassiveVoiceThreshold",
    type: "Integer",
    title: "Passive Voice Threshold (%)",
    help: "Maximum acceptable percentage of passive-voice sentences in body copy. Exceeding this triggers a readability warning.",
  },
  {
    name: "WeightAccessibility",
    type: "Integer",
    title: "Weight: Accessibility",
    help: "Scoring weight (0–100) for the Accessibility category. All five weights must sum to exactly 100.",
  },
  {
    name: "WeightSEO",
    type: "Integer",
    title: "Weight: SEO",
    help: "Scoring weight (0–100) for the SEO category. All five weights must sum to exactly 100.",
  },
  {
    name: "WeightReadability",
    type: "Integer",
    title: "Weight: Readability",
    help: "Scoring weight (0–100) for the Readability category. All five weights must sum to exactly 100.",
  },
  {
    name: "WeightCompleteness",
    type: "Integer",
    title: "Weight: Completeness",
    help: "Scoring weight (0–100) for the Completeness category. All five weights must sum to exactly 100.",
  },
  {
    name: "WeightGovernance",
    type: "Integer",
    title: "Weight: Governance",
    help: "Scoring weight (0–100) for the Governance category. All five weights must sum to exactly 100.",
  },
  {
    name: "AccessibilityThreshold",
    type: "Droplist",
    title: "Accessibility Threshold",
    help: "WCAG conformance level to enforce. AA is the legal baseline in most jurisdictions; AAA applies stricter criteria.",
    source: A11Y_LEVELS_PATH,
  },
  {
    name: "SEOExpectationsByPageType",
    type: "Multi-Line Text",
    title: "SEO Expectations by Page Type",
    help: 'JSON object mapping template names to per-type SEO overrides. Example: {"Article Page": {"titleMin": 20, "metaDescMax": 160}}. Keys must match the templateName value from page data.',
  },
  {
    name: "LocalizationRules",
    type: "Multi-Line Text",
    title: "Localization Rules",
    help: 'JSON object mapping language codes to rule overrides. Example: {"fr-FR": {"bodyMinWords": 80}}. Overrides apply only when the page language matches the key.',
  },
];

const VENDOR_FIELDS: FieldDef[] = [
  {
    name: "VendorName",
    type: "Single-Line Text",
    title: "Vendor Name",
    help: "Machine-readable vendor identifier. Must be exactly 'anthropic' or 'openai'. Used by the app to resolve the correct API client.",
  },
  {
    name: "APIKey",
    type: "Single-Line Text",
    title: "API Key",
    help: "The API key for this vendor. Stored in plain text — ensure this item's security settings restrict read access to trusted roles only. Can be entered directly in the Settings Panel.",
  },
  {
    name: "ModelName",
    type: "Single-Line Text",
    title: "Model Name",
    help: "The specific model to use for analysis. Examples: claude-sonnet-4-6 (Anthropic) or gpt-4o (OpenAI). Leave blank to use the default model for the vendor.",
  },
];

const CONFIG_OPTION_FIELDS: FieldDef[] = [
  {
    name: "DisplayText",
    type: "Single-Line Text",
    title: "Display Text",
    help: "Human-readable label shown in the Content Editor and tooltips. The item name is the actual stored value used by the application.",
  },
];

// ─── __Standard Values defaults ───────────────────────────────────────────────

const SETTINGS_STANDARD_VALUES: Record<string, string> = {
  EnableAIAnalysis:     "1",
  PreferredTone:        "formal",
  ReadingLevel:         "college",
  MetaDescMinChars:     "70",
  MetaDescMaxChars:     "165",
  TitleMinChars:        "10",
  TitleMaxChars:        "70",
  BodyMinWords:         "100",
  PassiveVoiceThreshold: "40",
  WeightAccessibility:  "30",
  WeightSEO:            "25",
  WeightReadability:    "20",
  WeightCompleteness:   "15",
  WeightGovernance:     "10",
  AccessibilityThreshold: "AA",
};

const VENDOR_ANTHROPIC_STANDARD_VALUES: Record<string, string> = {
  VendorName: "anthropic",
  ModelName:  "claude-sonnet-4-6",
};

const VENDOR_OPENAI_STANDARD_VALUES: Record<string, string> = {
  VendorName: "openai",
  ModelName:  "gpt-4o",
};

type TemplateIds = {
  settingsTemplateId: string;
  vendorTemplateId: string;
  configOptionTemplateId: string;
};

/**
 * Creates (or finds) the three custom templates under /sitecore/templates/modules/.
 * Templates are stored as ordinary Sitecore items, so this requires no SCS package —
 * everything is bootstrapped via the authoring GraphQL API.
 */
async function createOrGetTemplates(
  client: Client,
  contextId: string,
  language: string,
): Promise<TemplateIds | null> {
  // Fast path — all templates already exist from a previous init
  const [settingsData, vendorData, configOptionData] = await Promise.all([
    gqlQuery(client, contextId, GET_ITEM_BY_PATH_QUERY, { path: SETTINGS_TEMPLATE_PATH, language }),
    gqlQuery(client, contextId, GET_ITEM_BY_PATH_QUERY, { path: VENDOR_TEMPLATE_PATH, language }),
    gqlQuery(client, contextId, GET_ITEM_BY_PATH_QUERY, { path: CONFIG_OPTION_TEMPLATE_PATH, language }),
  ]);
  if (settingsData?.item?.itemId && vendorData?.item?.itemId && configOptionData?.item?.itemId) {
    return {
      settingsTemplateId: settingsData.item.itemId,
      vendorTemplateId: vendorData.item.itemId,
      configOptionTemplateId: configOptionData.item.itemId,
    };
  }

  // Locate /sitecore/templates root
  const tplRoot = await gqlQuery(client, contextId, GET_ITEM_BY_PATH_QUERY, { path: "/sitecore/templates", language });
  if (!tplRoot?.item?.itemId) return null;

  // Create /sitecore/templates/modules if needed
  const modulesTplId = await getOrCreateItem(
    client, contextId, "/sitecore/templates/modules", "modules",
    FOLDER_TEMPLATE_ID, tplRoot.item.itemId, language,
  );
  if (!modulesTplId) return null;

  // Create AI Content Intelligence folder under modules templates
  const tplFolderId = await getOrCreateItem(
    client, contextId, TEMPLATES_FOLDER_PATH, "AI Content Intelligence",
    FOLDER_TEMPLATE_ID, modulesTplId, language,
  );
  if (!tplFolderId) return null;

  // ── Global Settings template ────────────────────────────────────────────────
  const settingsTemplateId = settingsData?.item?.itemId ?? await gqlCreate(
    client, contextId, "AI CI Global Settings", TEMPLATE_TEMPLATE_ID, tplFolderId, language,
    [{ name: "__Icon", value: "Apps/32x32/Options.png" }],
  );
  if (!settingsTemplateId) return null;

  const settingsSectionId = await gqlCreate(
    client, contextId, "Settings", SECTION_TEMPLATE_ID, settingsTemplateId, language,
  );
  if (settingsSectionId) {
    for (const def of SETTINGS_FIELDS) {
      await gqlCreateField(client, contextId, def, settingsSectionId, language);
    }
    // Create __Standard Values (child of template, using template's own ID)
    const stdValId = await gqlCreate(
      client, contextId, "__Standard Values", settingsTemplateId, settingsTemplateId, language,
      Object.entries(SETTINGS_STANDARD_VALUES).map(([name, value]) => ({ name, value })),
    );
    // Link the newly created item to the template via its __Standard values field
    if (stdValId) {
      await gqlUpdateByName(client, contextId, settingsTemplateId, language, [
        { name: "__Standard values", value: stdValId },
      ]);
    }
  }

  // ── Vendor template ─────────────────────────────────────────────────────────
  const vendorTemplateId = vendorData?.item?.itemId ?? await gqlCreate(
    client, contextId, "AI CI Vendor", TEMPLATE_TEMPLATE_ID, tplFolderId, language,
    [{ name: "__Icon", value: "Office/32x32/robot.png" }],
  );
  if (!vendorTemplateId) return null;

  const vendorSectionId = await gqlCreate(
    client, contextId, "Vendor", SECTION_TEMPLATE_ID, vendorTemplateId, language,
  );
  if (vendorSectionId) {
    for (const def of VENDOR_FIELDS) {
      await gqlCreateField(client, contextId, def, vendorSectionId, language);
    }
  }

  // ── Config Option template (shared by Tones, Reading Levels, Accessibility Levels) ──
  const configOptionTemplateId = configOptionData?.item?.itemId ?? await gqlCreate(
    client, contextId, "AI CI Config Option", TEMPLATE_TEMPLATE_ID, tplFolderId, language,
    [{ name: "__Icon", value: "Office/32x32/tag.png" }],
  );
  if (!configOptionTemplateId) return null;

  const configOptionSectionId = await gqlCreate(
    client, contextId, "Option", SECTION_TEMPLATE_ID, configOptionTemplateId, language,
  );
  if (configOptionSectionId) {
    for (const def of CONFIG_OPTION_FIELDS) {
      await gqlCreateField(client, contextId, def, configOptionSectionId, language);
    }
  }

  return { settingsTemplateId, vendorTemplateId, configOptionTemplateId };
}

export interface InitializeResult {
  success: boolean;
  settingsItemId: string | null;
  vendorItemIds: { anthropic: string | null; openai: string | null };
  error?: string;
}

export async function initializeSettings(
  client: Client,
  contextId: string,
  language = "en",
): Promise<InitializeResult> {
  const result: InitializeResult = {
    success: false,
    settingsItemId: null,
    vendorItemIds: { anthropic: null, openai: null },
  };

  try {
    // Step 1: Bootstrap templates via GQL (no SCS package required)
    const templates = await createOrGetTemplates(client, contextId, language);
    if (!templates) {
      result.error = "Could not create templates under /sitecore/templates/modules/. Check content authoring permissions.";
      return result;
    }

    // Step 2: Get /sitecore/system/modules parent
    const modulesData = await gqlQuery(client, contextId, GET_ITEM_BY_PATH_QUERY, {
      path: "/sitecore/system/modules",
      language,
    });
    const modulesId = modulesData?.item?.itemId;
    if (!modulesId) {
      result.error = "Could not find /sitecore/system/modules. Check content permissions.";
      return result;
    }

    // Step 3: Create module root folder (idempotent)
    const rootId = await getOrCreateItem(
      client, contextId, MODULE_ROOT, "AI Content Intelligence",
      FOLDER_TEMPLATE_ID, modulesId, language,
    );
    if (!rootId) {
      result.error = "Failed to create AI Content Intelligence folder.";
      return result;
    }

    // Step 4: Create Global Settings item using the dynamically-created template
    result.settingsItemId = await getOrCreateItem(
      client, contextId, GLOBAL_SETTINGS_PATH, "Global Settings",
      templates.settingsTemplateId, rootId, language,
    );

    // Step 5: Create Vendors folder + vendor items (with VendorName/ModelName defaults)
    const vendorsId = await getOrCreateItem(
      client, contextId, VENDORS_PATH, "Vendors",
      FOLDER_TEMPLATE_ID, rootId, language,
    );
    if (vendorsId) {
      result.vendorItemIds.anthropic = await getOrCreateItem(
        client, contextId, ANTHROPIC_PATH, "Anthropic",
        templates.vendorTemplateId, vendorsId, language,
        Object.entries(VENDOR_ANTHROPIC_STANDARD_VALUES).map(([name, value]) => ({ name, value })),
      );
      result.vendorItemIds.openai = await getOrCreateItem(
        client, contextId, OPENAI_PATH, "OpenAI",
        templates.vendorTemplateId, vendorsId, language,
        Object.entries(VENDOR_OPENAI_STANDARD_VALUES).map(([name, value]) => ({ name, value })),
      );
    }

    // Step 6: Create Config folder + Droplist option items (using AI CI Config Option template)
    const configId = await getOrCreateItem(
      client, contextId, CONFIG_PATH, "Config",
      FOLDER_TEMPLATE_ID, rootId, language,
    );
    if (configId) {
      const optTplId = templates.configOptionTemplateId;
      // Tones
      const tonesId = await getOrCreateItem(
        client, contextId, TONES_PATH, "Tones",
        FOLDER_TEMPLATE_ID, configId, language,
      );
      if (tonesId) {
        for (const { name, displayText } of [
          { name: "formal",         displayText: "Formal" },
          { name: "conversational", displayText: "Conversational" },
          { name: "technical",      displayText: "Technical" },
        ]) {
          await getOrCreateItem(client, contextId, `${TONES_PATH}/${name}`, name,
            optTplId, tonesId, language, [{ name: "DisplayText", value: displayText }]);
        }
      }
      // Reading Levels
      const readingId = await getOrCreateItem(
        client, contextId, READING_LEVELS_PATH, "Reading Levels",
        FOLDER_TEMPLATE_ID, configId, language,
      );
      if (readingId) {
        for (const { name, displayText } of [
          { name: "elementary",  displayText: "Elementary (grades 3-5)" },
          { name: "high-school", displayText: "High School (grades 8-10)" },
          { name: "college",     displayText: "College (grades 12-14)" },
          { name: "expert",      displayText: "Expert / Professional" },
        ]) {
          await getOrCreateItem(client, contextId, `${READING_LEVELS_PATH}/${name}`, name,
            optTplId, readingId, language, [{ name: "DisplayText", value: displayText }]);
        }
      }
      // Accessibility Levels
      const a11yId = await getOrCreateItem(
        client, contextId, A11Y_LEVELS_PATH, "Accessibility Levels",
        FOLDER_TEMPLATE_ID, configId, language,
      );
      if (a11yId) {
        for (const { name, displayText } of [
          { name: "AA",  displayText: "WCAG 2.2 AA (Standard)" },
          { name: "AAA", displayText: "WCAG 2.2 AAA (Enhanced)" },
        ]) {
          await getOrCreateItem(client, contextId, `${A11Y_LEVELS_PATH}/${name}`, name,
            optTplId, a11yId, language, [{ name: "DisplayText", value: displayText }]);
        }
      }
    }

    result.success = !!result.settingsItemId;
    return result;
  } catch (err) {
    result.error = err instanceof Error ? err.message : "Initialization failed";
    return result;
  }
}

// ─── saveSettingsFields ───────────────────────────────────────────────────────

/**
 * Saves settings field values back to the Sitecore Global Settings item
 * using the authoring GQL updateItem mutation (not xmc.pages.saveFields,
 * which requires a site context and only works for page content items).
 */
export async function saveSettingsFields(
  client: Client,
  itemId: string,
  contextId: string,
  fieldValues: Record<string, string>,
): Promise<void> {
  const fields = Object.entries(fieldValues).map(([name, value]) => ({ name, value }));
  if (fields.length === 0) return;
  const ok = await gqlUpdateByName(client, contextId, itemId, "en", fields);
  if (!ok) {
    throw new Error("Failed to save settings. Check content authoring permissions.");
  }
}
