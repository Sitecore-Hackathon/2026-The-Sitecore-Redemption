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
import { CategoryBars, ScoreRing } from "@/components/content-intelligence/score-display";
import { FindingsList } from "@/components/content-intelligence/findings-list";
import { analyzePage } from "@/lib/content-intelligence/analyzer";
import type { ContentAnalysis } from "@/lib/content-intelligence/types";
import { useAppContext } from "@/components/providers/marketplace";
import {
  AlertTriangle,
  BarChart2,
  CheckCircle,
  FileSearch,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { useState } from "react";

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------
function AnalysisSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex flex-col items-center gap-3">
        <Skeleton className="h-[140px] w-[140px] rounded-full" />
        <Skeleton className="h-5 w-32" />
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
      <div className="space-y-3">
        <Skeleton className="h-14 w-full rounded-lg" />
        <Skeleton className="h-14 w-full rounded-lg" />
        <Skeleton className="h-14 w-full rounded-lg" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Analysis status banner
// ---------------------------------------------------------------------------
function QualityBanner({ analysis }: { analysis: ContentAnalysis }) {
  const critical = analysis.findings.filter(
    (f) => f.severity === "critical",
  ).length;
  const warnings = analysis.findings.filter(
    (f) => f.severity === "warning",
  ).length;

  if (critical > 0) {
    return (
      <Alert variant="danger">
        <AlertTitle>Publishing blocked by {critical} critical issue{critical > 1 ? "s" : ""}</AlertTitle>
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
          {warnings} warning{warnings > 1 ? "s" : ""} detected
        </AlertTitle>
        <AlertDescription>
          This page can publish, but quality score is {analysis.overallScore}. Address the warnings to improve performance.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert variant="success">
      <AlertTitle>Page is ready to publish</AlertTitle>
      <AlertDescription>
        No critical issues or warnings. Score: {analysis.overallScore}/100.
      </AlertDescription>
    </Alert>
  );
}

// ---------------------------------------------------------------------------
// Results view
// ---------------------------------------------------------------------------
function AnalysisResults({
  analysis,
  onReanalyze,
  reanalyzing,
}: {
  analysis: ContentAnalysis;
  onReanalyze: () => void;
  reanalyzing: boolean;
}) {
  const criticalCount = analysis.findings.filter(
    (f) => f.severity === "critical",
  ).length;
  const warningCount = analysis.findings.filter(
    (f) => f.severity === "warning",
  ).length;
  const suggestionCount = analysis.findings.filter(
    (f) => f.severity === "suggestion",
  ).length;

  return (
    <div className="space-y-6">
      {/* Pre-publish quality banner */}
      <QualityBanner analysis={analysis} />

      {/* Score ring */}
      <Card style="filled" padding="md">
        <CardContent>
          <ScoreRing score={analysis.overallScore} grade={analysis.grade} />
        </CardContent>
      </Card>

      {/* Finding summary badges */}
      <div className="flex flex-wrap gap-2">
        {criticalCount > 0 && (
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-danger-500" />
            <Badge colorScheme="danger">
              {criticalCount} Critical
            </Badge>
          </div>
        )}
        {warningCount > 0 && (
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-warning-500" />
            <Badge colorScheme="warning">
              {warningCount} Warning{warningCount > 1 ? "s" : ""}
            </Badge>
          </div>
        )}
        {suggestionCount > 0 && (
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-primary-fg" />
            <Badge colorScheme="primary">
              {suggestionCount} Suggestion{suggestionCount > 1 ? "s" : ""}
            </Badge>
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
        <div className="flex items-center gap-2 mb-4">
          <BarChart2 className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Category Breakdown</h3>
        </div>
        <CategoryBars categories={analysis.categories} />
      </div>

      <Separator />

      {/* Findings */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <FileSearch className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">
            Findings ({analysis.findings.length})
          </h3>
        </div>
        <FindingsList findings={analysis.findings} />
      </div>

      <Separator />

      {/* Footer: metadata + re-analyze */}
      <div className="flex flex-col gap-3">
        <div className="text-xs text-muted-foreground space-y-1">
          <p>
            <span className="font-medium">Item:</span>{" "}
            <span className="font-mono break-all">{analysis.itemPath}</span>
          </p>
          <p>
            <span className="font-medium">Template:</span> {analysis.pageType}
          </p>
          <p>
            <span className="font-medium">Language:</span>{" "}
            {analysis.language.toUpperCase()}
          </p>
          <p>
            <span className="font-medium">Analyzed:</span>{" "}
            {analysis.analyzedAt.toLocaleTimeString()}
          </p>
        </div>
        <Button
          variant="outline"
          colorScheme="neutral"
          size="sm"
          onClick={onReanalyze}
          disabled={reanalyzing}
          className="w-full sm:w-auto"
        >
          <RefreshCw
            className={`!w-3.5 !h-3.5 ${reanalyzing ? "animate-spin" : ""}`}
          />
          {reanalyzing ? "Re-analyzing…" : "Re-analyze"}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------
function EmptyState({ onAnalyze, loading }: { onAnalyze: () => void; loading: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
      <div className="p-4 rounded-full bg-primary-bg">
        <Sparkles className="h-8 w-8 text-primary-fg" />
      </div>
      <div>
        <h3 className="font-semibold mb-1">Ready to analyze</h3>
        <p className="text-sm text-muted-foreground max-w-xs">
          Run the content intelligence engine to evaluate this page across
          accessibility, SEO, readability, completeness, and governance
          dimensions.
        </p>
      </div>
      <Button onClick={onAnalyze} disabled={loading} colorScheme="primary">
        <Sparkles className="!w-4 !h-4" />
        {loading ? "Analyzing…" : "Analyze Page"}
      </Button>
      <div className="flex flex-wrap justify-center gap-2 text-xs text-muted-foreground">
        <span>Rules engine</span>
        <span>•</span>
        <span>AI semantic analysis</span>
        <span>•</span>
        <span>WCAG 2.2</span>
        <span>•</span>
        <span>Schema.org</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------
export function ContentIntelligencePanel() {
  const appContext = useAppContext();
  const [analysis, setAnalysis] = useState<ContentAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const itemPath = (appContext?.resourceAccess?.[0] as unknown as { itemPath?: string })?.itemPath;

  const runAnalysis = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await analyzePage(itemPath);
      setAnalysis(result);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Analysis failed. Please retry.",
      );
    } finally {
      setLoading(false);
    }
  };

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
              Page context panel — quality scoring &amp; recommendations
            </CardDescription>
          </div>
          <Badge colorScheme="primary" size="sm">
            v1.0
          </Badge>
        </div>

        {/* Page info strip */}
        {appContext && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge colorScheme="neutral" size="sm">
              {(appContext as unknown as { language?: string }).language?.toUpperCase() ?? "EN"}
            </Badge>
            <Badge colorScheme="neutral" size="sm">
              Pages Panel
            </Badge>
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Error state */}
        {error && (
          <Alert variant="danger">
            <AlertTitle>Analysis error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Loading */}
        {loading && (
          <div>
            <div className="flex items-center gap-2 mb-4 text-sm text-muted-foreground">
              <Sparkles className="h-4 w-4 animate-pulse text-primary-fg" />
              <span>Running rules engine and AI analysis…</span>
            </div>
            <AnalysisSkeleton />
          </div>
        )}

        {/* Empty state */}
        {!loading && !analysis && (
          <EmptyState onAnalyze={runAnalysis} loading={loading} />
        )}

        {/* Results */}
        {!loading && analysis && (
          <AnalysisResults
            analysis={analysis}
            onReanalyze={runAnalysis}
            reanalyzing={false}
          />
        )}
      </CardContent>
    </Card>
  );
}
