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

const GET_FIELD_IDS_QUERY = `
  query GetFieldIds($itemId: ID!, $language: String!) {
    item(where: { itemId: $itemId, language: $language }) {
      fields {
        nodes {
          fieldId
          name
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

function parsePipeList(nodes: GqlField[], name: string): string[] {
  const v = getField(nodes, name);
  return v ? v.split("|").map((s) => s.trim()).filter(Boolean) : [];
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

// ─── GQL executor ─────────────────────────────────────────────────────────────

type Client = ReturnType<typeof useMarketplaceClient>;

async function gqlQuery(
  client: Client,
  contextId: string,
  query: string,
  variables: Record<string, string>,
): Promise<{ item?: { itemId?: string; fields?: { nodes?: GqlField[] } } } | null> {
  try {
    const result = await client.mutate("xmc.authoring.graphql", {
      params: {
        body: { query, variables },
        query: { sitecoreContextId: contextId },
      },
    });
    const gql = (result as unknown as { data?: { data?: { item?: unknown } } }).data;
    return (gql?.data ?? null) as { item?: { itemId?: string; fields?: { nodes?: GqlField[] } } } | null;
  } catch {
    return null;
  }
}

// ─── Field map builder ────────────────────────────────────────────────────────

/** Returns a map of fieldName → fieldId for a given item, used when saving. */
export async function fetchFieldIdMap(
  client: Client,
  itemId: string,
  contextId: string,
  language = "en",
): Promise<Record<string, string>> {
  const data = await gqlQuery(client, contextId, GET_FIELD_IDS_QUERY, { itemId, language });
  const nodes = data?.item?.fields?.nodes ?? [];
  const map: Record<string, string> = {};
  for (const n of nodes) {
    if (n.name && n.fieldId) map[n.name] = n.fieldId;
  }
  return map;
}

// ─── fetchSettings ────────────────────────────────────────────────────────────

function parseGlobalSettings(
  nodes: GqlField[],
  itemId: string,
): ContentIntelligenceSettings {
  const rawVendor = getField(nodes, "AIVendor");
  const aiVendor =
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
    aiVendor,
    preferredTone: getField(nodes, "PreferredTone") || "formal",
    readingLevel: getField(nodes, "ReadingLevel") || "college",
    bannedPhrases: parsePipeList(nodes, "BannedPhrases"),
    requiredSchemaTypes: parsePipeList(nodes, "RequiredSchemaTypes"),
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
    vendorItemId: null,
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

  const settings = parseGlobalSettings(item.fields?.nodes ?? [], item.itemId);
  return settings;
}

// ─── fetchVendorConfig ────────────────────────────────────────────────────────

export interface VendorConfig {
  vendor: "anthropic" | "openai";
  apiKey: string;
  model: string;
  itemId: string;
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
// Template Field items are created via CREATE_SLT_FIELD_MUTATION with Type inlined.

// Where the module's custom templates live in Sitecore
const TEMPLATES_FOLDER_PATH  = "/sitecore/templates/modules/AI Content Intelligence";
const SETTINGS_TEMPLATE_PATH = `${TEMPLATES_FOLDER_PATH}/AI CI Global Settings`;
const VENDOR_TEMPLATE_PATH   = `${TEMPLATES_FOLDER_PATH}/AI CI Vendor`;

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

// Creates a template field item with Type="Single-Line Text" and Shared="1" set inline.
// templateId and field values are hardcoded in the query to avoid complex variable types.
const CREATE_SLT_FIELD_MUTATION = `
  mutation CreateSltField($name: String!, $parent: ID!, $language: String!) {
    createItem(input: {
      name: $name
      templateId: "{455A3E98-A627-4B40-8035-E683A0331AC7}"
      parent: $parent
      language: $language
      fields: [
        { name: "Type", value: "Single-Line Text" }
        { name: "Shared", value: "1" }
      ]
    }) {
      item { itemId }
    }
  }
`;

async function gqlCreate(
  client: Client,
  contextId: string,
  name: string,
  templateId: string,
  parentId: string,
  language: string,
): Promise<string | null> {
  try {
    const result = await client.mutate("xmc.authoring.graphql", {
      params: {
        body: { query: CREATE_ITEM_MUTATION, variables: { name, templateId, parent: parentId, language } },
        query: { sitecoreContextId: contextId },
      },
    });
    const data = (result as unknown as { data?: { data?: { createItem?: { item?: { itemId?: string } } } } }).data?.data;
    return data?.createItem?.item?.itemId ?? null;
  } catch {
    return null;
  }
}

async function gqlCreateSltField(
  client: Client,
  contextId: string,
  name: string,
  parentId: string,
  language: string,
): Promise<void> {
  try {
    await client.mutate("xmc.authoring.graphql", {
      params: {
        body: { query: CREATE_SLT_FIELD_MUTATION, variables: { name, parent: parentId, language } },
        query: { sitecoreContextId: contextId },
      },
    });
  } catch {
    // Non-fatal — field may already exist; settings reads by name so missing fields return defaults
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
): Promise<string | null> {
  const existing = await gqlQuery(client, contextId, GET_ITEM_BY_PATH_QUERY, { path, language });
  if (existing?.item?.itemId) return existing.item.itemId;
  return gqlCreate(client, contextId, name, templateId, parentId, language);
}

/**
 * Creates (or finds) the two custom templates under /sitecore/templates/modules/.
 * Templates are stored as ordinary Sitecore items, so this requires no SCS package —
 * everything is bootstrapped via the authoring GraphQL API.
 */
async function createOrGetTemplates(
  client: Client,
  contextId: string,
  language: string,
): Promise<{ settingsTemplateId: string; vendorTemplateId: string } | null> {
  // Fast path — templates already exist from a previous init
  const [settingsData, vendorData] = await Promise.all([
    gqlQuery(client, contextId, GET_ITEM_BY_PATH_QUERY, { path: SETTINGS_TEMPLATE_PATH, language }),
    gqlQuery(client, contextId, GET_ITEM_BY_PATH_QUERY, { path: VENDOR_TEMPLATE_PATH, language }),
  ]);
  if (settingsData?.item?.itemId && vendorData?.item?.itemId) {
    return { settingsTemplateId: settingsData.item.itemId, vendorTemplateId: vendorData.item.itemId };
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
  );
  if (!settingsTemplateId) return null;

  const settingsSectionId = await gqlCreate(
    client, contextId, "Settings", SECTION_TEMPLATE_ID, settingsTemplateId, language,
  );
  if (settingsSectionId) {
    for (const fieldName of [
      "EnableAIAnalysis", "AIVendor", "PreferredTone", "ReadingLevel",
      "BannedPhrases", "RequiredSchemaTypes",
      "MetaDescMinChars", "MetaDescMaxChars", "TitleMinChars", "TitleMaxChars",
      "BodyMinWords", "PassiveVoiceThreshold",
      "WeightAccessibility", "WeightSEO", "WeightReadability", "WeightCompleteness", "WeightGovernance",
      "AccessibilityThreshold", "SEOExpectationsByPageType", "LocalizationRules",
    ]) {
      await gqlCreateSltField(client, contextId, fieldName, settingsSectionId, language);
    }
  }

  // ── Vendor template ─────────────────────────────────────────────────────────
  const vendorTemplateId = vendorData?.item?.itemId ?? await gqlCreate(
    client, contextId, "AI CI Vendor", TEMPLATE_TEMPLATE_ID, tplFolderId, language,
  );
  if (!vendorTemplateId) return null;

  const vendorSectionId = await gqlCreate(
    client, contextId, "Vendor", SECTION_TEMPLATE_ID, vendorTemplateId, language,
  );
  if (vendorSectionId) {
    for (const fieldName of ["VendorName", "APIKey", "ModelName"]) {
      await gqlCreateSltField(client, contextId, fieldName, vendorSectionId, language);
    }
  }

  return { settingsTemplateId, vendorTemplateId };
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

    // Step 5: Create Vendors folder + vendor items
    const vendorsId = await getOrCreateItem(
      client, contextId, VENDORS_PATH, "Vendors",
      FOLDER_TEMPLATE_ID, rootId, language,
    );
    if (vendorsId) {
      result.vendorItemIds.anthropic = await getOrCreateItem(
        client, contextId, ANTHROPIC_PATH, "Anthropic",
        templates.vendorTemplateId, vendorsId, language,
      );
      result.vendorItemIds.openai = await getOrCreateItem(
        client, contextId, OPENAI_PATH, "OpenAI",
        templates.vendorTemplateId, vendorsId, language,
      );
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
 * Saves settings field values back to the Sitecore item using field IDs.
 * Requires fetchFieldIdMap to have been called first to populate the ID map.
 */
export async function saveSettingsFields(
  client: Client,
  itemId: string,
  contextId: string,
  fieldIdMap: Record<string, string>,
  fieldValues: Record<string, string>,
): Promise<void> {
  const fields = Object.entries(fieldValues)
    .filter(([name]) => fieldIdMap[name])
    .map(([name, value]) => ({ id: fieldIdMap[name], value, originalValue: "" }));

  if (fields.length === 0) {
    throw new Error("No matching field IDs found. Ensure the module templates are deployed.");
  }

  await client.mutate("xmc.pages.saveFields", {
    params: {
      path: { pageId: itemId },
      body: { fields, language: "en", site: "", revision: "", pageVersion: 1 },
      query: { sitecoreContextId: contextId },
    },
  });
}
