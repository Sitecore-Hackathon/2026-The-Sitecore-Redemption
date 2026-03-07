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
import {
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Copy,
  Loader2,
  Pencil,
  Sparkles,
} from "lucide-react";
import { useState } from "react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getSeverityColorScheme(s: Severity): "danger" | "warning" | "primary" {
  if (s === "critical") return "danger";
  if (s === "warning") return "warning";
  return "primary";
}

function getSeverityAlertVariant(s: Severity): "danger" | "warning" | "default" {
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

// ─── Single finding card ──────────────────────────────────────────────────────

function FindingCard({
  finding,
  onApplyFix,
  applyingFixId,
}: {
  finding: Finding;
  onApplyFix?: (finding: Finding) => Promise<void>;
  applyingFixId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for iframe / non-HTTPS contexts where clipboard API is unavailable
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none;";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isApplying = applyingFixId === finding.id;
  const canApply =
    !!finding.fieldId && finding.applyValue !== undefined && !finding.applied;

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
              {finding.fieldName && (
                <Badge colorScheme="neutral" size="sm">
                  <Pencil className="!w-2.5 !h-2.5" />
                  {finding.fieldName}
                </Badge>
              )}
              {finding.applied && (
                <Badge colorScheme="success" size="sm">
                  <CheckCircle className="!w-2.5 !h-2.5" />
                  Applied
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
          {/* Current value */}
          {finding.currentValue !== undefined && finding.currentValue !== "" && (
            <div className="bg-muted rounded-md px-3 py-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                Current field value
              </p>
              <p className="text-sm font-mono break-all">{finding.currentValue}</p>
            </div>
          )}

          {/* Evidence */}
          <div className="bg-muted rounded-md px-3 py-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
              Evidence
            </p>
            <p className="text-sm">{finding.evidence}</p>
          </div>

          {/* Standard */}
          {finding.standard && (
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold">Standard: </span>
              {finding.standard}
            </p>
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

          {/* AI rewrite + actions */}
          {finding.applyValue !== undefined && (
            <div className="border border-primary-200 bg-primary-bg rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-primary-fg" />
                <p className="text-xs font-semibold text-primary-fg uppercase tracking-wide">
                  {finding.source === "ai" ? "AI Suggested Rewrite" : "Suggested Field Value"}
                </p>
                <Badge colorScheme="primary" size="sm">
                  {finding.confidence.charAt(0).toUpperCase() + finding.confidence.slice(1)}{" "}
                  confidence
                </Badge>
              </div>
              <pre className="text-sm text-primary-fg whitespace-pre-wrap font-sans leading-relaxed">
                {finding.applyValue}
              </pre>

              <div className="flex flex-wrap gap-2">
                {/* Copy button */}
                <Button
                  size="xs"
                  variant="outline"
                  colorScheme="primary"
                  onClick={() => copyToClipboard(finding.applyValue!)}
                >
                  <Copy className="!w-3 !h-3" />
                  {copied ? "Copied!" : "Copy"}
                </Button>

                {/* Apply Fix — writes directly to the Sitecore field */}
                {canApply && onApplyFix && (
                  <Button
                    size="xs"
                    variant="default"
                    colorScheme="primary"
                    disabled={isApplying}
                    onClick={() => onApplyFix(finding)}
                  >
                    {isApplying ? (
                      <>
                        <Loader2 className="!w-3 !h-3 animate-spin" />
                        Saving…
                      </>
                    ) : (
                      <>
                        <Pencil className="!w-3 !h-3" />
                        Apply Fix
                      </>
                    )}
                  </Button>
                )}

                {finding.applied && (
                  <Badge colorScheme="success">
                    <CheckCircle className="!w-3 !h-3" />
                    Saved to Sitecore
                  </Badge>
                )}
              </div>

              {canApply && (
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium">Field:</span>{" "}
                  <span className="font-mono">{finding.fieldName}</span>
                  {" — "}Apply Fix writes this value directly to the Sitecore field.
                </p>
              )}

              {!canApply && !finding.applied && finding.applyValue !== undefined && (
                <p className="text-xs text-muted-foreground">
                  This field could not be matched to a Sitecore field ID. Use the Copy button and paste manually.
                </p>
              )}
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ─── Severity group ───────────────────────────────────────────────────────────

function SeverityGroup({
  severity,
  findings,
  onApplyFix,
  applyingFixId,
}: {
  severity: Severity;
  findings: Finding[];
  onApplyFix?: (finding: Finding) => Promise<void>;
  applyingFixId: string | null;
}) {
  if (findings.length === 0) return null;

  return (
    <div className="space-y-1">
      <Alert variant={getSeverityAlertVariant(severity)} className="mb-2">
        <AlertTitle>
          {getSeverityLabel(severity)} ({findings.length})
        </AlertTitle>
        <AlertDescription>
          {severity === "critical" && "These issues must be resolved before publishing."}
          {severity === "warning" && "These issues should be addressed to improve quality."}
          {severity === "suggestion" && "Optional improvements to enhance content."}
        </AlertDescription>
      </Alert>
      <div className="divide-y divide-border rounded-lg border overflow-hidden">
        {findings.map((f) => (
          <FindingCard
            key={f.id}
            finding={f}
            onApplyFix={onApplyFix}
            applyingFixId={applyingFixId}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Public component ─────────────────────────────────────────────────────────

export function FindingsList({
  findings,
  onApplyFix,
  applyingFixId,
}: {
  findings: Finding[];
  onApplyFix?: (finding: Finding) => Promise<void>;
  applyingFixId: string | null;
}) {
  const critical = findings.filter((f) => f.severity === "critical");
  const warnings = findings.filter((f) => f.severity === "warning");
  const suggestions = findings.filter((f) => f.severity === "suggestion");

  if (findings.length === 0) {
    return (
      <Alert variant="success">
        <AlertTitle>No issues found</AlertTitle>
        <AlertDescription>This page passed all content quality checks.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <SeverityGroup
        severity="critical"
        findings={critical}
        onApplyFix={onApplyFix}
        applyingFixId={applyingFixId}
      />
      <SeverityGroup
        severity="warning"
        findings={warnings}
        onApplyFix={onApplyFix}
        applyingFixId={applyingFixId}
      />
      <SeverityGroup
        severity="suggestion"
        findings={suggestions}
        onApplyFix={onApplyFix}
        applyingFixId={applyingFixId}
      />
    </div>
  );
}
