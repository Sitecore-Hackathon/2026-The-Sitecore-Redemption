"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { Finding, Severity } from "@/lib/content-intelligence/types";
import { ChevronDown, ChevronRight, Copy, Sparkles } from "lucide-react";
import { useState } from "react";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function getSeverityColorScheme(
  s: Severity,
): "danger" | "warning" | "primary" {
  if (s === "critical") return "danger";
  if (s === "warning") return "warning";
  return "primary";
}

function getSeverityAlertVariant(
  s: Severity,
): "danger" | "warning" | "default" {
  if (s === "critical") return "danger";
  if (s === "warning") return "warning";
  return "default";
}

function getSeverityLabel(s: Severity): string {
  if (s === "critical") return "Critical";
  if (s === "warning") return "Warning";
  return "Suggestion";
}

function getCategoryLabel(category: Finding["category"]): string {
  const map: Record<Finding["category"], string> = {
    accessibility: "Accessibility",
    seo: "SEO",
    readability: "Readability",
    completeness: "Completeness",
    governance: "Governance",
  };
  return map[category];
}

// ---------------------------------------------------------------------------
// Single finding card
// ---------------------------------------------------------------------------
function FindingCard({ finding }: { finding: Finding }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <div className="flex items-start justify-between gap-2 cursor-pointer hover:bg-muted/50 px-4 py-3 rounded-lg transition-colors">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 mb-1">
              <Badge
                colorScheme={getSeverityColorScheme(finding.severity)}
                size="sm"
                variant="bold"
              >
                {getSeverityLabel(finding.severity)}
              </Badge>
              <Badge colorScheme="neutral" size="sm">
                {getCategoryLabel(finding.category)}
              </Badge>
              {finding.source === "ai" && (
                <Badge colorScheme="primary" size="sm">
                  <Sparkles className="!w-2.5 !h-2.5" />
                  AI
                </Badge>
              )}
            </div>
            <p className="text-sm font-medium leading-snug">{finding.title}</p>
          </div>
          <div className="shrink-0 mt-1">
            {open ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="px-4 pb-4 space-y-3">
          {/* Evidence */}
          <div className="bg-muted rounded-md px-3 py-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
              Evidence
            </p>
            <p className="text-sm">{finding.evidence}</p>
          </div>

          {/* Standard basis */}
          {finding.standard && (
            <div className="text-xs text-muted-foreground">
              <span className="font-semibold">Standard: </span>
              {finding.standard}
            </div>
          )}

          {/* Rationale */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
              Why it matters
            </p>
            <p className="text-sm text-muted-foreground">{finding.rationale}</p>
          </div>

          {/* Suggested fix */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
              Suggested fix
            </p>
            <p className="text-sm">{finding.suggestedFix}</p>
          </div>

          {/* AI rewrite */}
          {finding.aiRewrite && (
            <div className="border border-primary-200 bg-primary-bg rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-primary-fg" />
                <p className="text-xs font-semibold text-primary-fg uppercase tracking-wide">
                  AI Suggested Rewrite
                </p>
                <Badge colorScheme="primary" size="sm">
                  Confidence:{" "}
                  {finding.confidence.charAt(0).toUpperCase() +
                    finding.confidence.slice(1)}
                </Badge>
              </div>
              <pre className="text-sm text-primary-fg whitespace-pre-wrap font-sans leading-relaxed">
                {finding.aiRewrite}
              </pre>
              <Button
                size="xs"
                variant="outline"
                colorScheme="primary"
                onClick={() => copyToClipboard(finding.aiRewrite!)}
              >
                <Copy className="!w-3 !h-3" />
                {copied ? "Copied!" : "Copy"}
              </Button>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ---------------------------------------------------------------------------
// Severity group
// ---------------------------------------------------------------------------
function SeverityGroup({
  severity,
  findings,
}: {
  severity: Severity;
  findings: Finding[];
}) {
  if (findings.length === 0) return null;

  return (
    <div className="space-y-1">
      <Alert variant={getSeverityAlertVariant(severity)} className="mb-2">
        <AlertTitle>
          {getSeverityLabel(severity)} ({findings.length})
        </AlertTitle>
        <AlertDescription>
          {severity === "critical" &&
            "These issues must be resolved before publishing."}
          {severity === "warning" &&
            "These issues should be addressed to improve quality."}
          {severity === "suggestion" &&
            "Optional improvements to enhance content."}
        </AlertDescription>
      </Alert>
      <div className="divide-y divide-border rounded-lg border overflow-hidden">
        {findings.map((f) => (
          <FindingCard key={f.id} finding={f} />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------
export function FindingsList({ findings }: { findings: Finding[] }) {
  const critical = findings.filter((f) => f.severity === "critical");
  const warnings = findings.filter((f) => f.severity === "warning");
  const suggestions = findings.filter((f) => f.severity === "suggestion");

  if (findings.length === 0) {
    return (
      <Alert variant="success">
        <AlertTitle>No issues found</AlertTitle>
        <AlertDescription>
          This page passed all content quality checks.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <SeverityGroup severity="critical" findings={critical} />
      <SeverityGroup severity="warning" findings={warnings} />
      <SeverityGroup severity="suggestion" findings={suggestions} />
    </div>
  );
}
