"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CategoryBars,
  ScoreRing,
} from "@/components/content-intelligence/score-display";
import { FindingsList } from "@/components/content-intelligence/findings-list";
import {
  computeAnalysis,
  enrichFindingsWithFieldIds,
  formatItemId,
  runRulesEngine,
} from "@/lib/content-intelligence/analyzer";
import type {
  AnalyzeRequest,
  AnalyzeResponse,
  ContentAnalysis,
  FieldData,
  Finding,
  SitecorePageData,
} from "@/lib/content-intelligence/types";
import {
  useAppContext,
  useMarketplaceClient,
} from "@/components/providers/marketplace";
import {
  AlertTriangle,
  BarChart2,
  CheckCircle,
  Download,
  FileSearch,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

// ─── Types pulled from the SDK ────────────────────────────────────────────────
// PagesContext, PagesContextSiteInfo etc. aren't exported from the package
// top-level, so we use the query return type instead.
type PagesCtx = Awaited<
  ReturnType<ReturnType<typeof useMarketplaceClient>["query"]>
>["data"] & { siteInfo?: Record<string, unknown>; pageInfo?: Record<string, unknown> };

// ─── GQL query ────────────────────────────────────────────────────────────────

const GET_ITEM_FIELDS_QUERY = `
  query GetItemFields($itemId: String!, $language: String!) {
    item(path: $itemId, language: $language) {
      id
      name
      displayName
      template { name id }
      fields {
        id
        name
        value
      }
    }
  }
`;

// ─── Page HTML download ───────────────────────────────────────────────────────
//
// NEXT_PUBLIC_SITE_URL must be set in .env.local, e.g. https://my-site.vercel.app
// The request is proxied server-side to avoid CORS issues.

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");

async function downloadPageHtml(pageRoute: string, pageTitle: string): Promise<void> {
  const pageUrl = `${SITE_URL}${pageRoute}`;
  const proxyUrl = `/api/content-intelligence/page-html?url=${encodeURIComponent(pageUrl)}`;
  const res = await fetch(proxyUrl);
  if (!res.ok) {
    const body = await res.text().catch(() => res.statusText);
    throw new Error(`Failed to fetch page HTML (${res.status}): ${body}`);
  }
  const html = await res.text();
  const blob = new Blob([html], { type: "text/html" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${pageTitle.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.html`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ─── Data-fetching helpers ────────────────────────────────────────────────────

async function fetchItemFields(
  client: ReturnType<typeof useMarketplaceClient>,
  itemId: string,
  language: string,
  contextId: string,
): Promise<FieldData[]> {
  try {
    const result = await client.mutate("xmc.authoring.graphql", {
      params: {
        body: {
          query: GET_ITEM_FIELDS_QUERY,
          variables: { itemId: formatItemId(itemId), language },
        },
        query: { sitecoreContextId: contextId },
      },
    });
    // Traverse the double-envelope: ClientSDK result → RequestResult → GQL body
    const gqlBody = (result as unknown as { data?: { data?: { item?: { fields?: Array<{ id: string; name: string; value?: string }> } } } }).data;
    const itemFields = gqlBody?.data?.item?.fields;
    if (!Array.isArray(itemFields)) return [];
    return itemFields.map((f) => ({
      id: f.id ?? "",
      name: f.name ?? "",
      value: f.value ?? "",
    }));
  } catch {
    return [];
  }
}

async function fetchAIFindings(pageData: SitecorePageData): Promise<Finding[]> {
  try {
    const payload: AnalyzeRequest = { pageData };
    const res = await fetch("/api/content-intelligence/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json: AnalyzeResponse = await res.json();
    if (json.error) console.warn("AI analysis warning:", json.error);
    return json.findings ?? [];
  } catch {
    return [];
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PanelLoadingSpinner() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Connecting to Sitecore…</p>
    </div>
  );
}

function AnalysisSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center gap-3">
        <Skeleton className="h-[140px] w-[140px] rounded-full" />
        <Skeleton className="h-5 w-28" />
      </div>
      <Separator />
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <div className="flex justify-between">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-4 w-8" />
            </div>
            <Skeleton className="h-1.5 w-full rounded-full" />
          </div>
        ))}
      </div>
      <Separator />
      <div className="space-y-2">
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-16 w-full rounded-lg" />
      </div>
    </div>
  );
}

function QualityBanner({ analysis }: { analysis: ContentAnalysis }) {
  const critical = analysis.findings.filter((f) => f.severity === "critical").length;
  const warnings = analysis.findings.filter((f) => f.severity === "warning").length;

  if (critical > 0) {
    return (
      <Alert variant="danger">
        <AlertTitle>
          {critical} critical issue{critical > 1 ? "s" : ""} — publishing not recommended
        </AlertTitle>
        <AlertDescription>
          Resolve the critical findings below before publishing this page.
        </AlertDescription>
      </Alert>
    );
  }
  if (warnings > 0) {
    return (
      <Alert variant="warning">
        <AlertTitle>
          {warnings} warning{warnings > 1 ? "s" : ""} — quality score is {analysis.overallScore}
        </AlertTitle>
        <AlertDescription>
          This page can publish, but addressing warnings will improve discoverability.
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <Alert variant="success">
      <AlertTitle>Ready to publish</AlertTitle>
      <AlertDescription>No critical issues or warnings. Score: {analysis.overallScore}/100.</AlertDescription>
    </Alert>
  );
}

function EmptyState({
  onAnalyze,
  loading,
  pageTitle,
}: {
  onAnalyze: () => void;
  loading: boolean;
  pageTitle?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-10 text-center">
      <div className="p-4 rounded-full bg-primary-bg">
        <Sparkles className="h-8 w-8 text-primary-fg" />
      </div>
      <div>
        <h3 className="font-semibold mb-1">Ready to analyze</h3>
        {pageTitle && (
          <p className="text-xs text-muted-foreground mb-2 font-mono truncate max-w-xs">
            {pageTitle}
          </p>
        )}
        <p className="text-sm text-muted-foreground max-w-xs">
          Reads live Sitecore field values, runs a rules engine, then calls
          Claude AI to generate field-specific recommendations with one-click
          write-back.
        </p>
      </div>
      <Button onClick={onAnalyze} disabled={loading} colorScheme="primary">
        <Sparkles className="!w-4 !h-4" />
        {loading ? "Analyzing…" : "Analyze Page"}
      </Button>
      <div className="flex flex-wrap justify-center gap-2 text-xs text-muted-foreground">
        <span>Live field read</span>
        <span>•</span>
        <span>Rules engine</span>
        <span>•</span>
        <span>Claude AI</span>
        <span>•</span>
        <span>Field write-back</span>
      </div>
    </div>
  );
}

function AnalysisResults({
  analysis,
  pageRoute,
  onReanalyze,
  reanalyzing,
  onApplyFix,
  applyingFixId,
}: {
  analysis: ContentAnalysis;
  pageRoute: string;
  onReanalyze: () => void;
  reanalyzing: boolean;
  onApplyFix: (finding: Finding) => Promise<void>;
  applyingFixId: string | null;
}) {
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const critical = analysis.findings.filter((f) => f.severity === "critical").length;
  const warnings = analysis.findings.filter((f) => f.severity === "warning").length;
  const suggestions = analysis.findings.filter((f) => f.severity === "suggestion").length;

  const handleDownload = async () => {
    setDownloading(true);
    setDownloadError(null);
    try {
      await downloadPageHtml(pageRoute, analysis.pageTitle);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-5">
      <QualityBanner analysis={analysis} />

      {/* Score ring */}
      <div className="rounded-lg border bg-muted/40 py-5">
        <ScoreRing score={analysis.overallScore} grade={analysis.grade} />
      </div>

      {/* Finding counts */}
      <div className="flex flex-wrap gap-2">
        {critical > 0 && (
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-danger-500" />
            <Badge colorScheme="danger">{critical} Critical</Badge>
          </div>
        )}
        {warnings > 0 && (
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-warning-500" />
            <Badge colorScheme="warning">{warnings} Warning{warnings > 1 ? "s" : ""}</Badge>
          </div>
        )}
        {suggestions > 0 && (
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-primary-fg" />
            <Badge colorScheme="primary">{suggestions} Suggestion{suggestions > 1 ? "s" : ""}</Badge>
          </div>
        )}
        {analysis.findings.length === 0 && (
          <div className="flex items-center gap-1.5">
            <CheckCircle className="h-3.5 w-3.5 text-success-500" />
            <Badge colorScheme="success">All checks passed</Badge>
          </div>
        )}
      </div>

      <Separator />

      {/* Category breakdown */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <BarChart2 className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Category Breakdown</h3>
        </div>
        <CategoryBars categories={analysis.categories} />
      </div>

      <Separator />

      {/* Findings */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <FileSearch className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Findings ({analysis.findings.length})</h3>
        </div>
        <FindingsList
          findings={analysis.findings}
          onApplyFix={onApplyFix}
          applyingFixId={applyingFixId}
        />
      </div>

      <Separator />

      {/* Footer: meta + actions */}
      <div className="space-y-3">
        <div className="rounded-md border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground space-y-1">
          <p><span className="font-medium text-foreground">Page</span> <span className="font-mono">{analysis.pageTitle}</span></p>
          <p><span className="font-medium text-foreground">Path</span> <span className="font-mono break-all">{analysis.itemPath}</span></p>
          <p><span className="font-medium text-foreground">Template</span> {analysis.pageType}</p>
          <p><span className="font-medium text-foreground">Language</span> {analysis.language.toUpperCase()}</p>
          <p><span className="font-medium text-foreground">Analyzed</span> {analysis.analyzedAt.toLocaleTimeString()}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            colorScheme="neutral"
            size="sm"
            onClick={onReanalyze}
            disabled={reanalyzing}
          >
            <RefreshCw className={`!w-3.5 !h-3.5 ${reanalyzing ? "animate-spin" : ""}`} />
            {reanalyzing ? "Re-analyzing…" : "Re-analyze"}
          </Button>
          {SITE_URL ? (
            <Button
              variant="outline"
              colorScheme="neutral"
              size="sm"
              onClick={handleDownload}
              disabled={downloading}
            >
              {downloading ? (
                <Loader2 className="!w-3.5 !h-3.5 animate-spin" />
              ) : (
                <Download className="!w-3.5 !h-3.5" />
              )}
              {downloading ? "Downloading…" : "Download Page HTML"}
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground self-center">
              Set <span className="font-mono">NEXT_PUBLIC_SITE_URL</span> in .env.local to enable HTML download.
            </p>
          )}
        </div>
        {downloadError && (
          <p className="text-xs text-danger-500">{downloadError}</p>
        )}
      </div>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function ContentIntelligencePanel() {
  const client = useMarketplaceClient();
  const appContext = useAppContext();

  const [sdkReady, setSdkReady] = useState(false);
  const [pagesContext, setPagesContext] = useState<PagesCtx | null>(null);
  const [analysis, setAnalysis] = useState<ContentAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [applyingFixId, setApplyingFixId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analyzeStep, setAnalyzeStep] = useState("");

  const unsubRef = useRef<(() => void) | undefined>(undefined);

  const contextId =
    (appContext?.resourceAccess?.[0] as { context?: { preview?: string } } | undefined)
      ?.context?.preview ?? "";

  // Subscribe to pages.context for live updates as the editor navigates pages
  useEffect(() => {
    let active = true;
    client
      .query("pages.context", {
        subscribe: true,
        onSuccess: (data) => {
          if (!active) return;
          setPagesContext(data as unknown as PagesCtx);
          // Clear stale analysis when page changes
          setAnalysis(null);
          setError(null);
        },
      })
      .then((result) => {
        if (!active) return;
        if (result.data) setPagesContext(result.data as unknown as PagesCtx);
        unsubRef.current = result.unsubscribe;
        setSdkReady(true);
      })
      .catch(() => {
        if (active) setSdkReady(true); // still mark ready so UI doesn't stay stuck
      });

    return () => {
      active = false;
      unsubRef.current?.();
    };
  }, [client]);

  const runAnalysis = useCallback(async () => {
    const pageInfo = pagesContext?.pageInfo as Record<string, unknown> | undefined;
    if (!pageInfo?.id) {
      setError("No page context available. Open a page in Sitecore Pages first.");
      return;
    }

    setAnalyzing(true);
    setError(null);
    setAnalysis(null);

    try {
      const lang = (pageInfo.language as string | undefined) ?? "en";

      // 1. Fetch real field values via Authoring GQL
      setAnalyzeStep("Fetching live field values…");
      const fields = await fetchItemFields(client, pageInfo.id as string, lang, contextId);

      // 2. Build structured page data
      const siteInfo = pagesContext?.siteInfo as Record<string, unknown> | undefined;
      const template = pageInfo.template as { name?: string; id?: string } | undefined;
      const pageData: SitecorePageData = {
        pageId: pageInfo.id as string,
        pageName: (pageInfo.name as string) ?? "",
        displayName: (pageInfo.displayName as string) ?? "",
        pagePath: (pageInfo.path as string) ?? "",
        pageRoute: (pageInfo.route as string) ?? "",
        language: lang,
        version: (pageInfo.version as number) ?? 1,
        revision: (pageInfo.revision as string) ?? "",
        templateName: template?.name ?? "",
        templateId: template?.id ?? "",
        siteName: (siteInfo?.name as string) ?? "",
        fields,
        layoutJson: (pageInfo.presentationDetails as string) ?? undefined,
      };

      // 3. Deterministic rules engine
      setAnalyzeStep("Running rules engine…");
      const ruleFindings = runRulesEngine(pageData);

      // 4. Claude AI semantic analysis
      setAnalyzeStep("Running AI analysis via Claude…");
      const rawAiFindings = await fetchAIFindings(pageData);
      const aiFindings = enrichFindingsWithFieldIds(rawAiFindings, fields);

      // 5. Deduplicate: drop AI findings that cover the same field as a rule finding
      const coveredFieldNames = new Set(
        ruleFindings.map((f) => f.fieldName?.toLowerCase()).filter(Boolean),
      );
      const uniqueAiFindings = aiFindings.filter(
        (f) => !f.fieldName || !coveredFieldNames.has(f.fieldName.toLowerCase()),
      );

      // 6. Compute final score
      setAnalyzeStep("Computing scores…");
      const result = computeAnalysis(pageData, [...ruleFindings, ...uniqueAiFindings]);
      setAnalysis(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed. Please retry.");

    } finally {
      setAnalyzing(false);
      setAnalyzeStep("");
    }
  }, [client, pagesContext, contextId]);

  const applyFix = useCallback(
    async (finding: Finding) => {
      const pageInfo = pagesContext?.pageInfo as Record<string, unknown> | undefined;
      if (!finding.fieldId || finding.applyValue === undefined || !pageInfo?.id) return;

      setApplyingFixId(finding.id);
      setError(null);

      try {
        const siteInfo = pagesContext?.siteInfo as Record<string, unknown> | undefined;
        await client.mutate("xmc.pages.saveFields", {
          params: {
            path: { pageId: formatItemId(pageInfo.id as string) },
            body: {
              fields: [
                {
                  id: finding.fieldId,
                  value: finding.applyValue,
                  originalValue: finding.currentValue ?? "",
                },
              ],
              language: (pageInfo.language as string) ?? "en",
              site: (siteInfo?.name as string) ?? "",
              revision: (pageInfo.revision as string) ?? undefined,
              pageVersion: (pageInfo.version as number) ?? 1,
            },
            query: { sitecoreContextId: contextId },
          },
        });

        // Mark applied locally
        setAnalysis((prev) =>
          prev
            ? {
                ...prev,
                findings: prev.findings.map((f) =>
                  f.id === finding.id ? { ...f, applied: true } : f,
                ),
              }
            : prev,
        );
      } catch (err) {
        setError("Failed to apply fix: " + (err instanceof Error ? err.message : "Unknown error"));
      } finally {
        setApplyingFixId(null);
      }
    },
    [client, pagesContext, contextId],
  );

  const pageInfo = pagesContext?.pageInfo as Record<string, unknown> | undefined;
  const siteInfo = pagesContext?.siteInfo as Record<string, unknown> | undefined;
  const template = pageInfo?.template as { name?: string } | undefined;
  const pageTitle =
    (pageInfo?.displayName as string) ||
    (pageInfo?.name as string) ||
    (pageInfo?.path as string) ||
    undefined;

  return (
    <Card style="outline" padding="md" className="w-full">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary-fg" />
              Sitecore AI Content Intelligence
            </CardTitle>
            <CardDescription className="mt-1">
              Page context panel — quality scoring &amp; field-level AI recommendations
            </CardDescription>
          </div>
          <Badge colorScheme="primary" size="sm">v1.0</Badge>
        </div>

        {pageInfo && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {typeof pageInfo.language === "string" && pageInfo.language && (
              <Badge colorScheme="neutral" size="sm">
                {pageInfo.language.toUpperCase()}
              </Badge>
            )}
            {template?.name && (
              <Badge colorScheme="neutral" size="sm">{template.name}</Badge>
            )}
            {typeof pageInfo.version === "number" && pageInfo.version && (
              <Badge colorScheme="neutral" size="sm">v{String(pageInfo.version)}</Badge>
            )}
            {typeof siteInfo?.name === "string" && siteInfo.name && (
              <Badge colorScheme="neutral" size="sm">{siteInfo.name}</Badge>
            )}
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {error && (
          <Alert variant="danger">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!sdkReady && !analyzing && (
          <PanelLoadingSpinner />
        )}

        {sdkReady && !pageInfo && !analyzing && (
          <Alert variant="default">
            <AlertTitle>Waiting for page context</AlertTitle>
            <AlertDescription>
              Open a page in Sitecore Pages to begin analysis.
            </AlertDescription>
          </Alert>
        )}

        {analyzing && (
          <div>
            <div className="flex items-center gap-2 mb-4 text-sm text-muted-foreground">
              <Sparkles className="h-4 w-4 animate-pulse text-primary-fg" />
              <span>{analyzeStep || "Analyzing…"}</span>
            </div>
            <AnalysisSkeleton />
          </div>
        )}

        {sdkReady && !analyzing && !analysis && pageInfo && (
          <EmptyState
            onAnalyze={runAnalysis}
            loading={analyzing}
            pageTitle={pageTitle}
          />
        )}

        {!analyzing && analysis && (
          <AnalysisResults
            analysis={analysis}
            pageRoute={(pageInfo?.route as string) ?? (pageInfo?.path as string) ?? ""}
            onReanalyze={runAnalysis}
            reanalyzing={analyzing}
            onApplyFix={applyFix}
            applyingFixId={applyingFixId}
          />
        )}
      </CardContent>
    </Card>
  );
}
