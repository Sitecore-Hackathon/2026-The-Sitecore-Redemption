"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { CheckCircle2, Loader2, Settings } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  checkInitialized,
  DEFAULT_SETTINGS,
  fetchSettings,
  fetchVendorConfig,
  fetchVendorItems,
  initializeSettings,
  MODULE_ROOT_PATH,
  normalizeGuid,
  saveSettingsFields,
  saveVendorFields,
} from "@/lib/content-intelligence/settings";
import type { VendorConfig, VendorItem } from "@/lib/content-intelligence/settings";
import type { ContentIntelligenceSettings } from "@/lib/content-intelligence/types";
import { useMarketplaceClient } from "@/components/providers/marketplace";

// ─── Types ────────────────────────────────────────────────────────────────────

type InitState =
  | "checking"
  | "uninitialized"
  | "initializing"
  | "ready"
  | "error";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function FieldRow({
  children,
  label,
  hint,
}: {
  children: React.ReactNode;
  label: string;
  hint?: string;
}) {
  return (
    <div className="space-y-0.5">
      <div className="mb-1">
        <span className="text-xs font-medium text-foreground">{label}</span>
        {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

const SELECT_CLS =
  "w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary";
const INPUT_CLS =
  "w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary";
const TEXTAREA_CLS =
  "w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs font-mono resize-none focus:outline-none focus:ring-1 focus:ring-primary";

// ─── Component ────────────────────────────────────────────────────────────────

export interface SettingsPanelProps {
  contextId: string;
  onSettingsSaved: (settings: ContentIntelligenceSettings, vendorConfig: VendorConfig | null) => void;
}

export function SettingsPanel({ contextId, onSettingsSaved }: SettingsPanelProps) {
  const client = useMarketplaceClient();

  const [initState, setInitState] = useState<InitState>("checking");
  const [form, setForm] = useState<ContentIntelligenceSettings>(DEFAULT_SETTINGS);

  // Vendor items fetched from Sitecore after init
  const [vendorItems, setVendorItems] = useState<VendorItem[]>([]);
  // Inline vendor credential fields (keyed by vendorItem.itemId)
  const [vendorApiKey, setVendorApiKey] = useState<string>("");
  const [vendorModelName, setVendorModelName] = useState<string>("");

  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [initError, setInitError] = useState<string | null>(null);

  // Populate inline vendor credential fields when the selected vendor changes
  function syncVendorFields(selectedItemId: string | null, items: VendorItem[]) {
    const normalised = selectedItemId?.toUpperCase() ?? null;
    const found = items.find((v) => v.itemId.toUpperCase() === normalised);
    setVendorApiKey(found?.apiKey ?? "");
    setVendorModelName(found?.modelName ?? "");
  }

  const loadSettings = useCallback(async () => {
    if (!contextId) return;
    setInitState("checking");
    try {
      const itemId = await checkInitialized(client, contextId);
      if (!itemId) {
        setInitState("uninitialized");
        return;
      }
      const [loaded, vendors] = await Promise.all([
        fetchSettings(client, contextId),
        fetchVendorItems(client, contextId),
      ]);
      setForm(loaded);
      setVendorItems(vendors);
      syncVendorFields(loaded.vendorItemId, vendors);
      setInitState("ready");
    } catch {
      setInitState("error");
    }
  }, [client, contextId]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleInitialize = useCallback(async () => {
    setInitState("initializing");
    setInitError(null);
    try {
      const result = await initializeSettings(client, contextId);
      if (result.success) {
        const [loaded, vendors] = await Promise.all([
          fetchSettings(client, contextId),
          fetchVendorItems(client, contextId),
        ]);
        setForm(loaded);
        setVendorItems(vendors);
        syncVendorFields(loaded.vendorItemId, vendors);
        setInitState("ready");
      } else {
        setInitError(result.error ?? "Initialization failed. Check content authoring permissions.");
        setInitState("uninitialized");
      }
    } catch (err) {
      setInitError(err instanceof Error ? err.message : "Initialization failed");
      setInitState("uninitialized");
    }
  }, [client, contextId]);

  const handleVendorChange = useCallback((itemId: string) => {
    setForm((f) => ({ ...f, vendorItemId: itemId || null }));
    syncVendorFields(itemId || null, vendorItems);
  }, [vendorItems]);

  const handleSave = useCallback(async () => {
    if (!form.settingsItemId) return;
    setSaving(true);
    setSaveStatus("idle");
    setSaveError(null);
    try {
      // Save Global Settings
      const fieldValues: Record<string, string> = {
        EnableAIAnalysis: form.enableAIAnalysis ? "1" : "0",
        // Droplink requires {UPPERCASE-GUID} — normalise regardless of what GQL returned
        AIVendor: form.vendorItemId ? normalizeGuid(form.vendorItemId) : "",
        PreferredTone: form.preferredTone,
        ReadingLevel: form.readingLevel,
        ContentVibe: form.contentVibe ?? "",
        BannedPhrases: form.bannedPhrases.join("\n"),
        RequiredSchemaTypes: form.requiredSchemaTypes.join("\n"),
        MetaDescMinChars: String(form.metaDescMinChars),
        MetaDescMaxChars: String(form.metaDescMaxChars),
        TitleMinChars: String(form.titleMinChars),
        TitleMaxChars: String(form.titleMaxChars),
        BodyMinWords: String(form.bodyMinWords),
        PassiveVoiceThreshold: String(form.passiveVoiceThreshold),
        WeightAccessibility: String(form.categoryWeights.accessibility),
        WeightSEO: String(form.categoryWeights.seo),
        WeightReadability: String(form.categoryWeights.readability),
        WeightCompleteness: String(form.categoryWeights.completeness),
        WeightGovernance: String(form.categoryWeights.governance),
        AccessibilityThreshold: form.accessibilityThreshold,
      };
      await saveSettingsFields(client, form.settingsItemId, contextId, fieldValues);

      // Save vendor credentials if a vendor is selected
      if (form.vendorItemId) {
        await saveVendorFields(client, form.vendorItemId, contextId, vendorApiKey, vendorModelName);
        // Refresh vendor items so inline fields reflect saved values
        const updatedVendors = await fetchVendorItems(client, contextId);
        setVendorItems(updatedVendors);
      }

      setSaveStatus("success");
      const updated = await fetchSettings(client, contextId);
      setForm(updated);

      // Build vendor config from in-memory form state so the just-saved API key is
      // immediately available for AI calls — avoids a cache miss when re-reading from
      // Sitecore immediately after writing.
      let vendorConfig: VendorConfig | null = null;
      if (form.vendorItemId && vendorApiKey) {
        const selectedVendor = vendorItems.find((v) => v.itemId === form.vendorItemId);
        if (selectedVendor) {
          vendorConfig = {
            vendor: selectedVendor.vendor,
            apiKey: vendorApiKey,
            model: vendorModelName || (selectedVendor.vendor === "anthropic" ? "claude-sonnet-4-6" : "gpt-4o"),
            itemId: form.vendorItemId,
          };
        }
      }
      // Fall back to fetching from Sitecore if we can't construct it from form state
      if (!vendorConfig) {
        vendorConfig = await fetchVendorConfig(client, contextId, updated.aiVendor);
      }
      onSettingsSaved(updated, vendorConfig);
    } catch (err) {
      setSaveStatus("error");
      setSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [client, contextId, form, vendorApiKey, vendorModelName, onSettingsSaved]);

  const weightSum =
    form.categoryWeights.accessibility +
    form.categoryWeights.seo +
    form.categoryWeights.readability +
    form.categoryWeights.completeness +
    form.categoryWeights.governance;

  const isFormDisabled =
    initState === "uninitialized" || initState === "initializing" || !form.settingsItemId;

  // ─── Loading state ───────────────────────────────────────────────────────────

  if (initState === "checking") {
    return (
      <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        Checking configuration…
      </div>
    );
  }

  if (initState === "error") {
    return (
      <Alert variant="danger">
        <AlertTitle>Configuration error</AlertTitle>
        <AlertDescription>Could not load settings. Check permissions and try again.</AlertDescription>
      </Alert>
    );
  }

  // Selected vendor item (for inline credential display)
  const selectedVendorItem = vendorItems.find(
    (v) => v.itemId.toUpperCase() === (form.vendorItemId?.toUpperCase() ?? ""),
  );

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Uninitialized banner */}
      {(initState === "uninitialized" || initState === "initializing") && (
        <Alert variant="warning">
          <Settings className="h-4 w-4" />
          <AlertTitle>Setup required</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>
              The AI Content Intelligence module has not been set up in this Sitecore environment.
              Click &ldquo;Initialize&rdquo; to automatically create the required templates and
              configuration items under{" "}
              <code className="text-xs font-mono">{MODULE_ROOT_PATH}</code>.
            </p>
            {initError && (
              <p className="text-xs text-danger-fg">{initError}</p>
            )}
            <Button
              size="sm"
              colorScheme="primary"
              onClick={handleInitialize}
              disabled={initState === "initializing"}
            >
              {initState === "initializing" ? (
                <>
                  <Loader2 className="!w-3.5 !h-3.5 animate-spin" />
                  Initializing…
                </>
              ) : (
                "Initialize Settings"
              )}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Save feedback */}
      {saveStatus === "success" && (
        <Alert variant="success">
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>Settings saved</AlertTitle>
        </Alert>
      )}
      {saveStatus === "error" && saveError && (
        <Alert variant="danger">
          <AlertTitle>Save failed</AlertTitle>
          <AlertDescription>{saveError}</AlertDescription>
        </Alert>
      )}

      {/* Settings form */}
      <fieldset disabled={isFormDisabled} className="space-y-5 disabled:opacity-50 disabled:pointer-events-none">

        {/* AI Configuration */}
        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            AI Configuration
          </h3>

          <FieldRow label="Enable AI Analysis">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.enableAIAnalysis}
                onChange={(e) => setForm((f) => ({ ...f, enableAIAnalysis: e.target.checked }))}
                className="h-4 w-4 rounded border-border accent-primary"
              />
              <span className="text-xs text-muted-foreground">
                Run AI-powered semantic analysis on each page
              </span>
            </label>
          </FieldRow>

          <FieldRow label="AI Vendor" hint="Select which AI provider to use for analysis">
            <select
              value={form.vendorItemId ?? ""}
              onChange={(e) => handleVendorChange(e.target.value)}
              className={SELECT_CLS}
            >
              <option value="">— Select vendor —</option>
              {vendorItems.map((v) => (
                <option key={v.itemId} value={v.itemId}>
                  {v.vendor === "anthropic" ? "Anthropic (Claude)" : "OpenAI (GPT)"}
                </option>
              ))}
            </select>
          </FieldRow>

          {/* Inline vendor credentials — shown when a vendor is selected */}
          {selectedVendorItem && (
            <div className="ml-3 pl-3 border-l-2 border-border space-y-3">
              <FieldRow
                label="API Key"
                hint={`${selectedVendorItem.vendor === "anthropic" ? "Anthropic" : "OpenAI"} API key — stored in Sitecore`}
              >
                <input
                  type="password"
                  value={vendorApiKey}
                  onChange={(e) => setVendorApiKey(e.target.value)}
                  placeholder={selectedVendorItem.vendor === "anthropic" ? "sk-ant-…" : "sk-…"}
                  className={INPUT_CLS}
                  autoComplete="off"
                />
              </FieldRow>
              <FieldRow
                label="Model Name"
                hint="Leave blank to use the default model for this vendor"
              >
                <input
                  type="text"
                  value={vendorModelName}
                  onChange={(e) => setVendorModelName(e.target.value)}
                  placeholder={selectedVendorItem.vendor === "anthropic" ? "claude-sonnet-4-6" : "gpt-4o"}
                  className={INPUT_CLS}
                />
              </FieldRow>
            </div>
          )}
        </section>

        <Separator />

        {/* Editorial Style */}
        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Editorial Style
          </h3>

          <FieldRow label="Preferred Tone">
            <select
              value={form.preferredTone}
              onChange={(e) => setForm((f) => ({ ...f, preferredTone: e.target.value }))}
              className={SELECT_CLS}
            >
              <option value="formal">Formal</option>
              <option value="conversational">Conversational</option>
              <option value="technical">Technical</option>
            </select>
          </FieldRow>

          <FieldRow label="Reading Level">
            <select
              value={form.readingLevel}
              onChange={(e) => setForm((f) => ({ ...f, readingLevel: e.target.value }))}
              className={SELECT_CLS}
            >
              <option value="elementary">Elementary (grades 3–5)</option>
              <option value="high-school">High school (grades 8–10)</option>
              <option value="college">College (grades 12–14)</option>
              <option value="expert">Expert / Professional</option>
            </select>
          </FieldRow>

          <FieldRow
            label="Content Vibe"
            hint="Free-text instruction for the AI's overall tone and demographic target"
          >
            <textarea
              value={form.contentVibe ?? ""}
              onChange={(e) =>
                setForm((f) => ({ ...f, contentVibe: e.target.value || undefined }))
              }
              rows={3}
              placeholder="e.g. This site is catered for a Gen-Z demographic interested in fashion and sustainability."
              className={TEXTAREA_CLS}
            />
          </FieldRow>

          <FieldRow
            label="Banned Phrases"
            hint="One phrase per line — AI will flag these if found in content"
          >
            <textarea
              value={form.bannedPhrases.join("\n")}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  bannedPhrases: e.target.value
                    .split("\n")
                    .map((s) => s.trim())
                    .filter(Boolean),
                }))
              }
              rows={3}
              placeholder={"lorem ipsum\nsynergy\nclick here"}
              className={TEXTAREA_CLS}
            />
          </FieldRow>

          <FieldRow
            label="Required Schema Types"
            hint="One type per line — AI will suggest adding missing structured data"
          >
            <textarea
              value={form.requiredSchemaTypes.join("\n")}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  requiredSchemaTypes: e.target.value
                    .split("\n")
                    .map((s) => s.trim())
                    .filter(Boolean),
                }))
              }
              rows={2}
              placeholder={"Article\nBreadcrumb"}
              className={TEXTAREA_CLS}
            />
          </FieldRow>
        </section>

        <Separator />

        {/* SEO Thresholds */}
        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            SEO Thresholds
          </h3>

          <div className="grid grid-cols-2 gap-3">
            <FieldRow label="Meta Desc Min (chars)">
              <input
                type="number"
                value={form.metaDescMinChars}
                onChange={(e) => setForm((f) => ({ ...f, metaDescMinChars: Number(e.target.value) }))}
                className={INPUT_CLS}
                min={0}
              />
            </FieldRow>
            <FieldRow label="Meta Desc Max (chars)">
              <input
                type="number"
                value={form.metaDescMaxChars}
                onChange={(e) => setForm((f) => ({ ...f, metaDescMaxChars: Number(e.target.value) }))}
                className={INPUT_CLS}
                min={0}
              />
            </FieldRow>
            <FieldRow label="Title Min (chars)">
              <input
                type="number"
                value={form.titleMinChars}
                onChange={(e) => setForm((f) => ({ ...f, titleMinChars: Number(e.target.value) }))}
                className={INPUT_CLS}
                min={0}
              />
            </FieldRow>
            <FieldRow label="Title Max (chars)">
              <input
                type="number"
                value={form.titleMaxChars}
                onChange={(e) => setForm((f) => ({ ...f, titleMaxChars: Number(e.target.value) }))}
                className={INPUT_CLS}
                min={0}
              />
            </FieldRow>
          </div>

          <FieldRow label="Min Body Words">
            <input
              type="number"
              value={form.bodyMinWords}
              onChange={(e) => setForm((f) => ({ ...f, bodyMinWords: Number(e.target.value) }))}
              className={INPUT_CLS}
              min={0}
            />
          </FieldRow>
        </section>

        <Separator />

        {/* Category Weights */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Category Weights
            </h3>
            <Badge colorScheme={weightSum === 100 ? "success" : "danger"} size="sm">
              Sum: {weightSum}{weightSum === 100 ? " ✓" : " (must = 100)"}
            </Badge>
          </div>
          {(
            [
              { key: "accessibility", label: "Accessibility" },
              { key: "seo", label: "SEO" },
              { key: "readability", label: "Readability" },
              { key: "completeness", label: "Completeness" },
              { key: "governance", label: "Governance" },
            ] as const
          ).map(({ key, label }) => (
            <FieldRow key={key} label={label}>
              <input
                type="number"
                value={form.categoryWeights[key]}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    categoryWeights: { ...f.categoryWeights, [key]: Number(e.target.value) },
                  }))
                }
                className={INPUT_CLS}
                min={0}
                max={100}
              />
            </FieldRow>
          ))}
        </section>

        <Separator />

        {/* Advanced */}
        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Advanced
          </h3>

          <FieldRow label="Accessibility Threshold">
            <select
              value={form.accessibilityThreshold}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  accessibilityThreshold: e.target.value as "AA" | "AAA",
                }))
              }
              className={SELECT_CLS}
            >
              <option value="AA">WCAG 2.2 AA</option>
              <option value="AAA">WCAG 2.2 AAA</option>
            </select>
          </FieldRow>

          <FieldRow
            label="Passive Voice Threshold (%)"
            hint="Flag body text when passive voice exceeds this percentage"
          >
            <input
              type="number"
              value={form.passiveVoiceThreshold}
              onChange={(e) =>
                setForm((f) => ({ ...f, passiveVoiceThreshold: Number(e.target.value) }))
              }
              className={INPUT_CLS}
              min={0}
              max={100}
            />
          </FieldRow>
        </section>
      </fieldset>

      {/* Save button */}
      <div className="pt-1 space-y-1">
        <Button
          colorScheme="primary"
          size="sm"
          onClick={handleSave}
          disabled={saving || isFormDisabled || weightSum !== 100}
          className="w-full"
        >
          {saving ? (
            <>
              <Loader2 className="!w-3.5 !h-3.5 animate-spin" />
              Saving…
            </>
          ) : (
            "Save Settings"
          )}
        </Button>
        {isFormDisabled && !saving && (
          <p className="text-xs text-muted-foreground text-center">
            Initialize the module first to enable settings.
          </p>
        )}
        {weightSum !== 100 && !isFormDisabled && (
          <p className="text-xs text-danger-fg text-center">
            Category weights must sum to 100 before saving.
          </p>
        )}
      </div>
    </div>
  );
}
